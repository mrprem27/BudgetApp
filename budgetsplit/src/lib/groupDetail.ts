import { nextUnskippedOccurrence, recurringMonthlyEquivalent } from './recurrence';
import { shortDate } from './dateFormat';
import { txnTotal } from './splitMath';
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
