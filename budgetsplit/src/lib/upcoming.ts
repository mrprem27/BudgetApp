import { nextUnskippedOccurrence, materializeInstances } from './recurrence';
import { asRecurMode, type RecurMode } from '../constants/enums';
import type { TxnKind } from '../constants/enums';
import { myShareOrTotal } from './splitMath';
import type { TxnWithSplits } from '../db/queries/transactions';

/** One projected occurrence of a recurring series inside a horizon. */
export type ExpandedOccurrence = {
  /** Series id (not unique across the result — a weekly bill appears once per week). */
  seriesId: string;
  name: string;
  category: string;
  /** My share of THIS occurrence, in paise (full amount when I'm not in the split). */
  amount: number;
  dateMs: number;
};

/**
 * EVERY unskipped occurrence of every active recurring expense series inside
 * [fromMs, toMs], my-share amounts. This is the "committed bills" basis: a
 * weekly ₹500 bill with four occurrences left this month is ₹2,000 of
 * commitment, not ₹500 — `buildUpcoming` deliberately returns one row per
 * series (it feeds a "coming up" list), so summing it undercounted every
 * sub-monthly series. Pure; skips come from `getSkipsMap`.
 */
export function expandUpcoming(
  recurring: TxnWithSplits[],
  meId: string,
  fromMs: number,
  toMs: number,
  skipsBySeries?: Map<string, Set<number>>,
): ExpandedOccurrence[] {
  const out: ExpandedOccurrence[] = [];
  for (const txn of recurring) {
    if (txn.is_deleted) continue;
    // A rule I have not accepted is a PROPOSAL, not a bill.
    //
    // Callers pass rows from `getRecurringForGroup`, which is a ledger view and
    // therefore includes a peer's pending rule on purpose, marked. Every figure
    // downstream of here is money: `computeSafeToSpend`'s `upcomingBills`, the
    // month-end forecast floor, Afford, and the health score's bills-covered.
    // Aarav proposing "Gym ₹12,000/mo" took ₹4,000 off my Safe-to-Spend the
    // moment it arrived, while `getMyExposure` and every ledger total correctly
    // ignored it — one figure moving while the rest do not, which AGENTS §13
    // names as worse than all of them moving.
    if (txn.pendingApproval) continue;
    // Expenses ONLY, and deliberately — this feeds Safe-to-Spend's `upcomingBills`,
    // which is "committed outgoings before payday". Income is not a bill, and a
    // settlement is not consumption (AGENTS §12). `buildUpcoming` below is the
    // list, and that one shows all three, labelled per kind.
    if (txn.kind !== 'expense') continue;
    if (!txn.recur_freq) continue;
    if (txn.recur_state && txn.recur_state !== 'active') continue;
    for (const inst of materializeInstances(txn, fromMs, toMs, skipsBySeries?.get(txn.id))) {
      out.push({
        seriesId: txn.id,
        name: (txn.note && txn.note.trim()) || txn.category,
        category: txn.category,
        amount: myShareOrTotal(txn, meId),
        dateMs: inst.date,
      });
    }
  }
  out.sort((a, b) => a.dateMs - b.dateMs);
  return out;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export type UpcomingItem = {
  /** Series id (stable) — safe for React keys. */
  id: string;
  /** What to show: the note if present, else the category. */
  name: string;
  category: string;
  /** My share of the occurrence, in paise (falls back to full amount if I'm not in the split). */
  amount: number;
  /** Projected next occurrence (ms). */
  dateMs: number;
  /** Whole days from now until the occurrence (0 = today). */
  daysUntil: number;
  /** Which side of the ledger this is. Never sum across values of this. */
  kind: TxnKind;
  /**
   * 'auto' posts itself when due; 'remind' waits to be logged. A reminder is the
   * only one the user can act on, so the list needs to tell them apart.
   */
  mode: RecurMode;
};

/**
 * Project the next upcoming expense occurrences from active recurring series,
 * soonest first. Pure and deterministic — `nowMs` is injected, never read from
 * the clock here. Series that can't be projected (ended, paused, no freq) are
 * omitted so we never show a wrong date (plan deviation D5).
 */
export function buildUpcoming(
  recurring: TxnWithSplits[],
  meId: string,
  nowMs: number,
  limit = 3,
  /** Only include occurrences due within this many days (e.g. 4 = "coming up soon"). */
  withinDays?: number,
  /**
   * Skipped occurrence dates per series (`getSkipsMap`). Without this a bill the user
   * explicitly skipped still projects on its skipped date — which is what "Skip next
   * doesn't update Next" was.
   */
  skipsBySeries?: Map<string, Set<number>>,
): UpcomingItem[] {
  const items: UpcomingItem[] = [];
  for (const txn of recurring) {
    if (txn.is_deleted) continue;
    // Same rule as `expandUpcoming`. This list is what "Coming up" and the
    // reminder scheduler read, so a pending rule here becomes a notification
    // announcing a bill I never agreed to — and Afford sums it as committed.
    // The place to decide about a peer's rule is the approvals queue, which is
    // where it already appears.
    if (txn.pendingApproval) continue;
    // All three kinds. This is a LIST of what is coming, not a total — a recurring
    // salary and a standing transfer are both things you want to see. Consumers
    // must label and sum per kind rather than adding them together; §12 forbids
    // one figure across kinds, and two screens have already shipped that bug.
    if (!txn.recur_freq) continue;
    if (txn.recur_state && txn.recur_state !== 'active') continue;

    const next = nextUnskippedOccurrence(txn, nowMs, skipsBySeries?.get(txn.id));
    if (next === null) continue;

    // Costs me nothing, so it is not MY upcoming. A group rule split between two
    // other flatmates is coming for them; putting it on my list at ₹0 is a row
    // that explains nothing and a reminder about somebody else's bill.
    const amount = myShareOrTotal(txn, meId);
    if (amount === 0) continue;

    items.push({
      id: txn.id,
      name: (txn.note && txn.note.trim()) || txn.category,
      category: txn.category,
      amount,
      dateMs: next,
      daysUntil: Math.max(0, Math.round((next - nowMs) / DAY_MS)),
      kind: txn.kind,
      mode: asRecurMode(txn.recur_mode),
    });
  }
  items.sort((a, b) => a.dateMs - b.dateMs);
  const windowed = withinDays === undefined ? items : items.filter(i => i.daysUntil <= withinDays);
  return windowed.slice(0, limit);
}
