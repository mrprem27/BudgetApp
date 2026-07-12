import { getPeriodRange, getPriorPeriodRange } from '../lib/budget';

// Local-time ms helper (budget.ts uses date-fns, which works in local time).
const at = (y: number, m: number, d: number, h = 0, mi = 0, s = 0, ms = 0) =>
  new Date(y, m, d, h, mi, s, ms).getTime();

describe('getPeriodRange', () => {
  it('daily spans local midnight to 23:59:59.999', () => {
    const { from, to } = getPeriodRange('daily', new Date(2026, 5, 15, 13, 30));
    expect(from).toBe(at(2026, 5, 15));
    expect(to).toBe(at(2026, 5, 15, 23, 59, 59, 999));
  });

  it('monthly spans the first to the last day of the month (Feb 2026 = 28 days)', () => {
    const { from, to } = getPeriodRange('monthly', new Date(2026, 1, 10));
    expect(from).toBe(at(2026, 1, 1));
    expect(to).toBe(at(2026, 1, 28, 23, 59, 59, 999));
  });

  it('yearly spans Jan 1 to Dec 31', () => {
    const { from, to } = getPeriodRange('yearly', new Date(2026, 7, 20));
    expect(from).toBe(at(2026, 0, 1));
    expect(to).toBe(at(2026, 11, 31, 23, 59, 59, 999));
  });
});

describe('getPriorPeriodRange', () => {
  it('daily → the previous day', () => {
    const { from, to } = getPriorPeriodRange('daily', new Date(2026, 5, 15, 9));
    expect(from).toBe(at(2026, 5, 14));
    expect(to).toBe(at(2026, 5, 14, 23, 59, 59, 999));
  });

  it('monthly → previous month, crossing the year boundary (Jan → prior Dec)', () => {
    const { from, to } = getPriorPeriodRange('monthly', new Date(2026, 0, 10));
    expect(from).toBe(at(2025, 11, 1));
    expect(to).toBe(at(2025, 11, 31, 23, 59, 59, 999));
  });

  it('yearly → the previous year', () => {
    const { from, to } = getPriorPeriodRange('yearly', new Date(2026, 5, 1));
    expect(from).toBe(at(2025, 0, 1));
    expect(to).toBe(at(2025, 11, 31, 23, 59, 59, 999));
  });
});
