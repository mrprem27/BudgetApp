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
  cardBaselineAt: 'money.card_baseline_at',
} as const;

/**
 * MoneyProfile plus its two timestamps. Null until the first write, and never coerced to 0
 * like the paise fields.
 *
 * **They are two stamps because they answer two questions**, and one key answering both is
 * what made editing your investments erase your card debt:
 *
 * - `updatedAt` — "how stale are these hand-entered figures?", shown on `TotalMoneyCard`.
 *   Any write refreshes it.
 * - `cardBaselineAt` — "from when do we count card spend on top of the stated balance?"
 *   Only a write that *includes* `creditUsed` may move this. Re-stamping it on an unrelated
 *   edit silently drops every card transaction since, and `creditUsed` collapses back to the
 *   stored figure — net worth jumping overnight with nothing to explain it.
 */
export type MoneyProfileWithMeta = MoneyProfile & {
  updatedAt: number | null;
  cardBaselineAt: number | null;
};

export async function getMoneyProfile(db: SQLite.SQLiteDatabase): Promise<MoneyProfileWithMeta> {
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    `SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?, ?, ?)`,
    [KEYS.openingCash, KEYS.investments, KEYS.creditLimit, KEYS.creditUsed, KEYS.updatedAt, KEYS.cardBaselineAt],
  );
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  const num = (k: string) => (map[k] !== undefined ? Number(map[k]) : null);
  return {
    openingCash: Number(map[KEYS.openingCash]) || 0,
    investments: Number(map[KEYS.investments]) || 0,
    creditLimit: Number(map[KEYS.creditLimit]) || 0,
    creditUsed: Number(map[KEYS.creditUsed]) || 0,
    updatedAt: num(KEYS.updatedAt),
    // Falls back to `updatedAt` for profiles written before the split, where the one stamp
    // meant both. No migration needed: the fallback IS the old behaviour, and the first
    // credit edit after this ships writes the dedicated key.
    cardBaselineAt: num(KEYS.cardBaselineAt) ?? num(KEYS.updatedAt),
  };
}

/**
 * Upsert any subset of the money profile (paise). Missing fields are left as-is.
 *
 * `updatedAt` moves on every write; **`cardBaselineAt` moves only when `creditUsed` is part
 * of the write** — see {@link MoneyProfileWithMeta}. The previous version stamped one shared
 * key on any write, justified by "the editor always saves all 4 fields as one submit". It
 * does, and that was exactly the problem: submitting an unchanged `creditUsed` alongside a
 * new investments figure re-based the card window and discarded the spend it was measuring.
 */
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
  // Only a write that restates the card balance may move the window that balance is
  // measured from.
  if (partial.creditUsed !== undefined) entries.push([KEYS.cardBaselineAt, Date.now()]);
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
