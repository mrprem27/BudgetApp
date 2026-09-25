import type * as SQLite from 'expo-sqlite';

/**
 * The delivery queue (SPEC-SERVER.md §3.4): what this phone changed and the
 * server has not acknowledged yet.
 *
 * Every function here is a PLAIN `runAsync` — never its own transaction — because
 * the queue row must commit with the write it records, and expo-sqlite cannot
 * nest transactions. A write that commits without its queue row is a change the
 * server never hears about, with no symptom anywhere. So: every writer of a synced
 * table calls one of these inside its own transaction, and
 * `syncQueueCoverage.test.ts` fails on any writer that does not.
 *
 * Rows name the phone's own row, not a server id. A write needs no account and no
 * network, and the drain decides what each row becomes on the server.
 */

/** Local tables whose rows travel. Each maps to server rows in `lib/sync/rowMap`. */
export type QueueTable =
  | 'person' | 'person_group_trust' | 'budget_group' | 'group_member' | 'txn'
  | 'category' | 'category_budget' | 'asset' | 'savings_goal' | 'savings_txn' | 'pending_txn' | 'settings'
  /** My answer to an invitation: no local row exists until I'm in, so it travels as its snapshot. */
  | 'group_invite'
  /**
   * My answer to someone else's entry (S21), as its snapshot: the local row can't
   * say what I answered — refusing a retraction leaves it looking approved.
   */
  | 'txn_approval'
  /** A placeholder I've learned is an account (S21): the server folds its copy in too. */
  | 'person_merge';

export type QueueRow = {
  queue_id: number;
  local_table: QueueTable;
  local_id: string;
  op: 'upsert' | 'delete';
  snapshot: string | null;
  queued_at: number;
  sent_ids: string | null;
};

/** The id of the one money-profile row, which lives as `money.*` keys in `settings`. */
export const MONEY_PROFILE_ID = 'money';

/** This row changed: send its current state. */
export async function queueUpsert(db: SQLite.SQLiteDatabase, table: QueueTable, id: string): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO sync_queue (local_table, local_id, op, snapshot, queued_at, sent_ids)
     VALUES (?, ?, 'upsert', NULL, ?, NULL)`,
    [table, id, Date.now()],
  );
}

/**
 * This row is gone. `snapshot` is the row as it was — enough for the drain to work
 * out the server id (a category's kind and name; a budget line's group, category
 * and owner) once the row itself no longer exists.
 */
export async function queueDelete(
  db: SQLite.SQLiteDatabase,
  table: QueueTable,
  id: string,
  snapshot: Record<string, unknown>,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO sync_queue (local_table, local_id, op, snapshot, queued_at, sent_ids)
     VALUES (?, ?, 'delete', ?, ?, NULL)`,
    [table, id, JSON.stringify(snapshot), Date.now()],
  );
}

/**
 * My answer to something the server asked — an invitation, someone else's entry.
 * The snapshot IS the mutation: there is either no local row to read it from yet,
 * or the row can't say what I answered.
 */
export async function queueAnswer(
  db: SQLite.SQLiteDatabase,
  table: 'group_invite' | 'txn_approval' | 'person_merge',
  id: string,
  answer: Record<string, unknown>,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO sync_queue (local_table, local_id, op, snapshot, queued_at, sent_ids)
     VALUES (?, ?, 'upsert', ?, ?, NULL)`,
    [table, id, JSON.stringify(answer), Date.now()],
  );
}

/**
 * Queue every row a query returns — for writes that touch many rows in one
 * statement (a rename cascading through transactions, a reorder of goals).
 * `sql` selects one column, the local id.
 */
export async function queueUpsertWhere(
  db: SQLite.SQLiteDatabase,
  table: QueueTable,
  sql: string,
  params: unknown[] = [],
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO sync_queue (local_table, local_id, op, snapshot, queued_at, sent_ids)
     SELECT ?, id, 'upsert', NULL, ?, NULL FROM (${sql})`,
    [table, Date.now(), ...params] as SQLite.SQLiteBindValue[],
  );
}

/**
 * An entry I wrote has changed: send it. Only mine — `author_person_id` is NULL
 * for my own rows and set for anyone else's, which are theirs to send. Selected
 * from the row, so it runs after the write, in the same transaction.
 */
export async function queueEntry(db: SQLite.SQLiteDatabase, entryId: string): Promise<void> {
  await queueUpsertWhere(db, 'txn', 'SELECT id FROM txn t WHERE t.id = ? AND t.author_person_id IS NULL', [entryId]);
}

/**
 * Every entry in a series — a rule and its occurrences, which `softDeleteTxn`,
 * `restoreTxn` and `materializeDueOccurrences` change N at a time. One row per
 * call would leave the occurrences behind.
 */
export async function queueSeries(db: SQLite.SQLiteDatabase, seriesId: string): Promise<void> {
  await queueUpsertWhere(db, 'txn',
    'SELECT id FROM txn t WHERE (t.id = ? OR t.parent_recur_id = ?) AND t.author_person_id IS NULL', [seriesId, seriesId]);
}

/** Everything waiting, in the order it last changed. */
export async function queuedRows(db: SQLite.SQLiteDatabase, limit = 200): Promise<QueueRow[]> {
  return db.getAllAsync<QueueRow>(`SELECT * FROM sync_queue ORDER BY queue_id ASC LIMIT ${limit}`);
}

export async function queueCount(db: SQLite.SQLiteDatabase): Promise<number> {
  return (await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sync_queue'))?.n ?? 0;
}

/** Is this row waiting to go up? A pending local change wins over a pulled one. */
/** Every row with a change waiting, keyed `rowKey(table, id)` — one read for a whole page. */
export async function queuedKeys(db: SQLite.SQLiteDatabase): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ local_table: string; local_id: string }>('SELECT local_table, local_id FROM sync_queue');
  return new Set(rows.map(r => rowKey(r.local_table, r.local_id)));
}


/** One server mutation a queue row went out as: its id, and the server row it wrote. */
export type Sent = { m: number; e: string; i: string };

export const sentOf = (row: { sent_ids: string | null }): Sent[] =>
  row.sent_ids ? (JSON.parse(row.sent_ids) as Sent[]) : [];

/** Record which server mutations this row went out as. */
export async function markSent(db: SQLite.SQLiteDatabase, queueId: number, sent: Sent[]): Promise<void> {
  await db.runAsync('UPDATE sync_queue SET sent_ids = ? WHERE queue_id = ?', [JSON.stringify(sent), queueId]);
}

/**
 * Forget every row the server has acknowledged: all of its mutations are at or
 * below `lastMutationId`. A row changed again after it was sent was REPLACED with
 * `sent_ids` NULL, so it stays, and goes out again with its newer state.
 */
export async function clearAcknowledged(db: SQLite.SQLiteDatabase, lastMutationId: number): Promise<void> {
  const rows = await db.getAllAsync<{ queue_id: number; sent_ids: string }>(
    'SELECT queue_id, sent_ids FROM sync_queue WHERE sent_ids IS NOT NULL',
  );
  const done = rows.filter(r => { const ids = sentOf(r).map(x => x.m); return ids.length === 0 || Math.max(...ids) <= lastMutationId; })
    .map(r => r.queue_id);
  if (done.length) await db.runAsync('DELETE FROM sync_queue WHERE queue_id IN (SELECT value FROM json_each(?))', [JSON.stringify(done)]);
}

/** The queue row a server mutation went out from — if it has not been superseded — and what it wrote. */
export async function queueRowForMutation(
  db: SQLite.SQLiteDatabase,
  mutationId: number,
): Promise<{ row: QueueRow; sent: Sent } | null> {
  const rows = await db.getAllAsync<QueueRow>('SELECT * FROM sync_queue WHERE sent_ids IS NOT NULL');
  for (const row of rows) {
    const sent = sentOf(row).find(x => x.m === mutationId);
    if (sent) return { row, sent };
  }
  return null;
}

export async function dropQueueRow(db: SQLite.SQLiteDatabase, queueId: number): Promise<void> {
  await db.runAsync('DELETE FROM sync_queue WHERE queue_id = ?', [queueId]);
}

// --- Confirmed server versions ------------------------------------------------

export async function serverVersion(db: SQLite.SQLiteDatabase, entity: string, entityId: string): Promise<number> {
  return (await db.getFirstAsync<{ version: number }>(
    'SELECT version FROM sync_version WHERE entity = ? AND entity_id = ?', [entity, entityId],
  ))?.version ?? 0;
}

/** Every confirmed version, keyed `rowKey(entity, id)` — one read for a whole push. */
export async function serverVersions(db: SQLite.SQLiteDatabase): Promise<Map<string, number>> {
  const rows = await db.getAllAsync<{ entity: string; entity_id: string; version: number }>(
    'SELECT entity, entity_id, version FROM sync_version',
  );
  return new Map(rows.map(r => [rowKey(r.entity, r.entity_id), r.version]));
}

/** One server row's key: its entity and id. */
export const rowKey = (entity: string, id: string): string => `${entity}\u0000${id}`;

export async function setServerVersion(db: SQLite.SQLiteDatabase, entity: string, entityId: string, version: number): Promise<void> {
  await db.runAsync(
    'INSERT OR REPLACE INTO sync_version (entity, entity_id, version) VALUES (?, ?, ?)',
    [entity, entityId, version],
  );
}

