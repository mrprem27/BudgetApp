import { computeNet, simplify, rawDebts } from '../lib/settle';

const txn = (payments: [string, number][], shares: [string, number][], kind = 'expense') => ({
  kind,
  payments: payments.map(([personId, amount]) => ({ personId, amount })),
  shares: shares.map(([personId, amount]) => ({ personId, amount })),
});

describe('computeNet', () => {
  it('nets paid minus share per person', () => {
    const net = computeNet([txn([['a', 1000]], [['a', 500], ['b', 500]])]);
    expect(net.a).toBe(500);
    expect(net.b).toBe(-500);
  });
});

describe('simplify', () => {
  it('produces the minimum payment from debtor to creditor', () => {
    const r = simplify({ a: 50000, b: -50000 });
    expect(r).toEqual([{ from: 'b', to: 'a', amount: 50000 }]);
  });
  it('returns nothing when everyone is settled', () => {
    expect(simplify({ a: 0, b: 0 })).toEqual([]);
  });
  it('every payment balances out the nets', () => {
    const r = simplify({ a: 30000, b: 20000, c: -50000 });
    const paid = r.reduce((s, x) => s + x.amount, 0);
    expect(paid).toBe(50000);
  });
});

describe('rawDebts', () => {
  it('shows the direct debt from a single split expense', () => {
    const r = rawDebts([txn([['a', 1000]], [['a', 500], ['b', 500]])]);
    expect(r).toEqual([{ from: 'b', to: 'a', amount: 500 }]);
  });
  it('ignores income', () => {
    expect(rawDebts([txn([['a', 1000]], [], 'income')])).toEqual([]);
  });
});
