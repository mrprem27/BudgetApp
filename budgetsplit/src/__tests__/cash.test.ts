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
