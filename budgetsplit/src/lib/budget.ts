import * as SQLite from 'expo-sqlite';
import {
  startOfDay, endOfDay, startOfMonth, endOfMonth,
  startOfYear, endOfYear, getDaysInMonth, getDaysInYear,
} from 'date-fns';
import type { BudgetGroup } from '../db/queries/groups';
import { getTransactionsInRange } from '../db/queries/transactions';
import { getCategoryBudgets } from '../db/queries/categoryBudgets';
import type { BudgetCadence, CategoryBudget } from '../db/queries/categoryBudgets';

export type Period = 'daily' | 'monthly' | 'yearly';

export type BudgetHealth = 'green' | 'amber' | 'red' | 'none';

/**
 * A budget line is either a **rate** (a limit that resets at least as often as
 * the headline you are showing) or a **pool** (a lump sum drawn down over a
 * longer window than that headline covers).
 *
 * This is the distinction the eight disagreeing rollups were missing. ₹24,000/yr
 * for Trips is not ₹2,000/month: a trip spends the whole pool in one month, and
 * a rollup that divided by 12 would report "over budget" in precisely the month
 * the money was meant to be spent. Only rates sum into a headline; pools have to
 * be shown as pools.
 */
export type BudgetKind = 'rate' | 'pool';

/**
 * Cadences ordered fine → coarse. `once` is coarser than everything: it has no
 * period at all, so it can never roll up into one.
 */
const CADENCE_RANK: Record<BudgetCadence, number> = { daily: 0, monthly: 1, yearly: 2, once: 3 };
const PERIOD_RANK: Record<Period, number> = { daily: 0, monthly: 1, yearly: 2 };

/**
 * Is this line a rate or a pool **relative to the headline being shown**?
 *
 * Rate/pool is not a property of the cadence alone — it depends on what you are
 * rolling up into. A monthly budget is a rate in a monthly headline and a pool
 * in a daily one. The rule is one line: a cadence at or finer than the target
 * rolls up; anything coarser is a pool, because rolling *down* is the error.
 */
export function budgetKind(cadence: BudgetCadence, target: Period): BudgetKind {
  return CADENCE_RANK[cadence] <= PERIOD_RANK[target] ? 'rate' : 'pool';
}

/**
 * A rate budget line expressed as its cost over one `target` period, or `null`
 * for a pool, which has no equivalent at that period at all.
 *
 * `null` rather than `0` on purpose: `0` reads as "budgeted nothing" and lets a
 * caller silently drop an annual budget out of a total it presents as complete.
 * `null` forces the decision to the surface — see `rollUpBudgets`.
 *
 * Every multiplier is a **real calendar count**. The old ×30 vs ×daysInMonth
 * split was the visible half of this bug (a daily ₹500 line read ₹15,000 on one
 * screen and ₹15,500 on another); rolling *up* into a concrete month or year
 * means that period's actual length is simply the right number.
 *
 * Deliberately separate from `recurringMonthlyEquivalent` (`lib/recurrence.ts`):
 * a recurring *charge* is money that will certainly move, a budget line is a cap
 * that may not be reached, so they normalise differently on purpose.
 */
export function budgetEquivalent(
  cadence: BudgetCadence,
  paise: number,
  target: Period,
  /** Which month/year we are rolling up into — its real length is the multiplier. */
  on: Date,
): number | null {
  if (budgetKind(cadence, target) === 'pool') return null;
  // `daysInMonth × 12` would be the same mistake as `×30` wearing a different
  // hat (February → 336 days, January → 372), so the yearly target measures a year.
  switch (target) {
    case 'daily':
      return paise; // only `daily` reaches here
    case 'monthly':
      return cadence === 'daily' ? Math.round(paise * getDaysInMonth(on)) : paise;
    case 'yearly':
      if (cadence === 'daily') return Math.round(paise * getDaysInYear(on));
      return cadence === 'monthly' ? paise * 12 : paise;
  }
}

export type BudgetRollup = {
  /** Summed cost of every line that rolls up into `target`. */
  amount: number;
  /** Total of the pool lines — NOT in `amount`, and must be shown separately. */
  pooled: number;
  /** How many pool lines, so the UI can say "plus 2 yearly budgets". */
  pooledCount: number;
};

/**
 * The single answer to "what do all my budgets add up to over <period>?".
 *
 * Eight call sites answered this differently — three of them (`homeData`,
 * `insightsData`, `analytics`) summed raw line amounts with no conversion at all,
 * so a daily ₹500 budget contributed ₹500 to a figure labelled "monthly", 30× under.
 *
 * `src/lib/rebalance.ts` already worked this way ("a yearly budget's headroom is
 * not spendable this month"); this is the rest of the app agreeing with it.
 *
 * Returns both halves. A caller rendering only `amount` while pool lines exist is
 * showing an incomplete total, which is why `pooledCount` is here: ₹24,000/yr for
 * Trips must not silently vanish from a monthly headline — it is a pool spent
 * when the trip happens, not ₹2,000 every month.
 */
export function rollUpBudgets(
  lines: Array<{ cadence: BudgetCadence; amount: number }>,
  target: Period,
  on: Date,
): BudgetRollup {
  let amount = 0, pooled = 0, pooledCount = 0;
  for (const l of lines) {
    const v = budgetEquivalent(l.cadence, l.amount, target, on);
    if (v === null) { pooled += l.amount; pooledCount++; } else { amount += v; }
  }
  return { amount, pooled, pooledCount };
}

/**
 * Canonical budget-utilisation band from a percentage (null pct → 'none').
 * The single source for the 80% / 100% thresholds — was duplicated inline in
 * group detail, reports, and analytics.
 */
export function budgetHealth(pct: number | null): BudgetHealth {
  if (pct === null) return 'none';
  return pct >= 100 ? 'red' : pct >= 80 ? 'amber' : 'green';
}

/**
 * Canonical utilisation label: "75%", "1.2×" when over budget, "—" when
 * unknown. One source (was copied with a glyph drift — ASCII "X" vs "×").
 */
export function utilLabel(pct: number | null): string {
  if (pct === null) return '—';
  if (pct > 100) return `${(pct / 100).toFixed(1)}×`;
  return `${pct}%`;
}

export function getPeriodRange(period: Period, date: Date): { from: number; to: number } {
  switch (period) {
    case 'daily':
      return { from: startOfDay(date).getTime(), to: endOfDay(date).getTime() };
    case 'monthly':
      return { from: startOfMonth(date).getTime(), to: endOfMonth(date).getTime() };
    case 'yearly':
      return { from: startOfYear(date).getTime(), to: endOfYear(date).getTime() };
  }
}

/*
 * REMOVED: `getBudgetUsage`, `getSpentInRange`, `getPriorPeriodRange`, `BudgetUsage`.
 *
 * They implemented group-level budgets with carry-over on
 * `budget_group.limit_daily/monthly/yearly` — a second, contradictory answer to
 * "does unused budget roll over?" alongside category budgets, which explicitly
 * have none (see getCategoryBudgetStatus below).
 *
 * The path was already unreachable: nothing in the app ever writes those three
 * columns, so `limit` was always null and the carry-over branch could not run.
 * Its one caller (`app/group/[id].tsx`) then dropped the result without
 * rendering it — a wasted query on every group open. Category budgets are the
 * only budgeting mechanism now.
 */

/**
 * Expense per category within a period. Pass `groupId = null` to span all groups
 * (for a global budget). Pass `meId` to count only **my share** of each expense
 * (individual budget); omit it for the full bill amount (group total).
 */
export async function getCategorySpending(
  db: SQLite.SQLiteDatabase,
  groupId: string | null,
  fromMs: number,
  toMs: number,
  meId?: string,
): Promise<Record<string, number>> {
  const txns = await getTransactionsInRange(db, groupId, fromMs, toMs);
  const map: Record<string, number> = {};
  for (const t of txns) {
    if (t.kind !== 'expense') continue;
    const amt = meId
      ? (t.shares.find(sh => sh.personId === meId)?.amount ?? 0)
      : t.shares.reduce((s, sh) => s + sh.amount, 0);
    if (amt === 0) continue;
    map[t.category] = (map[t.category] ?? 0) + amt;
  }
  return map;
}

export type CategoryBudgetStatus = {
  category: string;
  cadence: BudgetCadence;
  allocated: number;   // paise
  spent: number;       // paise in the current window of this cadence
  remaining: number;   // allocated - spent (can be negative)
  pct: number | null;
  health: 'green' | 'amber' | 'red' | 'none';
};

/**
 * The spend window for a budget line, based on its cadence.
 *
 * The window **ends at `now`, not at the end of the period**: "spent" means what
 * has happened, never what is scheduled. A ₹50,000 fee dated the 28th and logged
 * on the 2nd used to count as already spent, so a budget read as blown four
 * weeks before the money moved. Future-dated commitments are a separate idea and
 * already have a home — `upcomingBills` in `getAffordSnapshot`.
 */
function windowForCadence(cadence: BudgetCadence, now: Date): { from: number; to: number } {
  const to = now.getTime();
  switch (cadence) {
    case 'daily':   return { from: getPeriodRange('daily', now).from, to };
    case 'monthly': return { from: getPeriodRange('monthly', now).from, to };
    case 'yearly':  return { from: getPeriodRange('yearly', now).from, to };
    case 'once':    return { from: 0, to }; // cumulative, all-time
  }
}

/**
 * Per-category budget status. Each budgeted category is compared against
 * spending in the current window of ITS cadence (today / this month / this year
 * / all-time). Daily/monthly/yearly lines repeat each period because the line
 * itself persists and only the window moves — the limit resets each period and
 * unused amount does NOT carry over (no rollover).
 */
export async function getCategoryBudgetStatus(
  db: SQLite.SQLiteDatabase,
  group: BudgetGroup,
  now = new Date(),
  /** When set, spend counts only this person's share (individual budget). */
  meId?: string,
): Promise<CategoryBudgetStatus[]> {
  const budgets = await getCategoryBudgets(db, group.id);
  if (budgets.length === 0) return [];

  // One spending query per distinct cadence window.
  const cadences = Array.from(new Set(budgets.map(b => b.cadence)));
  const spendByCadence: Record<string, Record<string, number>> = {};
  await Promise.all(cadences.map(async cad => {
    const w = windowForCadence(cad, now);
    spendByCadence[cad] = await getCategorySpending(db, group.id, w.from, w.to, meId);
  }));

  return statusRows(budgets, spendByCadence);
}

/** Build + sort CategoryBudgetStatus rows from budgets and per-cadence spend maps. */
function statusRows(budgets: CategoryBudget[], spendByCadence: Record<string, Record<string, number>>): CategoryBudgetStatus[] {
  const rows: CategoryBudgetStatus[] = budgets.map(b => {
    const spent = spendByCadence[b.cadence]?.[b.category] ?? 0;
    const pct = b.amount > 0 ? Math.round((spent / b.amount) * 100) : null;
    return { category: b.category, cadence: b.cadence, allocated: b.amount, spent, remaining: b.amount - spent, pct, health: budgetHealth(pct) };
  });
  const order: Record<BudgetCadence, number> = { daily: 0, monthly: 1, yearly: 2, once: 3 };
  rows.sort((a, b) => order[a.cadence] - order[b.cadence] || (b.pct ?? 0) - (a.pct ?? 0));
  return rows;
}

/**
 * GLOBAL personal budget status: budgets defined on the personal group, measured
 * against MY share of spending across ALL groups (personal + shared). The unified
 * "my total spend vs my budget" view that powers the Personal → Budget tab.
 */
export async function getMyGlobalBudgetStatus(
  db: SQLite.SQLiteDatabase,
  meId: string,
  now = new Date(),
): Promise<CategoryBudgetStatus[]> {
  const personal = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM budget_group WHERE is_personal = 1 ORDER BY created_at ASC LIMIT 1',
  );
  if (!personal) return [];
  const budgets = await getCategoryBudgets(db, personal.id);
  if (budgets.length === 0) return [];

  const cadences = Array.from(new Set(budgets.map(b => b.cadence)));
  const spendByCadence: Record<string, Record<string, number>> = {};
  await Promise.all(cadences.map(async cad => {
    const w = windowForCadence(cad, now);
    // null group → every group; meId → my share only.
    spendByCadence[cad] = await getCategorySpending(db, null, w.from, w.to, meId);
  }));

  return statusRows(budgets, spendByCadence);
}
