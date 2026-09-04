import type * as SQLite from 'expo-sqlite';
import { softDeleteTxn, restoreTxn } from './transactions';
import { logAudit } from './audit';
import type { ApprovalState, PayMethod } from '../../constants/enums';

export { NOT_AWAITING_APPROVAL } from './approvalSql';

export type TxnApproval = {
  txn_id: string;
  state: ApprovalState;
  created_at: number;
  decided_at: number | null;
  /** Where an incoming transfer actually landed for me. Null for everything else. */
  landed_pay_method: string | null;
  /** 1 when the author has retracted an entry I already accepted. See the schema. */
  pending_delete: number;
};

/**
 * Two shapes of "waiting on me", and they are not the same question.
 *
 * `state = 'pending'` is an entry that has never counted. `pending_delete = 1` is
 * an entry that IS counting and whose author now says it should not. Both need a
 * decision from me; only the first is excluded from my money figures, which is
 * why they cannot share one column.
 */
const AWAITING_ME = `(a.state = 'pending' OR a.pending_delete = 1)`;

/** Every entry still waiting on me, oldest arrival first. */
export async function getPendingApprovals(db: SQLite.SQLiteDatabase): Promise<TxnApproval[]> {
  return db.getAllAsync<TxnApproval>(
    // `created_at` is when it ARRIVED. Never `txn.date` — the peer chose that,
    // and a back-dated entry would bury itself at the bottom of the queue.
    // Joined to `txn` so a deleted entry can never leave a phantom in the queue
    // or the badge — the two writes in `rejectTxn` are not atomic (see there).
    `SELECT a.* FROM txn_approval a
       JOIN txn t ON t.id = a.txn_id AND t.is_deleted = 0
      WHERE ${AWAITING_ME} ORDER BY a.created_at ASC`,
  );
}

/** Drives the Home badge. Cheap enough to sit in the dashboard load. */
export async function getPendingApprovalCount(db: SQLite.SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM txn_approval a
       JOIN txn t ON t.id = a.txn_id AND t.is_deleted = 0
      WHERE ${AWAITING_ME}`,
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
  /*
   * A retraction is approved by APPLYING it — agreeing that the entry should go.
   *
   * Read before the transaction because `softDeleteTxn` opens its own and
   * expo-sqlite cannot nest, so this cannot all be one write. Order is what keeps
   * it safe: clear the flag first, so a failure between the two leaves the entry
   * counting and un-flagged (asked again on the next sync) rather than silently
   * gone — the same "fail toward still-visible" reasoning as `rejectTxn`.
   */
  const retraction = await db.getFirstAsync<{ n: number }>(
    'SELECT 1 AS n FROM txn_approval WHERE txn_id = ? AND pending_delete = 1', [txnId],
  );
  if (retraction) {
    await db.runAsync(
      `UPDATE txn_approval SET pending_delete = 0, state = 'approved', decided_at = ? WHERE txn_id = ?`,
      [now, txnId],
    );
    await softDeleteTxn(db, txnId, false, true);
    await logAudit(db, {
      entityType: 'txn', entityId: txnId, action: 'deleted',
      summary: 'You agreed to remove an entry the author retracted',
    });
    return;
  }
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
    /*
     * The decision, not just the entry (F21).
     *
     * "I accepted Aarav's ₹4,000" appeared nowhere — which is exactly the record
     * a disagreement gets settled from, and the one place a dispute would send
     * you looking. Inside the transaction, so the log and the decision commit or
     * roll back together.
     */
    await logAudit(db, {
      entityType: 'txn', entityId: txnId, action: 'updated',
      summary: 'You accepted an entry somebody else wrote',
    });
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
 * It does NOT edit their copy, and must not: I can refuse an entry, not rewrite
 * what someone else recorded. What it does now is TELL them — `dispute_state` is
 * a one-column outbox the sync drain turns into an objection on their screen
 * (F10). Before that, their balance and mine simply disagreed and neither of us
 * was told, which is the worst thing this app can do with money.
 */
export async function rejectTxn(db: SQLite.SQLiteDatabase, txnId: string): Promise<void> {
  /*
   * Refusing a RETRACTION means "no, this did happen" — so the entry stays
   * exactly where it is and only the flag clears. It must not fall through to the
   * soft delete below, which would carry out the very removal I just refused.
   *
   * `dispute_state = 'raise'` still fires: the author needs to know I disagreed,
   * and that is the same need the rejection path has.
   */
  const retraction = await db.getFirstAsync<{ n: number }>(
    'SELECT 1 AS n FROM txn_approval WHERE txn_id = ? AND pending_delete = 1', [txnId],
  );
  if (retraction) {
    await db.runAsync(
      `UPDATE txn_approval SET pending_delete = 0, decided_at = ?, dispute_state = 'raise' WHERE txn_id = ?`,
      [Date.now(), txnId],
    );
    await logAudit(db, {
      entityType: 'txn', entityId: txnId, action: 'updated',
      summary: 'You refused a retraction — the entry stays',
    });
    return;
  }
  // Two writes, NOT wrapped in a transaction: `softDeleteTxn` opens its own, and
  // expo-sqlite cannot nest. So the ORDER is what keeps every intermediate state
  // safe, and it is the deliberate one.
  //
  // Delete first. Between the two writes the entry is deleted and still 'pending'
  // — invisible and uncounted, which is the harmless direction. The reverse order
  // would leave a moment where the entry is marked 'rejected' but not yet deleted,
  // and 'rejected' is not filtered, so it would briefly count as my money. If the
  // second write then failed, it would stay that way.
  // The one caller allowed to remove somebody else's entry, because it is the
  // labelled way to do it: the decision is recorded and an objection is queued.
  await softDeleteTxn(db, txnId, false, true);
  /*
   * INSERT OR REPLACE, not UPDATE.
   *
   * An entry from a TRUSTED author is applied on arrival and never gets an
   * approval row — so an UPDATE here matched nothing, and rejecting it left no
   * record of the decision anywhere but the soft delete. That was survivable
   * while nothing could edit an entry after the fact. It is not survivable now:
   * a v2 of a rejected entry would find no rejection, see a trusted author, and
   * apply itself — erasing my decision with nothing to show it ever existed.
   *
   * The decision is the thing worth persisting. It belongs here whether or not
   * the entry ever had to wait.
   */
  await db.runAsync(
    `INSERT OR REPLACE INTO txn_approval (txn_id, state, created_at, decided_at, dispute_state)
     VALUES (?, 'rejected', COALESCE((SELECT created_at FROM txn_approval WHERE txn_id = ?), ?), ?, 'raise')`,
    [txnId, txnId, Date.now(), Date.now()],
  );
  await logAudit(db, {
    entityType: 'txn', entityId: txnId, action: 'deleted',
    summary: 'You refused an entry somebody else wrote',
  });
}

/** Undo either decision, putting the entry back in the queue exactly as it was. */
export async function reopenApproval(db: SQLite.SQLiteDatabase, txnId: string): Promise<void> {
  // Same reasoning as `rejectTxn`, mirrored: mark it pending first, so it is
  // filtered out again BEFORE it becomes visible. Restoring first would show a
  // still-'rejected' entry that every figure counts.
  /*
   * 'clear' rather than NULL: if the rejection already reached the author, taking
   * it back has to reach them too. Leaving it NULL would strand an objection on
   * their screen that I have since withdrawn, and they would have no way to know.
   */
  await db.runAsync(
    "UPDATE txn_approval SET state = 'pending', decided_at = NULL, dispute_state = 'clear' WHERE txn_id = ?",
    [txnId],
  );
  // Only a reject soft-deleted it; restoring an already-live row is a no-op.
  await restoreTxn(db, txnId);
  await logAudit(db, {
    entityType: 'txn', entityId: txnId, action: 'updated',
    summary: 'You took back your decision — it is waiting again',
  });
}
