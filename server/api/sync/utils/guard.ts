import type { Db } from './access';

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

/** Was this error a guard tripping, rather than anything else going wrong? */
export function isGuardFailure(e: unknown): boolean {
  const message = e instanceof Error ? e.message : String(e);
  return /precondition_failed/.test(message);
}
