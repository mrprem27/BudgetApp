import * as SQLite from 'expo-sqlite';
import {
  startOfDay, endOfDay, startOfMonth, endOfMonth,
  startOfYear, endOfYear, subDays, subMonths, subYears,
} from 'date-fns';
import type { BudgetGroup } from '../db/queries/groups';
import { getTransactionsInRange } from '../db/queries/transactions';
import { getCategoryBudgets } from '../db/queries/categoryBudgets';
import type { BudgetCadence } from '../db/queries/categoryBudgets';

export type Period = 'daily' | 'monthly' | 'yearly';

export type BudgetUsage = {
  spent: number;
  limit: number | null;
  pct: number | null;
  health: 'green' | 'amber' | 'red' | 'none';
};

export type BudgetHealth = 'green' | 'amber' | 'red' | 'none';

/**
 * Canonical budget-utilisation band from a percentage (null pct → 'none').
 * The single source for the 80% / 100% thresholds — was duplicated inline in
 * getBudgetUsage, group detail, reports, and analytics.
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

export function getPriorPeriodRange(period: Period, date: Date): { from: number; to: number } {
  switch (period) {
    case 'daily':   return getPeriodRange(period, subDays(date, 1));
    case 'monthly': return getPeriodRange(period, subMonths(date, 1));
    case 'yearly':  return getPeriodRange(period, subYears(date, 1));
  }
}

export async function getSpentInRange(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  fromMs: number,
  toMs: number,
): Promise<number> {
  // Routed through the materialization-aware query so recurring occurrences
  // within the period count toward the budget (spec §17.1).
  const txns = await getTransactionsInRange(db, groupId, fromMs, toMs);
  let total = 0;
  for (const t of txns) {
    if (t.kind === 'expense') {
      total += t.shares.reduce((s, sh) => s + sh.amount, 0);
    }
  }
  return total;
}

export async function getBudgetUsage(
  db: SQLite.SQLiteDatabase,
  group: BudgetGroup,
  period: Period,
  now = new Date(),
): Promise<BudgetUsage> {
  const limit = period === 'daily'
    ? group.limit_daily
    : period === 'monthly'
    ? group.limit_monthly
    : group.limit_yearly;

  const { from, to } = getPeriodRange(period, now);
  let spent = await getSpentInRange(db, group.id, from, to);

  let effectiveLimit = limit;
  if (limit && group.carry_over) {
    const prior = getPriorPeriodRange(period, now);
    const priorSpent = await getSpentInRange(db, group.id, prior.from, prior.to);
    const unused = Math.max(0, limit - priorSpent);
    effectiveLimit = limit + unused;
  }

  if (!effectiveLimit) return { spent, limit: null, pct: null, health: 'none' };

  const pct = Math.round((spent / effectiveLimit) * 100);
  return { spent, limit: effectiveLimit, pct, health: budgetHealth(pct) };
}

/** Total expense per category for a group within a period (full bill amount). */
export async function getCategorySpending(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  fromMs: number,
  toMs: number,
): Promise<Record<string, number>> {
  const txns = await getTransactionsInRange(db, groupId, fromMs, toMs);
  const map: Record<string, number> = {};
  for (const t of txns) {
    if (t.kind !== 'expense') continue;
    const amt = t.shares.reduce((s, sh) => s + sh.amount, 0);
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
): Promise<CategoryBudgetStatus[]> {
  const budgets = await getCategoryBudgets(db, group.id);
  if (budgets.length === 0) return [];

  // One spending query per distinct cadence window.
  const cadences = Array.from(new Set(budgets.map(b => b.cadence)));
  const spendByCadence: Record<string, Record<string, number>> = {};
  await Promise.all(cadences.map(async cad => {
    const w = windowForCadence(cad, now);
    spendByCadence[cad] = await getCategorySpending(db, group.id, w.from, w.to);
  }));

  const rows: CategoryBudgetStatus[] = budgets.map(b => {
    const spent = spendByCadence[b.cadence]?.[b.category] ?? 0;
    const pct = b.amount > 0 ? Math.round((spent / b.amount) * 100) : null;
    return {
      category: b.category,
      cadence: b.cadence,
      allocated: b.amount,
      spent,
      remaining: b.amount - spent,
      pct,
      health: budgetHealth(pct),
    };
  });

  const order: Record<BudgetCadence, number> = { daily: 0, monthly: 1, yearly: 2, once: 3 };
  rows.sort((a, b) => order[a.cadence] - order[b.cadence] || (b.pct ?? 0) - (a.pct ?? 0));
  return rows;
}
