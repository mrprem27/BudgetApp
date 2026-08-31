import type * as SQLite from 'expo-sqlite';
import { NOT_AWAITING_APPROVAL } from './approvalSql';

/**
 * The queue of entries whose current state has not reached the server.
 *
 * Every function here is a **plain `runAsync`** — none of them opens a
 * transaction. That is not an oversight, it is the requirement: the outbox row
 * must commit with the write it describes, and expo-sqlite cannot nest
 * `withTransactionAsync`. `logAudit` has exactly this shape for exactly this
 * reason, and it is why `rejectTxn` could never be made atomic.
 *
 * A write that commits without its outbox row is silent divergence — the failure
 * mode with no symptom. Appending inside the caller's transaction is the whole
 * defence, so if you add a write path to `txn`, add a `queueEntry` beside it.
 *
 * **Only entries I wrote are ever queued**, and both guards below say so in SQL
 * rather than trusting a caller to remember. Two separate rules, and the first
 * was missing entirely:
 *
 * 1. `t.author_person_id IS NULL` — the entry is mine. Broadcasting somebody
 *    else's entry means broadcasting my *opinion* of it as its current state,
 *    and the worst case is not hypothetical: rejecting a **trusted** peer's
 *    entry soft-deletes it locally and used to queue that tombstone, so the
 *    server took the deletion and it vanished from everyone's ledger. A
 *    trusted author's entry applies on arrival and therefore has no
 *    `txn_approval` row at all, so `NOT_AWAITING_APPROVAL` never saw it.
 *    `approval.ts` states the rule this restores: rejecting "does NOT edit
 *    their copy, and must not" — an objection travels as a dispute, which is
 *    what `txn_dispute` is for.
 * 2. `NOT_AWAITING_APPROVAL` — an entry I have not accepted is not mine to
 *    re-send; it would arrive with a second author and my copy would look
 *    authoritative.
 *
 * Recurring RULES are queued on purpose, so this does NOT carry
 * `recur_freq IS NULL`. A peer can send a rule, and a rule they cannot see is a
 * bill that silently posts on their device with no explanation.
 */

/**
 * The entry is one I wrote. `author_person_id` is NULL for my own rows and set
 * for anything `ingestPeerTxn` wrote, so NULL is the whole test.
 *
 * Exported so `outboxAuthorInvariant.test.ts` can read the real statements and
 * fail on any new write to `sync_outbox` that omits it — the same mechanism
 * `approvalInvariant.test.ts` uses, which has now caught this class three times.
 */
export const AUTHORED_BY_ME = 't.author_person_id IS NULL';

/**
 * Mark an entry as needing to go up.
 *
 * **Shared groups only, enforced here rather than at each call site.** The filter
 * is inside the statement so a caller cannot forget it: `payCardBill`,
 * `moveToInvestments`, the voice drain and onboarding all write through shared
 * plumbing into the *personal* group, and every one of them would otherwise queue
 * personal financial data for upload. Personal data never syncs — that is the
 * decision this line enforces.
 *
 * `INSERT OR REPLACE` keyed on `entry_id`, so editing one expense five times
 * queues it once. The drain re-reads the entry, so the newest state wins and there
 * is nothing stale to replay.
 *
 * Selects from the entry row rather than out of thin air. That is what lets the
 * two authorship guards apply at all — and it is also what makes this statement
 * visible to `approvalInvariant.test.ts`, which only scans literals that read
 * from the txn table and so could not see the old form. Every caller queues
 * *after* writing the row, inside the same transaction, so the join finds it.
 */
export async function queueEntry(
  db: SQLite.SQLiteDatabase,
  entryId: string,
  groupId: string,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO sync_outbox (entry_id, group_id, queued_at)
     SELECT t.id, ?, ?
       FROM txn t
      WHERE t.id = ?
        AND ${AUTHORED_BY_ME}
        AND EXISTS (SELECT 1 FROM budget_group g WHERE g.id = ? AND g.is_personal = 0)
        AND ${NOT_AWAITING_APPROVAL}`,
    [groupId, Date.now(), entryId, groupId],
  );
}

/**
 * Queue every entry in a series — the cascade case.
 *
 * `softDeleteTxn` and `restoreTxn` update N rows by `parent_recur_id` in one
 * statement, and `materializeDueOccurrences` creates N in a loop. One append per
 * function call would under-count and leave the occurrences behind, which looks
 * like sync working until someone checks a month that has one.
 */
export async function queueSeries(
  db: SQLite.SQLiteDatabase,
  seriesId: string,
  groupId: string,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO sync_outbox (entry_id, group_id, queued_at)
     SELECT t.id, ?, ?
       FROM txn t
      WHERE (t.id = ? OR t.parent_recur_id = ?)
        AND ${AUTHORED_BY_ME}
        AND EXISTS (SELECT 1 FROM budget_group g WHERE g.id = ? AND g.is_personal = 0)
        AND ${NOT_AWAITING_APPROVAL}`,
    [groupId, Date.now(), seriesId, seriesId, groupId],
  );
}

export type OutboxRow = { entry_id: string; group_id: string; queued_at: number };

/**
 * What is waiting to go up, oldest first.
 *
 * Bounded, like `voiceDrain`'s 50: a drain runs on app open, and an unbounded one
 * would hold the first screen behind however much accumulated while offline.
 * Anything past the cap simply waits for the next drain.
 */
export const MAX_PER_DRAIN = 50;

export async function pendingUploads(db: SQLite.SQLiteDatabase): Promise<OutboxRow[]> {
  return db.getAllAsync<OutboxRow>(
    `SELECT * FROM sync_outbox ORDER BY queued_at ASC LIMIT ${MAX_PER_DRAIN}`,
  );
}

/**
 * Forget an entry — **only ever after the server has accepted it.**
 *
 * Same rule `voiceDrain` states for its files: delete after the write commits, not
 * before. That makes delivery at-least-once, and a re-delivered entry is already
 * handled — `ingestPeerTxn` treats re-delivery as normal, because the alternative
 * (at-most-once) silently drops an entry on any failure and nobody finds out.
 */
export async function markDelivered(db: SQLite.SQLiteDatabase, entryId: string): Promise<void> {
  await db.runAsync('DELETE FROM sync_outbox WHERE entry_id = ?', [entryId]);
}

/**
 * What is queued, per group — so the screen can say which of it can actually go.
 *
 * A count alone was misleading in the one case that matters most at the start:
 * queue up entries in a group you have never shared, and the number climbs while
 * nothing can ever be sent, because there is nobody to send it to. "26 changes
 * waiting to go up · they will go next time you open the app" was true about the
 * queue and false about the world.
 */
export async function pendingUploadsByGroup(
  db: SQLite.SQLiteDatabase,
): Promise<Array<{ groupId: string; name: string; n: number }>> {
  return db.getAllAsync<{ groupId: string; name: string; n: number }>(
    `SELECT o.group_id AS groupId, g.name AS name, COUNT(*) AS n
       FROM sync_outbox o LEFT JOIN budget_group g ON g.id = o.group_id
      GROUP BY o.group_id ORDER BY n DESC`,
  );
}

/** Drives the "not yet synced" indicator. Cheap enough for a screen load. */
export async function pendingUploadCount(db: SQLite.SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sync_outbox');
  return row?.n ?? 0;
}
