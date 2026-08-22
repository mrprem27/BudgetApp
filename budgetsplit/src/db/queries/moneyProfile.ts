import * as SQLite from 'expo-sqlite';
import type { MoneyProfile } from '../../lib/cash';

/**
 * The user's real-money inputs for the Plan screen's "Total Money": starting cash,
 * investments, and credit (limit + used). Stored in the SQLite `settings` KV table
 * (all values integer paise) so financial truth stays in the DB alongside txns.
 */
const KEYS = {
  // Cash-in-hand from here on. Historically it meant "all my money" — see the
  // fallback in `getMoneyProfile`, which is what keeps old data and old backups
  // reading correctly.
  openingCash: 'money.opening_cash',
  openingBank: 'money.opening_bank',
  openingWallet: 'money.opening_wallet',
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
  // Built from KEYS rather than a hand-written list, because the hand-written one
  // silently dropped the two bucket keys the moment they were added — the read
  // returned zeros while the writes were landing correctly, which is the least
  // debuggable shape a bug can take.
  const wanted = Object.values(KEYS);
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    `SELECT key, value FROM settings WHERE key IN (${wanted.map(() => '?').join(',')})`,
    wanted as string[],
  );
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  const num = (k: string) => (map[k] !== undefined ? Number(map[k]) : null);
  /*
   * The legacy read, and it is not optional.
   *
   * Before buckets there was one figure, and `MoneyEditorSheet` labelled it "Money
   * in your bank + wallet right now" — so it was already a blend, and **bank** is
   * the honest majority reading of it. Treating it as cash-in-hand would drain the
   * bank bucket on the user's first bank expense.
   *
   * Why a fallback rather than a migration: `money.*` lives in the `settings` KV
   * table, and `settings` is in BACKUP_TABLES. A backup written before this ships
   * carries only `opening_cash`. Restored into a build that reinterpreted the key
   * with no fallback, the user's entire opening position would read as ₹0 with
   * nothing on screen to explain it. Same pattern as `cardBaselineAt` below.
   *
   * Self-healing: the first save through the editor writes all three keys, and
   * this branch is never taken again on that device.
   */
  const hasBuckets = map[KEYS.openingBank] !== undefined || map[KEYS.openingWallet] !== undefined;
  const legacyOpening = Number(map[KEYS.openingCash]) || 0;

  return {
    openingCash: hasBuckets ? Number(map[KEYS.openingCash]) || 0 : 0,
    openingBank: hasBuckets ? Number(map[KEYS.openingBank]) || 0 : legacyOpening,
    openingWallet: Number(map[KEYS.openingWallet]) || 0,
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
  if (partial.openingBank !== undefined) entries.push([KEYS.openingBank, Math.round(partial.openingBank)]);
  if (partial.openingCash !== undefined) entries.push([KEYS.openingCash, Math.round(partial.openingCash)]);
  if (partial.openingWallet !== undefined) entries.push([KEYS.openingWallet, Math.round(partial.openingWallet)]);
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

/**
 * Delete every `money.*` row.
 *
 * `wipeAllData` deliberately spares the `settings` table — migration markers live
 * there and must survive — but the money profile lives there too, so "Erase all
 * data" left the previous cash, investments and credit balance in place. On a
 * freshly-erased app, Plan still reported the demo's ₹3,00,000.
 *
 * A `LIKE 'money.%'` sweep rather than the six `KEYS` by name: the two timestamps
 * are written implicitly by `setMoneyProfile`, so a named list is one more thing
 * to keep in step with it.
 */
export async function clearMoneyProfile(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.runAsync("DELETE FROM settings WHERE key LIKE 'money.%'");
}
