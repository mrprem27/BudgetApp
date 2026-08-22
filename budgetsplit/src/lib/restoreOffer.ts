import type * as SQLite from 'expo-sqlite';
import { listServerBackups, serverConfigured, getStoredSession } from './serverApi';
import { settings } from './settings';

/**
 * "You have a copy on your account — want it back?"
 *
 * The last step of "keep a copy of everything". Snapshots upload on their own,
 * but until this existed, getting one back meant knowing to go to Settings →
 * Backup → Restore from your account. Someone setting up a replacement phone has
 * no reason to look there, and the whole feature is worthless if they do not.
 *
 * ### Why it only offers on an EMPTY device
 *
 * A restore is wipe-and-replace. Offering it to somebody who has been using the
 * app is offering to destroy their work, and a prompt that appears next to real
 * data is a prompt somebody eventually taps by accident. On a phone with nothing
 * on it there is nothing to lose, which is the only condition under which this
 * should ever appear unasked.
 *
 * Anyone with existing data can still restore deliberately, from the screen built
 * for it, with its own confirmation.
 */

/** What the offer needs to know, and nothing more. */
export type RestoreOffer = {
  /** How many copies the account holds — "your most recent of 4". */
  count: number;
  /** When the newest was taken. */
  newestAt: number;
};

/**
 * Null when there is nothing to offer, or nobody to offer it to.
 *
 * Never throws: this runs at launch behind a `catch`, and a network failure must
 * not delay or break the first screen.
 */
export async function pendingRestoreOffer(
  db: SQLite.SQLiteDatabase,
): Promise<RestoreOffer | null> {
  if (!serverConfigured()) return null;
  if (!(await getStoredSession())) return null;

  // Asked once. Someone who said no is setting this phone up as a fresh start,
  // and asking again on every launch would be nagging them out of a decision
  // they already made.
  if (await settings.restoreOfferDismissed().catch(() => false)) return null;

  if (!(await isFreshDevice(db))) return null;

  try {
    const backups = await listServerBackups();
    if (backups.length === 0) return null;
    return {
      count: backups.length,
      newestAt: Math.max(...backups.map(b => b.createdAt)),
    };
  } catch {
    // Offline, or the session died. Nothing to say — it will ask next launch.
    return null;
  }
}

/**
 * Has anything been done on this phone yet?
 *
 * Transactions are the test, not "is the database new". A fresh install runs
 * onboarding, which writes a person, a personal group, categories and possibly a
 * money profile — all of which exist on a phone that has still recorded nothing.
 * Counting rows in `txn` is the only measure that matches what a user would call
 * "I haven't used it yet", and it is deliberately inclusive of soft-deleted and
 * pending rows: any of them means somebody has been here.
 */
async function isFreshDevice(db: SQLite.SQLiteDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM txn');
  return (row?.n ?? 0) === 0;
}
