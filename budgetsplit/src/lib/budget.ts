import * as SQLite from 'expo-sqlite';
import {
  startOfDay, endOfDay, startOfMonth, endOfMonth,
  startOfYear, endOfYear, subDays, subMonths, subYears,
} from 'date-fns';
import type { BudgetGroup } from '../db/queries/groups';
import { getTransactionsInRange } from '../db/queries/transactions';

export type Period = 'daily' | 'monthly' | 'yearly';

export type BudgetUsage = {
  spent: number;
  limit: number | null;
  pct: number | null;
  health: 'green' | 'amber' | 'red' | 'none';
};

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

async function getSpentInRange(
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
  const health = pct >= 100 ? 'red' : pct >= 80 ? 'amber' : 'green';
  return { spent, limit: effectiveLimit, pct, health };
}
