import type * as SQLite from 'expo-sqlite';
import { softDeleteTxn, restoreTxn } from './transactions';
import type { ApprovalState, PayMethod } from '../../constants/enums';

export { NOT_AWAITING_APPROVAL } from './approvalSql';

export type TxnApproval = {
  txn_id: string;
  state: ApprovalState;
  created_at: number;
  decided_at: number | null;
  /** Where an incoming transfer actually landed for me. Null for everything else. */
  landed_pay_method: string | null;
};

/** Every entry still waiting on me, oldest arrival first. */
export async function getPendingApprovals(db: SQLite.SQLiteDatabase): Promise<TxnApproval[]> {
  return db.getAllAsync<TxnApproval>(
    // `created_at` is when it ARRIVED. Never `txn.date` — the peer chose that,
    // and a back-dated entry would bury itself at the bottom of the queue.
    // Joined to `txn` so a deleted entry can never leave a phantom in the queue
    // or the badge — the two writes in `rejectTxn` are not atomic (see there).
    `SELECT a.* FROM txn_approval a
       JOIN txn t ON t.id = a.txn_id AND t.is_deleted = 0
      WHERE a.state = 'pending' ORDER BY a.created_at ASC`,
  );
}

/** Drives the Home badge. Cheap enough to sit in the dashboard load. */
export async function getPendingApprovalCount(db: SQLite.SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM txn_approval a
       JOIN txn t ON t.id = a.txn_id AND t.is_deleted = 0
      WHERE a.state = 'pending'`,
  );
  return row?.n ?? 0;
}

export async function getApproval(
  db: SQLite.SQLiteDatabase,
  txnId: string,
): Promise<TxnApproval | null> {
  return db.getFirstAsync<TxnApproval>('SELECT * FROM txn_approval WHERE txn_id = ?', [txnId]);
}

/**
 * Accept an entry someone else wrote. From this moment it counts as my money
 * everywhere, because every analysis statement stops excluding it.
 *
 * The row is kept, not deleted: `decided_at` is what the detail screen shows
 * ("Approved 12 Aug"), and keeping it means a re-delivered envelope is recognised
 * as already-decided rather than asked again.
 */
export async function approveTxn(
  db: SQLite.SQLiteDatabase,
  txnId: string,
  /**
   * For an incoming transfer: where the money actually arrived. The sender says
   * how they sent it, but only the recipient knows where it landed, and the two
   * routinely differ — sent by UPI, landed in a bank account.
   */
  landedPayMethod?: PayMethod | null,
): Promise<void> {
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE txn_approval SET state = 'approved', decided_at = ?, landed_pay_method = ?
        WHERE txn_id = ? AND state = 'pending'`,
      [now, landedPayMethod ?? null, txnId],
    );
    // Also written onto the entry itself, because on MY device `pay_method` should
    // describe what happened to MY money — that is what `CASH_TOTALS_SQL` reads to
    // tell a card repayment from cash moving. The approval row keeps the record of
    // the decision; this makes the ledger act on it without a second read path.
    if (landedPayMethod) {
      await db.runAsync('UPDATE txn SET pay_method = ?, updated_at = ? WHERE id = ?', [landedPayMethod, now, txnId]);
    }
  });
}

/**
 * Refuse an entry someone else wrote.
 *
 * Two writes, and both are needed. The approval row records **my decision**, so a
 * re-delivery is never asked again. The soft delete removes it from the group
 * ledger on **my** device — I have said this did not happen, so it should stop
 * being shown as though it did.
 *
 * It does NOT reach their copy. Under sync their device still holds the entry and
 * their balance will disagree with mine until one of us changes it — a real hole,
 * recorded as F10 rather than half-solved here.
 */
export async function rejectTxn(db: SQLite.SQLiteDatabase, txnId: string): Promise<void> {
  // Two writes, NOT wrapped in a transaction: `softDeleteTxn` opens its own, and
  // expo-sqlite cannot nest. So the ORDER is what keeps every intermediate state
  // safe, and it is the deliberate one.
  //
  // Delete first. Between the two writes the entry is deleted and still 'pending'
  // — invisible and uncounted, which is the harmless direction. The reverse order
  // would leave a moment where the entry is marked 'rejected' but not yet deleted,
  // and 'rejected' is not filtered, so it would briefly count as my money. If the
  // second write then failed, it would stay that way.
  await softDeleteTxn(db, txnId);
  await db.runAsync(
    "UPDATE txn_approval SET state = 'rejected', decided_at = ? WHERE txn_id = ?",
    [Date.now(), txnId],
  );
}

/** Undo either decision, putting the entry back in the queue exactly as it was. */
export async function reopenApproval(db: SQLite.SQLiteDatabase, txnId: string): Promise<void> {
  // Same reasoning as `rejectTxn`, mirrored: mark it pending first, so it is
  // filtered out again BEFORE it becomes visible. Restoring first would show a
  // still-'rejected' entry that every figure counts.
  await db.runAsync(
    "UPDATE txn_approval SET state = 'pending', decided_at = NULL WHERE txn_id = ?",
    [txnId],
  );
  // Only a reject soft-deleted it; restoring an already-live row is a no-op.
  await restoreTxn(db, txnId);
}
