import type * as SQLite from 'expo-sqlite';
import { pendingUploads, markDelivered } from '../db/queries/syncOutbox';
import {
  readEntryDoc, markSynced, pullCursor, setPullCursor, toPeerEnvelope, personResolver,
  pendingDisputes, markDisputeSent, recordDispute, archiveVanishedGroup,
  readRosterDoc, adoptGroup, ROSTER_ENTRY_ID,
  dirtyRosters, clearRosterDirty, nextRosterVersion, setRosterVersion,
  type EntryDoc, type RosterDoc, type NameCollision,
} from '../db/queries/syncDoc';
import { ingestPeerTxn } from '../db/queries/peerIngest';
import { claimMyAccount, getMe } from '../db/queries/persons';
import { getGroupContext } from '../db/queries/groups';
import { canAddMember } from './permissions';
import { sealEntry, openEntry, unwrapGroupKey, wrapGroupKey, newGroupKey } from './groupCrypto';
import { deviceIdentity, deviceSecret, bindDeviceToAccount } from './deviceKey';
import {
  getStoredSession,
  listSyncGroups, pullSyncEntries, pushSyncEntry, registerDevice, listDeviceKeys,
  publishSyncGroup, inviteSyncMember, joinSyncGroup, pushSyncWraps,
  leaveSyncGroup, deleteSyncGroup,
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

/** A group that ended for me, and how. */
export type Vanished = { groupId: string; state: 'deleted' | 'removed' };

export type SyncOutcome = {
  pushed: number;
  pulled: number;
  /** Entries the server refused as stale. Someone else changed them first. */
  conflicts: string[];
  /**
   * Groups that stopped existing for me, and WHICH of the two things happened.
   *
   * Carried separately because they are different events with different next
   * steps, and collapsing them into one message made both vague: `deleted` is
   * over for everybody and there is nothing to do, while `removed` means the
   * group is still running without me and there is somebody I could ask.
   */
  vanished: Vanished[];
  /**
   * People a shared group introduced who look like people already here.
   *
   * Never merged automatically. Guessing wrong splits a balance across two rows
   * that never reconcile, and guessing right is not worth the times it does not.
   */
  collisions: NameCollision[];
  /** True when anything reached the database, so the caller knows to refresh. */
  changed: boolean;
  /** Why nothing happened, when nothing did. Not an error — a reason. */
  skipped?: 'disabled' | 'not-configured' | 'no-device-key' | 'signed-out' | 'offline';
};

const NOTHING: SyncOutcome = {
  pushed: 0, pulled: 0, conflicts: [], vanished: [], collisions: [], changed: false,
};

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
  const outcome = await attemptSync(db);
  // Recorded whatever happened, including the reasons — see `settings.lastSyncNote`.
  // A sync that quietly does nothing is indistinguishable from one that works,
  // and this is the only place that difference is written down.
  await settings.setLastSyncNote(outcome.skipped ?? 'ok').catch(() => {});
  if (!outcome.skipped) await settings.setLastSyncAt(Date.now()).catch(() => {});
  await settings.appendSyncLog({
    at: Date.now(),
    pushed: outcome.pushed,
    pulled: outcome.pulled,
    conflicts: outcome.conflicts.length,
    vanished: outcome.vanished.length,
    ...(outcome.skipped ? { skipped: outcome.skipped } : {}),
  }).catch(() => {});
  return outcome;
}

async function attemptSync(db: SQLite.SQLiteDatabase): Promise<SyncOutcome> {
  if (!serverConfigured()) return { ...NOTHING, skipped: 'not-configured' };
  if (!(await settings.syncEnabled().catch(() => false))) return { ...NOTHING, skipped: 'disabled' };

  const session = await getStoredSession();
  if (!session) return { ...NOTHING, skipped: 'signed-out' };

  /*
   * Before anything else: is this identity even ours?
   *
   * A phone that changes hands keeps its device id, and the server rightly
   * refuses to let one account overwrite another's key — so without this, the
   * second person's sync is refused on every launch and never recovers.
   */
  await bindDeviceToAccount(session.user.id).catch(() => {});

  /*
   * And is the LEDGER's idea of me bound to that identity?
   *
   * Everything downstream depends on it. My own entries go out with
   * `author: {uid: null}` and are refused by every receiver; an arriving roster
   * that names me by account id resolves to nobody, so `adoptGroup` mints a
   * phantom "me" and puts THAT in the group; and `ingestPeerTxn` then answers
   * `not-a-member`, which the pull treats as recoverable — so the cursor holds
   * and the group stops syncing silently, forever.
   *
   * Run here, before anything reads or writes a roster, and idempotent so a
   * device that signed in on an older build heals itself with no migration.
   * A refusal is not fatal to the sync: it means this phone holds somebody else's
   * ledger, or has no `is_me` row, and the right place to say so is the Account
   * screen rather than a background task.
   */
  await claimMyAccount(db, { uid: session.user.id, email: session.user.email }).catch(() => {});

  const identity = await deviceIdentity().catch(() => null);
  // No keychain means nowhere to keep the secret that opens this device's wraps.
  // Sync stays off entirely rather than running in a state where it can send but
  // never read.
  if (!identity) return { ...NOTHING, skipped: 'no-device-key' };

  try {
    await registerDevice(identity.deviceId, identity.publicKey);
    const groups = await listSyncGroups(identity.deviceId);
    // Cached so the Sync screen can explain a stuck queue while offline — which
    // is exactly when someone goes looking for the explanation.
    await settings.setSyncGroups(groups.map(g => [g.id, g.state] as [string, string])).catch(() => {});

    const secret = await deviceSecret();
    if (!secret) return { ...NOTHING, skipped: 'no-device-key' };

    // Before anything reads or writes: make sure my OTHER devices can open what
    // this one can. A second phone or a reinstall otherwise sits on a list of
    // approved groups it will never be able to read.
    await rewrapForMyDevices(groups, await keyring(groups, secret)).catch(() => {});

    const vanished = await reconcileVanished(db, groups);
    await drainRosters(db, groups, secret);
    const push = await drain(db, groups, secret);
    await drainDisputes(db, groups);
    const pull = await pullAll(db, groups, secret);

    return {
      pushed: push.pushed,
      pulled: pull.pulled,
      conflicts: push.conflicts,
      vanished,
      collisions: pull.collisions,
      changed: push.pushed > 0 || pull.pulled > 0 || vanished.length > 0,
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
 * Give my other devices the key to every group this one can open.
 *
 * A wrap is made per DEVICE, deliberately — a key wrapped to a person cannot be
 * opened by their second phone. But nothing ever created one for a device that
 * appeared later, so signing in on a new phone, or reinstalling on this one,
 * produced a device id with no wraps at all: every group came back `approved` with
 * `wrappedKey: null` and stayed unreadable forever. The only escape was for another
 * member to re-share, which used to mint a fresh key and break everyone else.
 *
 * Runs on every sync and is normally a no-op — a device that already has its wrap
 * costs one comparison. Best-effort: this is a repair, and failing it must never
 * stop the sync that follows.
 */
async function rewrapForMyDevices(groups: SyncGroup[], keys: Map<string, Uint8Array>): Promise<void> {
  const openable = groups.filter(g => keys.has(g.id));
  if (openable.length === 0) return;

  const devices = await listDeviceKeys();
  if (devices.length < 2) return;   // nothing to catch up

  for (const g of openable) {
    const key = keys.get(g.id)!;
    // Which of my devices lack a wrap for this group is not something the server
    // will tell me — `listSyncGroups` answers only for the calling device. So wrap
    // for all of them and let the upsert absorb the ones already there.
    const wraps = await Promise.all(
      devices.map(async d => ({ deviceId: d.deviceId, wrappedKey: await wrapGroupKey(key, d.publicKey) })),
    );
    await pushSyncWraps(g.id, wraps).catch(() => {});
  }
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
 * Groups that stopped existing while this device was away.
 *
 * Runs FIRST, before push and pull, so nothing is sent to a group that is gone
 * and no cursor is advanced against one. The server refuses those writes anyway;
 * this is what stops the device retrying them on every launch forever.
 */
async function reconcileVanished(db: SQLite.SQLiteDatabase, groups: SyncGroup[]): Promise<Vanished[]> {
  const gone: Vanished[] = [];
  for (const g of groups) {
    if (g.state !== 'deleted' && g.state !== 'removed') continue;
    // Which of the two it was travels with it. They are not the same event and do
    // not have the same next step: a deleted group is over for everyone, while
    // being removed from one leaves it running without me — and somebody I could
    // ask about it.
    if (await archiveVanishedGroup(db, g.id)) gone.push({ groupId: g.id, state: g.state });
  }
  return gone;
}

/**
 * Republish any roster that has changed since it last went up.
 *
 * Runs BEFORE the entry drain, and that order is the point: an entry naming a
 * member the other phones have never heard of is refused as `not-a-member`, so
 * the person has to arrive before the entry that mentions them.
 */
async function drainRosters(
  db: SQLite.SQLiteDatabase,
  groups: SyncGroup[],
  secret: Uint8Array,
): Promise<void> {
  const keys = await keyring(groups, secret);
  for (const groupId of await dirtyRosters(db)) {
    const key = keys.get(groupId);
    // Not shared, or not readable by this device. The flag stays set, so it goes
    // the moment the group is genuinely shareable.
    if (!key) continue;

    const roster = await readRosterDoc(db, groupId);
    if (!roster) { await clearRosterDirty(db, groupId); continue; }

    const version = await nextRosterVersion(db, groupId);
    try {
      const ciphertext = await sealEntry(roster, key, groupId, ROSTER_ENTRY_ID, version);
      await pushSyncEntry({ groupId, entryId: ROSTER_ENTRY_ID, version, ciphertext, isDeleted: false });
      await setRosterVersion(db, groupId, version);
      await clearRosterDirty(db, groupId);
    } catch (e) {
      /*
       * A 409 means another device published a roster we have not seen. Recording
       * the version it reports lets the next attempt land instead of colliding
       * forever at the same number — and the flag stays set so there IS a next
       * attempt.
       */
      if (e instanceof ServerRequestError && e.status === 409) {
        const current = (e.detail?.current as { version?: number } | undefined)?.version;
        if (typeof current === 'number') await setRosterVersion(db, groupId, current);
        // Carry on to the next group. A 409 is a fact about THIS group's roster —
        // somebody else published one — and nothing about it says the next group's
        // roster cannot go. Breaking here meant one stale version stalled every
        // other dirty roster in the same sync. The ordering rule that makes the
        // entry drain stop on failure is about a person arriving before the entry
        // that names them, which is within one group; rosters for different groups
        // are independent.
        continue;
      }
      // Anything else is almost certainly the connection, and the rest of the
      // batch will fail the same way. Stop.
      break;
    }
  }
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
): Promise<{ pulled: number; collisions: NameCollision[] }> {
  const keys = await keyring(groups, secret);
  let pulled = 0;
  const collisions: NameCollision[] = [];

  for (const [groupId, key] of keys) {
    let cursor = await pullCursor(db, groupId);
    // Bounded rather than `while (more)`: a first sync of a busy group is
    // several pages, and this runs while someone is waiting for a screen. What
    // is left comes on the next open.
    for (let page = 0; page < MAX_PULL_PAGES; page++) {
      const res = await pullSyncEntries(groupId, cursor);

      /*
       * Roster FIRST, always — before any entry in the page.
       *
       * An entry names people by id, and `toPeerEnvelope` refuses one naming
       * somebody this device cannot resolve. Applying entries before the roster
       * that introduces those people would drop the entire first page, and the
       * cursor would move past it.
       */
      for (const e of res.entries.filter(x => x.entryId === ROSTER_ENTRY_ID)) {
        const doc = await openEntry<RosterDoc>(e.ciphertext, key, groupId, e.entryId, e.version);
        if (!doc) continue;
        const clashes = await adoptGroup(db, groupId, doc);
        if (clashes.length > 0) collisions.push(...clashes);
        pulled++;
      }

      /*
       * `held` is how far it is SAFE to say we have got.
       *
       * The cursor used to advance to the end of every page regardless, which
       * quietly threw entries away: one naming a member this phone had never
       * heard of could not be resolved, was skipped — and was then behind the
       * cursor forever. A real expense that silently never arrives.
       *
       * So a RECOVERABLE failure stops the group here and leaves the cursor
       * before it. The next sync re-fetches from that point, and because a
       * republished roster carries a newer timestamp it lands in the same page and
       * is applied first — so the entry that failed succeeds on the retry. It
       * heals itself rather than needing anyone to notice.
       */
      let held = cursor;
      let stalled = false;

      for (const e of res.entries) {
        if (e.entryId === ROSTER_ENTRY_ID) { held = e.updatedAt; continue; }

        const doc = await openEntry<EntryDoc>(
          e.ciphertext, key, groupId, e.entryId, e.version,
        );
        /*
         * PERMANENT. The seal does not match where this entry claims to be: a
         * wrong key, a tampered payload, or one replayed under another id or
         * version. Retrying it forever would be an infinite loop, so this one
         * really does advance.
         */
        if (!doc) { held = e.updatedAt; continue; }

        // Rebuilt per entry, deliberately: a roster earlier in this very page may
        // have just created the people this entry names, and a resolver built once
        // at the top would not know about them.
        const resolve = await personResolver(db);
        const envelope = toPeerEnvelope(resolve, groupId, e.entryId, e.version, e.isDeleted, doc);
        // RECOVERABLE: it names somebody unknown, so a roster is missing or stale.
        if (!envelope) { stalled = true; break; }

        const result = await ingestPeerTxn(db, envelope);
        if (result.ok) { pulled++; held = e.updatedAt; continue; }
        // Also recoverable, and the same cause: their roster has not landed yet.
        if (result.reason === 'not-a-member') { stalled = true; break; }
        // Everything else is a fact about the entry, not about this device's
        // knowledge — unbalanced, stale, my own. Those never become admissible.
        held = e.updatedAt;
      }

      cursor = held;
      await setPullCursor(db, groupId, cursor);
      if (stalled || !res.more) break;
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
  return { pulled, collisions };
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
  | { ok: false; reason: 'not-signed-in' | 'no-device-key' | 'not-linked' | 'no-devices' | 'not-allowed' | 'no-key' | 'failed' };

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
export async function shareGroup(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  theirUserId: string,
): Promise<ShareResult> {
  if (!serverConfigured()) return { ok: false, reason: 'not-signed-in' };
  const identity = await deviceIdentity().catch(() => null);
  if (!identity) return { ok: false, reason: 'no-device-key' };

  /*
   * Sharing IS granting membership, so it answers to the same permission.
   *
   * It was ungated, in the query layer and in the UI, while `canAddMember`
   * refused a plain member from adding anybody — so the rule was enforced on the
   * quiet local path and not on the one that publishes every member's name,
   * colour and account id to a stranger's device. Whoever they invited then
   * received the roster and every entry.
   *
   * Checked here rather than only in the row, because `permissions.ts` says it
   * plainly: a screen hiding a button is a courtesy, the write path is the
   * control.
   */
  const me = await getMe(db);
  if (!me) return { ok: false, reason: 'not-signed-in' };
  if (!canAddMember(await getGroupContext(db, groupId, me.id))) {
    return { ok: false, reason: 'not-allowed' };
  }

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

    /*
     * REUSE the group's key. Minting one per share is what broke sharing with a
     * second person.
     *
     * This called `newGroupKey()` unconditionally, and the server's publish
     * returns early for a group it already has WITHOUT re-wrapping. So: share with
     * A under K1 and every entry is sealed with K1; share with B, mint K2, the
     * publish is a no-op so my own wraps stay K1, and B is handed K2 — a key that
     * opens nothing that exists. B saw a group and never a single entry, forever,
     * and nothing said so.
     *
     * A group already on the server that this device cannot open is refused rather
     * than re-keyed. Re-keying would leave every entry already up there sealed with
     * a key nobody holds any more — unrecoverable, because the old one only ever
     * lived in one device's memory.
     */
    const published = (await listSyncGroups(identity.deviceId)).find(g => g.id === groupId);
    let key: Uint8Array;
    if (published) {
      const secret = await deviceSecret();
      if (!secret || !published.wrappedKey) return { ok: false, reason: 'no-key' };
      const existing = await unwrapGroupKey(published.wrappedKey, secret).catch(() => null);
      if (!existing) return { ok: false, reason: 'no-key' };
      key = existing;
    } else {
      key = await newGroupKey();
    }

    const wrapsFor = async (devices: typeof mine) => Promise.all(
      devices.map(async d => ({ deviceId: d.deviceId, wrappedKey: await wrapGroupKey(key, d.publicKey) })),
    );

    await publishSyncGroup(groupId, await wrapsFor(mine));
    await inviteSyncMember(groupId, theirUserId, await wrapsFor(theirs));

    /*
     * The roster, sealed like any other entry.
     *
     * Without it the invitee accepts, syncs, and every entry is refused as
     * `not-a-member` — because their phone has no such group and no person rows
     * for anyone the entries name. Sent as a reserved entry id so it inherits the
     * versioning, the AAD binding and the encryption, and the server needs no
     * change and learns no names.
     */
    const roster = await readRosterDoc(db, groupId);
    if (roster) await pushRoster(db, groupId, key, roster);

    return { ok: true, devices: theirs.length };
  } catch (e) {
    // 403 is the one worth naming: it means the link they think they have does
    // not exist on the server, and "not linked" is something they can act on.
    if (e instanceof ServerRequestError && e.status === 403) return { ok: false, reason: 'not-linked' };
    return { ok: false, reason: 'failed' };
  }
}

/**
 * Send the roster as a sealed entry at version 1.
 *
 * Best-effort on the version: a re-share of a group already published would
 * collide at v1, and the roster it already carries is not wrong enough to be
 * worth failing the share over. Members are re-published whenever the group is
 * shared again, which is when the roster can actually have changed.
 */
async function pushRoster(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  key: Uint8Array,
  roster: RosterDoc,
): Promise<void> {
  for (let version = 1; version <= 3; version++) {
    try {
      const ciphertext = await sealEntry(roster, key, groupId, ROSTER_ENTRY_ID, version);
      await pushSyncEntry({ groupId, entryId: ROSTER_ENTRY_ID, version, ciphertext, isDeleted: false });
      return;
    } catch (e) {
      // 409 means a roster is already there at this version — try the next one.
      // Anything else, and a stale roster is better than a failed share.
      if (!(e instanceof ServerRequestError && e.status === 409)) return;
    }
  }
}

/**
 * Publish a group's roster right now, out of band.
 *
 * Leaving and deleting both need this, and both need it BEFORE they tell the
 * server, because the moment `removed_at` or `deleted_at` is set every write from
 * this device is refused — so a roster published afterwards never lands and the
 * others never learn what happened. Waiting for the next ordinary sync is not an
 * option either: by then the group is gone from this device's list.
 *
 * Best-effort by design. Failing to publish must not stop somebody leaving a
 * group they want out of; it only means the others find out on the server's terms
 * (`listSyncGroups` reporting `removed`) instead of ours.
 */
export async function publishRosterNow(
  db: SQLite.SQLiteDatabase,
  groupId: string,
): Promise<boolean> {
  try {
    const identity = await deviceIdentity();
    const secret = await deviceSecret();
    if (!identity || !secret) return false;
    const groups = await listSyncGroups(identity.deviceId);
    const key = (await keyring(groups, secret)).get(groupId);
    if (!key) return false;

    const roster = await readRosterDoc(db, groupId);
    if (!roster) return false;
    const version = await nextRosterVersion(db, groupId);
    const ciphertext = await sealEntry(roster, key, groupId, ROSTER_ENTRY_ID, version);
    await pushSyncEntry({ groupId, entryId: ROSTER_ENTRY_ID, version, ciphertext, isDeleted: false });
    await setRosterVersion(db, groupId, version);
    await clearRosterDirty(db, groupId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Tell the server this group is over for me — leaving, or deleting it for
 * everyone.
 *
 * Both routes existed in `serverApi` with **zero callers**, so neither half ever
 * ran: a local delete never reached `sync_group`, which is why the group came
 * back on the next pull. The receiving side (`reconcileVanished` →
 * `archiveVanishedGroup`) has been wired and waiting the whole time.
 */
export async function announceGroupExit(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  mode: 'leave' | 'delete',
): Promise<void> {
  if (!serverConfigured()) return;
  if (!(await getStoredSession())) return;
  // Roster first, always. See `publishRosterNow`.
  await publishRosterNow(db, groupId);
  try {
    if (mode === 'leave') await leaveSyncGroup(groupId);
    else await deleteSyncGroup(groupId);
  } catch {
    // The server may refuse (not the owner) or be unreachable. Locally this is
    // still over, and `reconcileVanished` reconciles the two on a later sync.
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
