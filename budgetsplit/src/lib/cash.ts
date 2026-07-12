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
  openingCash: number;   // starting cash balance the user entered at setup
  income: number;        // personal income received
  paidExpenses: number;  // what you actually paid out of pocket (any group)
  settledOut: number;    // settlements you paid
  settledIn: number;     // settlements paid to you (cash received)
  savings: number;       // currently set aside in goals
};

/** The four running sums computeCash accumulates — also what the aggregated SQL
 *  path (getCashPosition) computes directly in the DB. */
export type CashTotals = {
  income: number;        // my payments on income txns
  paidExpenses: number;  // my payments on expense txns (cash out the moment you paid)
  settledOut: number;    // my payments on settlement txns
  settledIn: number;     // my shares on settlement txns (cash received)
};

/** Final cash math, shared by the JS reducer (computeCash) and the SQL-aggregated
 *  path so both produce byte-identical CashPositions. */
export function cashPositionFromTotals(t: CashTotals, savings: number, openingCash = 0): CashPosition {
  const s = Math.max(0, savings);
  const available = openingCash + t.income - t.paidExpenses - t.settledOut + t.settledIn - s;
  return { available, openingCash, income: t.income, paidExpenses: t.paidExpenses, settledOut: t.settledOut, settledIn: t.settledIn, savings: s };
}

export function computeCash(txns: CashTxn[], myId: string, savings: number, openingCash = 0): CashPosition {
  let income = 0, paidExpenses = 0, settledOut = 0, settledIn = 0;
  for (const t of txns) {
    if (t.is_deleted) continue;
    const pay = t.payments.find(p => p.personId === myId)?.amount ?? 0;
    const share = t.shares.find(s => s.personId === myId)?.amount ?? 0;
    if (t.kind === 'income') income += pay;
    else if (t.kind === 'expense') paidExpenses += pay;       // cash out the moment you paid
    else if (t.kind === 'settlement') { settledOut += pay; settledIn += share; }
  }
  return cashPositionFromTotals({ income, paidExpenses, settledOut, settledIn }, savings, openingCash);
}

// --- Total Money -----------------------------------------------------------
// The single "Total Money" figure and its breakdown. Real money (cash +
// investments) plus available credit (limit − used). Credit is shown for
// spending-power context but is never spent from automatically.

export type MoneyProfile = {
  /** Starting cash balance entered at setup (paise). */
  openingCash: number;
  /** Total investments balance entered by the user (paise). Informational. */
  investments: number;
  /** Credit card limit (paise). */
  creditLimit: number;
  /** Credit already used (paise). */
  creditUsed: number;
};

export type TotalMoney = {
  total: number;           // yourMoney + creditAvailable
  yourMoney: number;       // cashAvailable + investments
  cashAvailable: number;
  investments: number;
  creditAvailable: number; // max(0, limit − used)
  creditLimit: number;
  creditUsed: number;
};

export function computeTotalMoney(cash: CashPosition, profile: MoneyProfile): TotalMoney {
  const cashAvailable = cash.available;
  const investments = Math.max(0, profile.investments);
  const creditLimit = Math.max(0, profile.creditLimit);
  const creditUsed = Math.max(0, profile.creditUsed);
  const creditAvailable = Math.max(0, creditLimit - creditUsed);
  const yourMoney = cashAvailable + investments;
  return {
    total: yourMoney + creditAvailable,
    yourMoney,
    cashAvailable,
    investments,
    creditAvailable,
    creditLimit,
    creditUsed,
  };
}
