import { nextUnskippedOccurrence, recurringMonthlyEquivalent } from './recurrence';
import { shortDate } from './dateFormat';
import { myShareOrTotal, txnTotal } from './splitMath';
import { SPLIT_MODE_PHRASE, type SplitMode } from '../constants/enums';
import type { TxnWithSplits } from '../db/queries/transactions';
import type { Person } from '../db/queries/persons';

/**
 * Pure derivations for the Group Detail screen. No React / RN / db — unit-tested.
 * The screen memoizes these; keeping the math here makes it testable and keeps the
 * screen a thin composer (AGENTS "screen thinness").
 */

/** A recurring *occurrence* row carries a `_<n>` suffix on its id (vs the rule). */
export function isRecurInstance(id: string): boolean {
  return /_\d+$/.test(id);
}

/** Human phrasing of a split mode (used in the recurring summary). */
export function splitLabel(mode: string): string {
  return SPLIT_MODE_PHRASE[mode as SplitMode] ?? SPLIT_MODE_PHRASE.equal;
}

export type ContributionRow = { member: Person; paid: number; net: number; frac: number };
export type Contributions = { total: number; fairShare: number; rows: ContributionRow[] };

/**
 * "Who paid what" — each member's expense payments vs the equal fair share.
 * `net > 0` = member is ahead (group owes them); `net < 0` = they owe. `frac` is
 * the paid amount relative to the biggest payer (for the bar width).
 */
export function computeContributions(
  txns: TxnWithSplits[],
  members: Person[],
  net: Record<string, number>,
): Contributions {
  const paid: Record<string, number> = {};
  let total = 0;
  for (const t of txns) {
    if (t.is_deleted || t.kind !== 'expense') continue;
    for (const p of t.payments) {
      paid[p.personId] = (paid[p.personId] ?? 0) + p.amount;
      total += p.amount;
    }
  }
  const fairShare = members.length > 0 ? Math.round(total / members.length) : 0;
  const maxPaid = Math.max(1, ...members.map(m => paid[m.id] ?? 0));
  return {
    total,
    fairShare,
    rows: members
      .map(m => ({ member: m, paid: paid[m.id] ?? 0, net: net[m.id] ?? 0, frac: (paid[m.id] ?? 0) / maxPaid }))
      .sort((a, b) => b.paid - a.paid),
  };
}

/** Monthly-equivalent WHOLE-BILL total across active recurring rules (the group
 *  summary pill — a group surface shows the group's bill; rows carry "your share"). */
export function computeRecurringMonthlyTotal(rules: TxnWithSplits[]): number {
  return rules.reduce(
    (sum, r) => sum + recurringMonthlyEquivalent(txnTotal(r), r.recur_freq, r.recur_interval),
    0,
  );
}

/**
 * Monthly-equivalent of MY share across active recurring rules.
 *
 * The counterpart to `computeRecurringMonthlyTotal`: that one is the group's bill,
 * this one is what it costs me. The Recurring tab used to show only the group
 * figure in its summary while every row underneath carried "your share", with
 * nothing tying the two together. Same `myShareOrTotal` fallback every other
 * projection surface uses, so the two can't disagree.
 */
export function computeRecurringMyShareMonthly(rules: TxnWithSplits[], meId: string): number {
  return rules.reduce(
    (sum, r) => sum + recurringMonthlyEquivalent(myShareOrTotal(r, meId), r.recur_freq, r.recur_interval),
    0,
  );
}

export type Settle = { from: string; to: string; amount: number };

/**
 * The one counterpart to offer a Settle button for, or null when there isn't one.
 *
 * If I owe, that's whoever the plan says I pay; if I'm owed, whoever pays me.
 * Null when no real counterpart exists — otherwise the transfer form opens with an
 * empty payee, which is how this read before it moved out of the balance card.
 */
export function primarySettleTarget(
  settles: Settle[],
  meId: string,
  personMap: Map<string, Person>,
  myNet: number,
): Person | null {
  if (myNet === 0) return null;
  const isOwe = myNet < 0;
  const hit = isOwe ? settles.find(s => s.from === meId) : settles.find(s => s.to === meId);
  if (!hit) return null;
  return personMap.get(isOwe ? hit.to : hit.from) ?? null;
}

export type SettlementSummary = {
  /** Total still to move, across every outstanding payment. */
  openTotal: number;
  /** How many members are square (net zero). */
  settledCount: number;
};

/**
 * Headline counts for the Members tab's summary: how much is open, and who's square.
 *
 * Counts over `memberIds`, not over `net`'s keys: a member who has never been in a
 * transaction is absent from the balance map entirely rather than present at zero,
 * so reading the map alone would report them as un-settled.
 */
export function settlementSummary(
  settles: Settle[],
  net: Record<string, number>,
  memberIds: string[],
): SettlementSummary {
  return {
    openTotal: settles.reduce((sum, s) => sum + s.amount, 0),
    settledCount: memberIds.filter(id => (net[id] ?? 0) === 0).length,
  };
}

/**
 * Earliest upcoming charge across active recurring rules (or null). Skip-aware:
 * without the skips map this advertised a charge the user explicitly skipped.
 */
export function computeRecurNextLabel(
  rules: TxnWithSplits[],
  skips?: Map<string, Set<number>>,
  now: number = Date.now(),
): string | null {
  const next = rules
    .map(r => nextUnskippedOccurrence(r, now, skips?.get(r.id)))
    .filter((d): d is number => d != null)
    .sort((a, b) => a - b)[0];
  return next ? shortDate(next) : null;
}
