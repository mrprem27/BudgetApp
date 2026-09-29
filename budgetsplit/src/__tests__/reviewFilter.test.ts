import {
  DEFAULT_FILTERS, filtersActive, parseFilterDate, rowMatches, isSimilarMerchant, normalizeFilters,
  type ReviewFilters, type FilterRow,
} from '../lib/reviewFilter';

const f = (over: Partial<ReviewFilters> = {}): ReviewFilters => ({ ...DEFAULT_FILTERS, ...over });
const row = (over: Partial<FilterRow> = {}): FilterRow => ({
  description: 'Swiggy order', category: 'Eating Out', amountPaise: 45000, date: new Date(2026, 6, 15, 12, 0).getTime(), ...over,
});

describe('filtersActive', () => {
  it('is false for defaults', () => {
    expect(filtersActive(DEFAULT_FILTERS)).toBe(false);
    expect(filtersActive(f({ query: '   ' }))).toBe(false); // whitespace only
  });
  it('is true when any field is set', () => {
    expect(filtersActive(f({ query: 'a' }))).toBe(true);
    expect(filtersActive(f({ categories: ['Fuel'] }))).toBe(true);
    expect(filtersActive(f({ amountMin: '100' }))).toBe(true);
    expect(filtersActive(f({ amountMax: '900' }))).toBe(true);
    expect(filtersActive(f({ dateFrom: '2026-07-01' }))).toBe(true);
    expect(filtersActive(f({ dateTo: '2026-07-31' }))).toBe(true);
  });
});

describe('parseFilterDate', () => {
  it('parses a bare date to start or end of day', () => {
    const start = parseFilterDate('2026-07-15', false)!;
    const end = parseFilterDate('2026-07-15', true)!;
    const s = new Date(start), e = new Date(end);
    expect([s.getHours(), s.getMinutes(), s.getSeconds()]).toEqual([0, 0, 0]);
    expect([e.getHours(), e.getMinutes(), e.getSeconds()]).toEqual([23, 59, 59]);
    expect(end).toBeGreaterThan(start);
  });
  it('honors an explicit time (space or T separator)', () => {
    const a = new Date(parseFilterDate('2026-07-15 09:30', false)!);
    const b = new Date(parseFilterDate('2026-07-15T09:30', true)!);
    expect([a.getHours(), a.getMinutes()]).toEqual([9, 30]);
    expect([b.getHours(), b.getMinutes()]).toEqual([9, 30]);
  });
  it('returns null for garbage', () => {
    expect(parseFilterDate('', false)).toBeNull();
    expect(parseFilterDate('15/07/2026', false)).toBeNull();
    expect(parseFilterDate('2026-13-40', false)).toBeNull(); // invalid month/day
  });
});

describe('rowMatches — single predicate', () => {
  it('no active filter → always matches', () => {
    expect(rowMatches(row(), DEFAULT_FILTERS)).toBe(true);
  });
  it('name query is case-insensitive substring', () => {
    expect(rowMatches(row(), f({ query: 'swig' }))).toBe(true);
    expect(rowMatches(row(), f({ query: 'ZOMATO' }))).toBe(false);
  });
  it('category is an exact match, and several mean "any of"', () => {
    expect(rowMatches(row(), f({ categories: ['Eating Out'] }))).toBe(true);
    expect(rowMatches(row(), f({ categories: ['Eating'] }))).toBe(false);
    expect(rowMatches(row(), f({ categories: ['Fuel', 'Eating Out'] }))).toBe(true);
    expect(rowMatches(row(), f({ categories: ['Fuel', 'Rent'] }))).toBe(false);
  });
  it('a lone Min is "at least" and a lone Max is "at most" (rupees, inclusive)', () => {
    const r = row({ amountPaise: 45000 }); // ₹450
    expect(rowMatches(r, f({ amountMin: '400' }))).toBe(true);
    expect(rowMatches(r, f({ amountMin: '450' }))).toBe(true);   // == bound
    expect(rowMatches(r, f({ amountMin: '500' }))).toBe(false);
    expect(rowMatches(r, f({ amountMax: '500' }))).toBe(true);
    expect(rowMatches(r, f({ amountMax: '450' }))).toBe(true);   // == bound
    expect(rowMatches(r, f({ amountMax: '400' }))).toBe(false);
  });
  it('both Min and Max is between, inclusive, tolerating swapped ends', () => {
    expect(rowMatches(row({ amountPaise: 45000 }), f({ amountMin: '400', amountMax: '500' }))).toBe(true);
    expect(rowMatches(row({ amountPaise: 45000 }), f({ amountMin: '500', amountMax: '400' }))).toBe(true); // swapped
    expect(rowMatches(row({ amountPaise: 45000 }), f({ amountMin: '100', amountMax: '400' }))).toBe(false);
    expect(rowMatches(row({ amountPaise: 40000 }), f({ amountMin: '400', amountMax: '500' }))).toBe(true); // == lower bound
  });
  it('both ends empty is no amount filter', () => {
    expect(rowMatches(row({ amountPaise: 1 }), f({ amountMin: '', amountMax: '  ' }))).toBe(true);
  });
  it('date range is inclusive of the whole to-day', () => {
    const on15 = row({ date: new Date(2026, 6, 15, 23, 30).getTime() });
    expect(rowMatches(on15, f({ dateFrom: '2026-07-15', dateTo: '2026-07-15' }))).toBe(true);  // same day, late — still in
    expect(rowMatches(on15, f({ dateFrom: '2026-07-16' }))).toBe(false);
    expect(rowMatches(on15, f({ dateTo: '2026-07-14' }))).toBe(false);
  });
});

describe('rowMatches — every filter narrows', () => {
  const r = row({ category: 'Eating Out', amountPaise: 45000 });
  it('requires every active filter to pass', () => {
    expect(rowMatches(r, f({ categories: ['Eating Out'], amountMin: '400' }))).toBe(true);
    expect(rowMatches(r, f({ categories: ['Eating Out'], amountMin: '500' }))).toBe(false); // amount fails
    expect(rowMatches(r, f({ categories: ['Fuel'], amountMin: '400' }))).toBe(false);       // category fails
  });
});

describe('normalizeFilters — saved views from before the rewrite', () => {
  it('maps the old amount modes onto Min/Max', () => {
    expect(normalizeFilters({ amountMode: 'gt', amtA: '400' })).toMatchObject({ amountMin: '400', amountMax: '' });
    expect(normalizeFilters({ amountMode: 'lt', amtA: '500' })).toMatchObject({ amountMin: '', amountMax: '500' });
    expect(normalizeFilters({ amountMode: 'between', amtA: '400', amtB: '500' })).toMatchObject({ amountMin: '400', amountMax: '500' });
    expect(normalizeFilters({ amountMode: 'any', amtA: '9' })).toMatchObject({ amountMin: '', amountMax: '' });
  });
  it('turns the single category into a list', () => {
    expect(normalizeFilters({ category: 'Fuel' }).categories).toEqual(['Fuel']);
    expect(normalizeFilters({ category: '' }).categories).toEqual([]);
  });
  it('keeps text and dates, drops combine, and survives junk', () => {
    const n = normalizeFilters({ query: 'x', dateFrom: '2026-07-01', dateTo: '2026-07-31', combine: 'or' });
    expect(n).toEqual({ ...DEFAULT_FILTERS, query: 'x', dateFrom: '2026-07-01', dateTo: '2026-07-31' });
    expect(normalizeFilters(null)).toEqual(DEFAULT_FILTERS);
    expect(normalizeFilters({})).toEqual(DEFAULT_FILTERS);
  });
  it('leaves a current-shape filter unchanged', () => {
    const cur = { ...DEFAULT_FILTERS, categories: ['A', 'B'], amountMin: '1', amountMax: '2' };
    expect(normalizeFilters(cur)).toEqual(cur);
  });
});

describe('isSimilarMerchant', () => {
  it('matches on a shared salient word', () => {
    expect(isSimilarMerchant('PVR LIMITED', 'PVR Cinemas Forum')).toBe(true);
    expect(isSimilarMerchant('Swiggy order', 'SWIGGY Instamart')).toBe(true);
  });
  it('does not match unrelated merchants', () => {
    expect(isSimilarMerchant('Swiggy order', 'Uber ride')).toBe(false);
  });
  it('word-less / empty descriptions never match', () => {
    expect(isSimilarMerchant('', 'Swiggy')).toBe(false);
    expect(isSimilarMerchant('a to', 'a to')).toBe(false); // only stopwords / short tokens
  });
});
