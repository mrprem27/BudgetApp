import {
  differenceInCalendarDays, differenceInCalendarMonths, differenceInCalendarYears,
  addDays, addWeeks, addMonths, addYears,
  startOfMonth, endOfMonth, subMonths, format, parseISO,
} from 'date-fns';
import { PRIORITY_RANK } from './savings';
import type { Priority, SavingsFrequency } from '../db/queries/savings';

/** Whole periods elapsed between the schedule anchor and now. */
export function periodsElapsed(freq: SavingsFrequency, anchorMs: number, nowMs: number): number {
  const a = new Date(anchorMs), n = new Date(nowMs);
  switch (freq) {
    case 'daily': return Math.max(0, differenceInCalendarDays(n, a));
    case 'weekly': return Math.max(0, Math.floor(differenceInCalendarDays(n, a) / 7));
    case 'monthly': return Math.max(0, differenceInCalendarMonths(n, a));
    case 'yearly': return Math.max(0, differenceInCalendarYears(n, a));
    default: return 0;
  }
}

/** Move the schedule anchor forward by N whole periods. */
export function advanceAnchor(freq: SavingsFrequency, anchorMs: number, periods: number): number {
  if (periods <= 0) return anchorMs;
  const a = new Date(anchorMs);
  switch (freq) {
    case 'daily': return addDays(a, periods).getTime();
    case 'weekly': return addWeeks(a, periods).getTime();
    case 'monthly': return addMonths(a, periods).getTime();
    case 'yearly': return addYears(a, periods).getTime();
    default: return anchorMs;
  }
}

export type GoalLike = {
  id: string;
  target: number;
  allocation: number;
  frequency: SavingsFrequency;
  priority: Priority;
  anchor: number; // last_auto_at ?? created_at
};

export type AutoAllocation = { goalId: string; amount: number; newAnchor: number };

/**
 * Plan scheduled auto-funding (pure). Each eligible goal is due its fixed
 * allocation × elapsed periods (capped at what's left to its target). Due
 * amounts are satisfied from the unallocated pool in priority order (High →
 * Medium → Low). The schedule anchor only advances for periods actually funded
 * (or for completed goals), so a short pool back-funds gradually rather than
 * skipping periods. Returns only goals whose anchor moves and/or get funded.
 */
export function planAutoAllocations(
  goals: GoalLike[],
  saved: Record<string, number>,
  poolUnallocated: number,
  nowMs: number,
): AutoAllocation[] {
  const eligible = goals
    .filter(g => g.allocation > 0 && g.frequency !== 'none')
    .map(g => {
      const periods = periodsElapsed(g.frequency, g.anchor, nowMs);
      const remaining = Math.max(0, g.target - (saved[g.id] ?? 0));
      const due = Math.min(periods * g.allocation, remaining);
      return { g, periods, due };
    })
    .filter(x => x.periods >= 1);

  eligible.sort((a, b) => PRIORITY_RANK[a.g.priority] - PRIORITY_RANK[b.g.priority] || a.g.anchor - b.g.anchor);

  let poolLeft = Math.max(0, poolUnallocated);
  const out: AutoAllocation[] = [];
  for (const x of eligible) {
    const amount = Math.min(x.due, poolLeft);
    poolLeft -= amount;
    // Fully satisfied (incl. completed goals where due was capped) → advance all
    // elapsed periods; otherwise advance only the periods we could fund.
    const advance = amount >= x.due ? x.periods : Math.floor(amount / x.g.allocation);
    if (amount > 0 || advance > 0) {
      out.push({ goalId: x.g.id, amount, newAnchor: advanceAnchor(x.g.frequency, x.g.anchor, advance) });
    }
  }
  return out;
}

// --- Leftover sweep ------------------------------------------------------

/**
 * Which completed months to sweep budget leftover for. `marker` is the last
 * month already swept ('YYYY-MM'), or null on first run. Returns the month
 * ranges to sweep (never the in-progress month) and the new marker. On first
 * run it returns no months (we start fresh — no retroactive surprise deposit).
 */
export function monthsToSweep(marker: string | null, now: Date): { months: { start: number; end: number }[]; newMarker: string } {
  const lastCompleted = subMonths(startOfMonth(now), 1); // start of last finished month
  const newMarker = format(lastCompleted, 'yyyy-MM');
  if (!marker) return { months: [], newMarker };

  const months: { start: number; end: number }[] = [];
  let m = addMonths(startOfMonth(parseISO(marker + '-01')), 1);
  while (m.getTime() <= lastCompleted.getTime()) {
    months.push({ start: startOfMonth(m).getTime(), end: endOfMonth(m).getTime() });
    m = addMonths(m, 1);
  }
  return { months, newMarker };
}

// --- Auto-reduce (protect high-priority goals) ---------------------------

export type ReduceGoal = { id: string; priority: Priority; locked: number };
export type Reduction = { goalId: string; reduceBy: number };

/**
 * When allocated savings exceed what the pool can back, pull funds out of the
 * lowest-priority *unlocked* goals first until the excess is covered. Locked
 * and higher-priority goals are protected. Pure.
 */
export function planReduction(goals: ReduceGoal[], saved: Record<string, number>, excess: number): Reduction[] {
  if (excess <= 0) return [];
  const order = goals
    .filter(g => g.locked !== 1 && (saved[g.id] ?? 0) > 0)
    .sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]); // low priority first

  let left = excess;
  const out: Reduction[] = [];
  for (const g of order) {
    if (left <= 0) break;
    const reduceBy = Math.min(saved[g.id] ?? 0, left);
    if (reduceBy > 0) { out.push({ goalId: g.id, reduceBy }); left -= reduceBy; }
  }
  return out;
}
