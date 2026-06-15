import { parseToPaise, splitEqual, splitByPercent, splitByShares, formatRupees, formatRupeesShort } from '../lib/money';

describe('parseToPaise', () => {
  it('parses rupee strings to paise', () => {
    expect(parseToPaise('1500.50')).toBe(150050);
    expect(parseToPaise('₹1,500')).toBe(150000);
    expect(parseToPaise('100')).toBe(10000);
  });
  it('returns 0 for empty / invalid', () => {
    expect(parseToPaise('')).toBe(0);
    expect(parseToPaise('abc')).toBe(0);
  });
});

describe('splitEqual', () => {
  it('sums exactly to the total, remainder to earliest', () => {
    expect(splitEqual(1000, 3)).toEqual([334, 333, 333]);
    expect(splitEqual(1000, 3).reduce((a, b) => a + b, 0)).toBe(1000);
  });
  it('handles n = 0', () => {
    expect(splitEqual(1000, 0)).toEqual([]);
  });
  it('divides evenly when possible', () => {
    expect(splitEqual(900, 3)).toEqual([300, 300, 300]);
  });
});

describe('splitByPercent', () => {
  it('applies percentages and sums to total', () => {
    expect(splitByPercent(1000, [50, 30, 20])).toEqual([500, 300, 200]);
  });
  it('distributes rounding remainder so the sum is exact', () => {
    const r = splitByPercent(1000, [33, 33, 34]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(1000);
  });
});

describe('splitByShares', () => {
  it('splits by ratio summing to total', () => {
    expect(splitByShares(1000, [2, 1, 1])).toEqual([500, 250, 250]);
    expect(splitByShares(1000, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(1000);
  });
  it('handles all-zero ratios', () => {
    expect(splitByShares(1000, [0, 0])).toEqual([0, 0]);
  });
});

describe('formatting', () => {
  it('formatRupees keeps two decimals', () => {
    expect(formatRupees(150050)).toBe('₹1,500.50');
    expect(formatRupees(0)).toBe('₹0.00');
  });
  it('formatRupeesShort rounds to whole rupees', () => {
    expect(formatRupeesShort(150050)).toBe('₹1,501');
    expect(formatRupeesShort(149949)).toBe('₹1,499');
  });
});
