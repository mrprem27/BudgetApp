import type { Db } from './access';
import { errorMessage } from '../../lib';

/**
 * Preconditions that live INSIDE a D1 batch (SPEC-SERVER.md §2.10).
 *
 * D1 has no interactive transactions: a check read before `batch()` can be stale
 * by the time the batch runs. So a precondition is written as a statement in the
 * batch itself — `INSERT INTO write_guard SELECT 1 WHERE NOT (<condition>)` — and
 * when the condition is false the insert trips `write_guard`'s `CHECK (0)` and the
 * whole batch rolls back. The check and the write it protects commit together or
 * not at all.
 *
 * Table and column names are never taken from a request: they come from the
 * allowlist below, so a guard cannot be turned into an injection.
 */

export const SYNCED_TABLES = [
  'profiles', 'friends', 'groups', 'group_members', 'group_preferences', 'categories', 'budgets',
  'assets', 'savings_goals', 'savings_transactions', 'money_profiles', 'user_preferences',
  'imported_transactions', 'transactions', 'approvals', 'trust_settings', 'disputes',
] as const;
export type SyncedTable = typeof SYNCED_TABLES[number];

export const isSyncedTable = (t: string): t is SyncedTable =>
  (SYNCED_TABLES as readonly string[]).includes(t);

/** Abort the batch unless `condition` (with `binds`) holds. */
export function guard(db: Db, condition: string, ...binds: unknown[]): D1PreparedStatement {
  return db.prepare(`INSERT INTO write_guard SELECT 1 WHERE NOT (${condition})`).bind(...binds);
}

/**
 * Compare-and-set: the row must be at exactly the version the client saw.
 * A create passes `baseVersion` 0 and requires that the row does not exist yet.
 */
export function versionIs(db: Db, table: SyncedTable, id: string, baseVersion: number): D1PreparedStatement {
  if (!isSyncedTable(table)) throw new Error(`not a synced table: ${table}`);
  return baseVersion === 0
    ? guard(db, `NOT EXISTS (SELECT 1 FROM ${table} WHERE id = ?)`, id)
    : guard(db, `EXISTS (SELECT 1 FROM ${table} WHERE id = ? AND version = ?)`, id, baseVersion);
}

/**
 * The platform failing, not the mutation: D1's own messages for a dropped
 * connection, an overloaded database, or a Worker past its query limit. The same
 * mutation would succeed later, so it must never be recorded as refused — the push
 * fails instead, and the phone retries it. Narrow on purpose: an error this does
 * not recognise is judged as the mutation's fault, and surfaces as a refusal.
 * (The query limit itself is kept clear of by `countQueries`, not caught here.)
 */
export function isTransient(e: unknown): boolean {
  return /network connection lost|overloaded|too many api requests|storage operation exceeded timeout|cannot resolve d1/i
    .test(errorMessage(e));
}

/** Was this error a guard tripping, rather than anything else going wrong? */
export function isGuardFailure(e: unknown): boolean {
  return /precondition_failed/.test(errorMessage(e));
}

/**
 * The same database, counting every query it runs — a `first`/`all`/`run`, or a
 * whole `batch` — so a push can stop cleanly before the Worker's per-request limit
 * (50 on Workers Free, 1000 on Paid) instead of hitting it part-way through a write.
 */
export function countQueries(db: Db): { db: Db; used: () => number } {
  let n = 0;
  const inner = new WeakMap<object, D1PreparedStatement>();
  const wrap = (st: D1PreparedStatement): D1PreparedStatement => {
    const w = {
      bind: (...values: unknown[]) => wrap(st.bind(...values)),
      first: (column?: string) => { n++; return column === undefined ? st.first() : st.first(column); },
      all: () => { n++; return st.all(); },
      run: () => { n++; return st.run(); },
      raw: () => { n++; return st.raw(); },
    } as unknown as D1PreparedStatement;
    inner.set(w, st);
    return w;
  };
  return {
    db: {
      prepare: (sql: string) => wrap(db.prepare(sql)),
      batch: (statements: D1PreparedStatement[]) => { n++; return db.batch(statements.map(s => inner.get(s) ?? s)); },
    } as Db,
    used: () => n,
  };
}
