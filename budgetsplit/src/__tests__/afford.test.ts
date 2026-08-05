import { evaluateAfford, AffordVerdict, AffordReason, incomeSharePct } from '../lib/afford';

describe('evaluateAfford — cash axis', () => {
  it('is comfortable when plenty remains above the safety buffer', () => {
    const r = evaluateAfford({ amount: 1000, available: 10000, upcomingBills: 0 });
    expect(r.verdict).toBe(AffordVerdict.Comfortable);
    expect(r.freeToSpend).toBe(10000);
    expect(r.remaining).toBe(9000);
    expect(r.reasons).toContain(AffordReason.Healthy);
  });

  it('subtracts upcoming bills before deciding', () => {
    const r = evaluateAfford({ amount: 3000, available: 10000, upcomingBills: 6000 });
    expect(r.freeToSpend).toBe(4000);
    expect(r.remaining).toBe(1000);
    // 1000 < 15% buffer (1500) → tight via thin buffer
    expect(r.verdict).toBe(AffordVerdict.Tight);
    expect(r.reasons).toContain(AffordReason.ThinBuffer);
  });

  it('says no when the purchase exceeds free-to-spend', () => {
    const r = evaluateAfford({ amount: 5000, available: 10000, upcomingBills: 6000 });
    expect(r.verdict).toBe(AffordVerdict.No);
    expect(r.remaining).toBe(-1000);
    expect(r.reasons).toContain(AffordReason.CashShort);
  });

  it('ignores negative bills', () => {
    expect(evaluateAfford({ amount: 1000, available: 5000, upcomingBills: -100 }).freeToSpend).toBe(5000);
  });
});

describe('evaluateAfford — category axis', () => {
  it('flags going over an explicit category budget', () => {
    const r = evaluateAfford({
      amount: 4000, available: 100000, upcomingBills: 0,
      category: { name: 'Dining', spentThisMonth: 7000, norm: 8000, budget: 10000 },
    });
    expect(r.reasons).toContain(AffordReason.OverCategoryBudget);
    expect(r.verdict).toBe(AffordVerdict.Tight); // affordable, but over budget
    expect(r.categoryAfter).toBe(11000);
    expect(r.categoryCap).toBe(10000);
  });

  it('falls back to your own norm (with tolerance) when no budget is set', () => {
    // norm 5000 → cap 5750; spent 4000 + buy 3000 = 7000 > 5750
    const r = evaluateAfford({
      amount: 3000, available: 100000, upcomingBills: 0,
      category: { name: 'Coffee', spentThisMonth: 4000, norm: 5000 },
    });
    expect(r.reasons).toContain(AffordReason.AboveCategoryNorm);
    expect(r.categoryCap).toBe(5750);
  });

  it('stays comfortable inside the norm tolerance band', () => {
    const r = evaluateAfford({
      amount: 500, available: 100000, upcomingBills: 0,
      category: { name: 'Coffee', spentThisMonth: 4000, norm: 5000 },
    });
    expect(r.reasons).not.toContain(AffordReason.AboveCategoryNorm);
    expect(r.verdict).toBe(AffordVerdict.Comfortable);
  });
});

describe('evaluateAfford — income share axis', () => {
  it('flags a purchase that is a large slice of monthly income', () => {
    const r = evaluateAfford({
      amount: 15000, available: 1000000, upcomingBills: 0, monthlyIncome: 100000,
    });
    expect(r.incomeShare).toBeCloseTo(0.15);
    expect(r.reasons).toContain(AffordReason.LargeIncomeShare);
    expect(r.verdict).toBe(AffordVerdict.Tight);
  });

  it('does not flag a small slice of income', () => {
    const r = evaluateAfford({
      amount: 5000, available: 1000000, upcomingBills: 0, monthlyIncome: 100000,
    });
    expect(r.reasons).not.toContain(AffordReason.LargeIncomeShare);
    expect(r.verdict).toBe(AffordVerdict.Comfortable);
  });
});

describe('evaluateAfford — combined', () => {
  it('cash short dominates and is listed first', () => {
    const r = evaluateAfford({
      amount: 200000, available: 100000, upcomingBills: 0, monthlyIncome: 100000,
      category: { name: 'Gadgets', spentThisMonth: 0, norm: 1000, budget: 2000 },
    });
    expect(r.verdict).toBe(AffordVerdict.No);
    expect(r.reasons[0]).toBe(AffordReason.CashShort);
  });
});

describe('incomeSharePct', () => {
  it('renders a normal share as a rounded percentage', () => {
    // ₹5,000 against ₹85,000/month — the case UX_AUDIT reported as 417%.
    expect(incomeSharePct(500000 / 8500000)).toBe('6%');
  });

  it('still prints a merely-large share, because that can be real', () => {
    // 417% was the figure UX_AUDIT reported. The cap is deliberately NOT what
    // fixes it — a purchase really can exceed a month's income, so suppressing
    // this would hide a true answer. What fixes it is the denominator
    // (`incomeSource: 'rule'` over a 30-day sample) and the honest label.
    expect(incomeSharePct(4.17)).toBe('417%');
  });

  it('caps a share so absurd the denominator cannot be an income', () => {
    expect(incomeSharePct(50)).toBe('>999%');
  });

  it('renders nothing meaningful for absent or zero input', () => {
    expect(incomeSharePct(undefined)).toBe('—');
    expect(incomeSharePct(0)).toBe('—');
    expect(incomeSharePct(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('keeps a share just under the cap exact', () => {
    expect(incomeSharePct(9.99)).toBe('999%');
  });
});
