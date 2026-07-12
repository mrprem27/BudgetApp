import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import type { TxnKind } from '../../constants/enums';
import type { ParsedDirection } from '../../lib/importParse';

/** A parsed-but-unconfirmed transaction shown in the Review inbox. */
export type PendingTxn = {
  id: string;
  date: number;
  amount: number;          // paise (positive)
  description: string;
  kind: TxnKind;
  category: string | null;
  direction: ParsedDirection;
  raw: string | null;
  created_at: number;
  /** Review draft: target group id, or null = Personal. */
  dest_group_id: string | null;
  /** Review draft: JSON {included, mode, values} for a group split, or null. */
  split_draft: string | null;
};

export type NewPending = Omit<PendingTxn, 'id' | 'created_at' | 'dest_group_id' | 'split_draft'>;

/** The subset of a pending row the Review screen auto-saves as you edit it. */
export type PendingDraft = Partial<Pick<PendingTxn, 'kind' | 'category' | 'amount' | 'dest_group_id' | 'split_draft'>>;

export async function insertPending(db: SQLite.SQLiteDatabase, rows: NewPending[]): Promise<void> {
  if (rows.length === 0) return;
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const r of rows) {
      await db.runAsync(
        `INSERT INTO pending_txn (id, date, amount, description, kind, category, direction, raw, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuid(), r.date, r.amount, r.description, r.kind, r.category ?? null, r.direction, r.raw ?? null, now],
      );
    }
  });
}

export async function getPending(db: SQLite.SQLiteDatabase): Promise<PendingTxn[]> {
  return db.getAllAsync<PendingTxn>('SELECT * FROM pending_txn ORDER BY date DESC, created_at DESC');
}

/** Auto-save a Review row's in-progress edits. Only the provided fields change. */
export async function updatePendingDraft(
  db: SQLite.SQLiteDatabase,
  id: string,
  d: PendingDraft,
): Promise<void> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (d.kind !== undefined) { sets.push('kind=?'); args.push(d.kind); }
  if (d.category !== undefined) { sets.push('category=?'); args.push(d.category); }
  if (d.amount !== undefined) { sets.push('amount=?'); args.push(d.amount); }
  if (d.dest_group_id !== undefined) { sets.push('dest_group_id=?'); args.push(d.dest_group_id); }
  if (d.split_draft !== undefined) { sets.push('split_draft=?'); args.push(d.split_draft); }
  if (sets.length === 0) return;
  args.push(id);
  await db.runAsync(`UPDATE pending_txn SET ${sets.join(', ')} WHERE id=?`, args);
}

/** Re-insert a pending row verbatim (its id + drafts) — the Undo of a delete or
 *  a commit in Review. */
export async function restorePending(db: SQLite.SQLiteDatabase, row: PendingTxn): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO pending_txn
       (id, date, amount, description, kind, category, direction, raw, created_at, dest_group_id, split_draft)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id, row.date, row.amount, row.description, row.kind, row.category ?? null,
      row.direction, row.raw ?? null, row.created_at, row.dest_group_id ?? null, row.split_draft ?? null,
    ],
  );
}

export async function getPendingCount(db: SQLite.SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) as n FROM pending_txn');
  return row?.n ?? 0;
}

export async function deletePending(db: SQLite.SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM pending_txn WHERE id = ?', [id]);
}

export async function clearPending(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.runAsync('DELETE FROM pending_txn');
}
