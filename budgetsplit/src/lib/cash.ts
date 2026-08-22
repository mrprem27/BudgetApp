// Derived cash position — your *real* money. Computed purely from existing
// transactions (no duplicate ledger entries): what you actually paid out of
// pocket, settlements in/out, income, minus money set aside in Savings.
// Budgets/"spending" still use your share; this is the cash-timing view.

import { PayMethod } from '../constants/enums';
import { myShareOf, myPaidOf } from './splitMath';

export type CashTxn = {
  kind: string;
  is_deleted?: number | boolean;
  /** How it was paid. Card spend is debt, not cash out — see `computeCash`. */
  pay_method?: string | null;
  /** Epoch ms. Only used to date card spend against the money profile's baseline. */
  date?: number;
  payments: { personId: string; amount: number }[];
  shares: { personId: string; amount: number }[];
};

export type CashPosition = {
  available: number;     // real money you can spend right now
  openingCash: number;   // starting cash balance the user entered at setup
  income: number;        // personal income received
  paidExpenses: number;  // what you actually paid *in cash* (any group)
  settledOut: number;    // settlements you paid
  settledIn: number;     // settlements paid to you (cash received)
  savings: number;       // currently set aside in goals
  /** Card spend since the money profile was last confirmed — debt, not cash out.
   *  Optional so an older/partial CashPosition still type-checks. */
  cardSpend?: number;
  /**
   * Where the money sits. Optional because only the SQL path fills it — the JS
   * reducer is a parity oracle for `available` and has no bucket dimension.
   *
   * These do NOT sum to `available`: savings are held back from the total and are
   * not yet attributable to a bucket (that arrives with the sweep), and
   * `unattributed` sits outside them by design.
   */
  byBucket?: Record<'bank' | 'cash' | 'wallet', number>;
  /** Movement on entries whose pay method was never recorded. Real, unassigned. */
  unattributed?: number;
};

/** The four running sums computeCash accumulates — also what the aggregated SQL
 *  path (getCashPosition) computes directly in the DB. */
export type CashTotals = {
  income: number;        // my payments on income txns
  /** My payments on expense txns **excluding card** — cash out the moment you paid. */
  paidExpenses: number;
  settledOut: number;    // my payments on settlement txns
  settledIn: number;     // my shares on settlement txns (cash received)
  /**
   * My payments on **card** expense txns dated after the money profile was last
   * confirmed. Raises used credit instead of lowering cash.
   */
  cardSpend: number;
};

/** Final cash math, shared by the JS reducer (computeCash) and the SQL-aggregated
 *  path so both produce byte-identical CashPositions. */
export function cashPositionFromTotals(t: CashTotals, savings: number, openingCash = 0): CashPosition {
  const s = Math.max(0, savings);
  // `cardSpend` is deliberately absent from this sum: putting a purchase on a card
  // doesn't move cash, it creates debt. It lands on `creditUsed` in
  // `computeTotalMoney` instead. Counting it here as well as there would be the
  // double-count this fixes.
  const available = openingCash + t.income - t.paidExpenses - t.settledOut + t.settledIn - s;
  return {
    available, openingCash,
    income: t.income, paidExpenses: t.paidExpenses,
    settledOut: t.settledOut, settledIn: t.settledIn,
    savings: s, cardSpend: t.cardSpend,
  };
}

/**
 * @param cardBaselineMs Card spend is only counted from here — the moment the user
 *   last confirmed their card balance. `null` counts all of history (they've never
 *   confirmed one). Anything at or before it is already inside `profile.creditUsed`.
 */
export function computeCash(
  txns: CashTxn[],
  myId: string,
  savings: number,
  openingCash = 0,
  cardBaselineMs: number | null = null,
): CashPosition {
  let income = 0, paidExpenses = 0, settledOut = 0, settledIn = 0, cardSpend = 0;
  for (const t of txns) {
    if (t.is_deleted) continue;
    const pay = myPaidOf(t, myId);
    const share = myShareOf(t, myId);
    if (t.kind === 'income') income += pay;
    else if (t.kind === 'expense') {
      if (t.pay_method === PayMethod.Card) {
        // Debt, not cash out — and only the part not already in the stated balance.
        if (cardBaselineMs == null || (t.date ?? 0) > cardBaselineMs) cardSpend += pay;
      } else {
        paidExpenses += pay;                                   // cash out the moment you paid
      }
    }
    else if (t.kind === 'settlement') {
      settledOut += pay; settledIn += share;
      // A card-bill payment (settlement with pay_method 'card'): the cash left
      // via settledOut above, and the same amount comes off the card debt —
      // creditUsed's one way down between Plan edits. Baseline-bounded exactly
      // like card spend: rows at/before the stated balance are already in it.
      if (t.pay_method === PayMethod.Card && (cardBaselineMs == null || (t.date ?? 0) > cardBaselineMs)) {
        cardSpend -= pay;
      }
    }
  }
  return cashPositionFromTotals({ income, paidExpenses, settledOut, settledIn, cardSpend }, savings, openingCash);
}

// --- Total Money -----------------------------------------------------------
// The single "Total Money" figure and its breakdown. Real money (cash +
// investments) plus available credit (limit − used). Credit is shown for
// spending-power context but is never spent from automatically.

export type MoneyProfile = {
  /**
   * Starting balances per bucket (paise).
   *
   * There used to be one `openingCash` meaning "all my money" — the editor's own
   * hint said "bank + wallet". Splitting it lets a savings withdrawal return to
   * where the money came from instead of landing in an undifferentiated pool.
   * `getMoneyProfile` reads the old single figure as **bank** when no bucket key
   * exists, so old data and old backups keep their total exactly.
   */
  openingCash: number;
  openingBank: number;
  openingWallet: number;
  /** Total investments balance entered by the user (paise). Informational. */
  investments: number;
  /** Credit card limit (paise). */
  creditLimit: number;
  /** Credit already used (paise). */
  creditUsed: number;
};

/**
 * What the user has, across every bucket.
 *
 * The invariant this whole split rests on: **this must equal the single
 * `openingCash` figure that existed before buckets.** Every analytical consumer —
 * Safe-to-Spend, the overspend raid, afford, the health score — reads a total and
 * is provably unaffected as long as that holds. A total that moves is not a
 * migration, it is a bug, and the existing cash tests are what say so.
 */
export function openingTotal(p: Pick<MoneyProfile, 'openingCash' | 'openingBank' | 'openingWallet'>): number {
  return p.openingBank + p.openingCash + p.openingWallet;
}

export type TotalMoney = {
  total: number;           // yourMoney + creditAvailable
  yourMoney: number;       // cashAvailable + investments
  cashAvailable: number;
  investments: number;
  creditAvailable: number; // max(0, limit − used)
  creditLimit: number;
  creditUsed: number;
  /** Spendable right now: cash only. The Plan hero (`V2-12`). */
  available: number;
  /** cash + investments − credit used. Unused limit is headroom, not an asset. */
  netWorth: number;
};

export function computeTotalMoney(cash: CashPosition, profile: MoneyProfile): TotalMoney {
  const cashAvailable = cash.available;
  const investments = Math.max(0, profile.investments);
  const creditLimit = Math.max(0, profile.creditLimit);
  // The stated balance is a *baseline*, exactly like `openingCash`: card spend since
  // the user last confirmed it is added on read, so edits and deletes self-correct
  // and nothing has to be mutated on every write. Clamped to the limit because a
  // stale baseline plus new spend could otherwise exceed it.
  //
  // `cardSpend` is a NET delta: card purchases add, card-bill payments subtract
  // (see cash.ts settlement branch / CASH_TOTALS_SQL), so it may legitimately be
  // negative — a repayment larger than post-baseline spend brings the stated
  // balance itself down. The outer clamp keeps the result at ≥ 0.
  const creditUsed = Math.min(
    creditLimit > 0 ? creditLimit : Number.MAX_SAFE_INTEGER,
    Math.max(0, Math.max(0, profile.creditUsed) + (cash.cardSpend ?? 0)),
  );
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
    // `V2-12` — the two figures the old single `total` conflated.
    //
    // `available` is what you can spend right now. Investments are yours but not
    // liquid, and unused credit is not money at all — counting a ₹2L limit made the
    // hero read ₹2L richer than the bank did, which is exactly backwards for an app
    // whose job is telling you when to stop.
    available: cashAvailable,
    // Assets minus what you actually owe. Credit *used* is a liability; credit
    // *available* is neither an asset nor a debt, so it appears in neither figure —
    // it is headroom, shown separately and labelled as such.
    netWorth: cashAvailable + investments - creditUsed,
  };
}
