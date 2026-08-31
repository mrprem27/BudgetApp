import { computeShares, computePayments, validateShares, myShareOf, myShareOrTotal, myPaidOf, txnTotal } from '../lib/splitMath';
import { splitByMode } from '../lib/money';
import type { Person } from '../db/queries/persons';

const p = (id: string): Person => ({ id, name: id, avatar_color: '#20C4B8', is_me: 0, image_uri: null } as any);
const members = [p('a'), p('b'), p('c')];

describe('computeShares', () => {
  it('splits equally (remainder distributed by splitEqual)', () => {
    const s = computeShares({ members, splitMembers: ['a', 'b', 'c'], splitType: 'equal', total: 10000, exactAmounts: {}, percentages: {}, ratios: {} });
    expect(s.reduce((t, x) => t + x.amount, 0)).toBe(10000);
    expect(s).toHaveLength(3);
  });

  it('uses exact amounts as entered', () => {
    const s = computeShares({ members, splitMembers: ['a', 'b'], splitType: 'exact', total: 10000, exactAmounts: { a: '30', b: '70' }, percentages: {}, ratios: {} });
    expect(s).toEqual([{ personId: 'a', amount: 3000 }, { personId: 'b', amount: 7000 }]);
  });

  it('splits by percentage', () => {
    const s = computeShares({ members, splitMembers: ['a', 'b'], splitType: 'percent', total: 10000, exactAmounts: {}, percentages: { a: '25', b: '75' }, ratios: {} });
    expect(s.reduce((t, x) => t + x.amount, 0)).toBe(10000);
    expect(s[0].amount).toBe(2500);
  });

  it('splits by shares/ratios', () => {
    const s = computeShares({ members, splitMembers: ['a', 'b'], splitType: 'shares', total: 9000, exactAmounts: {}, percentages: {}, ratios: { a: '1', b: '2' } });
    expect(s.reduce((t, x) => t + x.amount, 0)).toBe(9000);
    expect(s[0].amount).toBe(3000);
    expect(s[1].amount).toBe(6000);
  });

  it('returns [] when nobody is included', () => {
    expect(computeShares({ members, splitMembers: [], splitType: 'equal', total: 10000, exactAmounts: {}, percentages: {}, ratios: {} })).toEqual([]);
  });

  // D5: an explicit 0 shares input EXCLUDES the person. Regression for the
  // split-engine disagreement where splitByMode coerced 0 → a full share, so
  // the same saved split owed different amounts in Add vs Review.
  it('an explicit 0 shares ratio excludes that person', () => {
    const s = computeShares({ members, splitMembers: ['a', 'b'], splitType: 'shares', total: 9000, exactAmounts: {}, percentages: {}, ratios: { a: '0', b: '3' } });
    expect(s).toEqual([{ personId: 'a', amount: 0 }, { personId: 'b', amount: 9000 }]);
  });

  it('agrees with splitByMode for a 0-shares entry (the engines are one)', () => {
    const byMode = splitByMode(9000, ['a', 'b'], 'shares', { a: '0', b: '3' });
    expect(byMode).toEqual({ a: 0, b: 9000 });
  });

  it('a blank shares input still defaults to one share', () => {
    const byMode = splitByMode(9000, ['a', 'b'], 'shares', { b: '2' });
    expect(byMode).toEqual({ a: 3000, b: 6000 });
  });
});

describe('share accessors', () => {
  const txn = {
    payments: [{ personId: 'a', amount: 9000 }],
    shares: [{ personId: 'a', amount: 3000 }, { personId: 'b', amount: 6000 }],
  };

  it('myShareOf: my share, 0 when not in the split (analysis basis)', () => {
    expect(myShareOf(txn, 'b')).toBe(6000);
    expect(myShareOf(txn, 'z')).toBe(0);
  });

  /**
   * The projection basis falls back only for an UNSPLIT bill. A split that simply
   * does not name me is not unsplit — it is a bill I am explicitly not on.
   *
   * The old fallback returned the whole share total whenever I was absent, so a
   * flatmate's ₹18,000 car EMI split between the two of them was charged to me in
   * full: off Safe-to-Spend, under the forecast, and listed against my name.
   */
  it('myShareOrTotal: my share, and 0 for a split I am not on', () => {
    expect(myShareOrTotal(txn, 'b')).toBe(6000);
    expect(myShareOrTotal(txn, 'z')).toBe(0);
    // Which is the same answer the analysis basis gives about the same row.
    expect(myShareOrTotal(txn, 'z')).toBe(myShareOf(txn, 'z'));
  });

  it('myShareOrTotal: an explicit 0 share stays 0 (not coerced to the total)', () => {
    const t = { payments: [], shares: [{ personId: 'a', amount: 0 }, { personId: 'b', amount: 9000 }] };
    expect(myShareOrTotal(t, 'a')).toBe(0);
  });

  it('myShareOrTotal: empty shares fall back to the payments side', () => {
    const t = { payments: [{ personId: 'a', amount: 5000 }], shares: [] };
    expect(myShareOrTotal(t, 'b')).toBe(5000);
  });

  it('myPaidOf: my payments-side amount', () => {
    expect(myPaidOf(txn, 'a')).toBe(9000);
    expect(myPaidOf(txn, 'b')).toBe(0);
  });

  it('txnTotal: payments first, shares fallback, zero when both empty', () => {
    expect(txnTotal(txn)).toBe(9000);
    expect(txnTotal({ payments: [], shares: txn.shares })).toBe(9000);
    expect(txnTotal({ payments: [], shares: [] })).toBe(0);
  });
});

describe('validateShares', () => {
  const shares = (...amts: number[]) => amts.map((amount, i) => ({ personId: `p${i}`, amount }));

  it('accepts a split that adds up exactly', () => {
    expect(validateShares(10000, shares(5000, 5000))).toEqual({ ok: true, assigned: 10000, delta: 0 });
  });

  it('rejects a short split and reports what is unassigned', () => {
    expect(validateShares(10000, shares(4000, 5000))).toEqual({ ok: false, assigned: 9000, delta: 1000 });
  });

  it('rejects an over-assigned split with a negative delta', () => {
    expect(validateShares(10000, shares(6000, 5000))).toEqual({ ok: false, assigned: 11000, delta: -1000 });
  });

  it('rejects an empty split rather than treating it as balanced', () => {
    expect(validateShares(10000, []).ok).toBe(false);
  });

  it('treats a zero-total expense with no shares as invalid', () => {
    // Guards the degenerate case where both sides are 0 and the sums "match".
    expect(validateShares(0, []).ok).toBe(false);
  });

  it('accepts a single-member split carrying the whole total', () => {
    expect(validateShares(7500, shares(7500)).ok).toBe(true);
  });

  it('agrees with what computeShares produces for every mode', () => {
    const base = { members, splitMembers: ['a', 'b', 'c'], total: 10000, exactAmounts: {}, percentages: {}, ratios: {} };
    for (const splitType of ['equal', 'percent', 'shares'] as const) {
      const s = computeShares({
        ...base,
        splitType,
        percentages: { a: '33', b: '33', c: '34' },
        ratios: { a: '1', b: '1', c: '1' },
      });
      expect(validateShares(10000, s).ok).toBe(true);
    }
  });

  it('catches the unbalanced exact split that splitByMode deliberately allows', () => {
    const s = computeShares({
      members, splitMembers: ['a', 'b', 'c'], splitType: 'exact', total: 10000,
      exactAmounts: { a: '30', b: '30', c: '30' }, percentages: {}, ratios: {},
    });
    expect(validateShares(10000, s)).toMatchObject({ ok: false, delta: 1000 });
  });
});

describe('computePayments', () => {
  it('defaults to me paying the full total when no explicit payers', () => {
    expect(computePayments({}, 'me', 10000)).toEqual([{ personId: 'me', amount: 10000 }]);
  });
  it('uses explicit non-zero payers', () => {
    expect(computePayments({ me: '40', b: '60' }, 'me', 10000)).toEqual([{ personId: 'me', amount: 4000 }, { personId: 'b', amount: 6000 }]);
  });
  it('returns [] with no current user', () => {
    expect(computePayments({}, undefined, 10000)).toEqual([]);
  });
});
