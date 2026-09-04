import {
  matchesFilters, applyFilters, filtersActive, resolveRange, NO_FILTERS, KIND_ANY,
  type FilterableTxn, type TxnFilters,
} from '../lib/txnFilter';

/**
 * `OV-34`. Three ledgers filtered three different ways and disagreed about what
 * filtering means: Personal offered group scope and **no text search at all**, the
 * group ledger searched `category + note`, and Search searched a much wider
 * haystack. So the same word found a row on one screen and not on another.
 *
 * These assert the union behaviour, which is Search's — the widest was also the
 * right one, because someone hunting a row types whatever they remember about it.
 */

const ME = 'me';
const AARAV = 'aarav';

function txn(over: Partial<FilterableTxn> = {}): FilterableTxn {
  return {
    kind: 'expense',
    date: Date.parse('2026-06-15T12:00:00Z'),
    category: 'Groceries',
    note: 'Big Bazaar',
    tags: null,
    payments: [{ personId: ME, amount: 120000 }],
    shares: [{ personId: ME, amount: 120000 }],
    ...over,
  };
}

const f = (over: Partial<TxnFilters> = {}): TxnFilters => ({ ...NO_FILTERS, ...over });

describe('nothing set matches everything', () => {
  it('is inactive and keeps the list intact', () => {
    expect(filtersActive(NO_FILTERS)).toBe(false);
    const rows = [txn(), txn({ kind: 'income' })];
    expect(applyFilters(rows, NO_FILTERS)).toHaveLength(2);
  });

  it('reports active for each field on its own', () => {
    expect(filtersActive(f({ query: 'x' }))).toBe(true);
    expect(filtersActive(f({ kind: 'income' }))).toBe(true);
    expect(filtersActive(f({ from: 1 }))).toBe(true);
    expect(filtersActive(f({ to: 1 }))).toBe(true);
    expect(filtersActive(f({ personId: AARAV }))).toBe(true);
    // Whitespace is not a query — otherwise a stray space claims the list is filtered.
    expect(filtersActive(f({ query: '   ' }))).toBe(false);
  });
});

describe('free text searches everything the user might remember', () => {
  it('matches the category and the note', () => {
    expect(matchesFilters(txn(), f({ query: 'grocer' }))).toBe(true);
    expect(matchesFilters(txn(), f({ query: 'bazaar' }))).toBe(true);
  });

  it('matches a tag — the group ledger could not', () => {
    const t = txn({ tags: '["goa-trip","reimbursable"]' });
    expect(matchesFilters(t, f({ query: 'goa' }))).toBe(true);
  });

  it('matches the amount with or without the separator', () => {
    // ₹1,200 typed either way. Search folded both spellings in; the others had
    // no amount in the haystack at all.
    expect(matchesFilters(txn(), f({ query: '1200' }))).toBe(true);
    expect(matchesFilters(txn(), f({ query: '1,200' }))).toBe(true);
  });

  it('is case-insensitive and ignores surrounding space', () => {
    expect(matchesFilters(txn(), f({ query: '  BAZAAR ' }))).toBe(true);
  });

  it('does not match what is not there', () => {
    expect(matchesFilters(txn(), f({ query: 'petrol' }))).toBe(false);
  });

  it('survives a row with no note and no tags', () => {
    const bare = txn({ note: null, tags: null });
    expect(matchesFilters(bare, f({ query: 'grocer' }))).toBe(true);
    expect(matchesFilters(bare, f({ query: 'null' }))).toBe(false);
  });
});

describe('kind', () => {
  it('keeps every kind on "all"', () => {
    for (const k of ['expense', 'income', 'settlement']) {
      expect(matchesFilters(txn({ kind: k }), f({ kind: KIND_ANY }))).toBe(true);
    }
  });

  it('narrows to one', () => {
    expect(matchesFilters(txn({ kind: 'income' }), f({ kind: 'income' }))).toBe(true);
    expect(matchesFilters(txn({ kind: 'expense' }), f({ kind: 'income' }))).toBe(false);
  });
});

describe('date range', () => {
  const june15 = Date.parse('2026-06-15T12:00:00Z');

  it('is inclusive at both ends', () => {
    expect(matchesFilters(txn({ date: june15 }), f({ from: june15, to: june15 }))).toBe(true);
  });

  it('excludes either side of the bounds', () => {
    expect(matchesFilters(txn({ date: june15 - 1 }), f({ from: june15 }))).toBe(false);
    expect(matchesFilters(txn({ date: june15 + 1 }), f({ to: june15 }))).toBe(false);
  });

  it('treats one bound as open-ended on the other side', () => {
    expect(matchesFilters(txn({ date: 0 }), f({ to: june15 }))).toBe(true);
    expect(matchesFilters(txn({ date: june15 * 2 }), f({ from: june15 }))).toBe(true);
  });
});

/**
 * The person filter is the one field that existed on **no** surface, and the
 * question it answers is "show me everything involving Aarav" — which is both the
 * dinner he paid for and the one he ate. Splitting those in two would make the user
 * know which side of a transaction someone was on before they could find it.
 */
describe('person', () => {
  const paidByAarav = txn({ payments: [{ personId: AARAV, amount: 120000 }], shares: [{ personId: ME, amount: 120000 }] });
  const eatenByAarav = txn({ payments: [{ personId: ME, amount: 120000 }], shares: [{ personId: AARAV, amount: 60000 }, { personId: ME, amount: 60000 }] });

  it('matches when they paid', () => {
    expect(matchesFilters(paidByAarav, f({ personId: AARAV }))).toBe(true);
  });

  it('matches when they only consumed', () => {
    expect(matchesFilters(eatenByAarav, f({ personId: AARAV }))).toBe(true);
  });

  it('excludes an entry they are not on at all', () => {
    expect(matchesFilters(txn(), f({ personId: AARAV }))).toBe(false);
  });
});

describe('fields combine with AND', () => {
  it('needs every set field to match', () => {
    const t = txn({ kind: 'expense', category: 'Groceries' });
    expect(matchesFilters(t, f({ kind: 'expense', query: 'grocer' }))).toBe(true);
    // Right text, wrong kind.
    expect(matchesFilters(t, f({ kind: 'income', query: 'grocer' }))).toBe(false);
    // Right kind, wrong person.
    expect(matchesFilters(t, f({ kind: 'expense', personId: AARAV }))).toBe(false);
  });
});

/**
 * Presets exist because "last month" is what people ask for, and expressing it as
 * two dates is arithmetic they should not have to do. `now` is injected because
 * every date-sensitive thing here is run across seven pinned dates.
 */
describe('range presets', () => {
  // A Monday in the middle of a 30-day month, so nothing is accidentally right.
  const now = new Date(2026, 5, 15, 14, 30).getTime(); // 15 June 2026

  it('has no bounds for any-time or custom', () => {
    expect(resolveRange('any', now)).toEqual({ from: null, to: null });
    // Custom means "the caller supplies them", so the preset itself contributes none.
    expect(resolveRange('custom', now)).toEqual({ from: null, to: null });
  });

  it('counts 7 days inclusive of today, not 8', () => {
    const { from, to } = resolveRange('7d', now);
    expect(new Date(from!).getDate()).toBe(9);
    expect(new Date(to!).getDate()).toBe(15);
    // Whole days at both ends: an entry at 00:00 today and one at 23:59 both land.
    expect(new Date(from!).getHours()).toBe(0);
    expect(new Date(to!).getHours()).toBe(23);
  });

  it('counts 30 days inclusive', () => {
    const { from } = resolveRange('30d', now);
    expect(new Date(from!).getMonth()).toBe(4);   // May
    expect(new Date(from!).getDate()).toBe(17);
  });

  it('runs this month from the 1st to now', () => {
    const { from, to } = resolveRange('thisMonth', now);
    expect(new Date(from!).getDate()).toBe(1);
    expect(new Date(from!).getMonth()).toBe(5);
    expect(new Date(to!).getDate()).toBe(15);
  });

  it('covers all of last month, whatever its length', () => {
    const { from, to } = resolveRange('lastMonth', now);
    expect(new Date(from!).getMonth()).toBe(4);   // May
    expect(new Date(from!).getDate()).toBe(1);
    expect(new Date(to!).getDate()).toBe(31);     // May has 31
  });

  it('rolls the year back in January', () => {
    const jan = new Date(2026, 0, 10).getTime();
    const { from, to } = resolveRange('lastMonth', jan);
    expect(new Date(from!).getFullYear()).toBe(2025);
    expect(new Date(from!).getMonth()).toBe(11);  // December
    expect(new Date(to!).getDate()).toBe(31);
  });

  it('gets February right in a leap year and out of one', () => {
    // Day 0 of March is the last day of February, which is why this needs no
    // month-length table.
    const mar2028 = new Date(2028, 2, 5).getTime();   // 2028 is a leap year
    expect(new Date(resolveRange('lastMonth', mar2028).to!).getDate()).toBe(29);
    const mar2026 = new Date(2026, 2, 5).getTime();
    expect(new Date(resolveRange('lastMonth', mar2026).to!).getDate()).toBe(28);
  });
});
