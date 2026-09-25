import type { Db } from './utils/access';
import { buildStatements, diagnose, Rejected, type EntitySpec, type Mutation, type PushContext } from './utils/mutation';
import { isTransient } from './utils/guard';

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
export function parsePush(body: unknown): { deviceId: string; mutations: Mutation[]; resumable: boolean } | string {
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
  return { deviceId: b.deviceId.trim(), mutations, resumable: b.resumable === true };
}

/**
 * Make sure the user's scope and this device exist, and that the device is theirs.
 * Returns the device's last applied mutation id, or null if it belongs to someone else.
 */
export async function ensureDevice(db: Db, userId: string, deviceId: string, now: number): Promise<number | null> {
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO sync_scopes (id, kind, seq, created_at) VALUES (?, 'user', 0, ?)").bind(userId, now),
    db.prepare('INSERT OR IGNORE INTO devices (id, user_id, last_mutation_id, created_at, last_seen_at) VALUES (?, ?, 0, ?, ?)')
      .bind(deviceId, userId, now, now),
  ]);
  const device = await db.prepare('SELECT user_id, last_mutation_id FROM devices WHERE id = ?')
    .bind(deviceId).first<{ user_id: string; last_mutation_id: number }>();
  if (!device || device.user_id !== userId) return null;
  return device.last_mutation_id;
}

/**
 * Apply every mutation in order. Returns the last mutation id now acknowledged.
 *
 * A TRANSIENT failure (`isTransient`: a query limit, a dropped connection) is
 * never recorded as a refusal — the mutation is fine, the moment is not. For a
 * phone that says it can resume from the acknowledgement (`resumable`), the push
 * stops there and answers what it applied; the rest comes next time. An older
 * phone sends its next chunk regardless of the answer, which would skip the gap
 * for good, so it gets the failure instead.
 */
export async function applyPush(
  ctx: PushContext,
  mutations: Mutation[],
  lastApplied: number,
  entities: Record<string, EntitySpec>,
  opts: { resumable?: boolean } = {},
): Promise<number> {
  let last = lastApplied;
  const stopHere = (e: unknown) => {
    if (isTransient(e) && opts.resumable) return true;
    throw e;
  };
  for (const m of mutations) {
    if (m.id <= last) continue;                       // already applied: a retry
    try {
      const spec = entities[m.entity];
      if (!spec) throw new Rejected('invalid', `unknown entity: ${m.entity}`);
      const statements = spec.custom ? await spec.custom(ctx, m) : await buildStatements(ctx, spec, m);
      try {
        await ctx.db.batch([...statements, ack(ctx, m.id)]);
      } catch (e) {
        throw await diagnose(ctx, spec, m, e);
      }
    } catch (e) {
      if (isTransient(e) && stopHere(e)) break;
      const r = e instanceof Rejected ? e : new Rejected('invalid', e instanceof Error ? e.message : String(e));
      try {
        await ctx.db.batch([
        ctx.db.prepare(
          `INSERT OR REPLACE INTO sync_rejections (device_id, mutation_id, code, message, current, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).bind(ctx.deviceId, m.id, r.code, r.message.slice(0, 500),
          r.current === null ? null : JSON.stringify(r.current), ctx.now),
          ack(ctx, m.id),
        ]);
      } catch (e2) {
        if (stopHere(e2)) break;
      }
    }
    last = m.id;
  }
  return last;
}

/** Advance the device's acknowledgement — always in the same batch as the effect. */
function ack(ctx: PushContext, mutationId: number): D1PreparedStatement {
  return ctx.db.prepare(
    'UPDATE devices SET last_mutation_id = ?, last_seen_at = ? WHERE id = ? AND last_mutation_id < ?',
  ).bind(mutationId, ctx.now, ctx.deviceId, mutationId);
}
