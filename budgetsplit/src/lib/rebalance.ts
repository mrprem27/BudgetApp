import type { CategoryBudgetStatus } from './budget';
import { OTHERS_LABEL } from './categoryFold';

/**
 * Mid-month re-plan (`V2-07`).
 *
 * When a category blows its limit, the only feedback used to be a red bar. There was
 * no way to act on it, so the month simply stayed broken — and my-share makes overruns
 * *less* predictable than a fixed budget would, because an itemized bill can hand you a
 * far larger share than you expected.
 *
 * This plans a redistribution: take the overspend from categories that still have room,
 * so the month's total holds. It is a **proposal** — nothing is written until the user
 * accepts, for the same reason `V2-10` stopped raiding goals silently.
 */

export type RebalanceDonor = {
  category: string;
  /** Current limit, in paise. */
  allocated: number;
  /** What the limit would become. */
  newAllocated: number;
  /** How much is being taken (`allocated − newAllocated`). */
  taken: number;
};

export type RebalancePlan = {
  /** The category that went over, and by how much. */
  category: string;
  overspend: number;
  donors: RebalanceDonor[];
  /** Total the donors can actually cover — may be less than `overspend`. */
  covered: number;
  /** True when the donors cannot cover the whole overspend. */
  partial: boolean;
};

/**
 * A donor keeps a floor of its own spend-to-date: a limit below what you have already
 * spent is instantly "over budget" too, which would move the red bar rather than
 * remove it. Headroom is therefore `allocated − spent`, never the full allocation.
 *
 * Donors are drained largest-headroom-first, so the fewest categories are disturbed —
 * trimming ₹500 from one line beats trimming ₹50 from ten, which reads as noise and is
 * impossible to remember later.
 *
 * Only same-cadence lines take part. A yearly budget's headroom is not spendable this
 * month, so borrowing from it would fix the display and not the money.
 */
export function planRebalance(
  statuses: CategoryBudgetStatus[],
  overCategory: string,
): RebalancePlan | null {
  // `Others` is a fold of several real lines, not a budget anybody set, so it can
  // be neither the thing re-planned nor a donor — moving "its" money would mean
  // moving an amount that belongs to categories this row only summarises.
  // `applyRebalance` drops it on the way out; refusing it here means a plan is
  // never SHOWN whose numbers would then not be applied.
  if (overCategory === OTHERS_LABEL) return null;

  const target = statuses.find(s => s.category === overCategory);
  if (!target || target.remaining >= 0) return null;

  const overspend = -target.remaining;
  const donors: RebalanceDonor[] = [];
  let left = overspend;

  const candidates = statuses
    .filter(s => s.category !== overCategory && s.category !== OTHERS_LABEL && s.cadence === target.cadence)
    .map(s => ({ s, headroom: Math.max(0, s.remaining) }))
    .filter(c => c.headroom > 0)
    .sort((a, b) => b.headroom - a.headroom || a.s.category.localeCompare(b.s.category));

  for (const { s, headroom } of candidates) {
    if (left <= 0) break;
    const taken = Math.min(headroom, left);
    donors.push({ category: s.category, allocated: s.allocated, newAllocated: s.allocated - taken, taken });
    left -= taken;
  }

  const covered = overspend - left;
  if (covered <= 0) return null;
  return { category: overCategory, overspend, donors, covered, partial: left > 0 };
}

/**
 * The plan as a full budget entry list, ready for `setCategoryBudgets` (which replaces
 * every line, so untouched categories must be passed through unchanged).
 *
 * The over-budget category is raised by exactly what was covered — the point is that
 * the month's *total* is unchanged, so this is a redistribution and never a quiet
 * increase in what you have allowed yourself to spend.
 */
export function applyRebalance(
  statuses: CategoryBudgetStatus[],
  plan: RebalancePlan,
): Array<{ category: string; cadence: CategoryBudgetStatus['cadence']; amount: number }> {
  const byCategory = new Map(plan.donors.map(d => [d.category, d.newAllocated]));
  return statuses
    /*
     * `Others` is a FOLD, not a category.
     *
     * `foldBudgetStatuses` invents it to gather every budget line whose category
     * is not in the catalog, so it has no row of its own. Submitting it made
     * `setCategoryBudgets` write a real one — and its preservation rule keeps any
     * line that is neither known nor submitted, so the folded lines survived
     * alongside it and the group's allocated total jumped by their sum out of
     * nowhere. The next fold then gathered them into the now-real Others again.
     */
    .filter(s => s.category !== OTHERS_LABEL)
    .map(s => ({
      category: s.category,
      cadence: s.cadence,
      amount: s.category === plan.category
        ? s.allocated + plan.covered
        : byCategory.get(s.category) ?? s.allocated,
    }));
}
