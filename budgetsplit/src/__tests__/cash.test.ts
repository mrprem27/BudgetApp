import { computeCash, type CashTxn } from '../lib/cash';

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
});
