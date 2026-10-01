import type * as SQLite from 'expo-sqlite';
import { getGoals, getGoalSavedMap, getCashPosition } from '../db/queries/savings';
import { getMoneyProfile } from '../db/queries/moneyProfile';
import { computeTotalMoney } from './cash';
import { getAssets } from '../db/queries/assets';

/**
 * Data assembly for the Money tab — goals, money profile and assets. The charges due this month
 * were listed here too; they are the Upcoming screen's (the bell on Home), and were shown twice (`U-96`).
 *
 * Lifted out of `useSavingsTab` so the forecast comparison is reachable by a test:
 * both of its halves were wrong in opposite directions. The spend side summed every
 * member's share of every group (a full bill, not mine) while the budget side summed
 * every group's allocation including the Personal group's — which is the global cap
 * this now uses on its own. `getAffordSnapshot` already compared the right two
 * things; this is Plan agreeing with it.
 */
export async function loadSavingsTabData(
  db: SQLite.SQLiteDatabase,
  /** Injected for determinism, same contract as the other loaders. */
  now: Date = new Date(),
) {
  // The profile is read ONCE and handed to everything that needs it. It is no
  // longer a cheap KV lookup — `investments` is derived from the asset register —
  // and this loader used to issue four of them.
  const profile = await getMoneyProfile(db);
  const [goals, saved, cashPos, assets] = await Promise.all([
    getGoals(db), getGoalSavedMap(db),
    // Same underlying figures as `getTotalMoney`, but carrying the per-bucket
    // detail. Only this screen needs it, which is why it is not on `TotalMoney`.
    getCashPosition(db, profile),
    // Itemises the Investments line on TotalMoneyCard — the figure is their sum.
    getAssets(db),
  ]);
  const money = computeTotalMoney(cashPos, profile);

  return { goals, saved, money, profile, assets, byBucket: cashPos.byBucket, unattributed: cashPos.unattributed, inGoals: cashPos.savings };
}
