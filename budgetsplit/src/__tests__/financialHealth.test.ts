import { computeHealthScore } from '../lib/financialHealth';

describe('computeHealthScore', () => {
  it('rates a healthy profile as great', () => {
    const r = computeHealthScore({ budgetUtilizationPct: 70, savingsRatePct: 25, netOwed: 0, income: 100000 });
    expect(r.score).toBe(100);
    expect(r.band).toBe('great');
  });

  it('penalizes overspend, low savings and debt', () => {
    const r = computeHealthScore({ budgetUtilizationPct: 130, savingsRatePct: -5, netOwed: 50000, income: 100000 });
    expect(r.score).toBeLessThan(40);
    expect(r.band).toBe('poor');
  });

  it('handles no budget / no income neutrally', () => {
    const r = computeHealthScore({ budgetUtilizationPct: null, savingsRatePct: null, netOwed: 0, income: 0 });
    expect(r.score).toBe(28 + 12 + 25);
    expect(r.band).toBe('good');
  });

  it('clamps to 0–100', () => {
    const r = computeHealthScore({ budgetUtilizationPct: 50, savingsRatePct: 50, netOwed: -100, income: 100000 });
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});
