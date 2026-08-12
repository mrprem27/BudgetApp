import type * as SQLite from 'expo-sqlite';
import { getDate, getDaysInMonth } from 'date-fns';
import { colors } from '../constants/colors';
import { getTransactionsInRange } from '../db/queries/transactions';
import { getBudgetAnalytics } from '../lib/analytics';
import { getAllGroups, sharedGroupsOf } from '../db/queries/groups';
import { getMe } from '../db/queries/persons';
import { buildSavingsInsights } from '../db/queries/savings';
import { myShareOf } from './splitMath';
import { getMyGlobalBudgetSummary } from './budget';
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

    const dayOfMonth = getDate(now);
    const daysInMonth = getDaysInMonth(now);

    /**
     * **One** month-end forecast for the whole screen.
     *
     * The hero used a naive run-rate — `(monthSpend / dayOfMonth) * daysInMonth`
     * — while the chart badge ~100px below used the credibility-weighted model,
     * so the same screen printed two different month-end totals at the same time.
     * The blended model is the one to keep: on day 2 a run-rate multiplies a
     * single rent payment by fifteen, which is exactly the case the prior exists
     * to damp. `forecastMonthEnd` floors at spent-so-far and reports `ready`, so
     * an early month degrades honestly instead of shouting a number.
     */
    const priorMonthTotal = Object.values(lastCatMap).reduce((s, v) => s + v, 0);
    const fc = forecastMonthEnd(monthSpend, dayOfMonth, daysInMonth, priorMonthTotal);
    const projected = Math.round(fc.projected);

    // Month-end forecast graph (moved here from Reports): a solid "spent so far"
    // line and a dashed projection to month-end. Rupee values (÷100) so the chart
    // axis reads in ₹.
    let forecastActual: LinePoint[] = [];
    let forecastProjected: LinePoint[] = [];
    let projectedTotal = 0;
    if (dayOfMonth >= FORECAST_MIN_DAYS) {
      const spendByDay = new Array(daysInMonth + 1).fill(0); // 1-indexed
      for (const t of monthTxns) {
        if (t.kind !== 'expense') continue;
        const amt = myShareOf(t, meId);
        // `> 0` matches how `catMap`/`monthSpend` are built, so the last point of
        // the actual line is the same number the hero shows.
        if (amt <= 0) continue;
        const d = getDate(new Date(t.date));
        if (d >= 1 && d <= daysInMonth) spendByDay[d] += amt;
      }
      const dailyCumulative: number[] = [];
      let running = 0;
      for (let d = 1; d <= dayOfMonth; d++) { running += spendByDay[d]; dailyCumulative.push(Math.round(running / 100)); }
      if (fc.ready) {
        /*
         * Weekly points, not daily.
         *
         * gifted-charts renders every x-label in a View exactly `spacing` wide at
         * one line, so `spacing` IS the label's width budget. 31 daily points on a
         * 393pt screen leave ~10px per label and two digits need ~12 — which is why
         * the axis read "1…", "2…", "3…". Measuring the container properly (see
         * `lib/chartAxis`) moved that from 9.7px to 10.5px: real, and not enough.
         * The library has no per-point label width for line charts, so the only
         * thing that creates room is fewer points. ~5 weekly points give ~58px each.
         *
         * The forecast MATHS is untouched — it runs on daily data above, and this
         * only samples the curve for drawing. The line is cumulative and monotonic,
         * so weekly sampling reads the same shape; the month-end value, which is the
         * point of the chart, is preserved exactly by always including the last day.
         */
        const marks: number[] = [];
        for (let d = 1; d <= daysInMonth; d += 7) marks.push(d);
        if (marks[marks.length - 1] !== daysInMonth) marks.push(daysInMonth);

        const valueAt = (d: number) => (d <= dayOfMonth
          ? dailyCumulative[d - 1]
          : Math.round(projectedAtDay(running, dayOfMonth, daysInMonth, fc.projected, d) / 100));

        // Projected series owns the x-axis labels and spans the whole month.
        forecastProjected = marks.map(d => ({ value: valueAt(d), label: `${d}`, hideDataPoint: true }));

        // Solid "actual" overlay stops at today. Sampled on the same marks so the
        // two lines stay registered, plus today itself so the marker lands on the
        // real figure rather than the nearest week boundary.
        const actualMarks = marks.filter(d => d <= dayOfMonth);
        if (actualMarks[actualMarks.length - 1] !== dayOfMonth) actualMarks.push(dayOfMonth);
        forecastActual = actualMarks.map((d, i) => ({
          value: dailyCumulative[d - 1], label: '',
          hideDataPoint: i !== actualMarks.length - 1,
          dataPointColor: colors.expense, dataPointRadius: 5,
        }));
        projectedTotal = Math.round(fc.projected / 100);
      }
    }

    /*
     * Shared groups only: the Personal group's lines are My Budget — the `budget`
     * figure below — so including it would report the same limit twice.
     *
     * `meId` is passed. Without it these drivers measured the whole group's spend
     * against one person's allowance (a group budget is per-person, `4c7ee45`) and
     * ignored every override.
     */
    const analyticsByGroup = await Promise.all(
      sharedGroupsOf(grps).map(async g => ({ group: g, a: await getBudgetAnalytics(db, g, { meId, now }) })),
    );

    // Shares monthSpend's basis: my share, all groups (FLOW-09 step 6). One
    // function so this cannot drift from Home's or Plan's answer.
    const mine = meId ? await getMyGlobalBudgetSummary(db, meId, { now }) : null;
    const budget = mine?.allocated ?? 0;

    const recommendations: Rec[] = analyticsByGroup.flatMap(({ group, a }) =>
      a.recommendations.map(r => ({ key: `${group.id}:${r.id}`, severity: r.severity, icon: r.icon, text: r.text, group: group.name })),
    );
    const drivers: Driver[] = [
      // My Budget's own overspend, labelled as mine rather than as a group's.
      ...(mine?.rows ?? [])
        .filter(r => r.remaining < 0)
        .map(r => ({ key: `me:${r.category}`, category: r.category, over: -r.remaining, group: 'Your budget' })),
      ...analyticsByGroup
        .flatMap(({ group, a }) => a.overBudget.map(t => ({ key: `${group.id}:${t.category}`, category: t.category, over: t.spent - t.allocated, group: group.name }))),
    ]
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
