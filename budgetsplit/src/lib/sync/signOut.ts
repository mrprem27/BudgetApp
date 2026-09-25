import type * as SQLite from 'expo-sqlite';
import { linkedUser } from '../../db/queries/syncApply';
import { queueCount } from '../../db/queries/syncQueue';
import { readAllTables, wipeToFreshInstall } from '../../db/queries/backup';
import { buildBackupPayload } from '../backup';
import { beginRestore, endRestore } from '../restoreGuard';
import { syncOnce, type Transport } from './engine';

/**
 * Signing out (SPEC-SERVER.md §4.1, `DQ-97`). The server holds everything, so a
 * signed-out phone keeps nothing — but only once everything is actually there.
 *
 * | Phone                               | Plan     |
 * |-------------------------------------|----------|
 * | not linked to this account          | `keep`   — its data exists nowhere else |
 * | linked, nothing left after a sync   | `wipe`   |
 * | linked, changes still waiting       | `unsent` — the caller warns |
 */
export type SignOutPlan =
  | { kind: 'keep' }
  | { kind: 'wipe' }
  | { kind: 'unsent'; count: number };

/** Run one sync, then say what signing out may do. "Nothing waiting" is checked AFTER the sync. */
export async function planSignOut(
  db: SQLite.SQLiteDatabase,
  transport: Transport,
  userId: string,
): Promise<SignOutPlan> {
  if ((await linkedUser(db)) !== userId) return { kind: 'keep' };
  await syncOnce(db, transport, userId);   // never throws; a failure just leaves rows queued
  const count = await queueCount(db);
  return count === 0 ? { kind: 'wipe' } : { kind: 'unsent', count };
}

/**
 * Empty the phone back to a fresh install. `writeExport` (for "Sign out anyway")
 * gets this phone's data before anything is touched; if it throws, nothing
 * happens. The wipe itself is one transaction, so a failure leaves the phone as
 * it was — and the caller clears the session only after this resolves.
 */
export async function wipeForSignOut(
  db: SQLite.SQLiteDatabase,
  opts: { writeExport?: (json: string) => Promise<void> } = {},
): Promise<void> {
  if (opts.writeExport) await opts.writeExport(JSON.stringify(buildBackupPayload(await readAllTables(db))));
  beginRestore();
  try {
    await wipeToFreshInstall(db);
  } finally {
    endRestore();
  }
}
