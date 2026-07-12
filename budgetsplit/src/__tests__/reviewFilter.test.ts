import {
  DEFAULT_FILTERS, filtersActive, parseFilterDate, rowMatches, isSimilarMerchant,
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
    expect(filtersActive(f({ category: 'Fuel' }))).toBe(true);
    expect(filtersActive(f({ amountMode: 'gt' }))).toBe(true);
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
  it('category is an exact match', () => {
    expect(rowMatches(row(), f({ category: 'Eating Out' }))).toBe(true);
    expect(rowMatches(row(), f({ category: 'Eating' }))).toBe(false);
  });
  it('amount less-than / greater-than (thresholds in rupees)', () => {
    expect(rowMatches(row({ amountPaise: 45000 }), f({ amountMode: 'lt', amtA: '500' }))).toBe(true);  // ₹450 < ₹500
    expect(rowMatches(row({ amountPaise: 45000 }), f({ amountMode: 'lt', amtA: '400' }))).toBe(false);
    expect(rowMatches(row({ amountPaise: 45000 }), f({ amountMode: 'gt', amtA: '400' }))).toBe(true);
    expect(rowMatches(row({ amountPaise: 45000 }), f({ amountMode: 'gt', amtA: '500' }))).toBe(false);
  });
  it('amount between is inclusive and tolerates swapped bounds', () => {
    expect(rowMatches(row({ amountPaise: 45000 }), f({ amountMode: 'between', amtA: '400', amtB: '500' }))).toBe(true);
    expect(rowMatches(row({ amountPaise: 45000 }), f({ amountMode: 'between', amtA: '500', amtB: '400' }))).toBe(true); // swapped
    expect(rowMatches(row({ amountPaise: 45000 }), f({ amountMode: 'between', amtA: '100', amtB: '400' }))).toBe(false);
    expect(rowMatches(row({ amountPaise: 40000 }), f({ amountMode: 'between', amtA: '400', amtB: '500' }))).toBe(true); // == lower bound
  });
  it('date range is inclusive of the whole to-day', () => {
    const on15 = row({ date: new Date(2026, 6, 15, 23, 30).getTime() });
    expect(rowMatches(on15, f({ dateFrom: '2026-07-15', dateTo: '2026-07-15' }))).toBe(true);  // same day, late — still in
    expect(rowMatches(on15, f({ dateFrom: '2026-07-16' }))).toBe(false);
    expect(rowMatches(on15, f({ dateTo: '2026-07-14' }))).toBe(false);
  });
});

describe('rowMatches — AND / OR combine', () => {
  const r = row({ category: 'Eating Out', amountPaise: 45000 });
  it('AND requires every active predicate', () => {
    expect(rowMatches(r, f({ combine: 'and', category: 'Eating Out', amountMode: 'gt', amtA: '400' }))).toBe(true);
    expect(rowMatches(r, f({ combine: 'and', category: 'Eating Out', amountMode: 'gt', amtA: '500' }))).toBe(false); // amount fails
  });
  it('OR needs only one active predicate', () => {
    expect(rowMatches(r, f({ combine: 'or', category: 'Fuel', amountMode: 'gt', amtA: '400' }))).toBe(true);  // amount passes
    expect(rowMatches(r, f({ combine: 'or', category: 'Fuel', amountMode: 'gt', amtA: '500' }))).toBe(false); // neither passes
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
