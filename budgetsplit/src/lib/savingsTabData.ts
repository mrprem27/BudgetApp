import type * as SQLite from 'expo-sqlite';
import { endOfMonth, differenceInCalendarDays } from 'date-fns';
import { getGoals, getGoalSavedMap, getCashPosition } from '../db/queries/savings';
import { getMoneyProfile } from '../db/queries/moneyProfile';
import { computeTotalMoney } from './cash';
import { getMe } from '../db/queries/persons';
import { getAllRecurringRules, getSkipsMap } from '../db/queries/recurring';
import { buildUpcoming, type UpcomingItem } from './upcoming';
import { getAssets } from '../db/queries/assets';

/**
 * Data assembly for the Money tab — goals, money profile, assets and upcoming bills.
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
  const [goals, saved, me, cashPos, assets] = await Promise.all([
    getGoals(db), getGoalSavedMap(db), getMe(db),
    // Same underlying figures as `getTotalMoney`, but carrying the per-bucket
    // detail. Only this screen needs it, which is why it is not on `TotalMoney`.
    getCashPosition(db, profile),
    // Itemises the Investments line on TotalMoneyCard — the figure is their sum.
    getAssets(db),
  ]);
  const money = computeTotalMoney(cashPos, profile);
  const meId = me?.id ?? '';

  let upcoming: UpcomingItem[] = [];
  if (me) {
    const rules = await getAllRecurringRules(db);
    const skips = await getSkipsMap(db, rules.map(r => r.id));
    /*
     * A REAL window, because the heading claims one.
     *
     * This passed `undefined`, which means no window — so the list was "the next
     * five charges, whenever they fall" under a heading reading "Due this month".
     * A yearly insurance bill due in eleven months appeared there for anyone with
     * fewer than five rules. The comment beside that heading argues the title is
     * what separates this block from the Recurring inventory ("Due this month is a
     * window, Recurring is the inventory") — so the title being false is not a
     * wording slip, it collapses the distinction the two screens rest on.
     */
    const daysLeftInMonth = Math.max(0, differenceInCalendarDays(endOfMonth(now), now));
    upcoming = buildUpcoming(rules, me.id, now.getTime(), 5, daysLeftInMonth, skips);
  }

  return { goals, saved, money, profile, assets, byBucket: cashPos.byBucket, unattributed: cashPos.unattributed, upcoming };
}
