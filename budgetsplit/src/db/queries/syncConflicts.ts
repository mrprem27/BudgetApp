import type * as SQLite from 'expo-sqlite';
import { applyRows, recordedRejections, resolveRejection, type RecordedRejection } from './syncApply';
import { queueUpsert } from './syncQueue';
import type { Row } from '../../lib/sync/rowMap';

/**
 * What the server said no to, per transaction (SPEC-SERVER.md §6.3, task S17).
 *
 * - **Refused**: the change was not allowed (you left the group, it isn't yours).
 *   The phone already went back to the server's copy; this only explains why.
 * - **Conflict**: someone changed the same transaction first, on another phone.
 *   The server's copy is on the phone now, and yours is kept beside it until the
 *   person picks one. Never merged: money is one person's decision (principle 5).
 */
export type TxnSyncIssue = {
  mutationId: number;
  kind: 'conflict' | 'refused';
  message: string;
  at: number;
  yours?: Row;
  theirs?: Row;
};

const asIssue = (r: RecordedRejection): TxnSyncIssue => ({
  mutationId: r.mutationId,
  kind: r.code === 'conflict' && r.yours && r.theirs ? 'conflict' : 'refused',
  message: r.message,
  at: r.at,
  yours: r.yours,
  theirs: r.theirs,
});

/** Unanswered issues on one transaction, newest first. */
export async function syncIssuesFor(db: SQLite.SQLiteDatabase, txnId: string): Promise<TxnSyncIssue[]> {
  return (await recordedRejections(db))
    .filter(r => !r.resolved && r.entity === 'transactions' && r.entityId === txnId)
    .map(asIssue);
}

/** Every unanswered money conflict, for the Review inbox. */
export async function openConflicts(db: SQLite.SQLiteDatabase): Promise<Array<TxnSyncIssue & { txnId: string }>> {
  return (await recordedRejections(db))
    .filter(r => !r.resolved && r.entity === 'transactions' && r.code === 'conflict' && r.yours && r.theirs)
    .map(r => ({ ...asIssue(r), txnId: r.entityId }));
}

/** Theirs is already on the phone: just stop asking. Also dismisses a refusal. */
export async function keepTheirs(db: SQLite.SQLiteDatabase, mutationId: number): Promise<void> {
  await resolveRejection(db, mutationId);
}

/**
 * Put this phone's version back and send it again — as an edit ON TOP of theirs
 * (their version becomes the base), so the server accepts it and every phone
 * ends on yours. One local transaction: the transaction and its queue row land
 * together or not at all.
 */
export async function keepYours(db: SQLite.SQLiteDatabase, mutationId: number, userId: string): Promise<boolean> {
  const r = (await recordedRejections(db)).find(x => x.mutationId === mutationId);
  if (!r?.yours || !r.theirs) return false;
  const theirs = r.theirs;
  const scope = String(theirs.scope_id ?? userId);
  await db.withTransactionAsync(async () => {
    await applyRows(db, {
      id: scope,
      kind: scope === userId ? 'user' : 'group',
      rows: {
        transactions: [{
          ...r.yours,
          id: r.entityId,
          scope_id: theirs.scope_id,
          author_id: theirs.author_id,
          version: theirs.version,
          created_at: theirs.created_at,
          updated_at: Date.now(),
          deleted_at: null,
        }],
      },
    }, { userId });
    await queueUpsert(db, 'txn', r.entityId);
  });
  await resolveRejection(db, mutationId);
  return true;
}
