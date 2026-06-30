import * as SQLite from 'expo-sqlite';
import type { MoneyProfile } from '../../lib/cash';

/**
 * The user's real-money inputs for the Plan screen's "Total Money": starting cash,
 * investments, and credit (limit + used). Stored in the SQLite `settings` KV table
 * (all values integer paise) so financial truth stays in the DB alongside txns.
 */
const KEYS = {
  openingCash: 'money.opening_cash',
  investments: 'money.investments',
  creditLimit: 'money.credit_limit',
  creditUsed: 'money.credit_used',
} as const;

export async function getMoneyProfile(db: SQLite.SQLiteDatabase): Promise<MoneyProfile> {
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    `SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?)`,
    [KEYS.openingCash, KEYS.investments, KEYS.creditLimit, KEYS.creditUsed],
  );
  const map: Record<string, number> = {};
  for (const r of rows) map[r.key] = Number(r.value) || 0;
  return {
    openingCash: map[KEYS.openingCash] ?? 0,
    investments: map[KEYS.investments] ?? 0,
    creditLimit: map[KEYS.creditLimit] ?? 0,
    creditUsed: map[KEYS.creditUsed] ?? 0,
  };
}

/** Upsert any subset of the money profile (paise). Missing fields are left as-is. */
export async function setMoneyProfile(
  db: SQLite.SQLiteDatabase,
  partial: Partial<MoneyProfile>,
): Promise<void> {
  const entries: [string, number][] = [];
  if (partial.openingCash !== undefined) entries.push([KEYS.openingCash, Math.round(partial.openingCash)]);
  if (partial.investments !== undefined) entries.push([KEYS.investments, Math.round(partial.investments)]);
  if (partial.creditLimit !== undefined) entries.push([KEYS.creditLimit, Math.round(partial.creditLimit)]);
  if (partial.creditUsed !== undefined) entries.push([KEYS.creditUsed, Math.round(partial.creditUsed)]);
  if (entries.length === 0) return;
  await db.withTransactionAsync(async () => {
    for (const [key, value] of entries) {
      await db.runAsync(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, String(value)],
      );
    }
  });
}
