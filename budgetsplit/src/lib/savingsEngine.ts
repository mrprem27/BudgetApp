import {
  differenceInCalendarDays, differenceInCalendarMonths, differenceInCalendarYears,
  addDays, addWeeks, addMonths, addYears,
} from 'date-fns';
import type { Priority, SavingsFrequency } from '../db/queries/savings';
import type { AssetBucket } from '../constants/enums';

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
  /** Manual drag rank — fine-grained order *within* a `priority` tag. */
  sort_order?: number;
  anchor: number; // last_auto_at ?? created_at
};

/** `emergency` funds first, then `need`, then `want` — the coarse fund-order tag. */
const fundTagRank = (p: Priority) => (p === 'emergency' ? 0 : p === 'need' ? 1 : 2);

/**
 * Funding order key: the tag (coarse), then the manual drag rank (fine).
 *
 * Goal cards are organized into three sections by `priority` — Emergency,
 * Need, Want — so that's the natural primary order for money too: fund your
 * emergency buffer first, then needs, then wants. `sort_order` (drag) breaks
 * ties *within* a section, letting you pick which Need (say) fills up first
 * without it ever jumping ahead of an Emergency goal. `planOverspendRaid`
 * below is this order's exact mirror — the same reason `want` is raided
 * before `need` and `emergency` isn't raided at all.
 */
const rankKey = (g: { sort_order?: number }) => g.sort_order ?? 0;

export type AutoAllocation = { goalId: string; amount: number; newAnchor: number };

/**
 * Plan scheduled auto-funding (pure). Each eligible goal is due its fixed
 * allocation × elapsed periods (capped at what's left to its target). Due
 * amounts are funded directly from available cash in priority order
 * (Emergency → Need → Want, drag rank within each). The schedule anchor only
 * advances for periods actually funded (or for completed goals), so short
 * cash back-funds gradually rather than skipping periods. Returns only goals
 * whose anchor moves and/or get funded.
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

  eligible.sort((a, b) =>
    fundTagRank(a.g.priority) - fundTagRank(b.g.priority) || rankKey(a.g) - rankKey(b.g) || a.g.anchor - b.g.anchor);

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

// --- Overspend raid (protect emergency goals, then need, before want) ----

export type RaidGoal = {
  id: string; priority: Priority; locked: number; sort_order?: number;
  /** What the goal is aiming for — a goal already at its target is never raided. */
  target: number;
};
export type GoalRaid = { goalId: string; amount: number };

/** `want` goals are raided before `need`; `emergency` is filtered out entirely, above. */
const raidTagRank = (p: Priority) => (p === 'want' ? 0 : 1);

/**
 * Cover a cash overspend by pulling money out of goals, until the `deficit` is
 * covered (or goals run dry). Three protections, in order:
 *
 * 1. `priority === 'emergency'` is never raid-eligible at all — stronger than
 *    `locked`, which stays an independent, user-togglable override any goal
 *    (of any tag) can also set.
 * 2. Among the rest, `want` goals are raided before `need` — the coarse
 *    protect-order the tag exists for.
 * 3. Within a tag, `sort_order` (drag rank) breaks ties, mirroring funding
 *    order in reverse — see the tie-break note below.
 *
 * Completed goals are never touched either way (they're the reward the whole
 * feature exists to produce), and investments are never touched. Pure.
 */
export function planOverspendRaid(goals: RaidGoal[], saved: Record<string, number>, deficit: number): GoalRaid[] {
  if (deficit <= 0) return [];
  const order = goals
    .filter(g => g.priority !== 'emergency' && g.locked !== 1 && (saved[g.id] ?? 0) > 0 && (saved[g.id] ?? 0) < g.target)
    // Within a tag, raiding is the mirror of funding, so ties must break the
    // *opposite* way. Before anyone drags, every goal has `sort_order = 0`
    // (INTEGER NOT NULL DEFAULT 0), so every comparison tied and a stable sort
    // left both orders identical to the input — making the newest goal funded
    // first *and* raided first. Reversing the index on a tie restores the
    // mirror without a drag.
    .map((g, i) => ({ g, i }))
    .sort((a, b) => (raidTagRank(a.g.priority) - raidTagRank(b.g.priority)) || (rankKey(b.g) - rankKey(a.g)) || (b.i - a.i))
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


// --- Surplus sweep -------------------------------------------------------

export type SweepAllocation = { goalId: string; amount: number; sourceAsset: AssetBucket };

/**
 * Push an underspent month's leftover into goals — proposed, never applied.
 *
 * The only automatic inflow before this was the fixed per-goal allocation, so a
 * month where you spent ₹8,000 under budget left that money sitting in the
 * current account doing nothing. This offers it to the goals that are short.
 *
 * **It sweeps FROM a named bucket, and that is the whole point.** A withdrawal
 * has to return money where it came from, and the ledger can only say so if the
 * sweep recorded it. Sweeping "cash" generically and returning it to the bank is
 * not a round trip — it rewrites where the user's money is, silently.
 *
 * Refuses rather than guesses, in three cases, each of which would otherwise
 * produce a confident wrong answer:
 *  - a surplus that is not real (nothing, or a negative "surplus")
 *  - no single bucket that can cover it — splitting a sweep across buckets is a
 *    policy nobody has chosen, and picking one silently drains it
 *  - nothing short enough to want the money
 *
 * Same ordering as `planAutoAllocations` — Emergency, then Need, then Want, drag
 * rank within each — because a sweep and a scheduled allocation are the same act
 * with different triggers, and two different orders would be indefensible.
 */
export function planSurplusSweep(
  /** `locked` is required: a locked goal is one the user has said to leave alone. */
  goals: (GoalLike & { locked: number })[],
  saved: Record<string, number>,
  surplus: number,
  /** What each bucket actually holds. A sweep may only draw from one of these. */
  buckets: Partial<Record<AssetBucket, number>>,
): SweepAllocation[] {
  if (surplus <= 0) return [];

  // One bucket must cover the whole sweep. Spreading it would need a policy for
  // which bucket gives up what, and inventing one here would be the same class of
  // guess this feature exists to avoid.
  const from = (Object.keys(buckets) as AssetBucket[])
    .filter(b => (buckets[b] ?? 0) >= surplus)
    .sort((a, b) => (buckets[b] ?? 0) - (buckets[a] ?? 0))[0];
  if (!from) return [];

  const short = goals
    .filter(g => g.locked !== 1 && g.target > (saved[g.id] ?? 0))
    .sort((a, b) => fundTagRank(a.priority) - fundTagRank(b.priority) || rankKey(a) - rankKey(b));

  let left = surplus;
  const out: SweepAllocation[] = [];
  for (const g of short) {
    if (left <= 0) break;
    // Never overshoot a target — the same cap `planAutoAllocations` applies.
    const amount = Math.min(g.target - (saved[g.id] ?? 0), left);
    if (amount <= 0) continue;
    left -= amount;
    out.push({ goalId: g.id, amount, sourceAsset: from });
  }
  return out;
}
