import type * as SQLite from 'expo-sqlite';
import { startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, format } from 'date-fns';
import { getAllGroups, type BudgetGroup } from '../db/queries/groups';
import { getCategories } from '../db/queries/categories';
import { getTransactionsInRange, type TxnWithSplits } from '../db/queries/transactions';
import { foldUncategorized } from './categoryFold';
import { getBudgetAnalytics, type BudgetAnalytics } from './analytics';
import { categoryVisual } from '../constants/categories';
import { CHART_COLORS } from '../constants/palette';
import type { DonutSeg } from './donut';

/**
 * All data assembly for the Reports screen — group summaries, the category pie,
 * the 6-month trend and the year/month/prior-month aggregates.
 *
 * Extracted from `app/reports.tsx` (596 lines), which was carrying ~130 lines of
 * query orchestration inline. The screen keeps the month state, the export
 * handlers and the render.
 */

type GroupSummary = {
  group: BudgetGroup;
  income: number;
  expense: number;
  topCats: Array<{ name: string; amount: number }>;
};

type MonthPoint = { label: string; total: number; byCat: Record<string, number> };

function buildSummary(group: BudgetGroup, txns: TxnWithSplits[]): GroupSummary {
  let income = 0;
  let expense = 0;
  const catMap: Record<string, number> = {};

  for (const t of txns) {
    if (t.kind === 'income') {
      income += t.payments.reduce((s, p) => s + p.amount, 0);
    } else if (t.kind === 'expense') {
      const amt = t.shares.reduce((s, sh) => s + sh.amount, 0);
      expense += amt;
      catMap[t.category] = (catMap[t.category] ?? 0) + amt;
    }
  }

  const topCats = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, amount]) => ({ name, amount }));

  return { group, income, expense, topCats };
}

export async function loadReportsData(db: SQLite.SQLiteDatabase, month: Date) {
      const grps = await getAllGroups(db);

      const fromMs = startOfMonth(month).getTime();
      const toMs = endOfMonth(month).getTime();
      const yFrom = startOfYear(month).getTime();
      const yTo = endOfYear(month).getTime();
      const pStart = startOfMonth(subMonths(month, 1)).getTime();
      const pEnd = endOfMonth(subMonths(month, 1)).getTime();
      // 6-month trend window (oldest → newest) ending at the selected month.
      const trendMonths = Array.from({ length: 6 }, (_, i) => subMonths(month, 5 - i));

      // Fire every independent read concurrently instead of awaiting each in series
      // (this loader used to do ~12 sequential round-trips). Ranges that were queried
      // more than once (current month, prior month) are fetched here and reused below.
      const [perGroup, yearTxns, allMonthTxns, knownExpenseCats, pTxns, trendTxnsByMonth] =
        await Promise.all([
          Promise.all(grps.map(async (g) => {
            const [gTxns, an] = await Promise.all([
              getTransactionsInRange(db, g.id, fromMs, toMs),
              getBudgetAnalytics(db, g, month),
            ]);
            return { summary: buildSummary(g, gTxns), analytics: an };
          })),
          getTransactionsInRange(db, null, yFrom, yTo),
          getTransactionsInRange(db, null, fromMs, toMs),
          getCategories(db, 'expense'),
          getTransactionsInRange(db, null, pStart, pEnd),
          Promise.all(trendMonths.map((m) =>
            getTransactionsInRange(db, null, startOfMonth(m).getTime(), endOfMonth(m).getTime()))),
        ]);

      const sums: GroupSummary[] = perGroup.map((r) => r.summary);
      const anMap: Record<string, BudgetAnalytics> = {};
      grps.forEach((g, i) => { anMap[g.id] = perGroup[i].analytics; });

      let yIncome = 0;
      let yExpense = 0;
      let biggest = 0;
      const yCatMap: Record<string, number> = {};

      for (const t of yearTxns) {
        if (t.kind === 'income') {
          yIncome += t.payments.reduce((s, p) => s + p.amount, 0);
        } else if (t.kind === 'expense') {
          const amt = t.shares.reduce((s, sh) => s + sh.amount, 0);
          yExpense += amt;
          yCatMap[t.category] = (yCatMap[t.category] ?? 0) + amt;
          if (amt > biggest) biggest = amt;
        }
      }

      const topCat = Object.entries(yCatMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

      // Build spending-by-category pie chart data for the selected month
      const monthCatMap: Record<string, number> = {};
      for (const s of sums) {
        for (const c of s.topCats) {
          monthCatMap[c.name] = (monthCatMap[c.name] ?? 0) + c.amount;
        }
      }
      // Add all categories from all groups (not just top 3). `allMonthTxns` and the
      // adopted expense category names were already fetched above.
      const knownExpense = new Set(knownExpenseCats.map(c => c.name));
      const fullCatMapRaw: Record<string, number> = {};
      for (const t of allMonthTxns) {
        if (t.kind === 'expense') { // getTransactionsInRange already excludes soft-deleted
          const amt = t.shares.reduce((s2, sh) => s2 + sh.amount, 0);
          fullCatMapRaw[t.category] = (fullCatMapRaw[t.category] ?? 0) + amt;
        }
      }
      const fullCatMap = foldUncategorized(fullCatMapRaw, knownExpense);
      // Month totals (Spent/Earned) + prior month, for the summary cards.
      let mSpent = 0, mEarned = 0;
      for (const t of allMonthTxns) {
        if (t.kind === 'expense') mSpent += t.shares.reduce((s2, sh) => s2 + sh.amount, 0);
        else if (t.kind === 'income') mEarned += t.payments.reduce((s2, p) => s2 + p.amount, 0);
      }
      // prior month (`pTxns`) was already fetched above.
      let pSpent = 0, pEarned = 0;
      for (const t of pTxns) {
        if (t.kind === 'expense') pSpent += t.shares.reduce((s2, sh) => s2 + sh.amount, 0);
        else if (t.kind === 'income') pEarned += t.payments.reduce((s2, p) => s2 + p.amount, 0);
      }

      const sortedCats = Object.entries(fullCatMap).sort((a, b) => b[1] - a[1]);
      const pieData: DonutSeg[] = sortedCats.slice(0, 8).map(([name, val], i) => ({
        name,
        paise: val,
        color: categoryVisual(name).color || CHART_COLORS[i % CHART_COLORS.length],
      }));
      const pieTotal = sortedCats.reduce((s, [, v]) => s + v, 0);

      // 6-month spending trend ending at the selected month — overall + per-category,
      // so picking a category in the donut/labels redraws this chart for that category.
      const monthly: MonthPoint[] = trendMonths.map((m, idx) => {
        let mTotal = 0;
        const byCatRaw: Record<string, number> = {};
        for (const t of trendTxnsByMonth[idx]) {
          if (t.kind !== 'expense') continue;
          const amt = t.shares.reduce((s2, sh) => s2 + sh.amount, 0);
          mTotal += amt;
          byCatRaw[t.category] = (byCatRaw[t.category] ?? 0) + amt;
        }
        // Fold unknown names into "Others" so the trend matches the donut/labels
        // (selecting the Others slice shows its 6-month total too).
        return { label: format(m, 'MMM'), total: mTotal, byCat: foldUncategorized(byCatRaw, knownExpense) };
      });

      return {
        groups: grps,
        summaries: sums,
        analyticsByGroup: anMap,
        yearIncome: yIncome,
        yearExpense: yExpense,
        yearTopCat: topCat,
        biggestTxn: biggest,
        monthSpent: mSpent,
        monthEarned: mEarned,
        prevSpent: pSpent,
        prevEarned: pEarned,
        pieData,
        pieTotal,
        monthly,
      };
}
