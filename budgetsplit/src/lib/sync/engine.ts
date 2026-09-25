import type * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import {
  applyRejection, applyRevoked, applyScope, buildOutbound, cursors, deviceId, linkedUser, rejectionsAfter,
  reserveMutationIds, setInvites, setLastSyncedAt, setRejectionsAfter, type Outbound, type Vanished,
} from '../../db/queries/syncApply';
import { adoptPulledAccounts } from '../../db/queries/personRemap';
import {
  clearAcknowledged, dropQueueRow, markSent, queueCount, queuedRows, queueRowForMutation, sentOf, serverVersion,
  setServerVersion, type QueueRow, type Sent,
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


/** Money entities are compare-and-set; everything else is last-write-wins on the server. */
const MONEY = new Set(['assets', 'savings_goals', 'savings_transactions', 'money_profiles', 'budgets', 'transactions']);

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
async function plan(db: SQLite.SQLiteDatabase, userId: string): Promise<Planned[]> {
  const byKey = new Map<string, Planned>();
  for (const row of await queuedRows(db, 500)) {
    const built = await buildOutbound(db, row, { userId });
    if (built === null) continue;                      // not sendable yet — stays queued
    if (built.length === 0) { await dropQueueRow(db, row.queue_id); continue; }
    for (const out of built) {
      const key = `${out.entity}\u0000${out.entityId}`;
      const prev = byKey.get(key);
      byKey.delete(key);                               // re-insert: order of LAST change
      const already = sentOf(row).find(x => x.e === out.entity && x.i === out.entityId)?.m;
      byKey.set(key, { out, rows: [...(prev?.rows ?? []), row], id: already ?? prev?.id });
    }
  }
  const all: Planned[] = [];
  for (const p of byKey.values()) {
    // Deleting something the server never had: nothing to send, nothing to wait for.
    if (p.out.op === 'delete' && p.id === undefined && (await serverVersion(db, p.out.entity, p.out.entityId)) === 0) {
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

async function push(db: SQLite.SQLiteDatabase, transport: Transport, device: string, userId: string): Promise<number> {
  const planned = await plan(db, userId);
  if (planned.length === 0) return 0;

  // Give every new mutation its id, and SAVE the ids, before anything is sent.
  const fresh = planned.filter(p => p.id === undefined);
  let next = fresh.length ? await reserveMutationIds(db, fresh.length) : 0;
  for (const p of fresh) p.id = next++;
  await db.withTransactionAsync(async () => {
    const sentByRow = new Map<number, { row: QueueRow; sent: Sent[] }>();
    for (const p of planned) {
      for (const r of p.rows) {
        const entry = sentByRow.get(r.queue_id) ?? { row: r, sent: [] };
        entry.sent.push({ m: p.id!, e: p.out.entity, i: p.out.entityId });
        sentByRow.set(r.queue_id, entry);
      }
    }
    for (const [queueId, { sent }] of sentByRow) await markSent(db, queueId, sent);
  });

  // Send in id order: the server applies each exactly once and skips what it has.
  const mutations: Mutation[] = [];
  for (const p of [...planned].sort((a, b) => a.id! - b.id!)) {
    mutations.push({
      id: p.id!, entity: p.out.entity, op: p.out.op, entityId: p.out.entityId,
      baseVersion: await serverVersion(db, p.out.entity, p.out.entityId),
      ...(p.out.op === 'upsert' ? { data: p.out.data } : {}),
    });
  }
  for (let i = 0; i < mutations.length; i += PUSH_CHUNK) {
    const chunk = mutations.slice(i, i + PUSH_CHUNK);
    await transport.push({ deviceId: device, mutations: chunk });
    // Optimistic: an accepted money write moved the server row on by one. The
    // next pull confirms it; a rejection replaces it with the server's copy.
    await db.withTransactionAsync(async () => {
      for (const m of chunk) if (MONEY.has(m.entity)) await setServerVersion(db, m.entity, m.entityId, m.baseVersion + 1);
    });
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
    for (const r of res.rejections) {
      await applyRejection(db, r, await queueRowForMutation(db, r.mutationId), ctx);
      await setRejectionsAfter(db, r.mutationId);
      rejected++;
    }
    await clearAcknowledged(db, res.lastMutationId);
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
    const pushed = await push(db, transport, device, userId);
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
