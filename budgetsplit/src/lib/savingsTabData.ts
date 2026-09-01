import type * as SQLite from 'expo-sqlite';
import { getDate, getDaysInMonth, startOfMonth, endOfMonth, subMonths, differenceInCalendarDays } from 'date-fns';
import { getGoals, getGoalSavedMap, getCashPosition } from '../db/queries/savings';
import { getMoneyProfile } from '../db/queries/moneyProfile';
import { computeTotalMoney } from './cash';
import { getAllGroups } from '../db/queries/groups';
import { getMe } from '../db/queries/persons';
import { getTransactionsInRange } from '../db/queries/transactions';
import { getRecurringForGroup, getSkipsMap } from '../db/queries/recurring';
import { getMyGlobalBudgetSummary } from './budget';
import { forecastMonthEnd as computeForecastMonthEnd } from './forecast';
import { buildUpcoming, type UpcomingItem } from './upcoming';
import { myShareOf } from './splitMath';
import { getAssets } from '../db/queries/assets';

/**
 * Data assembly for the Savings/Plan tab — goals, money profile, the month-end
 * forecast and its budget comparison, and upcoming bills.
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
  const [goals, saved, grps, me, cashPos, assets] = await Promise.all([
    getGoals(db), getGoalSavedMap(db), getAllGroups(db), getMe(db),
    // Same underlying figures as `getTotalMoney`, but carrying the per-bucket
    // detail. Only this screen needs it, which is why it is not on `TotalMoney`.
    getCashPosition(db, profile),
    // Itemises the Investments line on TotalMoneyCard — the figure is their sum.
    getAssets(db),
  ]);
  const money = computeTotalMoney(cashPos, profile);
  const meId = me?.id ?? '';

  // My share of this month's spend — the basis the budget below is measured in.
  const monthTxns = await getTransactionsInRange(db, null, startOfMonth(now).getTime(), now.getTime());
  let totalMonthSpend = 0;
  for (const t of monthTxns) {
    if (t.kind === 'expense') totalMonthSpend += myShareOf(t, meId);
  }

  const lastMonth = subMonths(now, 1);
  const prevTxns = await getTransactionsInRange(
    db, null, startOfMonth(lastMonth).getTime(), endOfMonth(lastMonth).getTime());
  let priorMonthTotal = 0;
  for (const t of prevTxns) {
    if (t.kind === 'expense') priorMonthTotal += myShareOf(t, meId);
  }

  // Same credibility-weighted model as Reports and Insights. Hidden until day 3.
  const f = computeForecastMonthEnd(totalMonthSpend, getDate(now), getDaysInMonth(now), priorMonthTotal);
  const forecastMonthEnd = f.ready ? f.projected : null;

  const forecastBudget = meId
    ? (await getMyGlobalBudgetSummary(db, meId, { now })).allocated
    : 0;

  let upcoming: UpcomingItem[] = [];
  if (me) {
    const recurringByGroup = await Promise.all(grps.map(g => getRecurringForGroup(db, g.id)));
    const rules = recurringByGroup.flat();
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

  // `monthSpend` is returned as well as consumed: it is the basis half of the
  // forecast-vs-budget comparison, and a forecast is null before day 3, so this is
  // the only way to assert that both halves are my share.
  return { goals, saved, money, profile, assets, byBucket: cashPos.byBucket, unattributed: cashPos.unattributed, monthSpend: totalMonthSpend, forecastMonthEnd, forecastBudget, upcoming };
}
