import { getPeriodRange } from '../lib/budget';

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
