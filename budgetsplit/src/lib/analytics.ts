import * as SQLite from 'expo-sqlite';
import {
  startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear,
  subDays, subMonths, subYears, getDate, getDaysInMonth,
} from 'date-fns';
import type { BudgetGroup } from '../db/queries/groups';
import type { BudgetCadence } from '../db/queries/categoryBudgets';
import { getCategoryBudgets } from '../db/queries/categoryBudgets';
import { getCategorySpending, utilLabel, budgetHealth, rollUpBudgets, budgetKind, type Period } from './budget';
import { OTHERS_LABEL } from './categoryFold';
import { forecastMonthEnd } from './forecast';
import { formatCompact, formatComparison } from './money';

export type BudgetStatus = 'over' | 'near' | 'under' | 'none';

export type CategoryTrend = {
  category: string;
  cadence: BudgetCadence;
  allocated: number;   // paise
  spent: number;       // paise, current window of the cadence
  prevSpent: number;   // paise, previous window of the cadence
  remaining: number;   // allocated - spent
  pct: number | null;  // utilization %
  deltaPct: number | null; // change vs previous window (% of prev)
  status: BudgetStatus;
  daysToLimit: number | null; // est. days until 100% at current pace (monthly only)
};

export type TopCategory = {
  category: string;
  spent: number;       // this month
  prevSpent: number;   // last month
  deltaPct: number | null;
};

export type Recommendation = {
  id: string;
  text: string;
  severity: 'warn' | 'info' | 'good';
  icon: 'alert-triangle' | 'trending-up' | 'trending-down' | 'clock' | 'check-circle' | 'pie-chart';
};

export type BudgetAnalytics = {
  /**
   * Allocation of the lines that roll up into `target` (default monthly).
   * Pool lines — a yearly budget under a monthly headline — are NOT in here;
   * see `pooledAllocated`.
   */
  totalAllocated: number;
  /**
   * Spend over the **`target` window**, restricted to the same categories that
   * `totalAllocated` covers. Both halves must share a window or the ratio below
   * is meaningless: this used to sum each line's spend in its *own* window
   * (daily → today, yearly → this year) and divide by mixed-cadence allocations.
   */
  totalSpent: number;
  remaining: number;
  utilizationPct: number | null;
  /** Pool lines excluded from the figures above — surface them, never drop them. */
  pooledAllocated: number;
  pooledCount: number;
  overBudget: CategoryTrend[];
  nearLimit: CategoryTrend[];
  underBudget: CategoryTrend[];
  onTrackCount: number;
  topCategories: TopCategory[];
  highest: TopCategory | null;
  lowest: TopCategory | null;
  biggestIncrease: TopCategory | null;
  biggestDecrease: TopCategory | null;
  projectedMonthEnd: number;
  monthlyBudgetTotal: number;     // monthly rollup (for projection comparison)
  recommendations: Recommendation[];
};

/**
 * The current window ends at **now**, not at the end of the period: "spent" is
 * what happened, never what is scheduled. A ₹50,000 fee dated the 28th and
 * logged on the 2nd used to count as already spent. Future-dated commitments
 * live in `upcomingBills` (`getAffordSnapshot`) instead.
 */
function currentWindow(cadence: BudgetCadence, now: Date): { from: number; to: number } {
  const to = now.getTime();
  switch (cadence) {
    case 'daily':   return { from: startOfDay(now).getTime(), to };
    case 'monthly': return { from: startOfMonth(now).getTime(), to };
    case 'yearly':  return { from: startOfYear(now).getTime(), to };
    case 'once':    return { from: 0, to };
  }
}

/** Spend window for an aggregate at `target` — same "ends at now" rule. */
function targetWindow(target: Period, now: Date): { from: number; to: number } {
  const to = now.getTime();
  switch (target) {
    case 'daily':   return { from: startOfDay(now).getTime(), to };
    case 'monthly': return { from: startOfMonth(now).getTime(), to };
    case 'yearly':  return { from: startOfYear(now).getTime(), to };
  }
}

function previousWindow(cadence: BudgetCadence, now: Date): { from: number; to: number } | null {
  switch (cadence) {
    case 'daily':   { const d = subDays(now, 1);   return { from: startOfDay(d).getTime(), to: endOfDay(d).getTime() }; }
    case 'monthly': { const d = subMonths(now, 1); return { from: startOfMonth(d).getTime(), to: endOfMonth(d).getTime() }; }
    case 'yearly':  { const d = subYears(now, 1);  return { from: startOfYear(d).getTime(), to: endOfYear(d).getTime() }; }
    case 'once':    return null;
  }
}

function deltaPctOf(spent: number, prev: number): number | null {
  if (prev > 0) return Math.round(((spent - prev) / prev) * 100);
  if (spent > 0) return 100; // appeared this period
  return null;
}

/**
 * Budget-centric analytics for a group: utilization, at-risk categories,
 * period-over-period trends, a month-end projection, and rule-based
 * recommendations. All amounts are integer paise.
 */
export async function getBudgetAnalytics(
  db: SQLite.SQLiteDatabase,
  group: BudgetGroup,
  now = new Date(),
  /** When set, spend counts only this person's share (individual budget). */
  meId?: string,
  /** Period the aggregate figures are expressed over. Per-category trends keep their own cadence. */
  target: Period = 'monthly',
): Promise<BudgetAnalytics> {
  // `meId` matters: without it this reads only the group defaults and silently
  // ignores every personal override.
  const budgets = await getCategoryBudgets(db, group.id, meId);

  // No budgets → nothing to analyse; skip the spending queries entirely (perf).
  if (budgets.length === 0) {
    return {
      totalAllocated: 0, totalSpent: 0, remaining: 0, utilizationPct: null,
      pooledAllocated: 0, pooledCount: 0,
      overBudget: [], nearLimit: [], underBudget: [], onTrackCount: 0,
      topCategories: [], highest: null, lowest: null, biggestIncrease: null, biggestDecrease: null,
      projectedMonthEnd: 0, monthlyBudgetTotal: 0, recommendations: [],
    };
  }

  // Spending per category for each distinct cadence window (current + previous).
  const cadences = Array.from(new Set(budgets.map(b => b.cadence)));
  const curByCad: Record<string, Record<string, number>> = {};
  const prevByCad: Record<string, Record<string, number>> = {};
  await Promise.all(cadences.map(async cad => {
    const cw = currentWindow(cad, now);
    curByCad[cad] = await getCategorySpending(db, group.id, cw.from, cw.to, meId);
    const pw = previousWindow(cad, now);
    prevByCad[cad] = pw ? await getCategorySpending(db, group.id, pw.from, pw.to, meId) : {};
  }));

  const dayOfMonth = getDate(now);
  const trends: CategoryTrend[] = budgets.map(b => {
    const spent = curByCad[b.cadence]?.[b.category] ?? 0;
    const prevSpent = prevByCad[b.cadence]?.[b.category] ?? 0;
    const pct = b.amount > 0 ? Math.round((spent / b.amount) * 100) : null;
    // Shares the 80/100 thresholds with lib/budget.budgetHealth (one source).
    const h = budgetHealth(pct);
    const status: BudgetStatus = h === 'red' ? 'over' : h === 'amber' ? 'near' : h === 'green' ? 'under' : 'none';
    // Days until limit, only meaningful for monthly cadence mid-month.
    let daysToLimit: number | null = null;
    if (b.cadence === 'monthly' && b.amount > 0 && spent > 0 && spent < b.amount) {
      const dailyRate = spent / Math.max(1, dayOfMonth);
      if (dailyRate > 0) daysToLimit = Math.ceil((b.amount - spent) / dailyRate);
    }
    return {
      category: b.category, cadence: b.cadence, allocated: b.amount,
      spent, prevSpent, remaining: b.amount - spent, pct,
      deltaPct: deltaPctOf(spent, prevSpent), status, daysToLimit,
    };
  });

  /*
   * Same catalog fold as the status rows (`foldBudgetStatuses`). Applied here too
   * because these lists supply the counts rendered directly above them — folding
   * one and not the other would print "2 over" over a single Others row.
   *
   * Per cadence, for the same reason: a daily and a monthly line share no window.
   * `daysToLimit` is dropped on a folded row — it is a pace estimate for one
   * category, and a merged bucket has no single pace.
   */
  const known = new Set(
    (await db.getAllAsync<{ name: string }>("SELECT name FROM category WHERE kind = 'expense'"))
      .map(r => r.name),
  );
  const folded: CategoryTrend[] = [];
  const otherByCadence = new Map<BudgetCadence, { allocated: number; spent: number; prevSpent: number }>();
  for (const t of trends) {
    if (known.has(t.category)) { folded.push(t); continue; }
    const acc = otherByCadence.get(t.cadence) ?? { allocated: 0, spent: 0, prevSpent: 0 };
    acc.allocated += t.allocated; acc.spent += t.spent; acc.prevSpent += t.prevSpent;
    otherByCadence.set(t.cadence, acc);
  }
  for (const [cadence, a] of otherByCadence) {
    const pct = a.allocated > 0 ? Math.round((a.spent / a.allocated) * 100) : null;
    const h = budgetHealth(pct);
    folded.push({
      category: OTHERS_LABEL, cadence, allocated: a.allocated, spent: a.spent,
      prevSpent: a.prevSpent, remaining: a.allocated - a.spent, pct,
      deltaPct: deltaPctOf(a.spent, a.prevSpent),
      status: h === 'red' ? 'over' : h === 'amber' ? 'near' : h === 'green' ? 'under' : 'none',
      daysToLimit: null,
    });
  }

  const overBudget = folded.filter(t => t.status === 'over').sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
  const nearLimit = folded.filter(t => t.status === 'near').sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
  const underBudget = folded.filter(t => t.status === 'under');

  /*
   * Aggregate over ONE window, from rate lines only.
   *
   * This block used to be `sum(t.allocated)` over `sum(t.spent)`. Both sides were
   * mixed: allocations of different cadences added together, and each line's spend
   * measured in its own window (a daily line's today, a yearly line's whole year).
   * The quotient was not a percentage of anything. It fed the group Budget tab,
   * Reports, the Groups list, Home's health engine and the Plan forecast — where a
   * ₹24k/yr Trips budget made a *monthly* forecast look comfortably funded.
   *
   * Pools are excluded from both halves. Excluding the allocation but keeping the
   * spend would inflate utilisation instead of fixing it.
   */
  const roll = rollUpBudgets(budgets, target, now);
  const rateCategories = new Set(
    budgets.filter(b => budgetKind(b.cadence, target) === 'rate').map(b => b.category),
  );
  const tw = targetWindow(target, now);
  const targetSpendByCat = await getCategorySpending(db, group.id, tw.from, tw.to, meId);
  const totalAllocated = roll.amount;
  const totalSpent = Object.entries(targetSpendByCat)
    .reduce((s, [cat, amt]) => (rateCategories.has(cat) ? s + amt : s), 0);
  const utilizationPct = totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 100) : null;

  // Top categories this month (all expense categories, budgeted or not).
  const monthSpend = await getCategorySpending(db, group.id, startOfMonth(now).getTime(), endOfMonth(now).getTime());
  const lastMonth = subMonths(now, 1);
  const prevMonthSpend = await getCategorySpending(db, group.id, startOfMonth(lastMonth).getTime(), endOfMonth(lastMonth).getTime());

  const topCategories: TopCategory[] = Object.entries(monthSpend)
    .map(([category, spent]) => {
      const prevSpent = prevMonthSpend[category] ?? 0;
      return { category, spent, prevSpent, deltaPct: deltaPctOf(spent, prevSpent) };
    })
    .sort((a, b) => b.spent - a.spent);

  const highest = topCategories[0] ?? null;
  const lowest = topCategories.length > 0 ? topCategories[topCategories.length - 1] : null;

  let biggestIncrease: TopCategory | null = null;
  let biggestDecrease: TopCategory | null = null;
  for (const c of topCategories) {
    const d = c.spent - c.prevSpent;
    if (d > 0 && (!biggestIncrease || d > biggestIncrease.spent - biggestIncrease.prevSpent)) biggestIncrease = c;
    if (d < 0 && (!biggestDecrease || d < biggestDecrease.spent - biggestDecrease.prevSpent)) biggestDecrease = c;
  }

  const totalMonthSpent = Object.values(monthSpend).reduce((s, v) => s + v, 0);
  const priorMonthTotal = Object.values(prevMonthSpend).reduce((s, v) => s + v, 0);
  const daysInMonth = getDaysInMonth(now);
  // One forecast model everywhere: credibility-weighted blend (lib/forecast),
  // not a raw linear run-rate. Floors at spend-so-far; 0 before day 3.
  const projectedMonthEnd = forecastMonthEnd(totalMonthSpent, dayOfMonth, daysInMonth, priorMonthTotal).projected;
  // Compared against `projectedMonthEnd`, so it must be everything that applies to a
  // month. Filtering to `cadence === 'monthly'` was half-right: it correctly dropped
  // yearly pools, but silently dropped *daily* lines too, so a ₹500/day budget
  // contributed nothing and the projection always looked over.
  const monthlyBudgetTotal = rollUpBudgets(budgets, 'monthly', now).amount;

  // --- Rule-based recommendations ---
  const recommendations: Recommendation[] = [];
  for (const t of overBudget.slice(0, 3)) {
    recommendations.push({
      id: `over-${t.category}`,
      severity: 'warn', icon: 'alert-triangle',
      text: `You're ${formatCompact(t.spent - t.allocated)} over on ${t.category} (${utilLabel(t.pct)} used).`,
    });
  }
  for (const t of nearLimit.slice(0, 3)) {
    const tail = t.daysToLimit !== null && t.daysToLimit <= 10
      ? ` — could run out in ${t.daysToLimit} day${t.daysToLimit === 1 ? '' : 's'}`
      : '';
    recommendations.push({
      id: `near-${t.category}`,
      severity: 'warn', icon: 'clock',
      text: `${t.category} is ${utilLabel(t.pct)} used${tail}.`,
    });
  }
  if (biggestIncrease && (biggestIncrease.deltaPct ?? 0) >= 15) {
    recommendations.push({
      id: 'increase', severity: 'warn', icon: 'trending-up',
      text: `${biggestIncrease.category} is ${formatComparison(biggestIncrease.deltaPct ?? 0)}.`,
    });
  }
  if (biggestDecrease && (biggestDecrease.deltaPct ?? 0) <= -15) {
    recommendations.push({
      id: 'decrease', severity: 'good', icon: 'trending-down',
      text: `${biggestDecrease.category} is ${formatComparison(biggestDecrease.deltaPct ?? 0)} — nice.`,
    });
  }
  if (monthlyBudgetTotal > 0 && projectedMonthEnd > monthlyBudgetTotal) {
    // Overage reads best as the amount (what to claw back) plus a scale cue.
    // A % is intuitive for modest overage, but "(250%) over" is widely misread —
    // past ~100% over we switch to a multiple ("3.5× your budget"), which stays
    // unambiguous however large the overrun gets.
    const overAmt = projectedMonthEnd - monthlyBudgetTotal;
    const overPct = Math.round((overAmt / monthlyBudgetTotal) * 100);
    const scale = overPct >= 100
      ? `about ${(projectedMonthEnd / monthlyBudgetTotal).toFixed(1).replace(/\.0$/, '')}× your budget`
      : `${overPct}% over budget`;
    recommendations.push({
      id: 'projected', severity: 'warn', icon: 'pie-chart',
      text: `At this pace you'll spend ${formatCompact(projectedMonthEnd)} this month — ${formatCompact(overAmt)}, ${scale}.`,
    });
  }
  if (recommendations.length === 0 && totalAllocated > 0) {
    recommendations.push({
      id: 'ontrack', severity: 'good', icon: 'check-circle',
      text: 'All budgets are on track. Nice work.',
    });
  }

  return {
    totalAllocated, totalSpent, remaining: totalAllocated - totalSpent, utilizationPct,
    pooledAllocated: roll.pooled, pooledCount: roll.pooledCount,
    overBudget, nearLimit, underBudget,
    onTrackCount: underBudget.length,
    topCategories, highest, lowest, biggestIncrease, biggestDecrease,
    projectedMonthEnd, monthlyBudgetTotal, recommendations,
  };
}
