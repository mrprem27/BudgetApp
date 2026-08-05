import { computeCash, computeTotalMoney, type CashTxn, type MoneyProfile } from '../lib/cash';

const ME = 'me';
const txn = (kind: string, pay: number, share: number, payer = ME, sharer = ME): CashTxn => ({
  kind,
  payments: pay ? [{ personId: payer, amount: pay }] : [],
  shares: share ? [{ personId: sharer, amount: share }] : [],
});

describe('computeCash', () => {
  it('fronting a group bill shows full cash out, then settlements net it to your share', () => {
    // You paid ₹3000 for a dinner (your share ₹1000); friends owe ₹2000.
    const beforeSettle = computeCash([txn('expense', 3000, 1000)], ME, 0);
    expect(beforeSettle.available).toBe(-3000); // you're out of pocket the full amount

    // Friends settle ₹2000 to you (you're the recipient → your share side).
    const afterSettle = computeCash([
      txn('expense', 3000, 1000),
      txn('settlement', 0, 2000, 'friend', ME),
    ], ME, 0);
    expect(afterSettle.available).toBe(-1000); // nets to your real share
  });

  it('income adds, settlements you pay subtract', () => {
    const c = computeCash([
      txn('income', 50000, 0),
      txn('settlement', 800, 0, ME, 'friend'), // you paid a friend
    ], ME, 0);
    expect(c.income).toBe(50000);
    expect(c.settledOut).toBe(800);
    expect(c.available).toBe(49200);
  });

  it('money set aside in savings reduces available cash', () => {
    const c = computeCash([txn('income', 10000, 0)], ME, 4000);
    expect(c.savings).toBe(4000);
    expect(c.available).toBe(6000);
  });

  it('ignores deleted txns', () => {
    const c = computeCash([{ ...txn('income', 9999, 0), is_deleted: 1 }], ME, 0);
    expect(c.available).toBe(0);
  });

  it('starts from the opening cash balance', () => {
    const c = computeCash([txn('expense', 2000, 2000)], ME, 0, 5000);
    expect(c.openingCash).toBe(5000);
    expect(c.available).toBe(3000); // 5000 opening − 2000 spent
  });
});

describe('computeTotalMoney', () => {
  const cash = (available: number) => computeCash([], ME, 0, available); // openingCash drives available
  const profile = (p: Partial<MoneyProfile> = {}): MoneyProfile =>
    ({ openingCash: 0, investments: 0, creditLimit: 0, creditUsed: 0, ...p });

  it('sums your money (cash + investments) plus available credit', () => {
    const tm = computeTotalMoney(cash(45000), profile({ investments: 150000, creditLimit: 60000, creditUsed: 10000 }));
    expect(tm.cashAvailable).toBe(45000);
    expect(tm.investments).toBe(150000);
    expect(tm.yourMoney).toBe(195000);
    expect(tm.creditAvailable).toBe(50000); // 60000 − 10000
    expect(tm.total).toBe(245000);          // 195000 + 50000
  });

  it('clamps available credit at zero when used exceeds the limit', () => {
    const tm = computeTotalMoney(cash(1000), profile({ creditLimit: 5000, creditUsed: 8000 }));
    expect(tm.creditAvailable).toBe(0);
    expect(tm.total).toBe(1000); // only cash; over-limit credit never goes negative
  });

  it('reflects negative cash in the total but not in credit', () => {
    const tm = computeTotalMoney(cash(-2000), profile({ creditLimit: 10000 }));
    expect(tm.cashAvailable).toBe(-2000);
    expect(tm.creditAvailable).toBe(10000);
    expect(tm.total).toBe(8000); // -2000 + 0 investments + 10000 credit
  });
});

describe('computeTotalMoney — Available vs Net Worth (V2-12)', () => {
  const cash = (available: number) => ({ available, openingCash: 0, income: 0, paidExpenses: 0, settledOut: 0, settledIn: 0, savings: 0 });
  const profile = (over: Partial<MoneyProfile> = {}): MoneyProfile =>
    ({ openingCash: 0, investments: 0, creditLimit: 0, creditUsed: 0, ...over });

  it('never counts unused credit as money you have', () => {
    // The bug: a ₹2L limit made the hero read ₹2L richer than the bank did.
    const m = computeTotalMoney(cash(50000), profile({ creditLimit: 20000000 }));
    expect(m.available).toBe(50000);
    expect(m.netWorth).toBe(50000);
    expect(m.creditAvailable).toBe(20000000); // still shown — as headroom, not money
  });

  it('keeps investments out of Available but inside Net Worth', () => {
    const m = computeTotalMoney(cash(50000), profile({ investments: 300000 }));
    expect(m.available).toBe(50000);   // not liquid
    expect(m.netWorth).toBe(350000);
  });

  it('subtracts credit actually used from Net Worth', () => {
    const m = computeTotalMoney(cash(100000), profile({ creditLimit: 500000, creditUsed: 200000 }));
    expect(m.netWorth).toBe(-100000);         // 100000 − 200000
    expect(m.available).toBe(100000);         // spending cash is unaffected by the debt
    expect(m.creditAvailable).toBe(300000);
  });

  it('lets Available go negative rather than papering over it', () => {
    // Overspending is the state the app most needs to show honestly.
    const m = computeTotalMoney(cash(-116188), profile({ creditLimit: 100000 }));
    expect(m.available).toBe(-116188);
  });

  it('treats negative profile entries as zero, not as a discount', () => {
    const m = computeTotalMoney(cash(1000), profile({ investments: -5000, creditLimit: -1, creditUsed: -9 }));
    expect(m.netWorth).toBe(1000);
    expect(m.creditAvailable).toBe(0);
  });

  it('keeps the legacy total intact for anything still reading it', () => {
    const m = computeTotalMoney(cash(1000), profile({ investments: 2000, creditLimit: 5000 }));
    expect(m.total).toBe(m.yourMoney + m.creditAvailable);
  });
});
