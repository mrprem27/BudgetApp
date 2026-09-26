/**
 * E5 — signals built on the projection (`SPEC-ENGINE.md` §4.2). Pure.
 *
 * v1 keeps exactly one: the low-point warning. Everything else the original
 * draft listed (unusual spend, recurring analysis, savings suggestion,
 * category insights, migrating the health score) is cut for now — none would
 * change a number the person already sees, and building signals nobody asked
 * for yet is the mistake `EN3`'s band already was. See spec §2's cut list.
 */
import type { FinanceSnapshot } from './types';
import { projectKnown } from './projection';
import { essentialFloor } from './behaviour';

export type LowPointWarning = {
  date: number;
  /** The single biggest event on the day the balance first drops below the floor. */
  label: string;
  amountPaise: number;
};

/** Days ahead worth warning about — a dip past the horizon's own end isn't "coming up". */
const WARNING_WINDOW_DAYS = 14;

/**
 * One warning when the projected balance drops below the essential floor
 * within `WARNING_WINDOW_DAYS` — never below zero (that's `afford`'s "Not
 * affordable", a verdict, not a heads-up) and never for a cold-start ledger
 * (the floor is 0 below 30 days of history, so there's nothing to warn about
 * that isn't also true today).
 */
export function lowPointWarning(snapshot: FinanceSnapshot): LowPointWarning | null {
  const floor = essentialFloor(snapshot);
  if (floor <= 0) return null;

  const projection = projectKnown(snapshot, WARNING_WINDOW_DAYS, [], true);
  const dip = projection.days.find(d => d.balance < floor);
  if (!dip) return null;

  // The biggest single claim ON THAT DAY, not the cumulative path — "what
  // pushed you under" should point at one thing, not a running total.
  const biggest = dip.events.reduce<{ label: string; amountPaise: number } | null>((worst, e) => {
    if (e.amountPaise >= 0) return worst; // only money leaving can push the balance down
    return !worst || e.amountPaise < worst.amountPaise ? e : worst;
  }, null);

  return {
    date: dip.date,
    label: biggest?.label ?? 'Everyday spending',
    amountPaise: biggest?.amountPaise ?? 0,
  };
}
