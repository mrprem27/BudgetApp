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

/**
 * Funding order key — the manual drag rank, and nothing else.
 *
 * This was `g.sort_order ?? PRIORITY_RANK[g.priority]`, and the fallback could
 * **never run**: `savings_goal.sort_order` is `INTEGER NOT NULL DEFAULT 0`, so it
 * is never null or undefined for a row read from the database. The High/Med/Low
 * buckets were replaced by drag ordering and no UI has set `priority` since —
 * `setPriority` is still destructured in `app/(tabs)/savings.tsx` and never
 * called — so every real goal carries the default 'medium' anyway.
 *
 * Left as one axis on purpose. The `priority` column, its enum and its use in
 * `savingsInsights` scoring are vestigial rather than harmful, and pulling them
 * out touches ten files of money-handling code; that is its own change, tracked
 * on the checklist, not a tail-end sweep.
 */
const rankKey = (g: { sort_order?: number }) => g.sort_order ?? 0;

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

export type RaidGoal = {
  id: string; priority: Priority; locked: number; sort_order?: number;
  /** What the goal is aiming for — a goal already at its target is never raided. */
  target: number;
};
export type GoalRaid = { goalId: string; amount: number };

/**
 * Cover a cash overspend by pulling money out of the lowest-priority *unlocked*
 * goals first, until the `deficit` is covered (or goals run dry). Locked,
 * completed and higher-priority goals are protected; investments are never
 * touched. Pure.
 */
export function planOverspendRaid(goals: RaidGoal[], saved: Record<string, number>, deficit: number): GoalRaid[] {
  if (deficit <= 0) return [];
  const order = goals
    // A finished goal is the one thing a raid must not touch: it is the reward the
    // whole feature exists to produce, and taking money back out silently un-finishes
    // it. The filter checked `locked` and `saved > 0` but never `saved >= target`.
    .filter(g => g.locked !== 1 && (saved[g.id] ?? 0) > 0 && (saved[g.id] ?? 0) < g.target)
    // Raiding is the mirror of funding, so ties must break the *opposite* way.
    // Before anyone drags, every goal has `sort_order = 0` (INTEGER NOT NULL
    // DEFAULT 0), so every comparison tied and a stable sort left both orders
    // identical to the input — making the newest goal funded first *and* raided
    // first. Reversing the index on a tie restores the mirror without a drag.
    .map((g, i) => ({ g, i }))
    .sort((a, b) => (rankKey(b.g) - rankKey(a.g)) || (b.i - a.i))
    .map(x => x.g);

  let left = deficit;
  const out: GoalRaid[] = [];
  for (const g of order) {
    if (left <= 0) break;
    const amount = Math.min(saved[g.id] ?? 0, left);
    if (amount > 0) { out.push({ goalId: g.id, amount }); left -= amount; }
  }
  return out;
}
