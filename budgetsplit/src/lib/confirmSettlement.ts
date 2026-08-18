import type * as SQLite from 'expo-sqlite';
import type { PayMethod } from '../constants/enums';
import { recordSettlement } from '../db/queries/transactions';
import {
  getPendingSettlement, setPendingSettlement, shouldAskAboutSettlement,
  type PendingSettlement,
} from './pendingSettlement';
import { confirmAsync } from './confirm';
import { formatRupees } from './money';

/**
 * Ask about a handed-off settle-up, and record it if it happened.
 *
 * Settle-up used to be the one hand-off with no way back. Scan & Pay has asked
 * "did that payment go through?" since it shipped; tapping *Pay by UPI* on a
 * transfer just said **"Opens your UPI app. Come back and save to record it."**
 * and then relied on the user remembering to return and press Save. A payment
 * that succeeded and never got recorded leaves the balance permanently wrong for
 * two people, which is the failure this closes.
 *
 * The invariant is unchanged: **the app never records a settlement it did not
 * observe.** It cannot observe one — it only opens someone else's app. What it can
 * do is ask, once, while the user still remembers. A confirmation is the user
 * asserting the payment happened; the app is not guessing.
 *
 * Unlike a scanned payment this writes straight to the ledger rather than to
 * `pending_txn`. Review exists to fix category, group and split — a settlement has
 * all three settled before the hand-off, so there would be nothing to review.
 */
export async function askAboutPendingSettlement(
  db: SQLite.SQLiteDatabase,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const s = await getPendingSettlement();
  if (!s) return false;

  // Too fast to have paid, or too long ago to remember — see pendingPayment.ts.
  if (!shouldAskAboutSettlement(s, nowMs)) {
    await setPendingSettlement(null);
    return false;
  }

  // Cleared before asking: whatever the answer, this hand-off has been dealt with,
  // and a crash mid-dialog must not leave it to be asked again forever.
  await setPendingSettlement(null);

  const paid = await confirmAsync(
    'Did that payment go through?',
    `${formatRupees(s.amountPaise)} to ${s.payeeName}. If it did, we'll record the settlement — no typing.`,
    'Yes, record it',
  );
  if (!paid) return false;

  await writePendingSettlement(db, s);
  return true;
}

/**
 * Write the stored plan. Deliberately does **not** re-plan: `plans` was resolved
 * against the balances the user was looking at when they paid, and re-running
 * `planAllGroupsSettlement` now could settle a different group than the one the
 * prompt named. Same call `applyOverspendRaid` makes, for the same reason.
 */
export async function writePendingSettlement(
  db: SQLite.SQLiteDatabase,
  s: PendingSettlement,
): Promise<void> {
  for (const p of s.plans) {
    await recordSettlement(db, {
      groupId: p.groupId,
      fromId: p.from,
      toId: p.to,
      amount: p.amount,
      date: s.date,
      note: s.note,
      payMethod: s.payMethod as PayMethod | undefined,
      category: s.category,
    });
  }
}
