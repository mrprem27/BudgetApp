import { largestRemainder, splitByPercent, splitByShares, splitEqual } from '../lib/money';
import { computePerPersonShares, computeAdjustedTotal, computeItemSubtotal, type LineItemDraft, type Adjustment } from '../lib/itemized';
import type { Person } from '../db/queries/persons';

/**
 * Parts must sum to the total. Every time, for every input.
 *
 * "Close enough" is not something money can be: parts that do not sum either
 * invent a paise or lose one, and then the app disagrees with itself about a
 * figure the user is looking at.
 *
 * The itemized bill is where this stopped being theoretical. Shares were scaled
 * by the adjustment ratio and rounded PER PERSON PER ITEM — an error of up to
 * half a paise each time — and the drift was then absorbed by a pass that could
 * move at most ±1 paise per member. With more items than members it could not
 * close, and the screen said "₹0.01 over-assigned" with every item already
 * assigned and no control anywhere that could change it. Save was dead, for good.
 */

const people = (n: number): Person[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, name: `P${i}`, avatar_color: '#000', is_me: i === 0 ? 1 : 0,
    email: null, mobile: null, upi_vpa: null, remote_uid: null, image_uri: null,
    receivable_state: 'expected' as const, receivable_state_at: null,
    trust_state: 'review' as const, trust_state_at: null,
  }));

const item = (rupees: string, qty: string, assignedTo: string[]): LineItemDraft =>
  ({ id: `i${rupees}${qty}${assignedTo.join()}`, name: 'x', qty, unitPrice: rupees, assignedTo });

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

describe('largestRemainder', () => {
  it('always sums to the total', () => {
    for (const total of [0, 1, 7, 99, 100000, 999999]) {
      for (const weights of [[1], [1, 1], [1, 1, 1], [3, 1], [1, 2, 3, 4], [7, 7, 7]]) {
        expect(largestRemainder(total, weights).reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });

  it('gives the spare paise to whoever was rounded down hardest', () => {
    // 100 across [1,1,1] is 33.33 each: two get 33 and one gets 34, and which one
    // is decided by the fraction rather than by array position — otherwise the
    // same person absorbs it on every bill, which over a year is a tilt.
    expect(largestRemainder(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(largestRemainder(10, [1, 8, 1])).toEqual([1, 8, 1]);
  });

  it('returns zeros rather than dividing by zero', () => {
    expect(largestRemainder(500, [0, 0])).toEqual([0, 0]);
  });
});

describe('splitByPercent', () => {
  it('is exact when the percentages total 100', () => {
    expect(splitByPercent(100000, [50, 50]).reduce((a, b) => a + b, 0)).toBe(100000);
    expect(splitByPercent(100000, [33, 33, 34]).reduce((a, b) => a + b, 0)).toBe(100000);
  });

  /**
   * The old version distributed the remainder unconditionally, so anything under
   * 100% added a spare paise to EVERY member. 50 + 40 of ₹1,000 came out as
   * ₹500.01 and ₹400.01, and the "still unassigned" figure read ₹99.98 for a gap
   * the user could see was ₹100.00.
   */
  it('hands back exactly what was asked for when they do not', () => {
    expect(splitByPercent(100000, [50, 40])).toEqual([50000, 40000]);
    expect(splitByPercent(100000, [33, 33, 33])).toEqual([33000, 33000, 33000]);
  });

  it('does not silently cap an over-100% split', () => {
    // Also the user's to reconcile. Quietly clamping would change numbers they
    // typed without telling them.
    expect(splitByPercent(100000, [60, 60])).toEqual([60000, 60000]);
  });
});

describe('splitEqual and splitByShares stay exact', () => {
  it.each([[1, 3], [100, 3], [1000, 7], [999999, 13]])(
    'splitEqual(%i, %i) sums to the total', (total, n) => {
      expect(splitEqual(total, n).reduce((a, b) => a + b, 0)).toBe(total);
    },
  );

  it.each([[100, [1, 1, 1]], [1000, [2, 3, 5]], [7, [1, 1, 1, 1, 1]]])(
    'splitByShares(%i, %p) sums to the total', (total, ratios) => {
      expect(splitByShares(total as number, ratios as number[]).reduce((a, b) => a + b, 0)).toBe(total);
    },
  );
});

describe('an itemized bill always adds up', () => {
  /**
   * The exact case that was unsaveable: four ₹100 dishes, three people on every
   * dish, 5% service. Subtotal 40000, total 42000, and the old per-item scaling
   * left 42001.
   */
  it('closes on four dishes, three people and a service charge', () => {
    const members = people(3);
    const ids = members.map(m => m.id);
    const items = [1, 2, 3, 4].map(n => item('100', '1', ids));
    // Distinct ids — `item()` keys off its arguments, and four identical dishes
    // would otherwise collide.
    items.forEach((it, i) => { it.id = `dish-${i}`; });
    const adjustments: Adjustment[] = [{ type: 'service', mode: 'percent', value: '5' }];

    const subtotal = items.reduce((s, i) => s + computeItemSubtotal(i), 0);
    const total = computeAdjustedTotal(subtotal, adjustments);
    expect(total).toBe(42000);

    expect(sum(computePerPersonShares(items, adjustments, members))).toBe(total);
  });

  /**
   * A sweep, because this class of bug is trivially fixed for one case and left
   * broken for the next. Every combination of item count, price, people and
   * adjustment must land exactly, or the save button is dead for that bill.
   */
  it.each([
    [5, '100', 3, '5'],
    [7, '199', 3, '5'],
    [12, '0.99', 2, '5'],
    [3, '33.33', 4, '12.5'],
    [9, '1', 7, '18'],
    [4, '1250.75', 5, '2.5'],
  ])('closes on %i items at ₹%s across %i people with %s%% added', (count, price, n, pct) => {
    const members = people(n);
    const ids = members.map(m => m.id);
    const items = Array.from({ length: count }, (_, i) => {
      const it = item(price, '1', ids);
      it.id = `it-${i}`;
      return it;
    });
    const adjustments: Adjustment[] = [{ type: 'service', mode: 'percent', value: pct }];

    const subtotal = items.reduce((s, i) => s + computeItemSubtotal(i), 0);
    const total = computeAdjustedTotal(subtotal, adjustments);

    expect(sum(computePerPersonShares(items, adjustments, members))).toBe(total);
  });

  it('closes with a discount as well as a charge', () => {
    const members = people(3);
    const ids = members.map(m => m.id);
    const items = [item('250', '1', ids), item('99.99', '2', ids)];
    const adjustments: Adjustment[] = [
      { type: 'service', mode: 'percent', value: '10' },
      { type: 'discount', mode: 'amount', value: '50' },
    ];
    const subtotal = items.reduce((s, i) => s + computeItemSubtotal(i), 0);
    expect(sum(computePerPersonShares(items, adjustments, members)))
      .toBe(computeAdjustedTotal(subtotal, adjustments));
  });

  it('leaves the shares SHORT while an item is unassigned', () => {
    // The gap is the thing the screen asks the user to close. Forcing the total
    // here would silently assign somebody a dish nobody picked.
    const members = people(2);
    const ids = members.map(m => m.id);
    const assigned = item('100', '1', ids);
    const orphan = item('60', '1', []);
    orphan.id = 'orphan';

    const shares = computePerPersonShares([assigned, orphan], [], members);
    expect(sum(shares)).toBe(10000);
    expect(sum(shares)).toBeLessThan(computeAdjustedTotal(16000, []));
  });

  it('gives nobody anything when nothing is assigned', () => {
    const members = people(3);
    const orphan = item('100', '1', []);
    expect(sum(computePerPersonShares([orphan], [], members))).toBe(0);
  });
});

/**
 * `largestRemainder` RENORMALISES — it hands out `total × wᵢ / Σw`. That is
 * exactly right when the bases already account for the whole subtotal, and
 * silently destructive when they do not.
 *
 * `splitItemBase` deliberately allows an `exact`/`percent` item to be under- or
 * over-assigned ("any shortfall/overage is the user's remainder to reconcile"),
 * so running the renormalising path over those bases rewrote what somebody
 * typed — and, worse, made the shares sum to the total, so the screen's
 * "you haven't assigned everything" guard never fired.
 */
describe('an itemized bill never rewrites the amounts you typed', () => {
  const member = (id: string) => ({ id, name: id }) as Person;
  const members = [member('a'), member('b')];
  // `qty` and `unitPrice` are the raw STRINGS the form holds, not paise.
  const item = (over: Record<string, unknown> = {}): LineItemDraft => ({
    id: 'i1', name: 'Pizza', qty: '1', unitPrice: '100',
    assignedTo: ['a', 'b'], splitMode: 'exact', splitValues: {},
    ...over,
  } as LineItemDraft);

  it('leaves an under-assigned exact split short instead of scaling it up', () => {
    // ₹100 item, ₹40 each typed. The gap is ₹20 and it must stay visible.
    const shares = computePerPersonShares(
      [item({ splitValues: { a: '40', b: '40' } })], [], members,
    );
    expect(shares).toEqual({ a: 4000, b: 4000 });
    expect(shares.a + shares.b).toBe(8000);   // NOT 10000
  });

  it('leaves an over-assigned exact split over instead of scaling it down', () => {
    const shares = computePerPersonShares(
      [item({ splitValues: { a: '60', b: '60' } })], [], members,
    );
    expect(shares).toEqual({ a: 6000, b: 6000 });
    expect(shares.a + shares.b).toBe(12000);  // NOT 10000
  });

  it('leaves a percent split that does not reach 100 short', () => {
    const shares = computePerPersonShares(
      [item({ splitMode: 'percent', splitValues: { a: '30', b: '30' } })], [], members,
    );
    expect(shares.a + shares.b).toBe(6000);   // 60% of ₹100, NOT ₹100
  });

  // The case renormalising exists for, and which must keep working: bases that
  // DO account for the subtotal still land exactly on the total.
  it('still lands exactly on the total when the split is complete', () => {
    const shares = computePerPersonShares(
      [item({ splitValues: { a: '50', b: '50' } })], [], members,
    );
    expect(shares.a + shares.b).toBe(10000);
  });

  it('still closes a bill with more items than members and an adjustment', () => {
    // The defect renormalising was introduced for: four ₹100 dishes three ways
    // with a 5% service charge used to come out 1 paise over and could not save.
    const three = [member('a'), member('b'), member('c')];
    const dishes = [1, 2, 3, 4].map(n => item({
      id: `i${n}`, assignedTo: ['a', 'b', 'c'], splitMode: 'equal', splitValues: {},
    }));
    const shares = computePerPersonShares(
      dishes, [{ type: 'service', mode: 'percent', value: '5' }] as Adjustment[], three,
    );
    expect(shares.a + shares.b + shares.c).toBe(42000);   // ₹400 + 5%
  });
});
