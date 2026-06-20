import { parseToPaise, splitEqual, splitByPercent, splitByShares, formatRupees, formatRupeesShort, formatCompact, formatCompactMajor } from '../lib/money';

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

describe('formatCompactMajor (major units)', () => {
  it('keeps values under 1000 as grouped integers', () => {
    expect(formatCompactMajor(999)).toBe('₹999');
    expect(formatCompactMajor(0)).toBe('₹0');
  });
  it('uses the Indian scale for INR (K / L / Cr) with up to 2 decimals', () => {
    expect(formatCompactMajor(1240)).toBe('₹1.24K');
    expect(formatCompactMajor(120000)).toBe('₹1.2L');
    expect(formatCompactMajor(34000000)).toBe('₹3.4Cr');
  });
  it('drops trailing zeros after the decimal', () => {
    expect(formatCompactMajor(1000)).toBe('₹1K');
    expect(formatCompactMajor(100000)).toBe('₹1L');
    expect(formatCompactMajor(52000)).toBe('₹52K');
  });
  it('uses the international scale for non-INR (K / M / B)', () => {
    expect(formatCompactMajor(3_400_000, 'USD')).toBe('$3.4M');
    expect(formatCompactMajor(2_000_000_000, 'USD')).toBe('$2B');
    expect(formatCompactMajor(120000, 'USD')).toBe('$120K');
  });
  it('is negative- and non-finite-safe', () => {
    expect(formatCompactMajor(-1240)).toBe('-₹1.24K');
    expect(formatCompactMajor(NaN)).toBe('₹0');
    expect(formatCompactMajor(Infinity)).toBe('₹0');
  });
});

describe('formatCompact (smallest unit / paise)', () => {
  it('abbreviates paise after converting to rupees', () => {
    expect(formatCompact(124000)).toBe('₹1.24K');       // ₹1,240
    expect(formatCompact(12000000)).toBe('₹1.2L');      // ₹1,20,000
    expect(formatCompact(99900)).toBe('₹999');          // ₹999
  });
  it('handles cents for non-INR', () => {
    expect(formatCompact(340000000, 'USD')).toBe('$3.4M'); // $3,400,000
  });
});
