import { myPaidOf, myShareOf } from './splitMath';
import type { SettlementRow } from './settlementView';

/** What a filtered ledger adds up to, from my side (`U-52`). All paise. */
export type ActivityTotals = {
  /** My share of the expenses — what I consumed, the figure budgets and Reports use. */
  spent: number;
  /** What I received as income. */
  income: number;
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
 * - Transfers are never spending or income.
 */
export function activityTotals(rows: readonly TotalsRow[], meId: string): ActivityTotals {
  let spent = 0, income = 0;
  for (const t of rows) {
    if (t.pendingApproval) continue;
    if (t.kind === 'income') income += myPaidOf(t, meId);
    else if (t.kind === 'expense') spent += myShareOf(t, meId);
  }
  return { spent, income };
}
