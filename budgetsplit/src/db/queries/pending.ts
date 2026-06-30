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
};

export type NewPending = Omit<PendingTxn, 'id' | 'created_at'>;

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
