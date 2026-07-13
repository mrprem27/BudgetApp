import { startOfMonth, format } from 'date-fns';
import { nextOccurrenceOnOrAfter, recurringMonthlyEquivalent } from './recurrence';
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
  switch (mode) {
    case 'shares': return 'by shares';
    case 'exact': return 'by exact amounts';
    case 'percent': return 'by percentage';
    default: return 'equally';
  }
}

/** Human phrasing of a recur frequency. */
export function freqWord(freq: string | null): string {
  switch (freq) {
    case 'daily': return 'daily';
    case 'weekly': return 'weekly';
    case 'yearly': return 'yearly';
    case 'custom': return 'custom';
    default: return 'monthly';
  }
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

/** My spend this month in a personal group (hero subtitle). */
export function computePersonalMonthSpend(
  txns: TxnWithSplits[],
  meId: string | undefined,
  now: number = Date.now(),
): number {
  const monthStart = startOfMonth(new Date(now)).getTime();
  return txns.reduce(
    (s, t) => (t.kind === 'expense' && t.date >= monthStart
      ? s + (t.shares.find(x => x.personId === meId)?.amount ?? 0)
      : s),
    0,
  );
}

/** Monthly-equivalent total across active recurring rules (summary pill). */
export function computeRecurringMonthlyTotal(rules: TxnWithSplits[]): number {
  return rules.reduce((sum, r) => {
    const rAmt = r.payments.reduce((s, p) => s + p.amount, 0);
    return sum + recurringMonthlyEquivalent(rAmt, r.recur_freq);
  }, 0);
}

/** Earliest upcoming charge across active recurring rules, as "MMM d" (or null). */
export function computeRecurNextLabel(rules: TxnWithSplits[], now: number = Date.now()): string | null {
  const next = rules
    .map(r => nextOccurrenceOnOrAfter(r, now))
    .filter((d): d is number => d != null)
    .sort((a, b) => a - b)[0];
  return next ? format(next, 'MMM d') : null;
}
