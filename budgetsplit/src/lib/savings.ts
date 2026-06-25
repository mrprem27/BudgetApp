import type { Priority, SavingsFrequency } from '../db/queries/savings';

export type GoalProgress = { saved: number; target: number; remaining: number; pct: number; rawPct: number; over: number; done: boolean };

/**
 * Progress of a goal. `pct` is clamped to 100 (for the ring fill); `rawPct` and
 * `over` expose overfunding so the UI can show "105% · +₹X over" — manual adds
 * are allowed to push a goal past its target.
 */
export function goalProgress(saved: number, target: number): GoalProgress {
  const s = Math.max(0, saved);
  const t = Math.max(0, target);
  const remaining = Math.max(0, t - s);
  const over = Math.max(0, s - t);
  const rawPct = t > 0 ? Math.round((s / t) * 100) : (s > 0 ? 100 : 0);
  const pct = Math.min(100, rawPct);
  return { saved: s, target: t, remaining, pct, rawPct, over, done: t > 0 && s >= t };
}

const FREQ_DAYS: Record<SavingsFrequency, number> = { daily: 1, weekly: 7, monthly: 30, yearly: 365, none: 0 };

/**
 * Estimated completion for a goal funded by a fixed allocation each frequency.
 * Returns null when it can't be projected (already done, or no fixed cadence).
 */
export function estimatedCompletion(
  remaining: number,
  allocation: number,
  frequency: SavingsFrequency,
  from = new Date(),
): { date: Date; days: number; periods: number } | null {
  if (remaining <= 0) return null;
  if (allocation <= 0 || frequency === 'none') return null;
  const periods = Math.ceil(remaining / allocation);
  const days = periods * FREQ_DAYS[frequency];
  return { date: new Date(from.getTime() + days * 86400000), days, periods };
}

/** Approximate monthly contribution implied by a goal's allocation + frequency. */
export function monthlyContribution(allocation: number, frequency: SavingsFrequency): number {
  switch (frequency) {
    case 'daily': return allocation * 30;
    case 'weekly': return Math.round(allocation * 52 / 12);
    case 'monthly': return allocation;
    case 'yearly': return Math.round(allocation / 12);
    default: return 0;
  }
}

export const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

const MS_PER_MONTH = 30 * 86400000;

/** Whole months between now and a deadline (rounded up; 0 if past/now). */
export function monthsUntil(targetMs: number, from = Date.now()): number {
  if (!Number.isFinite(targetMs) || targetMs <= from) return 0;
  return Math.max(1, Math.ceil((targetMs - from) / MS_PER_MONTH));
}

/**
 * Monthly contribution needed to reach a goal by its deadline. Returns the full
 * remainder when the deadline is now/overdue, and 0 when nothing is left.
 */
export function neededPerMonth(remaining: number, targetMs: number, from = Date.now()): number {
  if (remaining <= 0) return 0;
  if (!Number.isFinite(targetMs) || targetMs <= from) return remaining;
  return Math.ceil(remaining / monthsUntil(targetMs, from));
}
