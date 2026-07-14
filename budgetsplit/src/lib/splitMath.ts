import { parseToPaise, splitEqual, splitByPercent, splitByShares } from './money';
import type { SplitMode } from '../constants/enums';
import type { Person } from '../db/queries/persons';

/**
 * Pure split/payer math for the Add-expense flow. No React/RN/db — unit-tested.
 * The Add screen holds the raw string inputs; these turn them into paise shares.
 */

export type Share = { personId: string; amount: number };

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
