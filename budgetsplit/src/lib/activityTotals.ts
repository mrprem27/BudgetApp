import { myPaidOf, myShareOf } from './splitMath';
import { settlementView, type SettlementRow } from './settlementView';

/** What a filtered ledger adds up to, from my side (`U-52`). All paise. */
export type ActivityTotals = {
  /** My share of the expenses — what I consumed, the figure budgets and Reports use. */
  spent: number;
  /** What I received as income. */
  income: number;
  /**
   * How the rows moved my position with other people: positive = they owe me more (or I owe
   * them less) than before, negative = the other way. Paying a bill for the group, being paid
   * back and paying someone back all land here; spending alone never does.
   */
  netWithOthers: number;
};

export type TotalsRow = SettlementRow & {
  kind: string;
  isPersonal: boolean;
  pendingApproval?: boolean;
};

/**
 * Totals over exactly the rows a ledger is showing, so the figures above a filtered list
 * describe that list. Pure — the Personal screen passes it the rows it renders.
 *
 * - An entry waiting for my approval moves none of my numbers (AGENTS §13), so it adds nothing.
 * - Transfers are never spending or income; they only move `netWithOthers`.
 * - Only shared-group rows touch `netWithOthers`: in Personal there is nobody else, and a
 *   personal transfer (a card bill, a move into an asset) is money changing place, not a debt.
 */
export function activityTotals(rows: readonly TotalsRow[], meId: string): ActivityTotals {
  let spent = 0, income = 0, netWithOthers = 0;
  for (const t of rows) {
    if (t.pendingApproval) continue;
    const paid = myPaidOf(t, meId);
    const share = myShareOf(t, meId);
    if (t.kind === 'income') { income += paid; continue; }
    if (t.kind === 'expense') spent += share;
    // A settlement counts only when it is a transfer between people — a move into or out of an
    // asset or a card bill is money changing place (`settlementView` decides which).
    if (t.kind === 'settlement' && settlementView(t).kind !== 'transfer') continue;
    if (!t.isPersonal) netWithOthers += paid - share;
  }
  return { spent, income, netWithOthers };
}
