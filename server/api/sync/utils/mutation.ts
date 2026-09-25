import { canReadScope, ensurePerson, type Db } from './access';
import { guard, isGuardFailure, versionIs, type SyncedTable } from './guard';

/**
 * Shared shapes and helpers for writing one mutation (SPEC-SERVER.md §3.2).
 *
 * Every entity writer — the generic one in `push.ts`, and each `CustomSpec` in
 * `entities/*.ts` — builds on these three things: `Rejected` (why a mutation
 * failed), the stamped columns every synced row carries (`bumpScope`,
 * `createdAt`, `SCOPE_SEQ`), and `clean` (only the columns a client may write,
 * with values D1 can bind).
 */

const MAX_TEXT = 64 * 1024;

/** A user-scoped entity written by the generic builder in `push.ts`. */
export type GenericSpec = {
  table: SyncedTable;
  /** Compare-and-set on `version` (money), rather than last-write-wins. */
  money: boolean;
  /** The only data columns a client may write. */
  columns: readonly string[];
  /** A deterministic id derived from the row's natural key, when it has one. */
  id?: (userId: string, data: Record<string, unknown>) => string | null;
  /** Columns naming a person; a missing one is created as a placeholder. */
  ensurePeople?: readonly string[];
  /** A column naming a group the writer must currently be able to read. */
  readableGroup?: string;
  /** A column referencing another of the writer's own rows. */
  ownedReference?: { column: string; table: SyncedTable };
  /** Columns restricted to a fixed list of values (or patterns) beyond what the schema checks. */
  allowedValues?: Record<string, ReadonlyArray<string | RegExp>>;
  custom?: undefined;
};

/**
 * An entity whose writes need more than the generic shape — a group (it creates
 * its own scope and owner), a transaction (a bundle of rows, validated as one).
 * `custom` returns every statement for the batch except the acknowledgement,
 * which `applyPush` always appends itself.
 */
export type CustomSpec = {
  table: SyncedTable;
  money: boolean;
  custom: (ctx: PushContext, m: Mutation) => Promise<D1PreparedStatement[]>;
  /** Explain a tripped guard. Defaults to "changed on another device". */
  diagnose?: (ctx: PushContext, m: Mutation) => Promise<Rejected>;
};

export type EntitySpec = GenericSpec | CustomSpec;

export type Mutation = {
  id: number;
  entity: string;
  op: 'upsert' | 'delete';
  entityId: string;
  baseVersion: number;
  data?: Record<string, unknown>;
};

export type RejectionCode = 'conflict' | 'forbidden' | 'invalid' | 'not_found';
export class Rejected extends Error {
  constructor(readonly code: RejectionCode, message: string, readonly current: unknown = null) {
    super(message);
  }
}

export type PushContext = { db: Db; userId: string; deviceId: string; now: number };

/**
 * When the row was created, as the phone says it — accepted on CREATE only.
 *
 * Offline-first means only the phone knows when a row was made, and the app
 * orders by it (groups, transactions on one day, assets, goals). Stamping the
 * upload time instead would give a months-old ledger one timestamp and reorder
 * a restored phone. Nothing is protected by distrusting the creation time of
 * one's own row — approvals use the server's own `arrived_at` — so the value is
 * accepted, bounded to a sane range, and otherwise replaced by `now`.
 * `updated_at` stays the server's.
 */
export function createdAt(raw: Record<string, unknown> | undefined, now: number): number {
  const v = raw?.created_at;
  return typeof v === 'number' && Number.isInteger(v) && v >= Date.UTC(2020, 0, 1) && v <= now + 5 * 60_000 ? v : now;
}

/** The scope's counter, as a subquery — read after `bumpScope` in the same batch. */
export const SCOPE_SEQ = '(SELECT seq FROM sync_scopes WHERE id = ?)';

/** Advance a scope's change counter. Every write does this once, in its own batch. */
export function bumpScope(ctx: PushContext, scopeId: string): D1PreparedStatement {
  return ctx.db.prepare('UPDATE sync_scopes SET seq = seq + 1 WHERE id = ?').bind(scopeId);
}

/** Keep only writable columns, with values D1 can bind. */
export function clean(
  table: string,
  columns: readonly string[],
  data: Record<string, unknown>,
  allowedValues?: Record<string, ReadonlyArray<string | RegExp>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of columns) {
    if (!(col in data)) continue;
    const v = data[col];
    if (v === undefined) continue;
    if (v !== null && typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') {
      throw new Rejected('invalid', `${table}.${col}: must be a string, number, boolean or null`);
    }
    if (typeof v === 'string' && v.length > MAX_TEXT) throw new Rejected('invalid', `${table}.${col}: too long`);
    if (typeof v === 'number' && !Number.isFinite(v)) throw new Rejected('invalid', `${table}.${col}: not a number`);
    const allowed = allowedValues?.[col];
    if (allowed && !allowed.some(a => (typeof a === 'string' ? a === String(v) : a.test(String(v))))) {
      throw new Rejected('invalid', `${table}.${col}: ${String(v)} is not allowed`);
    }
    out[col] = typeof v === 'boolean' ? (v ? 1 : 0) : v;
  }
  return out;
}

/** The generic entity write: create, update or soft-delete a user-scoped row. */
export async function buildStatements(ctx: PushContext, spec: GenericSpec, m: Mutation): Promise<D1PreparedStatement[]> {
  const { db, userId, now } = ctx;
  const t = spec.table;
  const data = m.op === 'upsert' ? clean(spec.table, spec.columns, m.data ?? {}, spec.allowedValues) : {};

  // The row's id: derived from its natural key where one exists, else the client's.
  let id = m.entityId;
  if (spec.id) {
    const derived = spec.id(userId, m.op === 'upsert' ? data : {});
    if (m.op === 'upsert') {
      if (!derived) throw new Rejected('invalid', `${t}: missing the columns its id is made from`);
      if (derived !== m.entityId) throw new Rejected('invalid', `${t}: id must be ${derived}`);
      id = derived;
    }
  }

  const existing = await db.prepare(`SELECT scope_id, version, deleted_at FROM ${t} WHERE id = ?`)
    .bind(id).first<{ scope_id: string; version: number; deleted_at: number | null }>();
  if (existing && existing.scope_id !== userId) throw new Rejected('forbidden', `${t}: that id belongs to someone else`);

  const pre: D1PreparedStatement[] = [
    // Fence: whatever happens between this read and the batch, the row may not be someone else's.
    guard(db, `NOT EXISTS (SELECT 1 FROM ${t} WHERE id = ? AND scope_id <> ?)`, id, userId),
  ];
  if (spec.money) {
    // Compare-and-set. A create claims baseVersion 0; anything else names the version it saw.
    pre.push(versionIs(db, t, id, m.baseVersion));
  }

  if (m.op === 'delete') {
    if (!existing) throw new Rejected('not_found', `${t}: nothing to delete`);
    return [
      ...pre,
      bumpScope(ctx, userId),
      db.prepare(
        `UPDATE ${t} SET deleted_at = ?, version = version + 1, seq = ${SCOPE_SEQ}, updated_at = ?, updated_by = ?
          WHERE id = ?`,
      ).bind(now, userId, now, userId, id),
    ];
  }

  // Validation that needs the database, done before building the write.
  if (spec.readableGroup && typeof data[spec.readableGroup] === 'string') {
    if (!(await canReadScope(db, userId, data[spec.readableGroup] as string))) {
      throw new Rejected('forbidden', `${t}: not a member of that group`);
    }
  }
  if (spec.ownedReference) {
    const ref = spec.ownedReference;
    pre.push(guard(db, `EXISTS (SELECT 1 FROM ${ref.table} WHERE id = ? AND scope_id = ?)`, data[ref.column], userId));
  }
  for (const col of spec.ensurePeople ?? []) {
    if (typeof data[col] === 'string') {
      pre.push(ensurePerson(db, data[col] as string, null, userId, now));
    }
  }

  const cols = Object.keys(data);
  if (existing) {
    const sets = cols.map(c => `${c} = ?`);
    return [
      ...pre,
      bumpScope(ctx, userId),
      db.prepare(
        `UPDATE ${t} SET ${[...sets, 'deleted_at = NULL', 'version = version + 1', `seq = ${SCOPE_SEQ}`, 'updated_at = ?', 'updated_by = ?'].join(', ')}
          WHERE id = ?`,
      ).bind(...cols.map(c => data[c]), userId, now, userId, id),
    ];
  }
  const all = ['id', 'scope_id', 'user_id', 'version', 'created_at', 'updated_at', 'created_by', 'updated_by', ...cols];
  return [
    ...pre,
    bumpScope(ctx, userId),
    db.prepare(
      `INSERT INTO ${t} (${all.join(', ')}, seq)
       VALUES (${all.map(() => '?').join(', ')}, ${SCOPE_SEQ})`,
    ).bind(id, userId, userId, 1, createdAt(m.data, now), now, userId, userId, ...cols.map(c => data[c]), userId),
  ];
}

/** A batch failed: say why, reading the row's state now. */
export async function diagnose(ctx: PushContext, spec: EntitySpec, m: Mutation, e: unknown): Promise<Rejected> {
  if (e instanceof Rejected) return e;
  const message = e instanceof Error ? e.message : String(e);
  if (!isGuardFailure(e)) return new Rejected('invalid', message.replace(/^D1_ERROR:\s*/, ''));
  if (spec.custom) {
    if (spec.diagnose) return spec.diagnose(ctx, m);
    const current = await ctx.db.prepare(`SELECT * FROM ${spec.table} WHERE id = ?`).bind(m.entityId).first();
    return new Rejected('conflict', `${spec.table}: changed on another device`, current);
  }
  const id = spec.id ? spec.id(ctx.userId, clean(spec.table, spec.columns, m.data ?? {}, spec.allowedValues)) ?? m.entityId : m.entityId;
  const row = await ctx.db.prepare(`SELECT * FROM ${spec.table} WHERE id = ?`).bind(id).first<Record<string, unknown>>();
  if (row && row.scope_id !== ctx.userId) return new Rejected('forbidden', `${spec.table}: that id belongs to someone else`);
  if (spec.ownedReference && m.op === 'upsert') {
    const ref = spec.ownedReference;
    const owns = await ctx.db.prepare(`SELECT 1 AS ok FROM ${ref.table} WHERE id = ? AND scope_id = ?`)
      .bind((m.data ?? {})[ref.column], ctx.userId).first();
    if (!owns) return new Rejected('forbidden', `${spec.table}.${ref.column}: not yours`);
  }
  return new Rejected('conflict', `${spec.table}: changed on another device`, row);
}
