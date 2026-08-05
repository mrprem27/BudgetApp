import { parseToPaise, splitEqual, splitByPercent, splitByShares } from './money';
import type { SplitMode } from '../constants/enums';
import type { Person } from '../db/queries/persons';

/**
 * Pure split/payer math for the Add-expense flow. No React/RN/db — unit-tested.
 * The Add screen holds the raw string inputs; these turn them into paise shares.
 */

export type Share = { personId: string; amount: number };

/**
 * My paise share of a transaction — the basis Home, budgets and afford all use.
 * Not in the split → 0 (I didn't spend it). `lib/upcoming` keeps its own
 * fallback-to-total for unsplit projections, so it is not a caller.
 * First shared version of a calc still inlined at ~30 sites; see V2-18.
 */
export function myShareOf(txn: { shares: readonly Share[] }, meId: string): number {
  return txn.shares.find(s => s.personId === meId)?.amount ?? 0;
}

export type ShareInputs = {
  members: Person[];
  splitMembers: string[];
  splitType: SplitMode;
  total: number;
  exactAmounts: Record<string, string>;
  percentages: Record<string, string>;
  ratios: Record<string, string>;
};

/** Resolve each included member's share (paise) for the chosen split mode. */
export function computeShares(i: ShareInputs): Share[] {
  const selected = i.members.filter(m => i.splitMembers.includes(m.id));
  if (selected.length === 0) return [];

  if (i.splitType === 'equal') {
    const amounts = splitEqual(i.total, selected.length);
    return selected.map((m, idx) => ({ personId: m.id, amount: amounts[idx] }));
  }
  if (i.splitType === 'exact') {
    return selected.map(m => ({ personId: m.id, amount: parseToPaise(i.exactAmounts[m.id] ?? '0') }));
  }
  if (i.splitType === 'percent') {
    const pcts = selected.map(m => {
      const p = parseInt(i.percentages[m.id] ?? '0', 10);
      return Number.isFinite(p) ? p : 0;
    });
    const amounts = splitByPercent(i.total, pcts);
    return selected.map((m, idx) => ({ personId: m.id, amount: amounts[idx] }));
  }
  if (i.splitType === 'shares') {
    const rs = selected.map(m => {
      const r = parseInt(i.ratios[m.id] ?? '1', 10);
      return Number.isFinite(r) ? r : 1;
    });
    const amounts = splitByShares(i.total, rs);
    return selected.map((m, idx) => ({ personId: m.id, amount: amounts[idx] }));
  }
  return [];
}

/**
 * Is this set of shares a complete allocation of `total`?
 *
 * The single source for "does this split add up", shared by the Quick-Add save
 * path and the Review commit path so the two can't drift. `exact` mode reads the
 * user's inputs verbatim and deliberately does NOT reconcile a shortfall
 * (see splitByMode) — this is the check that stops an unbalanced one being
 * written, rather than silently fixing it up.
 *
 * `delta` is what's still unallocated: positive = short, negative = over.
 */
export function validateShares(total: number, shares: Share[]): { ok: boolean; assigned: number; delta: number } {
  const assigned = shares.reduce((s, x) => s + x.amount, 0);
  return { ok: shares.length > 0 && assigned === total, assigned, delta: total - assigned };
}

/** Resolve who paid (paise). No explicit payers → the current user paid the full total. */
export function computePayments(
  payerAmounts: Record<string, string>,
  meId: string | undefined,
  total: number,
): Share[] {
  if (!meId) return [];
  const payers = Object.entries(payerAmounts)
    .map(([pid, val]) => ({ personId: pid, amount: parseToPaise(val) }))
    .filter(p => p.amount > 0);
  if (payers.length === 0) return [{ personId: meId, amount: total }];
  return payers;
}
