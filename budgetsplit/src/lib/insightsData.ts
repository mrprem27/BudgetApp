import type * as SQLite from 'expo-sqlite';
import { getDate, getDaysInMonth } from 'date-fns';
import { colors } from '../constants/colors';
import { getTransactionsInRange } from '../db/queries/transactions';
import { getBudgetAnalytics } from '../lib/analytics';
import { getAllGroups } from '../db/queries/groups';
import { buildSavingsInsights } from '../db/queries/savings';
import { forecastMonthEnd, projectedAtDay, FORECAST_MIN_DAYS } from './forecast';

/**
 * Data assembly for the Insights screen: month-vs-last-month category shifts,
 * the what-if simulator input, the month-end forecast series, cross-group
 * budget recommendations/drivers and savings nudges.
 *
 * Extracted from `app/insights.tsx`, which carried ~100 lines of query
 * orchestration inline. The screen keeps the cut-percentage state and render.
 */

type Shift = { cat: string; thisAmt: number; pct: number };
type Rec = { key: string; severity: 'warn' | 'info' | 'good'; icon: string; text: string; group: string };
type Driver = { key: string; category: string; over: number; group: string };
type LinePoint = { value: number; label?: string; hideDataPoint?: boolean; dataPointColor?: string; dataPointRadius?: number };

export async function loadInsightsData(
  db: SQLite.SQLiteDatabase,
  opts: { savingsInsights?: boolean } = {},
) {

    const grps = await getAllGroups(db);

    // This month vs last month spend by category (for shifts + velocity).
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const lastMonthEnd = new Date(monthStart.getTime() - 1);
    const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);
    const [monthTxns, lastMonthTxns] = await Promise.all([
      getTransactionsInRange(db, null, monthStart.getTime(), Date.now()),
      getTransactionsInRange(db, null, lastMonthStart.getTime(), lastMonthEnd.getTime()),
    ]);
    const catMap: Record<string, number> = {};
    const lastCatMap: Record<string, number> = {};
    for (const t of monthTxns) if (t.kind === 'expense') {
      const amt = t.shares.reduce((s: number, sh: { amount: number }) => s + sh.amount, 0);
      catMap[t.category] = (catMap[t.category] ?? 0) + amt;
    }
    for (const t of lastMonthTxns) if (t.kind === 'expense') {
      const amt = t.shares.reduce((s: number, sh: { amount: number }) => s + sh.amount, 0);
      lastCatMap[t.category] = (lastCatMap[t.category] ?? 0) + amt;
    }
    const monthSpend = Object.values(catMap).reduce((s, v) => s + v, 0);

    // Top spending category powers the "What if I cut…" simulator.
    const topEntry = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
    const whatIf = topEntry ? { name: topEntry[0], monthly: topEntry[1] } : null;

    // Month-end projection from daily pace.
    const today = new Date();
    const dayOfMonth = getDate(today);
    const daysInMonth = getDaysInMonth(today);
    const projected = dayOfMonth > 0 ? Math.round((monthSpend / dayOfMonth) * daysInMonth) : 0;

    // Month-end forecast graph (moved here from Reports): a solid "spent so far"
    // line and a dashed projection to month-end, using the credibility-weighted
    // model (src/lib/forecast). Rupee values (÷100) so the chart axis reads in ₹.
    let forecastActual: LinePoint[] = [];
    let forecastProjected: LinePoint[] = [];
    let projectedTotal = 0;
    if (dayOfMonth >= FORECAST_MIN_DAYS) {
      const spendByDay = new Array(daysInMonth + 1).fill(0); // 1-indexed
      for (const t of monthTxns) {
        if (t.kind !== 'expense') continue;
        const d = getDate(new Date(t.date));
        if (d >= 1 && d <= daysInMonth) spendByDay[d] += t.shares.reduce((x: number, sh: { amount: number }) => x + sh.amount, 0);
      }
      const dailyCumulative: number[] = [];
      let running = 0;
      for (let d = 1; d <= dayOfMonth; d++) { running += spendByDay[d]; dailyCumulative.push(Math.round(running / 100)); }
      const priorMonthTotal = Object.values(lastCatMap).reduce((s, v) => s + v, 0);
      const fc = forecastMonthEnd(running, dayOfMonth, daysInMonth, priorMonthTotal);
      if (fc.ready) {
        const labelForDay = (d: number) => (d % 2 === 1 ? `${d}` : '');
        // Projected series owns the x-axis labels and spans the whole month.
        forecastProjected = Array.from({ length: daysInMonth }, (_, i) => {
          const d = i + 1;
          const value = d <= dayOfMonth
            ? dailyCumulative[d - 1]
            : Math.round(projectedAtDay(running, dayOfMonth, daysInMonth, fc.projected, d) / 100);
          return { value, label: labelForDay(d), hideDataPoint: true };
        });
        // Solid "actual" overlay up to today; marks the "today" point only.
        forecastActual = dailyCumulative.map((value, i) => ({
          value, label: '', hideDataPoint: i !== dayOfMonth - 1,
          dataPointColor: colors.expense, dataPointRadius: 5,
        }));
        projectedTotal = Math.round(fc.projected / 100);
      }
    }

    // Budget analytics per group — powers the total, plus the recommendations and
    // "driving overspend" that used to live inside each group's Budget tab. They're
    // aggregated across every group here and tagged with the group name.
    const analyticsByGroup = await Promise.all(grps.map(async g => ({ group: g, a: await getBudgetAnalytics(db, g) })));
    const budget = analyticsByGroup.reduce((s, x) => s + x.a.totalAllocated, 0);

    const recommendations: Rec[] = analyticsByGroup.flatMap(({ group, a }) =>
      a.recommendations.map(r => ({ key: `${group.id}:${r.id}`, severity: r.severity, icon: r.icon, text: r.text, group: group.name })),
    );
    const drivers: Driver[] = analyticsByGroup
      .flatMap(({ group, a }) => a.overBudget.map(t => ({ key: `${group.id}:${t.category}`, category: t.category, over: t.spent - t.allocated, group: group.name })))
      .sort((x, y) => y.over - x.over)
      .slice(0, 6);

    // Savings nudges — moved here from the Plan tab.
    // Flag-gated: skip the query entirely when the surface is off, rather than
    // building nudges the screen will throw away.
    const savings = opts.savingsInsights === false ? [] : await buildSavingsInsights(db);

    // Biggest category shifts vs last month.
    const shifts: Shift[] = Object.entries(catMap)
      .filter(([cat]) => lastCatMap[cat])
      .map(([cat, thisAmt]) => {
        const lastAmt = lastCatMap[cat] ?? 0;
        return { cat, thisAmt, pct: lastAmt > 0 ? Math.round(((thisAmt - lastAmt) / lastAmt) * 100) : 0 };
      })
      .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
      .slice(0, 3);

    return { monthSpend, budget, projected, shifts, whatIf, recommendations, drivers, savings, multiGroup: grps.length > 1, forecastActual, forecastProjected, projectedTotal };
}
