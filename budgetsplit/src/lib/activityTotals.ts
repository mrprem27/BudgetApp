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

/**
 * A group's spending over the rows given: my share, and the whole group's (`U-88`, the row under
 * a group's header). Spending only; a transfer or an entry waiting for approval is neither. The
 * caller chooses the rows (`totalsRows`: the filters, and this month while no date is chosen).
 */
export function groupSpend(
  rows: readonly {
    kind: string; pendingApproval?: boolean; is_deleted?: number | boolean | null;
    shares: ReadonlyArray<{ personId: string; amount: number }>;
  }[],
  meId: string,
): { mine: number; everyone: number } {
  let mine = 0, everyone = 0;
  for (const t of rows) {
    if (t.kind !== 'expense' || t.pendingApproval || t.is_deleted) continue;
    mine += myShareOf(t, meId);
    everyone += t.shares.reduce((s, x) => s + x.amount, 0);
  }
  return { mine, everyone };
}

