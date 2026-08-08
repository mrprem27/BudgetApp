import { budgetMonthlyEquivalent, getPeriodRange } from '../lib/budget';

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

// getPriorPeriodRange's tests went with it — it existed only to compute the
// previous period's unused budget for group-level carry-over, which was removed
// (nothing ever wrote budget_group.limit_*, so it could not run).

/**
 * `budgetMonthlyEquivalent` and `recurringMonthlyEquivalent` are near-identical in shape and
 * deliberately disagree: a `once` budget is a cap on a single purchase, so counting it as a
 * monthly commitment would inflate the headline every month forever. The budget editor used
 * to define its own private copy while the group Budget tab imported the *recurring* one —
 * so the same pair of screens could report two different monthly totals for one dataset.
 */
describe('budgetMonthlyEquivalent', () => {
  it('passes monthly through unchanged', () => {
    expect(budgetMonthlyEquivalent('monthly', 500000)).toBe(500000);
  });

  it('multiplies daily by 30', () => {
    expect(budgetMonthlyEquivalent('daily', 10000)).toBe(300000);
  });

  it('divides yearly by 12, rounded to whole paise', () => {
    expect(budgetMonthlyEquivalent('yearly', 1200000)).toBe(100000);
    // 100 paise / 12 = 8.33 → must land on an integer, never a fraction.
    expect(budgetMonthlyEquivalent('yearly', 100)).toBe(8);
    expect(Number.isInteger(budgetMonthlyEquivalent('yearly', 99999))).toBe(true);
  });

  it('returns 0 for a one-time budget — the whole reason this is not the recurring helper', () => {
    expect(budgetMonthlyEquivalent('once', 999999)).toBe(0);
  });

  it('handles zero and never returns a negative for a zero input', () => {
    for (const c of ['once', 'daily', 'monthly', 'yearly'] as const) {
      expect(budgetMonthlyEquivalent(c, 0)).toBe(0);
    }
  });
});
