import type * as SQLite from 'expo-sqlite';

/**
 * Keep a row's account in step with its Paid from (`U-68`).
 *
 * While the money math still reads `pay_method`, the account is derived from it: the default
 * account of that kind — unless the row already points at another account of the SAME kind (a
 * named bank, a second card), which is kept. No Paid from, or "Other", means no account.
 * Every write that sets `pay_method` runs this after it, so no path can leave the two apart.
 */
export const ALIGN_ACCOUNT_SQL = (table: 'txn' | 'pending_txn') => `
  UPDATE ${table} SET account_id = CASE
      WHEN pay_method IS NULL OR pay_method NOT IN ('bank','cash','wallet','card') THEN NULL
      WHEN account_id IS NOT NULL
       AND (SELECT kind FROM account WHERE id = ${table}.account_id) = pay_method THEN account_id
      ELSE 'default:' || pay_method
    END
  WHERE id = ?`;

export async function alignAccount(db: SQLite.SQLiteDatabase, table: 'txn' | 'pending_txn', id: string): Promise<void> {
  await db.runAsync(ALIGN_ACCOUNT_SQL(table), [id]);
}
