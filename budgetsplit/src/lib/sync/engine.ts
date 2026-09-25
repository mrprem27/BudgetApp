import type * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import {
  applyRejection, applyRevoked, applyScope, buildOutbound, cursors, deviceId, linkedUser, rejectionsAfter,
  reserveMutationIds, setInvites, setLastSyncedAt, setRejectionsAfter, type Outbound, type Vanished,
} from '../../db/queries/syncApply';
import { adoptPulledAccounts } from '../../db/queries/personRemap';
import {
  clearAcknowledged, dropQueueRow, markSent, queueCount, queuedRows, queueRowForMutation, rowKey, sentOf, serverVersions,
  type QueueRow, type Sent,
} from '../../db/queries/syncQueue';
import type { Mutation, PullResult } from '../serverApi';

/**
 * The sync engine (SPEC-SERVER.md §3.4): push the queue, pull what changed,
 * apply it, and clear what the server acknowledged.
 *
 * It moves rows; it decides nothing about money. Every rule that protects one
 * person from another is the server's (principle 2), and every figure is derived
 * on the phone from the rows, by the code that derives it today.
 *
 * The network is a `Transport`, injected — the app passes `serverApi`, and the
 * tests pass the real Worker code running on an in-process D1, so the whole loop
 * is exercised with no network and no mocks of the server's rules.
 */

export type Transport = {
  /** The server may apply only part of it: the answer says how far it got. */
  push(body: { deviceId: string; mutations: Mutation[] }): Promise<{ lastMutationId: number }>;
  pull(body: { deviceId: string; cursors: Record<string, number>; rejectionsAfter: number }): Promise<PullResult>;
};

export type SyncOutcome = {
  pushed: number;
  pulled: number;
  rejected: number;
  /** True when anything local changed, so the caller refreshes the screens. */
  changed: boolean;
  /** Groups that ended for me on this sync — deleted by their owner, or I was removed. Told once. */
  vanished?: Vanished[];
  /**
   * Why nothing (or not everything) happened. Each maps to a different fix on
   * the status line: `offline` fixes itself, `signed-out` needs a sign-in, and
   * `failed` a retry.
   */
  skipped?: 'not-linked' | 'offline' | 'signed-out' | 'failed';
  /** The error behind `failed`, for the caller that knows the network layer to classify. */
  error?: unknown;
};

/** 0–1 through a sync: the push is the first tenth, the pull the rest. */
export type SyncProgress = (fraction: number) => void;


/**
 * The order entities go up in, so every row lands after what it points at: a
 * savings transaction after its goal, a transaction after its group and its
 * asset, an occurrence after its rule. Deletes go the other way round.
 */
const RANK = [
  'profiles', 'friends', 'trust_settings', 'groups', 'group_preferences', 'group_members', 'categories', 'budgets',
  'assets', 'savings_goals', 'savings_transactions', 'transactions', 'imported_transactions', 'money_profiles',
];
const rank = (e: string) => { const i = RANK.indexOf(e); return i < 0 ? RANK.length : i; };

/**
 * Mutations per request: the server's own cap. How many of them it applies within
 * its per-request query budget is the server's business — the answer says how far
 * it got, and the push continues from there.
 */
const PUSH_CHUNK = 100;
const MAX_PULL_ROUNDS = 10;

type Planned = { out: Outbound; rows: QueueRow[]; id?: number };

/**
 * Turn the queue into an ordered list of mutations, one per server row.
 *
 *   * COLLAPSED: when two queue rows write the same server row (a budget line
 *     deleted and re-created under a fresh local id; a rename's delete and
 *     upsert of one key), only the LAST is sent, and it answers every row that
 *     fed it.
 *   * ORDERED: parents before children on the way up, the reverse for deletes.
 *   * IDEMPOTENT: a row already given a mutation id keeps it. Ids are saved
 *     BEFORE the push, so a push whose reply was lost is re-sent under the SAME
 *     ids — and the server, having applied them, skips them. (The Replicache
 *     rule: a retry must never be a second write.)
 */
async function plan(db: SQLite.SQLiteDatabase, userId: string, versions: Map<string, number>): Promise<Planned[]> {
  const byKey = new Map<string, Planned>();
  for (const row of await queuedRows(db, 500)) {
    const built = await buildOutbound(db, row, { userId });
    if (built === null) continue;                      // not sendable yet — stays queued
    if (built.length === 0) { await dropQueueRow(db, row.queue_id); continue; }
    for (const out of built) {
      const key = rowKey(out.entity, out.entityId);
      const prev = byKey.get(key);
      byKey.delete(key);                               // re-insert: order of LAST change
      const already = sentOf(row).find(x => x.e === out.entity && x.i === out.entityId)?.m;
      if (prev?.id !== undefined && already === undefined) {
        // A newer change onto an older one that already went out (a line deleted,
        // reply lost, then added back). The old one is re-sent under ITS id — a
        // no-op if the server applied it — and the new one follows under a fresh
        // id. Reusing the old id would have the server skip the new state as a
        // repeat of the old.
        byKey.set(`${key}\u0000sent:${prev.id}`, prev);
        byKey.set(key, { out, rows: [row], id: undefined });
      } else {
        byKey.set(key, { out, rows: [...(prev?.rows ?? []), row], id: already ?? prev?.id });
      }
    }
  }
  const all: Planned[] = [];
  for (const p of byKey.values()) {
    // Deleting something the server never had: nothing to send, nothing to wait for.
    if (p.out.op === 'delete' && p.id === undefined && (versions.get(rowKey(p.out.entity, p.out.entityId)) ?? 0) === 0) {
      for (const r of p.rows) await dropQueueRow(db, r.queue_id);
      continue;
    }
    all.push(p);
  }
  const isRule = (p: Planned) => p.out.entity === 'transactions' && p.out.data.recurrence != null;
  const ups = all.filter(p => p.out.op === 'upsert')
    .sort((a, b) => rank(a.out.entity) - rank(b.out.entity) || Number(isRule(b)) - Number(isRule(a)));
  const dels = all.filter(p => p.out.op === 'delete')
    .sort((a, b) => rank(b.out.entity) - rank(a.out.entity));
  return [...ups, ...dels];
}

async function push(
  db: SQLite.SQLiteDatabase, transport: Transport, device: string, userId: string, onProgress?: SyncProgress,
): Promise<number> {
  const versions = await serverVersions(db);
  const planned = await plan(db, userId, versions);
  if (planned.length === 0) return 0;

  // Give every new mutation its id, and SAVE the ids, before anything is sent.
  const fresh = planned.filter(p => p.id === undefined);
  let next = fresh.length ? await reserveMutationIds(db, fresh.length) : 0;
  for (const p of fresh) p.id = next++;
  await db.withTransactionAsync(async () => {
    const sentByRow = new Map<number, Sent[]>();
    for (const p of planned) {
      for (const r of p.rows) {
        sentByRow.set(r.queue_id, [...(sentByRow.get(r.queue_id) ?? []), { m: p.id!, e: p.out.entity, i: p.out.entityId }]);
      }
    }
    for (const [queueId, sent] of sentByRow) await markSent(db, queueId, sent);
  });

  // Send in id order: the server applies each exactly once and skips what it has.
  const mutations: Mutation[] = [];
  // Two mutations for one server row in a single push: the second is judged
  // against the version the first leaves behind.
  const bases = new Map<string, number>();
  for (const p of [...planned].sort((a, b) => a.id! - b.id!)) {
    const key = rowKey(p.out.entity, p.out.entityId);
    const base = bases.has(key) ? bases.get(key)! + 1 : (versions.get(key) ?? 0);
    bases.set(key, base);
    mutations.push({
      id: p.id!, entity: p.out.entity, op: p.out.op, entityId: p.out.entityId,
      baseVersion: base,
      ...(p.out.op === 'upsert' ? { data: p.out.data } : {}),
    });
  }
  /*
   * Only ever continue from what the server ACKNOWLEDGED. It may stop part-way
   * through a chunk (a per-request limit), and it skips any id at or below its
   * acknowledgement — so sending the next chunk regardless would have it apply
   * later ids and then treat the unapplied gap as done, for good.
   */
  let i = 0;
  while (i < mutations.length) {
    const chunk = mutations.slice(i, i + PUSH_CHUNK);
    const { lastMutationId } = await transport.push({ deviceId: device, mutations: chunk });
    // No guess at the new version here: an acknowledged mutation may have been
    // refused. The pull that follows applies the server's copy, version and all.
    const stop = chunk.findIndex(m => m.id > lastMutationId);      // ids ascend, so the rest is a prefix
    const taken = stop < 0 ? chunk.length : stop;
    // Nothing taken: stop sending for now. The rest stays queued for the next
    // sync, and the pull still runs, so other people's changes still arrive.
    if (taken === 0) break;
    i += taken;
    onProgress?.(0.1 * (i / mutations.length));
  }
  return mutations.length;
}

async function pullAll(db: SQLite.SQLiteDatabase, transport: Transport, device: string, userId: string, onProgress?: SyncProgress) {
  const ctx = { userId };
  let pulled = 0;
  let rejected = 0;
  const vanished: Vanished[] = [];
  for (let round = 0; round < MAX_PULL_ROUNDS; round++) {
    const res = await transport.pull({ deviceId: device, cursors: await cursors(db), rejectionsAfter: await rejectionsAfter(db) });
    // Groups before my own scope: my approvals name transactions that live in a
    // group, never the other way round, so the entry lands before the question.
    const ordered = [...res.scopes].sort((x, y) => Number(x.kind === 'user') - Number(y.kind === 'user'));
    // Refusals first — they need the queue rows they answer — then forget what
    // the server has taken, BEFORE applying the page: my own acknowledged change
    // is then applied like anyone's, with its version, and a row still skipped
    // really is one with a change waiting to go up.
    for (const r of res.rejections) {
      await applyRejection(db, r, await queueRowForMutation(db, r.mutationId), ctx);
      await setRejectionsAfter(db, r.mutationId);
      rejected++;
    }
    await clearAcknowledged(db, res.lastMutationId);
    for (const scope of ordered) {
      pulled += Object.values(scope.rows).reduce((a, r) => a + r.length, 0);
      // Someone this phone knows under another id, now named by account: they
      // take the account's id first, or the scope would add them twice (S20).
      await adoptPulledAccounts(db, [...(scope.rows.group_members ?? []), ...(scope.rows.friends ?? [])]);
      await applyScope(db, scope, ctx);
    }
    await setInvites(db, res.invites ?? []);
    // How far through every scope the phone now is, by seq: the one honest
    // denominator the server has. A scope with nothing in it counts as done.
    const head = res.scopes.reduce((a, sc) => a + (sc.head ?? sc.cursor), 0);
    const at = res.scopes.reduce((a, sc) => a + sc.cursor, 0);
    onProgress?.(0.1 + 0.9 * (head > 0 ? Math.min(1, at / head) : 1));
    for (const groupId of res.revoked) {
      const v = await applyRevoked(db, groupId, res.revokedWhy?.[groupId]);
      if (v) vanished.push(v);
    }
    if (!res.scopes.some(s => s.more)) break;
  }
  return { pulled, rejected, vanished };
}

/**
 * One full cycle. Never throws: a sync that fails is a sync that happens later,
 * and it must not take down a screen.
 *
 * Runs only for the account this phone's ledger is JOINED to — the first sign-in
 * (§4) decides that, and until it has, sending the queue would put half a ledger
 * on the server.
 */
export async function syncOnce(
  db: SQLite.SQLiteDatabase,
  transport: Transport,
  userId: string,
  onProgress?: SyncProgress,
): Promise<SyncOutcome> {
  if ((await linkedUser(db)) !== userId) return { pushed: 0, pulled: 0, rejected: 0, changed: false, skipped: 'not-linked' };
  try {
    const device = await deviceId(db, uuid);
    onProgress?.(0);
    const pushed = await push(db, transport, device, userId, onProgress);
    onProgress?.(0.1);
    const { pulled, rejected, vanished } = await pullAll(db, transport, device, userId, onProgress);
    await setLastSyncedAt(db, Date.now());
    return { pushed, pulled, rejected, changed: pulled > 0 || rejected > 0 || vanished.length > 0, vanished };
  } catch (e) {
    return { pushed: 0, pulled: 0, rejected: 0, changed: false, skipped: 'failed', error: e };
  }
}

/** Is there anything to send? Cheap, so a write can decide whether to schedule a sync. */
export async function hasPendingChanges(db: SQLite.SQLiteDatabase): Promise<boolean> {
  return (await queueCount(db)) > 0;
}
