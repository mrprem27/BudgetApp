import {
  differenceInCalendarDays, differenceInCalendarMonths, differenceInCalendarYears,
  addDays, addWeeks, addMonths, addYears,
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
  /** Manual drag rank — when present it drives funding order; falls back to priority. */
  sort_order?: number;
  anchor: number; // last_auto_at ?? created_at
};

/** Funding order key: manual drag rank when set, else the High→Med→Low bucket. */
const rankKey = (g: { sort_order?: number; priority: Priority }) =>
  g.sort_order ?? PRIORITY_RANK[g.priority];

export type AutoAllocation = { goalId: string; amount: number; newAnchor: number };

/**
 * Plan scheduled auto-funding (pure). Each eligible goal is due its fixed
 * allocation × elapsed periods (capped at what's left to its target). Due
 * amounts are funded directly from available cash in priority order (High →
 * Medium → Low). The schedule anchor only advances for periods actually funded
 * (or for completed goals), so short cash back-funds gradually rather than
 * skipping periods. Returns only goals whose anchor moves and/or get funded.
 */
export function planAutoAllocations(
  goals: GoalLike[],
  saved: Record<string, number>,
  availableCash: number,
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

  eligible.sort((a, b) => rankKey(a.g) - rankKey(b.g) || a.g.anchor - b.g.anchor);

  let cashLeft = Math.max(0, availableCash);
  const out: AutoAllocation[] = [];
  for (const x of eligible) {
    const amount = Math.min(x.due, cashLeft);
    cashLeft -= amount;
    // Fully satisfied (incl. completed goals where due was capped) → advance all
    // elapsed periods; otherwise advance only the periods we could fund.
    const advance = amount >= x.due ? x.periods : Math.floor(amount / x.g.allocation);
    if (amount > 0 || advance > 0) {
      out.push({ goalId: x.g.id, amount, newAnchor: advanceAnchor(x.g.frequency, x.g.anchor, advance) });
    }
  }
  return out;
}

// --- Overspend raid (protect high-priority goals) ------------------------

export type RaidGoal = { id: string; priority: Priority; locked: number; sort_order?: number };
export type GoalRaid = { goalId: string; amount: number };

/**
 * Cover a cash overspend by pulling money out of the lowest-priority *unlocked*
 * goals first, until the `deficit` is covered (or goals run dry). Locked and
 * higher-priority goals are protected; investments are never touched. Pure.
 */
export function planOverspendRaid(goals: RaidGoal[], saved: Record<string, number>, deficit: number): GoalRaid[] {
  if (deficit <= 0) return [];
  const order = goals
    .filter(g => g.locked !== 1 && (saved[g.id] ?? 0) > 0)
    .sort((a, b) => rankKey(b) - rankKey(a)); // lowest rank (bottom of list) raided first

  let left = deficit;
  const out: GoalRaid[] = [];
  for (const g of order) {
    if (left <= 0) break;
    const amount = Math.min(saved[g.id] ?? 0, left);
    if (amount > 0) { out.push({ goalId: g.id, amount }); left -= amount; }
  }
  return out;
}
