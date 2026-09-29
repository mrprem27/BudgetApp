/**
 * The Add screen's budget nudge inputs — "₹400 left in Food this month" — read
 * off the engine's own `FinanceSnapshot` (`L11`), so opening Add costs one
 * snapshot read instead of two. Pure.
 *
 * `budget` is the category's line normalised to a monthly figure
 * (`budgetEquivalent`, the one source for that — a yearly line is not ₹X/12 of
 * headroom), `null` when there isn't one. `spentThisMonth` is my share, this
 * calendar month, up to `asOf`.
 */
import { startOfMonth } from 'date-fns';
import type { FinanceSnapshot } from './engine/types';
import { budgetEquivalent } from './budget';

export type CategoryNudge = { budget: number | null; spentThisMonth: number };

export function categoryNudge(snapshot: FinanceSnapshot, category: string): CategoryNudge {
  const monthStart = startOfMonth(new Date(snapshot.asOf)).getTime();
  const spentThisMonth = snapshot.history
    .filter(h => h.kind === 'expense' && h.category === category && h.date >= monthStart && h.date <= snapshot.asOf)
    .reduce((s, h) => s + h.amountPaise, 0);

  const line = snapshot.budgets.find(b => b.category === category);
  const monthly = line ? budgetEquivalent(line.cadence, line.amount, 'monthly', new Date(snapshot.asOf)) : null;
  return { budget: monthly != null && monthly > 0 ? monthly : null, spentThisMonth };
}
