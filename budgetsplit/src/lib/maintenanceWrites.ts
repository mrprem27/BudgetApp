import type * as SQLite from 'expo-sqlite';
import { materializeDueOccurrences } from '../db/queries/recurring';
import { runSavingsMaintenance } from '../db/queries/savings';
import { setPendingOverspendNotice } from './overspendNotice';
import { isRestoring } from './restoreGuard';

/**
 * What a return to the app catches up on: recurring occurrences that came due while it was away,
 * then goal funding and the overspend check (which should see those occurrences). Skipped while a
 * restore holds the database. Resolves to whether anything was written; never rejects.
 */
export async function runForegroundMaintenance(db: SQLite.SQLiteDatabase): Promise<boolean> {
  if (isRestoring()) return false;
  const posted = await materializeDueOccurrences(db).catch(() => 0);
  const raid = await runSavingsMaintenance(db).catch(() => null);
  if (raid && raid.total > 0) await setPendingOverspendNotice(raid).catch(() => {});
  return posted > 0 || (raid?.total ?? 0) > 0;
}

/*
 * The root layout runs the catch-up on its own connection, as it always has — sync, the voice drain
 * and the payment checks run at the same moment on the provider's, and two transactions on one
 * connection collide. But the root sits above `DataRefreshProvider` and cannot tell the screens, so
 * it leaves the run here and the tab layout waits on it, then refreshes (`P2-5`).
 */
let latest: Promise<boolean> = Promise.resolve(false);

/** Root layout, on each foreground. */
export function startForegroundMaintenance(db: SQLite.SQLiteDatabase): void {
  latest = runForegroundMaintenance(db);
}

/** Tab layout: whether the latest foreground catch-up wrote anything, once it has finished. */
export function foregroundMaintenanceDone(): Promise<boolean> {
  return latest;
}
