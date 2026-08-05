import type * as SQLite from 'expo-sqlite';
import { getDate, getDaysInMonth } from 'date-fns';
import { colors } from '../constants/colors';
import { getTransactionsInRange } from '../db/queries/transactions';
import { getBudgetAnalytics } from '../lib/analytics';
import { getAllGroups } from '../db/queries/groups';
import { getMe } from '../db/queries/persons';
import { buildSavingsInsights } from '../db/queries/savings';
import { myShareOf } from './splitMath';
import { getMyGlobalBudgetStatus } from './budget';
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
  /** Injected for determinism, same contract as `getBudgetAnalytics`/`lib/upcoming`. */
  now: Date = new Date(),
) {

    const [grps, me] = await Promise.all([getAllGroups(db), getMe(db)]);
    const meId = me?.id ?? '';

    // This month vs last month spend by category (for shifts + velocity).
    // Copy before mutating — `now` belongs to the caller.
    const monthStart = new Date(now.getTime());
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const lastMonthEnd = new Date(monthStart.getTime() - 1);
    const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);
    const [monthTxns, lastMonthTxns] = await Promise.all([
      getTransactionsInRange(db, null, monthStart.getTime(), now.getTime()),
      getTransactionsInRange(db, null, lastMonthStart.getTime(), lastMonthEnd.getTime()),
    ]);
    // My share, not the group total — same basis as Home, budgets and afford.
    const catMap: Record<string, number> = {};
    const lastCatMap: Record<string, number> = {};
    for (const t of monthTxns) if (t.kind === 'expense') {
      const amt = myShareOf(t, meId);
      if (amt > 0) catMap[t.category] = (catMap[t.category] ?? 0) + amt;
    }
    for (const t of lastMonthTxns) if (t.kind === 'expense') {
      const amt = myShareOf(t, meId);
      if (amt > 0) lastCatMap[t.category] = (lastCatMap[t.category] ?? 0) + amt;
    }
    const monthSpend = Object.values(catMap).reduce((s, v) => s + v, 0);
    // Sample size behind every projection on this screen (see SampleNote).
    const txnCount = monthTxns.filter(t => t.kind === 'expense' && myShareOf(t, meId) > 0).length;

    // Top spending category powers the "What if I cut…" simulator.
    const topEntry = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
    const whatIf = topEntry ? { name: topEntry[0], monthly: topEntry[1] } : null;

    // Month-end projection from daily pace.
    const dayOfMonth = getDate(now);
    const daysInMonth = getDaysInMonth(now);
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
        if (d >= 1 && d <= daysInMonth) spendByDay[d] += myShareOf(t, meId);
      }
      const dailyCumulative: number[] = [];
      let running = 0;
      for (let d = 1; d <= dayOfMonth; d++) { running += spendByDay[d]; dailyCumulative.push(Math.round(running / 100)); }
      const priorMonthTotal = Object.values(lastCatMap).reduce((s, v) => s + v, 0);
      const fc = forecastMonthEnd(running, dayOfMonth, daysInMonth, priorMonthTotal);
      if (fc.ready) {
        // Every-other-day labels ("1..", "2..") overlapped and got clipped by the
        // chart at typical screen widths — 5-day steps leave each label room to
        // render its full 1-2 digit day number.
        const labelForDay = (d: number) => (d === 1 || d % 5 === 0 ? `${d}` : '');
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
    const analyticsByGroup = await Promise.all(grps.map(async g => ({ group: g, a: await getBudgetAnalytics(db, g, now) })));

    // Must share monthSpend's basis: the my-share budget (FLOW-09 step 6), not
    // every group's allocation. `analyticsByGroup` stays group-scoped on purpose —
    // drivers/recommendations are findings about a group's own budget line, and
    // passing `meId` there would compare my share against the group's allocation.
    const myBudgetRows = meId ? await getMyGlobalBudgetStatus(db, meId, now) : [];
    const budget = myBudgetRows.reduce((s, r) => s + r.allocated, 0);

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

    return { monthSpend, budget, projected, txnCount, shifts, whatIf, recommendations, drivers, savings, multiGroup: grps.length > 1, forecastActual, forecastProjected, projectedTotal };
}
