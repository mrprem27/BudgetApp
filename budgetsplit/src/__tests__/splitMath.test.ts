import { computeShares, computePayments } from '../lib/splitMath';
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
