import { splitItemBase, computePerPersonShares, type LineItemDraft } from '../lib/itemized';
import type { Person } from '../db/queries/persons';

const P = (id: string): Person => ({ id, name: id, avatar_color: '#000', is_me: 0, email: null } as Person);
const members = [P('a'), P('b'), P('c')];

const item = (over: Partial<LineItemDraft>): LineItemDraft => ({
  id: 'i', name: 'X', qty: '1', unitPrice: '300', assignedTo: ['a', 'b', 'c'], ...over,
});

describe('splitItemBase', () => {
  it('equal splits the base evenly (remainder to the front)', () => {
    expect(splitItemBase(item({ splitMode: 'equal' }), 300)).toEqual({ a: 100, b: 100, c: 100 });
    expect(splitItemBase(item({ splitMode: 'equal' }), 301)).toEqual({ a: 101, b: 100, c: 100 });
  });

  it('exact reads per-member ₹ inputs directly', () => {
    const out = splitItemBase(item({ splitMode: 'exact', splitValues: { a: '1.50', b: '1', c: '0.50' } }), 300);
    expect(out).toEqual({ a: 150, b: 100, c: 50 });
  });

  it('percent splits by per-member percentages (exact-sum via largest-remainder)', () => {
    const out = splitItemBase(item({ splitMode: 'percent', splitValues: { a: '50', b: '25', c: '25' } }), 300);
    expect(out.a + out.b + out.c).toBe(300);
    expect(out.a).toBe(150);
  });

  it('shares splits by per-member share counts', () => {
    const out = splitItemBase(item({ splitMode: 'shares', splitValues: { a: '2', b: '1', c: '1' } }), 400);
    expect(out).toEqual({ a: 200, b: 100, c: 100 });
  });

  it('defaults to equal when no mode set, and returns {} for no assignees', () => {
    expect(splitItemBase(item({}), 300)).toEqual({ a: 100, b: 100, c: 100 });
    expect(splitItemBase(item({ assignedTo: [] }), 300)).toEqual({});
  });
});

describe('computePerPersonShares with modes', () => {
  it('mixes an equal item and a percent item and sums to the bill total', () => {
    const items: LineItemDraft[] = [
      item({ id: '1', unitPrice: '300', assignedTo: ['a', 'b', 'c'], splitMode: 'equal' }),
      item({ id: '2', unitPrice: '200', assignedTo: ['a', 'b'], splitMode: 'percent', splitValues: { a: '75', b: '25' } }),
    ];
    const shares = computePerPersonShares(items, [], members);
    expect(shares.a + shares.b + shares.c).toBe(50000); // ₹500 in paise
    expect(shares.a).toBe(100_00 + 150_00); // 100 equal + 150 (75% of 200)
    expect(shares.b).toBe(100_00 + 50_00);
    expect(shares.c).toBe(100_00);
  });

  it('applies a tax adjustment proportionally across modes', () => {
    const items: LineItemDraft[] = [
      item({ id: '1', unitPrice: '1000', assignedTo: ['a', 'b'], splitMode: 'exact', splitValues: { a: '600', b: '400' } }),
    ];
    const shares = computePerPersonShares(items, [{ label: 'GST', type: 'tax', mode: 'percent', value: '10' }], members);
    // ₹1000 + 10% = ₹1100 total, split 60/40 → 660 / 440
    expect(shares.a + shares.b + shares.c).toBe(110000);
    expect(shares.a).toBe(66000);
    expect(shares.b).toBe(44000);
  });
});
