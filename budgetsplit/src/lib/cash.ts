// Derived cash position — your *real* money. Computed purely from existing
// transactions (no duplicate ledger entries): what you actually paid out of
// pocket, settlements in/out, income, minus money set aside in Savings.
// Budgets/"spending" still use your share; this is the cash-timing view.

export type CashTxn = {
  kind: string;
  is_deleted?: number | boolean;
  payments: { personId: string; amount: number }[];
  shares: { personId: string; amount: number }[];
};

export type CashPosition = {
  available: number;     // real money you can spend right now
  income: number;        // personal income received
  paidExpenses: number;  // what you actually paid out of pocket (any group)
  settledOut: number;    // settlements you paid
  settledIn: number;     // settlements paid to you (cash received)
  savings: number;       // currently set aside in the Savings pool
};

export function computeCash(txns: CashTxn[], myId: string, savings: number): CashPosition {
  let income = 0, paidExpenses = 0, settledOut = 0, settledIn = 0;
  for (const t of txns) {
    if (t.is_deleted) continue;
    const pay = t.payments.find(p => p.personId === myId)?.amount ?? 0;
    const share = t.shares.find(s => s.personId === myId)?.amount ?? 0;
    if (t.kind === 'income') income += pay;
    else if (t.kind === 'expense') paidExpenses += pay;       // cash out the moment you paid
    else if (t.kind === 'settlement') { settledOut += pay; settledIn += share; }
  }
  const available = income - paidExpenses - settledOut + settledIn - Math.max(0, savings);
  return { available, income, paidExpenses, settledOut, settledIn, savings: Math.max(0, savings) };
}
