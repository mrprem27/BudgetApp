import type * as SQLite from 'expo-sqlite';
import { insertPending } from '../db/queries/pending';
import { getCategories } from '../db/queries/categories';
import { matchCategory } from './smartCategory';
import { getPendingPayment, setPendingPayment, shouldAskAbout, type PendingPayment } from './pendingPayment';
import { confirmAsync } from './confirm';
import { formatRupees } from './money';

/**
 * Ask about a handed-off UPI payment, and file it if it happened.
 *
 * This is the payoff of the whole Scan & Pay flow: the transaction you just made is
 * already known — payee, amount, time, method — so the alternative to one yes/no is
 * typing all of it from memory later, which is the friction the feature exists to
 * remove.
 *
 * It lands in `pending_txn`, not `txn`. The app never sees the payment succeed, so a
 * confirmed row still goes through Review like every other imported row, where the
 * category, group and split can be corrected before it counts.
 */
export async function askAboutPendingPayment(
  db: SQLite.SQLiteDatabase,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const p = await getPendingPayment();
  if (!p) return false;

  // Too fast to have paid, or too long ago to remember — see pendingPayment.ts.
  if (!shouldAskAbout(p, nowMs)) {
    await setPendingPayment(null);
    return false;
  }

  // Cleared before asking: whatever the answer, this handoff has been dealt with, and
  // a crash mid-dialog must not leave it to be asked again forever.
  await setPendingPayment(null);

  const who = p.name ?? p.vpa;
  const paid = await confirmAsync(
    'Did that payment go through?',
    `${formatRupees(p.amountPaise)} to ${who}. If it did, we'll add it to your review inbox — no typing.`,
    'Yes, add it',
  );
  if (!paid) return false;

  await recordScannedPayment(db, p, nowMs);
  return true;
}

/**
 * Write a scanned payment as a pending row, category guessed from the payee.
 *
 * Shared by both routes into Review, because they differ only in *when* we know the
 * payment happened, never in what gets written:
 *   - hand-off → confirmed on return by `askAboutPendingPayment`;
 *   - record-only → written at scan time, for a shop code we can't re-emit honestly
 *     (`ScanTarget.canHandoff`), where the user pays in their own UPI app instead.
 *
 * `pending_txn` either way. The app never observes a payment succeeding, so every row
 * goes through Review like any other import, where category, group and split can be
 * corrected before it counts.
 */
export async function recordScannedPayment(
  db: SQLite.SQLiteDatabase,
  p: PendingPayment,
  nowMs: number = Date.now(),
): Promise<void> {
  const description = p.name ?? p.vpa;
  // `p.category` is already MCC-derived where the code carried one — the merchant's own
  // declaration to their bank, so it outranks anything read off a display name.
  let category = p.category ?? null;
  if (!category) {
    // Reuse the same guesser Quick Add uses on a typed title — a merchant name is
    // exactly the kind of string it was built for ("Chai Stop" → Eating Out).
    try {
      category = matchCategory(description, await getCategories(db, 'expense'));
    } catch {
      category = null;
    }
  }

  await insertPending(db, [{
    date: nowMs,
    amount: p.amountPaise,
    description,
    kind: 'expense',
    category,
    direction: 'debit',
    source: 'upi_qr',
    pay_method: 'upi',
    raw: `Scanned & paid ${p.vpa}`,
    // Captured at scan time, not now: `nowMs` can be hours after the payment, and the
    // user has moved. See `PendingPayment.lat`.
    lat: p.lat,
    lng: p.lng,
    place_label: p.placeLabel,
  }]);
}
