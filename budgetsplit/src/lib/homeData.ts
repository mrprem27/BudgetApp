import type * as SQLite from 'expo-sqlite';
import {
  startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear,
  subDays, subMonths, subYears, getDate, getDaysInMonth,
} from 'date-fns';
import { getAllPersons } from '../db/queries/persons';
import { getAllGroups } from '../db/queries/groups';
import { getMyExposure } from '../db/queries/balances';
import { getSafeToSpend } from '../db/queries/spendPower';
import { getPendingCount } from '../db/queries/pending';
import { getCategories } from '../db/queries/categories';
import { getTransactionsInRange, getLedgerStats } from '../db/queries/transactions';
import { getGoalFundingStatus } from '../db/queries/spendPower';
import { getTotalMoney } from '../db/queries/savings';
import { getRecurringForGroup, getSkipsMap } from '../db/queries/recurring';
import { foldUncategorized } from './categoryFold';
import { settings } from './settings';
import { myShareOf, myIncomeOf } from './splitMath';
import { getMyGlobalBudgetSummary, budgetEquivalent, type Period } from './budget';
import { computeHealthScore, type HealthInputs, type HealthResult } from './financialHealth';
import { forecastMonthEnd, type Forecast } from './forecast';
import { buildUpcoming, type UpcomingItem } from './upcoming';
import { categoryVisual } from '../constants/categories';
import type { CategoryRow } from '../components/finance/home/CategoryRankList';
import type { ForecastShift } from '../components/finance/home/ForecastCard';
import type { BudgetGroup } from '../db/queries/groups';

/**
 * Dashboard data assembly — period spend/income, owe/owed exposure, budget
 * pace, category ranking, health score, upcoming bills, month-end forecast
 * and the tracking streak.
 *
 * Extracted from `app/(tabs)/index.tsx`, which carried ~150 lines of query
 * orchestration inline. The screen keeps the tab state and render.
 */

export type TabKey = 'today' | 'month' | 'year';

/**
 * The period each pill rolls budgets up into — and, because `Period` and
 * `BudgetCadence` share a vocabulary, also the noun the empty state says when
 * nothing is budgeted at that period ("No daily budget set").
 *
 * The rule this encodes lives in `budgetKind`: a line counts toward a headline
 * only when its cadence is at or finer than the headline's period. Today sees
 * daily lines, Month sees daily + monthly, Year sees all three.
 */
export const TARGET_FOR_TAB: Record<TabKey, Period> = {
  today: 'daily', month: 'monthly', year: 'yearly',
};

export function getRange(tab: TabKey): { from: number; to: number } {
  const now = new Date();
  switch (tab) {
    case 'today': return { from: startOfDay(now).getTime(), to: endOfDay(now).getTime() };
    // Ends at `now`: "spent" is what happened, not what is scheduled. A fee dated
    // the 28th and logged on the 2nd used to count as already spent for the month.
    case 'month': return { from: startOfMonth(now).getTime(), to: now.getTime() };
    case 'year':  return { from: startOfYear(now).getTime(), to: endOfYear(now).getTime() };
  }
}

// "Till now" comparison: the prior period only up to the SAME elapsed point we're
// at in the current one (e.g. month-to-date vs same-day-last-month-to-date), so the
// delta isn't unfairly low early in a period. Capped at the prior period's real end.
export function getPrevRange(tab: TabKey): { from: number; to: number } {
  const now = new Date();
  const elapsed = now.getTime() - getRange(tab).from;
  switch (tab) {
    case 'today': { const d = subDays(now, 1);   const from = startOfDay(d).getTime();   return { from, to: Math.min(from + elapsed, endOfDay(d).getTime()) }; }
    case 'month': { const d = subMonths(now, 1); const from = startOfMonth(d).getTime(); return { from, to: Math.min(from + elapsed, endOfMonth(d).getTime()) }; }
    case 'year':  { const d = subYears(now, 1);  const from = startOfYear(d).getTime();  return { from, to: Math.min(from + elapsed, endOfYear(d).getTime()) }; }
  }
}

export const PREV_LABEL: Record<TabKey, string> = { today: 'yesterday', month: 'last month', year: 'last year' };
export const PERIOD_LABEL: Record<TabKey, string> = { today: 'SPENT TODAY', month: 'SPENT THIS MONTH', year: 'SPENT THIS YEAR' };
// Lowercase, sentence-context period names for the health-score confidence note
// ("Based on N transactions logged {this}") — distinct from the shouting-caps
// PERIOD_LABEL above, which is a section heading, not inline prose.
export const TXN_COUNT_PERIOD_LABEL: Record<TabKey, string> = { today: 'today', month: 'this month', year: 'this year' };

export async function loadHomeData(
  db: SQLite.SQLiteDatabase,
  groups: BudgetGroup[],
  tab: TabKey,
) {

    const persons = await getAllPersons(db);

    const me = persons.find(p => p.is_me === 1);
    if (!me) {
      return {
        meInfo: null as { name: string; color: string; image: string | null } | null,
        spending: 0, income: 0, prevSpending: 0,
        oweTotal: 0, owedTotal: 0, reviewCount: 0,
        budget: { allocated: 0, spent: 0, pooledCount: 0, exists: false, monthlyAllocated: 0 },
        catRows: [] as CategoryRow[], catTotal: 0,
        health: null as HealthResult | null, healthInputs: null as HealthInputs | null, healthTxnCount: 0,
        upcoming: [] as UpcomingItem[],
        forecast: null as Forecast | null, topShift: null as ForecastShift | null,
        streak: 0, streakLoggedDays: new Set<string>(),
      };
    }
    const meInfo = { name: me.name, color: me.avatar_color, image: me.image_uri };

    const { from, to } = getRange(tab);
    // Single source of truth: materialization-aware query feeds the hero number
    // and the category breakdown so they always agree (incl. recurring).
    const txns = await getTransactionsInRange(db, null, from, to);
    let sp = 0;
    let inc = 0;
    const catMap: Record<string, number> = {};
    for (const txn of txns) {
      if (txn.is_deleted) continue;
      if (txn.kind === 'expense') {
        const myShare = myShareOf(txn, me.id);
        sp += myShare;
        if (myShare > 0) catMap[txn.category] = (catMap[txn.category] ?? 0) + myShare;
      } else if (txn.kind === 'income') {
        inc += myIncomeOf(txn, me.id);
      }
    }

    // Compute daily streak from month transactions
    const loggedDays = new Set<string>();
    for (const t of txns) {
      if (t.is_deleted) continue;
      const d = new Date(t.date);
      if (!isFinite(d.getTime())) continue;
      loggedDays.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    // Count consecutive days backwards from today
    const today3 = new Date();
    let s = 0;
    for (let i = 0; i < 31; i++) {
      const check = new Date(today3.getFullYear(), today3.getMonth(), today3.getDate() - i);
      const key = `${check.getFullYear()}-${String(check.getMonth() + 1).padStart(2, '0')}-${String(check.getDate()).padStart(2, '0')}`;
      if (loggedDays.has(key)) s++;
      else break;
    }

    // Prior-period spend (my share) for the hero delta.
    const prev = getPrevRange(tab);
    const prevTxns = await getTransactionsInRange(db, null, prev.from, prev.to);
    let prevSp = 0;
    for (const t of prevTxns) {
      if (t.is_deleted || t.kind !== 'expense') continue;
      prevSp += myShareOf(t, me.id);
    }

    // Who owes whom — single source of truth (per-person, after all settlements),
    // so owe AND owed can both show (matches Insights / Personal / Groups).
    const exp = await getMyExposure(db, me.id);
    const reviewCount = await getPendingCount(db);

    /*
     * Everything budget-shaped on Home is **My Budget** — one summary, no per-group
     * loop.
     *
     * The loop it replaces summed every group's allocation (the Personal group's
     * included, which IS this cap) and paired it with every group's *full bill*,
     * because no `meId` was passed: a ₹1,000 expense split 50/50 charged ₹1,000
     * against my budget. Both halves now share my-share, all-groups basis, and the
     * health score is rebased onto them.
     */
    /*
     * TWO summaries, because Home asks two different questions.
     *
     * `monthly` is the health engine's basis and never moves. Its inputs are
     * month-shaped (`dayOfMonth`, `daysInMonth`), so a score that re-based itself
     * on whichever pill was tapped would swing between three different numbers
     * for the same finances.
     *
     * `mine` is the pace bar's, rolled up at the period the pills select. The
     * screen used to take the monthly figure and divide it by days-in-month for
     * Today and multiply it by 12 for Year. Both are wrong in the same way: the
     * first rolls a monthly line *down* into a day — the error `budgetKind`
     * exists to name, and the one a single rent payment turns into a 15× red bar
     * — and the second silently dropped every yearly line from the Year view,
     * the one place a yearly line belongs.
     */
    const target = TARGET_FOR_TAB[tab];
    const monthly = await getMyGlobalBudgetSummary(db, me.id, { target: 'monthly' });
    const mine = tab === 'month' ? monthly : await getMyGlobalBudgetSummary(db, me.id, { target });

    // D2: the whole-month figure onboarding stores (`budget_target`) is a real
    // input until category budgets exist — it drives the Home pace bar and the
    // health engine's budget terms instead of being one sentence two screens
    // deep in the budget editor. Category budgets win the moment they're set.
    const budgetTarget = (await settings.budgetTarget()) ?? 0;
    // Read off the line count, not off `allocated`: at the daily target a user
    // with eight monthly lines rolls up to zero, and testing the *amount* would
    // fall back to a stale onboarding figure precisely when they have real ones.
    const hasCategoryBudgets = monthly.categoryCount > 0;
    // That onboarding figure is one whole-MONTH cap over ALL categories, so it
    // obeys the same rate/pool rule as any monthly line: it is the Month headline,
    // ×12 the Year one, and a pool on Today. Deriving ₹X/30 from it would be the
    // same roll-down error, wearing the "but they have no daily budget" hat.
    const budgetAllocated = hasCategoryBudgets
      ? mine.allocated
      : budgetEquivalent('monthly', budgetTarget, target, new Date()) ?? 0;
    /*
     * The bar's numerator must share its denominator's scope or it measures
     * nothing. `mine.spent` is my spend restricted to the categories that
     * contributed to `mine.allocated`; the hero number above it is all spend, and
     * the two are *deliberately* different quantities — see `HeroCard`.
     *
     * Against the bare onboarding target — one cap over everything — the whole
     * period's spend IS the matching numerator.
     */
    const budgetSpent = hasCategoryBudgets ? mine.spent : sp;
    // Health keeps the monthly basis, whatever pill is active.
    const monthlyAllocated = monthly.allocated > 0 ? monthly.allocated : budgetTarget;

    // Category breakdown for "Where it went" (largest first). Names not in the
    // global catalog fold into one "Others" row (catMap itself is left intact so
    // budget attribution above stays per-name).
    const knownExpense = new Set((await getCategories(db, 'expense')).map(c => c.name));
    const sorted = Object.entries(foldUncategorized(catMap, knownExpense)).sort((a, b) => b[1] - a[1]);
    const catRows: CategoryRow[] = sorted.map(([name, paise]) => ({ name, paise }));
    const catTotal = sorted.reduce((acc, [, v]) => acc + v, 0);

    // Coming up: next recurring bills across all groups.
    const recurringByGroup = await Promise.all(groups.map(g => getRecurringForGroup(db, g.id)));
    // "Coming up" = only what's due in the next 4 days (imminent), not the whole month.
    // Drives the bell badge only (the list moved to the Reminders screen). Count
    // all bills due within the next 14 days — same window the Reminders screen uses.
    const upcomingRules = recurringByGroup.flat();
    const upcomingSkips = await getSkipsMap(db, upcomingRules.map(r => r.id));
    const upcoming = buildUpcoming(upcomingRules, me.id, Date.now(), 99, 14, upcomingSkips);

    // Safe-to-Spend — the strip above the hero, not the hero itself. Scoped to a
    // rolling horizon regardless of the Today/Month/Year selector, which is
    // exactly why it renders *outside* the card those pills drive: inside, it
    // read as a headline that ignored its own control (see `StsStrip`).
    const sts = await getSafeToSpend(db);

    // ── Health score inputs: the four FinHealth-style pillars, each term from
    // its single existing source (see lib/financialHealth.ts). ──
    const nowMs2 = Date.now();
    const now2 = new Date(nowMs2);
    const [ninetyTxns, funding, totalMoney, ledger] = await Promise.all([
      getTransactionsInRange(db, null, nowMs2 - 90 * 86400000, nowMs2),
      getGoalFundingStatus(db, nowMs2),
      getTotalMoney(db),
      getLedgerStats(db),
    ]);
    let income90 = 0, spend90 = 0, monthSp = 0;
    const monthStartMs = startOfMonth(now2).getTime();
    for (const t of ninetyTxns) {
      if (t.is_deleted) continue;
      if (t.kind === 'expense') {
        const share = myShareOf(t, me.id);
        spend90 += share;
        if (t.date >= monthStartMs) monthSp += share;
      } else if (t.kind === 'income') income90 += myIncomeOf(t, me.id);
    }
    const healthInputsNow: HealthInputs = {
      income90, spend90,
      budgetAllocated: monthlyAllocated,
      // Against a bare whole-month target the spend side is the whole month's
      // my-share spend; category budgets keep their own scoped figure.
      budgetSpent: monthly.allocated > 0 ? monthly.spent : monthSp,
      dayOfMonth: getDate(now2),
      daysInMonth: getDaysInMonth(now2),
      liquid: sts.available,
      goalCommitMonthly: funding.commitMonthly,
      goalFundedThisMonth: funding.fundedThisMonth,
      creditUsed: totalMoney.creditUsed,
      netIOwe: exp.owe,
      upcomingBills: sts.upcomingBills,
      goalsCount: funding.goalsCount,
      hasBudget: monthlyAllocated > 0,
      dataDays: ledger.firstTxnMs != null ? Math.floor((nowMs2 - ledger.firstTxnMs) / 86400000) : 0,
      hasIncome: ledger.hasIncome,
      txnCount: ledger.txnCount,
    };
    const health = computeHealthScore(healthInputsNow);
    const healthInputs = healthInputsNow;

    // Month-end forecast + biggest category shift vs last month (Month view only).
    let forecast: Forecast | null = null;
    let topShift: ForecastShift | null = null;
    if (tab === 'month') {
      const now = new Date();
      const lmStart = startOfMonth(subMonths(now, 1)).getTime();
      const lmEnd = endOfMonth(subMonths(now, 1)).getTime();
      const lmTxns = await getTransactionsInRange(db, null, lmStart, lmEnd);
      let lmSpend = 0;
      const lmCat: Record<string, number> = {};
      for (const t of lmTxns) {
        if (t.is_deleted || t.kind !== 'expense') continue;
        const share = myShareOf(t, me.id);
        if (share <= 0) continue;
        lmSpend += share;
        lmCat[t.category] = (lmCat[t.category] ?? 0) + share;
      }
      // Known committed bills still due this month floor the forecast — the
      // same figure Safe-to-Spend subtracts, so the two can't disagree.
      forecast = forecastMonthEnd(sp, getDate(now), getDaysInMonth(now), lmSpend, sts.upcomingBills);
      // Biggest shift among categories present in BOTH months (avoids "new"/∞%).
      topShift = Object.entries(catMap)
        .filter(([cat]) => lmCat[cat])
        .map(([cat, thisAmt]) => ({ cat, thisAmt, pct: lmCat[cat] > 0 ? Math.round(((thisAmt - lmCat[cat]) / lmCat[cat]) * 100) : 0 }))
        .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0] ?? null;
    }

    return {
      meInfo,
      spending: sp, income: inc, prevSpending: prevSp,
      oweTotal: exp.owe, owedTotal: exp.owed, reviewCount,
      budget: {
        /** Rolled up at the active period; 0 when nothing is budgeted at it. */
        allocated: budgetAllocated,
        /** Spend restricted to the categories behind `allocated` — never all spend. */
        spent: budgetSpent,
        /** Lines too coarse for this period (a yearly line on Month), excluded from both halves. */
        pooledCount: hasCategoryBudgets ? mine.pooledCount : 0,
        /** Tab-independent: does ANY budget exist? Separates "no budget" from
         *  "no budget at THIS period", which need different copy and different tiles. */
        exists: hasCategoryBudgets || budgetTarget > 0,
        /** The whole-month figure, for the Month-only forecast card. */
        monthlyAllocated,
      },
      // For Home's GET STARTED tiles: don't re-ask what onboarding answered.
      peopleCount: persons.filter(p => p.id !== me.id).length,
      catRows, catTotal, health, healthInputs,
      healthTxnCount: txns.filter(t => !t.is_deleted).length,
      upcoming, forecast, topShift, sts,
      streak: s, streakLoggedDays: loggedDays,
    };
}
