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
  updatedAt: 'money.updated_at',
} as const;

/** MoneyProfile plus when it was last edited — `updatedAt` is null until the
 *  first `setMoneyProfile` write, and is never coerced to 0 like the paise fields. */
export type MoneyProfileWithMeta = MoneyProfile & { updatedAt: number | null };

export async function getMoneyProfile(db: SQLite.SQLiteDatabase): Promise<MoneyProfileWithMeta> {
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    `SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?, ?)`,
    [KEYS.openingCash, KEYS.investments, KEYS.creditLimit, KEYS.creditUsed, KEYS.updatedAt],
  );
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return {
    openingCash: Number(map[KEYS.openingCash]) || 0,
    investments: Number(map[KEYS.investments]) || 0,
    creditLimit: Number(map[KEYS.creditLimit]) || 0,
    creditUsed: Number(map[KEYS.creditUsed]) || 0,
    updatedAt: map[KEYS.updatedAt] !== undefined ? Number(map[KEYS.updatedAt]) : null,
  };
}

/** Upsert any subset of the money profile (paise). Missing fields are left as-is.
 *  Any write stamps a single shared `updatedAt` for the whole profile — the editor
 *  sheet always saves all 4 fields as one submit, so per-field timestamps would be
 *  unused precision. */
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
  entries.push([KEYS.updatedAt, Date.now()]);
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
