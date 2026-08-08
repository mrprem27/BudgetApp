import * as SQLite from 'expo-sqlite';
import {
  startOfDay, endOfDay, startOfMonth, endOfMonth,
  startOfYear, endOfYear,
} from 'date-fns';
import type { BudgetGroup } from '../db/queries/groups';
import { getTransactionsInRange } from '../db/queries/transactions';
import { getCategoryBudgets } from '../db/queries/categoryBudgets';
import type { BudgetCadence, CategoryBudget } from '../db/queries/categoryBudgets';

export type Period = 'daily' | 'monthly' | 'yearly';

export type BudgetHealth = 'green' | 'amber' | 'red' | 'none';

/**
 * Canonical budget-utilisation band from a percentage (null pct → 'none').
 * The single source for the 80% / 100% thresholds — was duplicated inline in
 * group detail, reports, and analytics.
 */
/**
 * Approximate monthly cost of one **budget line**, for a single comparable headline.
 *
 * Deliberately separate from `recurringMonthlyEquivalent` (`lib/recurrence.ts`) despite the
 * near-identical shape, because the two disagree on purpose:
 *
 * | cadence | recurring charge | budget line |
 * |---|---|---|
 * | `once`  | n/a              | **0** — a one-time cap isn't a monthly commitment |
 * | `daily` | ×30              | ×30 |
 * | `weekly`| ×52/12           | n/a — not a budget cadence |
 *
 * `app/group/[id]/budget.tsx` used to define its own local copy of this while the group
 * Budget tab imported the *recurring* one, so the same screen pair could produce two
 * different monthly totals for the same data. One function per meaning, both named for
 * what they measure.
 *
 * Amounts are integer paise; `yearly` rounds, so a total never drifts by a fraction.
 */
export function budgetMonthlyEquivalent(cadence: BudgetCadence, paise: number): number {
  switch (cadence) {
    case 'daily':   return Math.round(paise * 30);
    case 'monthly': return paise;
    case 'yearly':  return Math.round(paise / 12);
    // A one-time budget is a cap on a single purchase, not a recurring commitment —
    // counting it monthly would inflate the headline every month forever.
    case 'once':    return 0;
  }
}

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

/** The spend window for a budget line, based on its cadence. */
function windowForCadence(cadence: BudgetCadence, now: Date): { from: number; to: number } {
  switch (cadence) {
    case 'daily':   return getPeriodRange('daily', now);
    case 'monthly': return getPeriodRange('monthly', now);
    case 'yearly':  return getPeriodRange('yearly', now);
    case 'once':    return { from: 0, to: endOfDay(now).getTime() }; // cumulative, all-time
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
