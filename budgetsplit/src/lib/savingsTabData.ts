import type * as SQLite from 'expo-sqlite';
import { getDate, getDaysInMonth, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { getGoals, getGoalSavedMap, getTotalMoney } from '../db/queries/savings';
import { getMoneyProfile } from '../db/queries/moneyProfile';
import { getAllGroups } from '../db/queries/groups';
import { getMe } from '../db/queries/persons';
import { getTransactionsInRange } from '../db/queries/transactions';
import { getRecurringForGroup, getSkipsMap } from '../db/queries/recurring';
import { getMyGlobalBudgetSummary } from './budget';
import { forecastMonthEnd as computeForecastMonthEnd } from './forecast';
import { buildUpcoming, type UpcomingItem } from './upcoming';
import { myShareOf } from './splitMath';

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
  const [goals, saved, money, profile, grps, me] = await Promise.all([
    getGoals(db), getGoalSavedMap(db), getTotalMoney(db), getMoneyProfile(db),
    getAllGroups(db), getMe(db),
  ]);
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
    upcoming = buildUpcoming(rules, me.id, now.getTime(), 5, undefined, skips);
  }

  // `monthSpend` is returned as well as consumed: it is the basis half of the
  // forecast-vs-budget comparison, and a forecast is null before day 3, so this is
  // the only way to assert that both halves are my share.
  return { goals, saved, money, profile, monthSpend: totalMonthSpend, forecastMonthEnd, forecastBudget, upcoming };
}
