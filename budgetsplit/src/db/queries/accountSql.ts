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

export type AccountKind = 'bank' | 'cash' | 'wallet' | 'card';
const DEFAULT_NAMES: Record<AccountKind, string> = { bank: 'Bank', cash: 'Cash', wallet: 'Wallet', card: 'Credit card' };
const DEFAULT_ORDER: Record<AccountKind, number> = { bank: 0, cash: 1, wallet: 2, card: 3 };

/** The four default accounts. Fixed ids, so each is one row on every device. */
export const SEED_DEFAULT_ACCOUNTS_SQL = `
  INSERT OR IGNORE INTO account (id, name, kind, is_default, sort_order, created_at, updated_at) VALUES
    ${(Object.keys(DEFAULT_NAMES) as AccountKind[])
      .map(k => `('default:${k}', '${DEFAULT_NAMES[k]}', '${k}', 1, ${DEFAULT_ORDER[k]}, 0, 0)`).join(',\n    ')}`;

/**
 * Set a kind's TOTAL opening (or a card's total limit) by writing the default account the
 * difference the other accounts of that kind don't already hold, so the total reads back as
 * written. Creates the default if a wipe removed it. The caller queues `account`.
 */
export async function setDefaultAccountTotal(
  db: SQLite.SQLiteDatabase, kind: AccountKind, column: 'opening_balance' | 'credit_limit', total: number,
): Promise<void> {
  const id = `default:${kind}`;
  const others = await db.getFirstAsync<{ s: number | null }>(
    `SELECT SUM(${column}) AS s FROM account WHERE kind = ? AND id <> ?`, [kind, id],
  );
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO account (id, name, kind, is_default, sort_order, ${column}, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET ${column} = excluded.${column}, updated_at = excluded.updated_at`,
    [id, DEFAULT_NAMES[kind], kind, DEFAULT_ORDER[kind], Math.round(total) - (others?.s ?? 0), now, now],
  );
}

/** The default card's due day, 1–31, or null to clear. */
export async function setDefaultCardDueDay(db: SQLite.SQLiteDatabase, day: number | null): Promise<void> {
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO account (id, name, kind, is_default, sort_order, due_day, created_at, updated_at)
     VALUES ('default:card', 'Credit card', 'card', 1, 3, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET due_day = excluded.due_day, updated_at = excluded.updated_at`,
    [day, now, now],
  );
}
