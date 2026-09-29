import type * as SQLite from 'expo-sqlite';
import { startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, format } from 'date-fns';
import { getAllGroups, getArchivedGroups, type BudgetGroup } from '../db/queries/groups';
import { getCategories } from '../db/queries/categories';
import { getTransactionsInRange, type TxnWithSplits } from '../db/queries/transactions';
import { foldUncategorized, matchesCategory } from './categoryFold';
import { isInvestment } from './settlementView';
import { txnTotal } from './splitMath';
import { getMyGlobalBudgetSummary, isGlobalBudgetGroup } from './budget';
import { getBudgetAnalytics, type BudgetAnalytics } from './analytics';
import { categoryVisual } from '../constants/categories';
import { CHART_COLORS } from '../constants/palette';
import type { DonutSeg } from './donut';
import { getMe } from '../db/queries/persons';
import { myShareOf, myIncomeOf } from './splitMath';

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

/**
 * My-share, not group-total.
 *
 * Reports summed every member's share while Home, Insights, budgets and Afford
 * all summed mine, so the same month read (say) ₹95,000 here and ₹40,000 there
 * with nothing on either screen explaining the gap. Reports answers "where did
 * MY money go", like every other surface.
 */
function buildSummary(group: BudgetGroup, txns: TxnWithSplits[], meId: string): GroupSummary {
  let income = 0;
  let expense = 0;
  const catMap: Record<string, number> = {};

  for (const t of txns) {
    if (t.kind === 'income') {
      income += myIncomeOf(t, meId);
    } else if (t.kind === 'expense') {
      const amt = myShareOf(t, meId);
      if (amt <= 0) continue;
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
      /*
       * Archived groups included, so the page adds up to itself.
       *
       * The hero total comes from `getTransactionsInRange(db, null, …)`, which
       * never joins `budget_group` and so counts every group — while the cards
       * below it came from `getAllGroups`, which excludes archived ones. A trip
       * archived last month with ₹6,000 of my share inside the selected month put
       * the hero at ₹26,000 above cards summing to ₹20,000, with nothing on the
       * screen naming the difference.
       *
       * The hero is the half that is right: money spent in a group you have since
       * hidden was still spent, which is the same reason balances count archived
       * groups. So the cards are what had to widen.
       */
      const [live, archived, me] = await Promise.all([
        getAllGroups(db), getArchivedGroups(db), getMe(db),
      ]);
      const grps = [...live, ...archived];
      // Every figure below is my share (see `buildSummary`).
      const meId = me?.id ?? '';

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
              // Income/expense/topCats are per-group facts and every group gets them.
              // A budget bar is not: the Personal group's lines are My Budget, so it
              // gets the `myBudget` card below instead of a group-budget bar.
              isGlobalBudgetGroup(g)
                ? Promise.resolve(null)
                : getBudgetAnalytics(db, g, { meId, now: month }),
            ]);
            return { summary: buildSummary(g, gTxns, meId), analytics: an };
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
      grps.forEach((g, i) => {
        const an = perGroup[i].analytics;
        if (an) anMap[g.id] = an;
      });

      let yIncome = 0;
      let yExpense = 0;
      let biggest = 0;
      const yCatMap: Record<string, number> = {};

      for (const t of yearTxns) {
        if (t.kind === 'income') {
          yIncome += myIncomeOf(t, meId);
        } else if (t.kind === 'expense') {
          const amt = myShareOf(t, meId);
          if (amt <= 0) continue;
          yExpense += amt;
          yCatMap[t.category] = (yCatMap[t.category] ?? 0) + amt;
          if (amt > biggest) biggest = amt;
        }
      }

      const topCat = Object.entries(yCatMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

      /*
       * Spending by category for the pie, from EVERY transaction in the month.
       *
       * A second map was built here from each group's `topCats` and then never
       * read. Not a wrong number, but a top-3-per-group aggregate sitting three
       * lines above an all-categories one — two variables that disagree by
       * construction, and a ready-made trap for whoever reaches for the nearer
       * name. Deleted rather than left to be found.
       */
      const knownExpense = new Set(knownExpenseCats.map(c => c.name));
      const fullCatMapRaw: Record<string, number> = {};
      for (const t of allMonthTxns) {
        if (t.kind === 'expense') { // getTransactionsInRange already excludes soft-deleted
          const amt = myShareOf(t, meId);
          if (amt > 0) fullCatMapRaw[t.category] = (fullCatMapRaw[t.category] ?? 0) + amt;
        }
      }
      const fullCatMap = foldUncategorized(fullCatMapRaw, knownExpense);
      // Month totals (Spent/Earned) + prior month, for the summary cards.
      let mSpent = 0, mEarned = 0;
      for (const t of allMonthTxns) {
        if (t.kind === 'expense') mSpent += myShareOf(t, meId);
        else if (t.kind === 'income') mEarned += myIncomeOf(t, meId);
      }
      // prior month (`pTxns`) was already fetched above.
      let pSpent = 0, pEarned = 0;
      for (const t of pTxns) {
        if (t.kind === 'expense') pSpent += myShareOf(t, meId);
        else if (t.kind === 'income') pEarned += myIncomeOf(t, meId);
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
          const amt = myShareOf(t, meId);
          if (amt <= 0) continue;
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
        // My Budget for the selected month — the one figure the Personal group's
        // (absent) bar would otherwise have tried to be.
        myBudget: await getMyGlobalBudgetSummary(db, meId, { now: month }),
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

export type ReportSort = 'date' | 'amount';

/**
 * One month's ledger for the drill-down from a Reports segment. Group names cover
 * archived groups too: their entries are in the month, and an unnamed row reads
 * as Personal.
 */
export async function loadReportTransactions(db: SQLite.SQLiteDatabase, month: Date) {
  const [live, archived, me, txns, knownCats] = await Promise.all([
    getAllGroups(db),
    getArchivedGroups(db),
    getMe(db),
    getTransactionsInRange(db, null, startOfMonth(month).getTime(), endOfMonth(month).getTime()),
    // Only needed to resolve the folded "Others" filter — the category *list* is gone,
    // because the pie chart you arrived from is the category picker.
    getCategories(db, 'expense'),
  ]);
  const grps = [...live, ...archived];
  return {
    myId: me?.id ?? '',
    personalId: grps.find(g => g.is_personal === 1)?.id ?? null,
    groupNames: Object.fromEntries(grps.map(g => [g.id, g.name])) as Record<string, string>,
    known: new Set(knownCats.map(c => c.name)),
    txns,
  };
}

/**
 * The drill-down's rows, filtered and sorted, with a total PER KIND. A single total
 * across income + expense + transfers answers no question anyone has, and a
 * settlement is neither — so investments are counted apart from person-to-person
 * settlements too (`IV-17`), and "Moved" means what it says.
 */
export function reportTransactionRows(
  txns: TxnWithSplits[],
  { cat, typeFilter, group, sort, known }: { cat: string; typeFilter: string; group: string; sort: ReportSort; known: Set<string> },
): { rows: TxnWithSplits[]; byKind: Record<string, number> } {
  const rows = txns.filter(t => {
    if (typeFilter === 'invest') {
      if (!isInvestment(t)) return false;
    } else if (typeFilter === 'settlement') {
      // "Transfers" means between PEOPLE. An asset movement has its own tab, so
      // leaving it here would double-count it across two tabs.
      if (t.kind !== 'settlement' || isInvestment(t)) return false;
    } else if (typeFilter !== 'all' && t.kind !== typeFilter) return false;
    if (group !== 'all' && t.group_id !== group) return false;
    // A folded-name filter ("Others") matches any category not in the catalog.
    return cat === 'all' || matchesCategory(t.category, cat, known);
  });
  rows.sort((a, b) => (sort === 'amount' ? txnTotal(b) - txnTotal(a) : b.date - a.date));
  const byKind: Record<string, number> = { expense: 0, income: 0, settlement: 0, invest: 0 };
  for (const t of rows) {
    const bucket = isInvestment(t) ? 'invest' : t.kind;
    byKind[bucket] = (byKind[bucket] ?? 0) + txnTotal(t);
  }
  return { rows, byKind };
}
