import type * as SQLite from 'expo-sqlite';
import {
  startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear,
  subDays, subMonths, subYears, getDate, getDaysInMonth,
} from 'date-fns';
import { getAllPersons } from '../db/queries/persons';
import { sharedGroupsOf } from '../db/queries/groups';
import { getMyExposure } from '../db/queries/balances';
import { getSafeToSpendV2 } from '../db/queries/spendPower';
import { billsWithin } from './safeToSpend';
import { getPendingCount } from '../db/queries/pending';
import { getPendingApprovalCount } from '../db/queries/approval';
import { getCategories } from '../db/queries/categories';
import { getTransactionsInRange, getLedgerStats, getActiveRecurringRules } from '../db/queries/transactions';
import { getGoalFundingStatus } from '../db/queries/spendPower';
import { getTotalMoney } from '../db/queries/savings';
import { getAllRecurringRules, getSkipsMap } from '../db/queries/recurring';
import { foldUncategorized } from './categoryFold';
import { settings } from './settings';
import { myShareOf, myIncomeOf } from './splitMath';
import { getMyGlobalBudgetSummary, budgetEquivalent, type Period } from './budget';
import { computeHealthScore, type HealthInputs, type HealthResult } from './financialHealth';
import { monthEndFromEngine, type Forecast } from './forecast';
import { streakFrom } from './streak';
import { buildUpcoming, upcomingWindowDays, UPCOMING_NO_LIMIT, type UpcomingItem } from './upcoming';
import type { CategoryRow } from '../components/finance/home/CategoryRankList';
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
    // ...and the same for the year, which was the one case that did not follow the
    // rule the comment above states. It ran to `endOfYear`, so a future-dated entry
    // — a school fee logged in March and dated December, which `getSafeToSpend`
    // deliberately treats as a FUTURE one-off — counted as already spent. On 15
    // March the same card then showed "SPENT THIS YEAR ₹90,000" beside a pace bar
    // reading ₹40,000, because the budget half uses `windowForCadence`, which
    // correctly ends at now. Two numbers, one card, 2.25x apart, both labelled
    // "year". And `getPrevRange` compares against last year only up to the same
    // elapsed point, so the delta was measuring a full year against a
    // year-to-date on top of that.
    case 'year':  return { from: startOfYear(now).getTime(), to: now.getTime() };
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

/**
 * Home loads in two parts, because a period pill is a `deps` change and re-ran everything:
 * about a hundred database round trips per tap, most of them for figures the pill does not
 * touch (Safe to spend alone is ~40). On a phone each one is a hop to native, and Today / Month /
 * Year felt slow (2026-10-01).
 *
 * - `loadHomeBase` — everything that is the same on every pill.
 * - `loadHomePeriod` — the period's own spend, comparison, categories and budget roll-up.
 * - `composeHome` — pure; puts the two together into what the screen reads.
 */
export async function loadHomeBase(db: SQLite.SQLiteDatabase) {
  const persons = await getAllPersons(db);
  const me = persons.find(p => p.is_me === 1);
  if (!me) return null;
  const meInfo = { name: me.name, color: me.avatar_color, image: me.image_uri };

  // The streak reads its own window — the last 31 days and this month — whatever tab is open.
  const streakFromMs = Math.min(startOfMonth(new Date()).getTime(), Date.now() - 31 * 86_400_000);
  const streakTxns = await getTransactionsInRange(db, null, streakFromMs, Date.now());
  const { streak, days: streakLoggedDays } = streakFrom(streakTxns.filter(t => !t.is_deleted).map(t => t.date), Date.now());

  // Who owes whom — single source of truth (per-person, after all settlements),
  // so owe AND owed can both show (matches Insights / Personal / Groups).
  const exp = await getMyExposure(db, me.id);
  const reviewCount = await getPendingCount(db);
  // Entries other people wrote that are waiting on me.
  const approvalCount = await getPendingApprovalCount(db);

  /*
   * Everything budget-shaped on Home is **My Budget** — one summary, no per-group
   * loop.
   *
   * The loop it replaces summed every group's allocation (the Personal group's
   * included, which IS this cap) and paired it with every group's *full bill*,
   * because no `meId` was passed: a ₹1,000 expense split 50/50 charged ₹1,000
   * against my budget. Both halves now share my-share, all-groups basis, and the
   * health score is rebased onto them.
   *
   * `monthly` is the health engine's basis and never moves. Its inputs are
   * month-shaped (`dayOfMonth`, `daysInMonth`), so a score that re-based itself
   * on whichever pill was tapped would swing between three different numbers
   * for the same finances. The pace bar's own roll-up is `loadHomePeriod`'s.
   */
  const monthly = await getMyGlobalBudgetSummary(db, me.id, { target: 'monthly' });

  // D2: the whole-month figure onboarding stores (`budget_target`) is a real
  // input until category budgets exist — it drives the Home pace bar and the
  // health engine's budget terms instead of being one sentence two screens
  // deep in the budget editor. Category budgets win the moment they're set.
  const budgetTarget = (await settings.budgetTarget()) ?? 0;
  // Health keeps the monthly basis, whatever pill is active.
  const monthlyAllocated = monthly.allocated > 0 ? monthly.allocated : budgetTarget;

  // Drives the bell badge only (the list is the Upcoming screen's). The same window that screen
  // uses (`upcomingWindowDays`), so the badge counts what it lists.
  const upcomingRules = await getAllRecurringRules(db);
  const upcomingSkips = await getSkipsMap(db, upcomingRules.map(r => r.id));
  const upcoming = buildUpcoming(upcomingRules, me.id, Date.now(), UPCOMING_NO_LIMIT, upcomingWindowDays(), upcomingSkips);

  // Safe-to-Spend — the strip above the hero, not the hero itself. Scoped to a
  // rolling horizon regardless of the Today/Month/Year selector, which is
  // exactly why it renders *outside* the card those pills drive: inside, it
  // read as a headline that ignored its own control (see `StsStrip`).
  // `EN10`: reads the money engine (`getSafeToSpendV2`), not the arithmetic
  // formula — same breakdown shape, so `StsStrip`/`StsSheet` are unchanged.
  const sts = await getSafeToSpendV2(db);

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
  const healthInputs: HealthInputs = {
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
    // `owedExpected`, not `owed`: a written-off balance must not net against
    // what you owe. See `debtLoad`.
    owedToMe: exp.owedExpected,
    // Month-scoped, not the Safe-to-Spend window (which now runs to payday,
    // not month-end) — `billsWithin` reads the same projection over the
    // right days instead.
    upcomingBills: billsWithin(sts, nowMs2, getDaysInMonth(now2) - getDate(now2)),
    goalsCount: funding.goalsCount,
    hasBudget: monthlyAllocated > 0,
    dataDays: ledger.firstTxnMs != null ? Math.floor((nowMs2 - ledger.firstTxnMs) / 86400000) : 0,
    hasIncome: ledger.hasIncome,
    txnCount: ledger.txnCount,
  };
  const health = computeHealthScore(healthInputs);

  // Month-end forecast — on every tab: it is one of Home's two headline tiles (`U-21`). Always from
  // month-to-date spend (`monthSp`, the health score's), which is also what the Month pill shows.
  // Known committed bills still due this month floor the forecast — the same figure
  // Safe-to-Spend subtracts, so the two can't disagree.
  const forecast: Forecast | null = monthEndFromEngine(
    monthSp, getDate(now2), getDaysInMonth(now2), sts.dailyRate,
    billsWithin(sts, nowMs2, getDaysInMonth(now2) - getDate(now2)),
  );

  return {
    meInfo, monthly, budgetTarget, monthlyAllocated,
    oweTotal: exp.owe, owedTotal: exp.owed, reviewCount, approvalCount,
    // For Home's GET STARTED tiles: don't re-ask what onboarding answered.
    peopleCount: persons.filter(p => p.id !== me.id).length,
    health, healthInputs, upcoming, forecast, sts,
    streak, streakLoggedDays,
    /** Anything ever logged — what separates a first run from a quiet period. */
    everLogged: ledger.txnCount > 0,
    /** Entries logged, all time — when the next level is offered (`lib/levels.ts`). */
    entryCount: ledger.txnCount,
  };
}
export type HomeBase = Awaited<ReturnType<typeof loadHomeBase>>;

/** What one pill changes: the period's spend, its comparison, its categories, its budget roll-up. */
export async function loadHomePeriod(db: SQLite.SQLiteDatabase, groups: BudgetGroup[], tab: TabKey) {
  const me = (await getAllPersons(db)).find(p => p.is_me === 1);
  if (!me) return { tab, spending: 0, spendGroup: 0, income: 0, prevSpending: 0, catRows: [] as CategoryRow[], catTotal: 0, txnCount: 0, mine: null };

  const { from, to } = getRange(tab);
  // Single source of truth: materialization-aware query feeds the hero number
  // and the category breakdown so they always agree (incl. recurring).
  const txns = await getTransactionsInRange(db, null, from, to);
  let sp = 0;
  let inc = 0;
  // How much of the same spend came from group activity. Keyed on the group the
  // entry lives in — the axis the whole app is organised around — so it agrees
  // with the per-group breakdown on category detail. Anything outside a shared
  // group (including an entry whose group has since gone) counts as personal, so
  // the two always sum to `sp` exactly.
  const sharedIds = new Set(sharedGroupsOf(groups).map(g => g.id));
  let spGroup = 0;
  const catMap: Record<string, number> = {};
  for (const txn of txns) {
    if (txn.is_deleted) continue;
    if (txn.kind === 'expense') {
      const myShare = myShareOf(txn, me.id);
      sp += myShare;
      if (myShare > 0 && sharedIds.has(txn.group_id)) spGroup += myShare;
      if (myShare > 0) catMap[txn.category] = (catMap[txn.category] ?? 0) + myShare;
    } else if (txn.kind === 'income') {
      inc += myIncomeOf(txn, me.id);
    }
  }

  // Prior-period spend (my share) for the hero delta.
  const prev = getPrevRange(tab);
  const prevTxns = await getTransactionsInRange(db, null, prev.from, prev.to);
  let prevSp = 0;
  for (const t of prevTxns) {
    if (t.is_deleted || t.kind !== 'expense') continue;
    prevSp += myShareOf(t, me.id);
  }

  /*
   * The pace bar's summary, rolled up at the period the pills select. On Month it is the base's
   * `monthly`, so it is not read twice (`null` here).
   *
   * The screen used to take the monthly figure and divide it by days-in-month for
   * Today and multiply it by 12 for Year. Both are wrong in the same way: the
   * first rolls a monthly line *down* into a day — the error `budgetKind`
   * exists to name, and the one a single rent payment turns into a 15× red bar
   * — and the second silently dropped every yearly line from the Year view,
   * the one place a yearly line belongs.
   */
  const mine = tab === 'month' ? null : await getMyGlobalBudgetSummary(db, me.id, { target: TARGET_FOR_TAB[tab] });

  // Category breakdown for "Where it went" (largest first). Names not in the
  // global catalog fold into one "Others" row (catMap itself is left intact so
  // budget attribution above stays per-name).
  const knownExpense = new Set((await getCategories(db, 'expense')).map(c => c.name));
  const sorted = Object.entries(foldUncategorized(catMap, knownExpense)).sort((a, b) => b[1] - a[1]);
  const catRows: CategoryRow[] = sorted.map(([name, paise]) => ({ name, paise }));
  const catTotal = sorted.reduce((acc, [, v]) => acc + v, 0);

  return {
    tab, spending: sp, spendGroup: spGroup, income: inc, prevSpending: prevSp,
    catRows, catTotal, txnCount: txns.filter(t => !t.is_deleted).length, mine,
  };
}
export type HomePeriod = Awaited<ReturnType<typeof loadHomePeriod>>;

/** The two halves as the one object the screen reads. Pure. */
export function composeHome(base: HomeBase, period: HomePeriod) {
  if (!base) {
    return {
      meInfo: null as { name: string; color: string; image: string | null } | null,
      spending: 0, spendGroup: 0, income: 0, prevSpending: 0,
      oweTotal: 0, owedTotal: 0, reviewCount: 0, approvalCount: 0,
      budget: { allocated: 0, spent: 0, spentShared: 0, pooledCount: 0, exists: false, monthlyAllocated: 0 },
      catRows: [] as CategoryRow[], catTotal: 0,
      health: null as HealthResult | null, healthInputs: null as HealthInputs | null, healthTxnCount: 0,
      upcoming: [] as UpcomingItem[],
      forecast: null as Forecast | null,
      streak: 0, streakLoggedDays: new Set<string>(), everLogged: false, entryCount: 0,
      peopleCount: 0, sts: null as Awaited<ReturnType<typeof getSafeToSpendV2>> | null,
    };
  }
  const { monthly, budgetTarget, monthlyAllocated, ...rest } = base;
  const target = TARGET_FOR_TAB[period.tab];
  const mine = period.mine ?? monthly;
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
  return {
    ...rest,
    spending: period.spending, spendGroup: period.spendGroup, income: period.income, prevSpending: period.prevSpending,
    budget: {
      /** Rolled up at the active period; 0 when nothing is budgeted at it. */
      allocated: budgetAllocated,
      /*
       * Spend restricted to the categories behind `allocated` — never all spend. The bar's
       * numerator must share its denominator's scope or it measures nothing; the hero number
       * above it is all spend, and the two are *deliberately* different quantities (see
       * `HeroCard`). Against the bare onboarding target — one cap over everything — the whole
       * period's spend IS the matching numerator.
       */
      spent: hasCategoryBudgets ? mine.spent : period.spending,
      /** The shared-group part of `spent`, for the bar's second segment — never the other numerator's. */
      spentShared: hasCategoryBudgets ? mine.spentShared : period.spendGroup,
      /** Lines too coarse for this period (a yearly line on Month), excluded from both halves. */
      pooledCount: hasCategoryBudgets ? mine.pooledCount : 0,
      /** Tab-independent: does ANY budget exist? Separates "no budget" from
       *  "no budget at THIS period", which need different copy and different tiles. */
      exists: hasCategoryBudgets || budgetTarget > 0,
      /** The whole-month figure, for the Month-only forecast card. */
      monthlyAllocated,
    },
    catRows: period.catRows, catTotal: period.catTotal,
    healthTxnCount: period.txnCount,
  };
}

/** Both halves at once, for callers that want one period and nothing else (tests, mostly). */
export async function loadHomeData(db: SQLite.SQLiteDatabase, groups: BudgetGroup[], tab: TabKey) {
  return composeHome(await loadHomeBase(db), await loadHomePeriod(db, groups, tab));
}

/** How long the app must have been closed before the catch-up notice shows. */
const CATCH_UP_GAP_DAYS = 30;

/**
 * "Recurring catch-up complete" — after the app was closed a month or more, how
 * many rules posted entries in the meantime. Only the rules that actually post
 * from this phone (`materializeDueOccurrences`): active, auto, mine, in a live
 * group. Counting ended, remind-only or someone else's rules claimed entries that
 * were never written. Stamps this open, so the next one compares against it.
 */
export async function loadCatchUp(db: SQLite.SQLiteDatabase, now = Date.now()): Promise<{ days: number; ruleCount: number } | null> {
  const lastOpen = (await settings.appLastOpen()) ?? now;
  await settings.setAppLastOpen(now);
  const days = Math.floor((now - lastOpen) / 86400000);
  if (days < CATCH_UP_GAP_DAYS) return null;
  const ruleCount = (await getActiveRecurringRules(db))
    .filter(r => r.recur_mode === 'auto' && r.author_person_id == null).length;
  return ruleCount > 0 ? { days, ruleCount } : null;
}
