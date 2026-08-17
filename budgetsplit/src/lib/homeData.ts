import type * as SQLite from 'expo-sqlite';
import {
  startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear,
  subDays, subMonths, subYears, getDate, getDaysInMonth,
} from 'date-fns';
import { getAllPersons } from '../db/queries/persons';
import { getAllGroups } from '../db/queries/groups';
import { getMyExposure } from '../db/queries/balances';
import { getPendingCount } from '../db/queries/pending';
import { getCategories } from '../db/queries/categories';
import { getTransactionsInRange } from '../db/queries/transactions';
import { getRecurringForGroup, getSkipsMap } from '../db/queries/recurring';
import { foldUncategorized } from './categoryFold';
import { myShareOf, myIncomeOf } from './splitMath';
import { getMyGlobalBudgetSummary } from './budget';
import { computeHealthScore, type HealthInputs, type HealthResult } from './financialHealth';
import { forecastMonthEnd, type Forecast } from './forecast';
import { buildUpcoming, expandUpcoming, type UpcomingItem } from './upcoming';
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
        budget: { allocated: 0, spent: 0 },
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
    const mine = await getMyGlobalBudgetSummary(db, me.id);
    const over = mine.rows.filter(r => r.health === 'red').length;
    const near = mine.rows.filter(r => r.health === 'amber').length;
    const worstCat = mine.rows
      .filter(r => r.health === 'red' || r.health === 'amber')
      .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0] ?? null;

    const now2 = new Date();
    const healthInputsNow: HealthInputs = {
      spendPaise: sp,
      incomePaise: inc,
      prevSpendPaise: prevSp,
      budgetAllocated: mine.allocated,
      budgetSpent: mine.spent,
      categoriesOver: over,
      categoriesNear: near,
      totalBudgeted: mine.categoryCount,
      worstCategoryPct: worstCat?.pct ?? null,
      worstCategoryName: worstCat?.category ?? null,
      netOwedPaise: exp.owe - exp.owed,
      dayOfMonth: getDate(now2),
      daysInMonth: getDaysInMonth(now2),
    };
    const health = computeHealthScore(healthInputsNow);
    const healthInputs = healthInputsNow;

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
      // rules and skips are already loaded for "Coming up" just above.
      const committedRemaining = expandUpcoming(
        upcomingRules, me.id, Date.now(), endOfMonth(now).getTime(), upcomingSkips,
      ).reduce((s, o) => s + o.amount, 0);
      forecast = forecastMonthEnd(sp, getDate(now), getDaysInMonth(now), lmSpend, committedRemaining);
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
      budget: { allocated: mine.allocated, spent: mine.spent },
      catRows, catTotal, health, healthInputs,
      healthTxnCount: txns.filter(t => !t.is_deleted).length,
      upcoming, forecast, topShift,
      streak: s, streakLoggedDays: loggedDays,
    };
}
