import * as SQLite from 'expo-sqlite';
import {
  startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear,
  subDays, subMonths, subYears, getDate, getDaysInMonth,
} from 'date-fns';
import type { BudgetGroup } from '../db/queries/groups';
import type { BudgetCadence } from '../db/queries/categoryBudgets';
import { getCategoryBudgets } from '../db/queries/categoryBudgets';
import { getCategorySpending, utilLabel, budgetHealth } from './budget';
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
  totalAllocated: number;
  totalSpent: number;
  remaining: number;
  utilizationPct: number | null;
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
  monthlyBudgetTotal: number;     // sum of monthly-cadence allocations (for projection comparison)
  recommendations: Recommendation[];
};

export type GroupInsight = Recommendation & {
  groupId: string;
  groupName: string;
};

/**
 * Cross-group insights for the dashboard. Runs the per-group analytics for
 * every group, then merges and ranks their recommendations so the home screen
 * can surface the few that matter most (warnings first, then movers, then a
 * single positive note). Each insight carries its origin group so a tap can
 * deep-link to that group's budget.
 */
export async function getDashboardInsights(
  db: SQLite.SQLiteDatabase,
  groups: BudgetGroup[],
  now = new Date(),
  limit = 3,
): Promise<GroupInsight[]> {
  const perGroup = await Promise.all(
    groups.map(async g => ({ group: g, analytics: await getBudgetAnalytics(db, g, now) })),
  );
  return rankInsights(perGroup, limit);
}

/**
 * Pure ranking of per-group analytics into a short, prioritized insight list.
 * Split from {@link getDashboardInsights} so callers that already hold the
 * analytics array (e.g. the dashboard) don't re-run the spending queries.
 */
export function rankInsights(
  perGroup: Array<{ group: BudgetGroup; analytics: BudgetAnalytics }>,
  limit = 3,
): GroupInsight[] {
  const all: GroupInsight[] = [];
  for (const { group, analytics } of perGroup) {
    for (const r of analytics.recommendations) {
      // The "all on track" filler is per-group noise on a multi-group dashboard;
      // we synthesize a single positive note below only if nothing else surfaces.
      if (r.id === 'ontrack') continue;
      all.push({ ...r, groupId: group.id, groupName: group.name });
    }
  }

  const severityRank: Record<Recommendation['severity'], number> = { warn: 0, info: 1, good: 2 };
  all.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  const ranked = all.slice(0, limit);

  // Nothing noteworthy but the user does budget → reassure rather than show blank.
  if (ranked.length === 0) {
    const hasBudgets = perGroup.some(p => p.analytics.totalAllocated > 0);
    if (hasBudgets) {
      return [{
        id: 'ontrack', severity: 'good', icon: 'check-circle',
        text: 'All budgets are on track across your groups. Nice work.',
        groupId: perGroup.find(p => p.analytics.totalAllocated > 0)!.group.id,
        groupName: '',
      }];
    }
  }
  return ranked;
}

function currentWindow(cadence: BudgetCadence, now: Date): { from: number; to: number } {
  switch (cadence) {
    case 'daily':   return { from: startOfDay(now).getTime(), to: endOfDay(now).getTime() };
    case 'monthly': return { from: startOfMonth(now).getTime(), to: endOfMonth(now).getTime() };
    case 'yearly':  return { from: startOfYear(now).getTime(), to: endOfYear(now).getTime() };
    case 'once':    return { from: 0, to: endOfDay(now).getTime() };
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
): Promise<BudgetAnalytics> {
  const budgets = await getCategoryBudgets(db, group.id);

  // No budgets → nothing to analyse; skip the spending queries entirely (perf).
  if (budgets.length === 0) {
    return {
      totalAllocated: 0, totalSpent: 0, remaining: 0, utilizationPct: null,
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
    curByCad[cad] = await getCategorySpending(db, group.id, cw.from, cw.to);
    const pw = previousWindow(cad, now);
    prevByCad[cad] = pw ? await getCategorySpending(db, group.id, pw.from, pw.to) : {};
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

  const overBudget = trends.filter(t => t.status === 'over').sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
  const nearLimit = trends.filter(t => t.status === 'near').sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
  const underBudget = trends.filter(t => t.status === 'under');

  const totalAllocated = trends.reduce((s, t) => s + t.allocated, 0);
  const totalSpent = trends.reduce((s, t) => s + t.spent, 0);
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
  const monthlyBudgetTotal = budgets.filter(b => b.cadence === 'monthly').reduce((s, b) => s + b.amount, 0);

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
    overBudget, nearLimit, underBudget,
    onTrackCount: underBudget.length,
    topCategories, highest, lowest, biggestIncrease, biggestDecrease,
    projectedMonthEnd, monthlyBudgetTotal, recommendations,
  };
}
