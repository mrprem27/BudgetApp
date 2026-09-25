import type * as SQLite from 'expo-sqlite';
import { serverConfigured, getStoredSession } from './serverApi';
import { settings } from './settings';

/**
 * "Used BudgetSplit before?" — the way back to an account on a replacement phone.
 *
 * Signing in restores everything (the first sign-in, `lib/sync/firstSignIn.ts`),
 * but someone setting up a replacement phone has no reason to open Settings →
 * Account, and the whole feature is worthless if they do not.
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
/**
 * A fresh phone with no session: the one device that most needs to hear that
 * signing in brings everything back, and the one that would never think to look.
 *
 * Onboarding tells the user nothing needs an account, so nothing anywhere
 * suggested signing in, and a replacement phone had no way back to its data but
 * guessing at Settings → Account. Offering sign-in promises nothing — it says the
 * door is there. Only ever on a phone with nothing on it, so it is never shown to
 * somebody with work here.
 */
export type RestoreOffer = { kind: 'sign-in' };

/** Null when there is nothing to offer, or nobody to offer it to. Runs at launch, behind a `catch`. */
export async function pendingRestoreOffer(
  db: SQLite.SQLiteDatabase,
): Promise<RestoreOffer | null> {
  if (!serverConfigured()) return null;

  // Asked once. Someone who said no is setting this phone up as a fresh start,
  // and asking again on every launch would be nagging them out of a decision
  // they already made.
  if (await settings.restoreOfferDismissed().catch(() => false)) return null;

  // Only ever offered on a phone with nothing on it.
  if (!(await isFreshDevice(db))) return null;

  // Signed in already: the first sign-in brought the account's data, or there was none.
  if (await getStoredSession()) return null;
  return { kind: 'sign-in' };
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
