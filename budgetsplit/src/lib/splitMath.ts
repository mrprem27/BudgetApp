import { parseToPaise, splitByMode } from './money';
import type { SplitMode } from '../constants/enums';
import type { Person } from '../db/queries/persons';

/**
 * Pure split/payer math for the Add-expense flow. No React/RN/db — unit-tested.
 * The Add screen holds the raw string inputs; these turn them into paise shares.
 */

export type Share = { personId: string; amount: number };

/**
 * My paise share of a transaction — the basis Home, budgets and afford all use.
 * Not in the split → 0 (I didn't spend it). Use this for ANALYSIS (what did I
 * actually spend); use {@link myShareOrTotal} for PROJECTIONS.
 */
export function myShareOf(txn: { shares: readonly Share[] }, meId: string): number {
  return txn.shares.find(s => s.personId === meId)?.amount ?? 0;
}

/**
 * My paise share, falling back to the occurrence's full amount when I'm not in
 * the split. The PROJECTION basis: an unsplit upcoming bill is presumed mine
 * (someone has to pay it and it's on my list), whereas in analysis the same
 * absence means "not my spend". Every projection surface (upcoming, recurring
 * rows, afford's committed bills) must use this one, so the two fallbacks can
 * never disagree per-screen again.
 */
export function myShareOrTotal(
  txn: { shares: readonly Share[]; payments: readonly Share[] },
  meId: string,
): number {
  const mine = txn.shares.find(s => s.personId === meId)?.amount;
  if (mine !== undefined) return mine;
  const shareTotal = txn.shares.reduce((sum, s) => sum + s.amount, 0);
  return shareTotal || txn.payments.reduce((s, p) => s + p.amount, 0);
}

/**
 * The transaction's own total, kind-agnostic: what was PAID for it. Payments
 * is the side every kind fills (income lands there; an expense's payments must
 * equal its shares to save), so it is the canonical row total; shares are the
 * fallback for legacy rows with no payments. Replaces four divergent inline
 * versions (group CSV export, report export, report list, search — which
 * disagreed with each other for the same row).
 */
export function txnTotal(txn: { payments: readonly Share[]; shares: readonly Share[] }): number {
  const paid = txn.payments.reduce((s, p) => s + p.amount, 0);
  if (paid > 0) return paid;
  return txn.shares.reduce((s, x) => s + x.amount, 0);
}

/**
 * My paise on the payments side: what I paid (expense/settlement) or received
 * (income). The payments-side mirror of `myShareOf`.
 */
export function myPaidOf(txn: { payments: readonly Share[] }, meId: string): number {
  return txn.payments.find(p => p.personId === meId)?.amount ?? 0;
}

/**
 * My paise portion of an **income** transaction — semantic alias of
 * {@link myPaidOf}. Income is attributed by who received it (`payments`), not
 * by who owes a share, so the two kinds read different tables and must not be
 * collapsed into one call.
 */
export function myIncomeOf(txn: { payments: readonly Share[] }, meId: string): number {
  return myPaidOf(txn, meId);
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

/**
 * Resolve each included member's share (paise) for the chosen split mode.
 * Thin adapter over {@link splitByMode} — the one split engine — so Quick Add
 * can never disagree with Review/Itemized/import about what a mode means.
 */
export function computeShares(i: ShareInputs): Share[] {
  const selected = i.members.filter(m => i.splitMembers.includes(m.id));
  if (selected.length === 0) return [];
  const values =
    i.splitType === 'exact' ? i.exactAmounts :
    i.splitType === 'percent' ? i.percentages :
    i.splitType === 'shares' ? i.ratios : {};
  const byId = splitByMode(i.total, selected.map(m => m.id), i.splitType, values);
  return selected.map(m => ({ personId: m.id, amount: byId[m.id] ?? 0 }));
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
