import type { Db } from './utils/access';
import { buildStatements, diagnose, Rejected, type EntitySpec, type Mutation, type PushContext } from './utils/mutation';
import { countQueries, isTransient } from './utils/guard';
import { errorMessage } from '../lib';

/**
 * `POST /sync/push` (SPEC-SERVER.md §3.2).
 *
 * Mutations are applied IN ORDER, each in its own atomic D1 batch that also
 * advances `devices.last_mutation_id` — so a retried push skips what already
 * landed and applies the rest exactly once (the Replicache rule: a mutation's
 * effects and its acknowledgement commit together or not at all).
 *
 * A mutation that is refused or conflicts is NOT retried by anyone: it is written
 * to `sync_rejections` (in a batch that also advances the device), and the phone
 * learns of it on the next pull, reverts the entity and says why. The push reply
 * is only a receipt; the pull is the one place an outcome is read.
 *
 * The shared shapes (`EntitySpec`, `Mutation`, `PushContext`, `Rejected`) and the
 * generic entity builder live in `utils/mutation.ts`; each `CustomSpec` in
 * `entities/*.ts` reuses the same fences and stamped columns from there.
 */

export const MAX_MUTATIONS_PER_PUSH = 100;

export type { EntitySpec, Mutation, PushContext } from './utils/mutation';

/** Parse and validate a push body. Returns a message on failure. */
export function parsePush(body: unknown): { deviceId: string; mutations: Mutation[] } | string {
  if (!body || typeof body !== 'object') return 'Invalid JSON body';
  const b = body as Record<string, unknown>;
  if (typeof b.deviceId !== 'string' || !b.deviceId.trim()) return 'deviceId is required';
  if (!Array.isArray(b.mutations)) return 'mutations must be an array';
  if (b.mutations.length > MAX_MUTATIONS_PER_PUSH) return `at most ${MAX_MUTATIONS_PER_PUSH} mutations per push`;
  const mutations: Mutation[] = [];
  let last = 0;
  for (const raw of b.mutations) {
    const m = raw as Record<string, unknown>;
    if (!Number.isInteger(m.id) || (m.id as number) < 1) return 'each mutation needs a positive integer id';
    if ((m.id as number) <= last) return 'mutation ids must strictly increase';
    last = m.id as number;
    if (typeof m.entity !== 'string') return 'each mutation needs an entity';
    if (m.op !== 'upsert' && m.op !== 'delete') return 'op must be upsert or delete';
    if (typeof m.entityId !== 'string' || !m.entityId) return 'each mutation needs an entityId';
    if (!Number.isInteger(m.baseVersion) || (m.baseVersion as number) < 0) return 'baseVersion must be a non-negative integer';
    if (m.op === 'upsert' && (!m.data || typeof m.data !== 'object' || Array.isArray(m.data))) return 'an upsert needs data';
    mutations.push({
      id: m.id as number, entity: m.entity, op: m.op, entityId: m.entityId,
      baseVersion: m.baseVersion as number, data: m.data as Record<string, unknown> | undefined,
    });
  }
  return { deviceId: b.deviceId.trim(), mutations };
}

/**
 * Make sure the user's scope and this device exist, and that the device is theirs.
 * Returns the device's last applied mutation id, or null if it belongs to someone else.
 */
export async function ensureDevice(db: Db, userId: string, deviceId: string, now: number): Promise<number | null> {
  const results = await db.batch([
    db.prepare("INSERT OR IGNORE INTO sync_scopes (id, kind, seq, created_at) VALUES (?, 'user', 0, ?)").bind(userId, now),
    db.prepare('INSERT OR IGNORE INTO devices (id, user_id, last_mutation_id, created_at, last_seen_at) VALUES (?, ?, 0, ?, ?)')
      .bind(deviceId, userId, now, now),
    db.prepare('SELECT user_id, last_mutation_id FROM devices WHERE id = ?').bind(deviceId),
  ]);
  const device = (results[2].results as Array<{ user_id: string; last_mutation_id: number }>)[0];
  if (!device || device.user_id !== userId) return null;
  return device.last_mutation_id;
}

/**
 * The most D1 queries one mutation can cost — its reads, its write, a diagnosis
 * and a refusal included. A push stops BEFORE a mutation that might not fit its
 * budget, never inside one.
 */
export const MAX_QUERIES_PER_MUTATION = 12;

/**
 * Apply every mutation in order. Returns the last mutation id now acknowledged.
 *
 * `queryBudget`: how many D1 queries this request may still run (a Worker gets 50
 * in all on Workers Free, 1000 on Paid). The push counts its own and stops cleanly
 * when the next mutation might not fit; the phone continues from the answer. A
 * TRANSIENT failure of the platform (`isTransient`) is never recorded as a
 * refusal — the push fails and the phone retries it.
 */
export async function applyPush(
  ctx: PushContext,
  mutations: Mutation[],
  lastApplied: number,
  entities: Record<string, EntitySpec>,
  opts: { queryBudget?: number } = {},
): Promise<number> {
  const counter = opts.queryBudget === undefined ? null : countQueries(ctx.db);
  const run: PushContext = counter ? { ...ctx, db: counter.db } : ctx;
  let last = lastApplied;
  for (const m of mutations) {
    if (m.id <= last) continue;                       // already applied: a retry
    if (counter && counter.used() + MAX_QUERIES_PER_MUTATION > opts.queryBudget!) break;
    try {
      const spec = entities[m.entity];
      if (!spec) throw new Rejected('invalid', `unknown entity: ${m.entity}`);
      const statements = spec.custom ? await spec.custom(run, m) : await buildStatements(run, spec, m);
      try {
        await run.db.batch([...statements, ack(run, m.id)]);
      } catch (e) {
        throw await diagnose(run, spec, m, e);
      }
    } catch (e) {
      if (isTransient(e)) throw e;
      await run.db.batch([rejection(run, m.id, e instanceof Rejected ? e : new Rejected('invalid', errorMessage(e))), ack(run, m.id)]);
    }
    last = m.id;
  }
  return last;
}

/** Record why a mutation was refused, for the phone to read on its next pull. */
function rejection(ctx: PushContext, mutationId: number, r: Rejected): D1PreparedStatement {
  return ctx.db.prepare(
    `INSERT OR REPLACE INTO sync_rejections (device_id, mutation_id, code, message, current, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(ctx.deviceId, mutationId, r.code, r.message.slice(0, 500), r.current === null ? null : JSON.stringify(r.current), ctx.now);
}

/** Advance the device's acknowledgement — always in the same batch as the effect. */
function ack(ctx: PushContext, mutationId: number): D1PreparedStatement {
  return ctx.db.prepare(
    'UPDATE devices SET last_mutation_id = ?, last_seen_at = ? WHERE id = ? AND last_mutation_id < ?',
  ).bind(mutationId, ctx.now, ctx.deviceId, mutationId);
}
