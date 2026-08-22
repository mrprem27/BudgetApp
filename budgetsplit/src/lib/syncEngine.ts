import type * as SQLite from 'expo-sqlite';
import { pendingUploads, markDelivered } from '../db/queries/syncOutbox';
import {
  readEntryDoc, markSynced, pullCursor, setPullCursor, toPeerEnvelope, personResolver,
  pendingDisputes, markDisputeSent, recordDispute,
  type EntryDoc,
} from '../db/queries/syncDoc';
import { ingestPeerTxn } from '../db/queries/peerIngest';
import { sealEntry, openEntry, unwrapGroupKey, wrapGroupKey, newGroupKey } from './groupCrypto';
import { deviceIdentity, deviceSecret } from './deviceKey';
import {
  listSyncGroups, pullSyncEntries, pushSyncEntry, registerDevice, listDeviceKeys,
  publishSyncGroup, inviteSyncMember, joinSyncGroup,
  pushSyncDispute, pullSyncDisputes,
  ServerRequestError, serverConfigured, type SyncGroup,
} from './serverApi';
import { settings } from './settings';

/**
 * The transport. Everything above it is local; everything below it is the wire.
 *
 * Two halves, and they are deliberately asymmetric:
 *
 *   drain — read a queued entry, seal it, push it, and only THEN forget it
 *   pull  — fetch what changed, open it, and hand it to `ingestPeerTxn`
 *
 * The engine decides nothing about money. It moves sealed bytes and hands what
 * comes back to `ingestPeerTxn`, which is where trust and approval live. That
 * separation is the point: if the transport could decide what counts, then
 * "nothing lands without your say-so" would depend on a network path being
 * correct.
 */

export type SyncOutcome = {
  pushed: number;
  pulled: number;
  /** Entries the server refused as stale. Someone else changed them first. */
  conflicts: string[];
  /** True when anything reached the database, so the caller knows to refresh. */
  changed: boolean;
  /** Why nothing happened, when nothing did. Not an error — a reason. */
  skipped?: 'disabled' | 'not-configured' | 'no-device-key' | 'offline';
};

const NOTHING: SyncOutcome = { pushed: 0, pulled: 0, conflicts: [], changed: false };

/**
 * One full cycle: send what is queued, then fetch what is new.
 *
 * Push before pull, because pushing is what the user just did and seeing their
 * own change survive is what makes sync feel real. It also means a conflict is
 * discovered before the pull that resolves it, rather than a moment after.
 *
 * Never throws. A sync that fails is a sync that happens later — it must not
 * take down a screen, and it must not put a dialog in front of someone who did
 * not ask for one.
 */
export async function runSync(db: SQLite.SQLiteDatabase): Promise<SyncOutcome> {
  if (!serverConfigured()) return { ...NOTHING, skipped: 'not-configured' };
  if (!(await settings.syncEnabled().catch(() => false))) return { ...NOTHING, skipped: 'disabled' };

  const identity = await deviceIdentity().catch(() => null);
  // No keychain means nowhere to keep the secret that opens this device's wraps.
  // Sync stays off entirely rather than running in a state where it can send but
  // never read.
  if (!identity) return { ...NOTHING, skipped: 'no-device-key' };

  try {
    await registerDevice(identity.deviceId, identity.publicKey);
    const groups = await listSyncGroups(identity.deviceId);

    const secret = await deviceSecret();
    if (!secret) return { ...NOTHING, skipped: 'no-device-key' };

    const push = await drain(db, groups, secret);
    await drainDisputes(db, groups);
    const pull = await pullAll(db, groups, secret);

    return {
      pushed: push.pushed,
      pulled: pull.pulled,
      conflicts: push.conflicts,
      changed: push.pushed > 0 || pull.pulled > 0,
    };
  } catch {
    // Offline, the Worker down, or a dead session — all three mean the same
    // thing here and lead to the same next step, which is to try again later.
    return { ...NOTHING, skipped: 'offline' };
  }
}

/**
 * Group id → the key this device can open it with. Null where it cannot.
 *
 * Takes this device's SECRET, because unwrapping is now a real curve operation:
 * the wrap was made against the public key and only the private half opens it.
 */
async function keyring(groups: SyncGroup[], secret: Uint8Array): Promise<Map<string, Uint8Array>> {
  const keys = new Map<string, Uint8Array>();
  for (const g of groups) {
    if (g.state !== 'approved' || !g.wrappedKey) continue;
    const key = await unwrapGroupKey(g.wrappedKey, secret);
    if (key) keys.set(g.id, key);
  }
  return keys;
}

/**
 * Send what is queued.
 *
 * **Delete only after the server accepts.** That makes delivery at-least-once,
 * and re-delivery is already normal — `ingestPeerTxn` compares versions. The
 * other order is at-most-once, which drops an entry on any failure and tells
 * nobody, and silent divergence between two people's ledgers is the failure mode
 * this whole layer exists to avoid.
 */
async function drain(
  db: SQLite.SQLiteDatabase,
  groups: SyncGroup[],
  secret: Uint8Array,
): Promise<{ pushed: number; conflicts: string[] }> {
  const keys = await keyring(groups, secret);
  const queued = await pendingUploads(db);
  let pushed = 0;
  const conflicts: string[] = [];

  for (const row of queued) {
    const key = keys.get(row.group_id);
    // Not published yet, or this device has no wrap for it. Leave it queued:
    // it will go the moment the group is shareable, and dropping it would lose
    // the change with nothing to show it was ever made.
    if (!key) continue;

    const entry = await readEntryDoc(db, row.entry_id);
    // The entry is gone entirely. Nothing to send, and keeping the row would
    // retry it forever.
    if (!entry) { await markDelivered(db, row.entry_id); continue; }

    const ciphertext = await sealEntry(
      entry.doc, key, row.group_id, row.entry_id, entry.version,
    );

    try {
      await pushSyncEntry({
        groupId: row.group_id,
        entryId: row.entry_id,
        version: entry.version,
        ciphertext,
        isDeleted: entry.isDeleted,
      });
      // Both, in this order: record the accepted version first, so a crash
      // between the two re-sends an entry that is already there — which the
      // receiver refuses as stale — rather than forgetting one that is not.
      await markSynced(db, row.entry_id, entry.version);
      await markDelivered(db, row.entry_id);
      pushed++;
    } catch (e) {
      if (e instanceof ServerRequestError && e.status === 409) {
        /*
         * Someone else changed this entry first. NOT resolved here and not
         * merged — merging two versions of a money row invents a figure nobody
         * typed. It stays queued, the pull that follows brings their version in,
         * and the disagreement becomes visible instead of being decided by
         * whichever request happened to arrive later.
         */
        conflicts.push(row.entry_id);
        continue;
      }
      // Anything else — offline, 500, a dead session. Stop the whole loop rather
      // than carrying on: order is the only thing keeping a series consistent,
      // and `voiceDrain` stops for the same reason.
      break;
    }
  }
  return { pushed, conflicts };
}

/**
 * Send my objections — F10.
 *
 * Separate from the entry drain because a dispute is not an entry: it carries no
 * ciphertext, has no version of its own to advance, and a failure to deliver one
 * must not stop entries from going. It is the smaller, quieter half of the same
 * idea — something happened on this device that another person needs to know.
 */
async function drainDisputes(db: SQLite.SQLiteDatabase, groups: SyncGroup[]): Promise<void> {
  const joined = new Set(groups.filter(g => g.state === 'approved').map(g => g.id));
  for (const d of await pendingDisputes(db)) {
    // Not shared yet, so there is nobody to tell. It stays queued.
    if (!joined.has(d.group_id)) continue;
    try {
      await pushSyncDispute(d.group_id, d.txn_id, d.sync_version, d.dispute_state === 'clear');
      await markDisputeSent(db, d.txn_id);
    } catch {
      // Same rule as the entry drain: stop rather than skip, so ordering holds.
      break;
    }
  }
}

/** Fetch and apply what other people changed. */
async function pullAll(
  db: SQLite.SQLiteDatabase,
  groups: SyncGroup[],
  secret: Uint8Array,
): Promise<{ pulled: number }> {
  const keys = await keyring(groups, secret);
  // Built once, not per entry: the roster does not change mid-pull, and a page
  // holds up to 200 entries.
  const resolve = await personResolver(db);
  let pulled = 0;

  for (const [groupId, key] of keys) {
    let cursor = await pullCursor(db, groupId);
    // Bounded rather than `while (more)`: a first sync of a busy group is
    // several pages, and this runs while someone is waiting for a screen. What
    // is left comes on the next open.
    for (let page = 0; page < MAX_PULL_PAGES; page++) {
      const res = await pullSyncEntries(groupId, cursor);
      for (const e of res.entries) {
        const doc = await openEntry<EntryDoc>(
          e.ciphertext, key, groupId, e.entryId, e.version,
        );
        /*
         * Null means the seal did not match where this entry claims to be: a
         * wrong key, a tampered payload, or one replayed under another id or
         * version. Skipped, never guessed at — and the cursor still advances,
         * because retrying an entry that will never open is an infinite loop.
         */
        if (!doc) continue;

        const envelope = toPeerEnvelope(resolve, groupId, e.entryId, e.version, e.isDeleted, doc);
        if (!envelope) continue;

        const result = await ingestPeerTxn(db, envelope);
        if (result.ok) pulled++;
      }
      cursor = res.cursor;
      await setPullCursor(db, groupId, cursor);
      if (!res.more) break;
    }

    /*
     * Objections about MY entries, on their own cursor.
     *
     * Deliberately after the entries: an objection names a version, and applying
     * it before that version has arrived would file it against a figure this
     * device has not seen yet.
     */
    try {
      let dCursor = await pullCursor(db, disputeKey(groupId));
      const res = await pullSyncDisputes(groupId, dCursor);
      for (const d of res.disputes) {
        await recordDispute(db, d.entryId, d.byUser, d.version, d.createdAt, d.cleared);
      }
      dCursor = res.cursor;
      await setPullCursor(db, disputeKey(groupId), dCursor);
    } catch {
      // An objection arriving late is a delay; a failed entry pull is data loss.
      // Never let the smaller one take down the larger.
    }
  }
  return { pulled };
}

/**
 * Disputes get their own cursor, under a suffixed key.
 *
 * Sharing the entry cursor would make whichever stream advanced last skip the
 * other's backlog — two independent timelines cannot share one bookmark.
 */
const disputeKey = (groupId: string): string => `${groupId}#disputes`;

const MAX_PULL_PAGES = 5;

// --- Sharing a group -------------------------------------------------------

export type ShareResult =
  | { ok: true; devices: number }
  | { ok: false; reason: 'not-signed-in' | 'no-device-key' | 'not-linked' | 'no-devices' | 'failed' };

/**
 * Share a group with someone: publish it, and hand them the key.
 *
 * Adoption, not creation — the group goes up under the id it already has here, so
 * both devices agree on it with no mapping to get wrong.
 *
 * The key is generated on this phone, wrapped to my devices and theirs, and
 * uploaded already sealed. The server stores wraps it cannot open, which is what
 * makes "we cannot read any of it" a fact about the architecture rather than a
 * promise about behaviour.
 *
 * They land as invited, not joined. Being added to a group that starts moving
 * numbers should not be something that happens TO someone.
 */
export async function shareGroup(groupId: string, theirUserId: string): Promise<ShareResult> {
  if (!serverConfigured()) return { ok: false, reason: 'not-signed-in' };
  const identity = await deviceIdentity().catch(() => null);
  if (!identity) return { ok: false, reason: 'no-device-key' };

  try {
    const [mine, theirs] = await Promise.all([
      listDeviceKeys(),
      listDeviceKeys(theirUserId),
    ]);
    /*
     * They have an account but have never opened a build that registers a device.
     * Refused rather than half-done: publishing now would put the group up with
     * no way for them to ever read it, and nothing would come back later to fix
     * that — the key only exists on this phone during this call.
     */
    if (theirs.length === 0) return { ok: false, reason: 'no-devices' };

    const key = await newGroupKey();
    const wrapsFor = async (devices: typeof mine) => Promise.all(
      devices.map(async d => ({ deviceId: d.deviceId, wrappedKey: await wrapGroupKey(key, d.publicKey) })),
    );

    await publishSyncGroup(groupId, await wrapsFor(mine));
    await inviteSyncMember(groupId, theirUserId, await wrapsFor(theirs));
    return { ok: true, devices: theirs.length };
  } catch (e) {
    // 403 is the one worth naming: it means the link they think they have does
    // not exist on the server, and "not linked" is something they can act on.
    if (e instanceof ServerRequestError && e.status === 403) return { ok: false, reason: 'not-linked' };
    return { ok: false, reason: 'failed' };
  }
}

/**
 * Accept an invitation to a group someone else shared.
 *
 * Only the acceptance goes over the wire; the group's entries arrive on the next
 * sync, through the ordinary pull. Nothing special-cases a first sync, because a
 * cursor of zero already means "everything".
 */
export async function acceptGroupInvite(groupId: string): Promise<boolean> {
  try {
    await joinSyncGroup(groupId);
    return true;
  } catch {
    return false;
  }
}

/** Groups someone has invited me to and I have not answered. */
export async function pendingGroupInvites(): Promise<SyncGroup[]> {
  const identity = await deviceIdentity().catch(() => null);
  if (!identity || !serverConfigured()) return [];
  try {
    return (await listSyncGroups(identity.deviceId)).filter(g => g.state === 'pending');
  } catch {
    return [];
  }
}
