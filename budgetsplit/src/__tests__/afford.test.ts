import {
  evaluateAfford, AffordVerdict, AffordReason, AffordNecessity, incomeSharePct,
} from '../lib/afford';

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

describe('evaluateAfford — recurring purchases judge the monthly rate, not the one-off amount', () => {
  it('a small recurring habit can blow the category budget even though the single charge looks fine', () => {
    // ₹500 alone is nowhere near the ₹10,000 budget — but ~₹2,166/month is.
    const r = evaluateAfford({
      amount: 500, available: 100000, upcomingBills: 0,
      recurringMonthlyEquivalent: 2166,
      category: { name: 'Subscriptions', spentThisMonth: 9000, norm: 0, budget: 10000 },
    });
    expect(r.reasons).toContain(AffordReason.OverCategoryBudget);
    expect(r.categoryAfter).toBe(9000 + 2166);
  });

  it('a one-off purchase of the same size does not trip the budget', () => {
    const r = evaluateAfford({
      amount: 500, available: 100000, upcomingBills: 0,
      category: { name: 'Subscriptions', spentThisMonth: 9000, norm: 0, budget: 10000 },
    });
    expect(r.reasons).not.toContain(AffordReason.OverCategoryBudget);
  });

  it('still judges cash/buffer on the one-off amount, not the monthly rate', () => {
    const r = evaluateAfford({
      amount: 500, available: 1000, upcomingBills: 0, recurringMonthlyEquivalent: 20000,
    });
    // Only ₹500 leaves today — plenty of cash for that, regardless of the ₹20,000/mo rate.
    expect(r.reasons).not.toContain(AffordReason.CashShort);
    expect(r.remaining).toBe(500);
  });

  it('income share is judged on the monthly rate too', () => {
    const r = evaluateAfford({
      amount: 100, available: 100000, upcomingBills: 0, monthlyIncome: 10000,
      recurringMonthlyEquivalent: 1500, // 15% of income — above the 10% warn line
    });
    expect(r.reasons).toContain(AffordReason.LargeIncomeShare);
    expect(r.incomeShare).toBeCloseTo(0.15);
  });

  it('unusual-for-category still judges the single charge, not the monthly rate', () => {
    // A ₹500 coffee habit isn't an unusual SINGLE purchase, even though its
    // monthly total (₹2,166) would look large next to a ₹100 typical basket.
    const r = evaluateAfford({
      amount: 500, available: 100000, upcomingBills: 0, recurringMonthlyEquivalent: 2166,
      category: { name: 'Coffee', spentThisMonth: 0, norm: 0, typicalBasket: 400 },
    });
    expect(r.reasons).not.toContain(AffordReason.UnusualForCategory);
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
    // ₹5,000 against ₹85,000/month — the case an early UX audit reported as 417%.
    expect(incomeSharePct(500000 / 8500000)).toBe('6%');
  });

  it('still prints a merely-large share, because that can be real', () => {
    // 417% was the figure that audit reported. The cap is deliberately NOT what
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

// A comfortable baseline: lots of cash, no bills, so only the axis under test bites.
const easy = { amount: 10000, available: 10_000_00, upcomingBills: 0 };

describe('evaluateAfford — month projection axis', () => {
  it('flags a month already forecast over budget', () => {
    const r = evaluateAfford({ ...easy, projection: { projectedMonthEnd: 95000, budget: 100000 } });
    // 95k projected + 10k purchase = 105k against a 100k budget.
    expect(r.reasons).toContain(AffordReason.MonthAlreadyOver);
    expect(r.projectedAfter).toBe(105000);
    expect(r.verdict).toBe(AffordVerdict.Tight);
  });

  it('stays quiet when the purchase still lands inside the budget', () => {
    const r = evaluateAfford({ ...easy, projection: { projectedMonthEnd: 50000, budget: 100000 } });
    expect(r.reasons).not.toContain(AffordReason.MonthAlreadyOver);
    expect(r.verdict).toBe(AffordVerdict.Comfortable);
  });

  it('ignores the axis when no budget is set', () => {
    const r = evaluateAfford({ ...easy, projection: { projectedMonthEnd: 999999, budget: 0 } });
    expect(r.reasons).not.toContain(AffordReason.MonthAlreadyOver);
    expect(r.projectedAfter).toBeUndefined();
  });
});

describe('evaluateAfford — goal impact axis', () => {
  it('flags a meaningful delay and echoes the goal through', () => {
    const r = evaluateAfford({ ...easy, goalImpact: { name: 'Europe Vacation', monthsDelayed: 1.5 } });
    expect(r.reasons).toContain(AffordReason.DelaysGoal);
    expect(r.goalImpact?.name).toBe('Europe Vacation');
  });

  it('ignores a delay too small to be a real trade-off', () => {
    const r = evaluateAfford({ ...easy, goalImpact: { name: 'Laptop', monthsDelayed: 0.1 } });
    expect(r.reasons).not.toContain(AffordReason.DelaysGoal);
    expect(r.verdict).toBe(AffordVerdict.Comfortable);
  });
});

describe('evaluateAfford — unusual-for-category axis', () => {
  it('flags a purchase far above a typical single basket', () => {
    // ₹100 typical basket, ₹100 purchase would be fine; 4x it is not.
    const r = evaluateAfford({
      ...easy, amount: 40000,
      category: { name: 'Food', spentThisMonth: 0, norm: 500000, typicalBasket: 10000 },
    });
    expect(r.reasons).toContain(AffordReason.UnusualForCategory);
  });

  it('is independent of the monthly norm', () => {
    // Sits well inside a generous monthly norm, yet is 4x a typical basket —
    // the case a norm-only check misses.
    const r = evaluateAfford({
      ...easy, amount: 40000,
      category: { name: 'Food', spentThisMonth: 0, norm: 900000, typicalBasket: 10000 },
    });
    expect(r.reasons).toContain(AffordReason.UnusualForCategory);
    expect(r.reasons).not.toContain(AffordReason.AboveCategoryNorm);
  });

  it('stays quiet for an ordinary-sized purchase', () => {
    const r = evaluateAfford({
      ...easy, amount: 12000,
      category: { name: 'Food', spentThisMonth: 0, norm: 500000, typicalBasket: 10000 },
    });
    expect(r.reasons).not.toContain(AffordReason.UnusualForCategory);
  });
});

describe('evaluateAfford — necessity modulation', () => {
  // available 10000 → buffer target 1500; spending 9000 leaves 1000, under it.
  const thin = { amount: 9000, available: 10000, upcomingBills: 0 };

  it('keeps a Need comfortable when only the buffer is strained', () => {
    const r = evaluateAfford({ ...thin, necessity: AffordNecessity.Need });
    expect(r.reasons).toContain(AffordReason.ThinBuffer);
    expect(r.verdict).toBe(AffordVerdict.Comfortable);
  });

  it('leaves the same purchase tight when unmarked', () => {
    expect(evaluateAfford(thin).verdict).toBe(AffordVerdict.Tight);
  });

  it('does not soften a Need past the buffer axis', () => {
    const r = evaluateAfford({
      ...thin, necessity: AffordNecessity.Need,
      category: { name: 'Gadgets', spentThisMonth: 0, norm: 1000, budget: 2000 },
    });
    expect(r.reasons).toContain(AffordReason.OverCategoryBudget);
    expect(r.verdict).toBe(AffordVerdict.Tight);
  });

  it('never lets a Need override the hard cash gate', () => {
    const r = evaluateAfford({ amount: 500000, available: 1000, upcomingBills: 0, necessity: AffordNecessity.Need });
    expect(r.verdict).toBe(AffordVerdict.No);
    expect(r.reasons).toContain(AffordReason.CashShort);
  });

  it('holds a Later to the strict reading', () => {
    expect(evaluateAfford({ ...thin, necessity: AffordNecessity.Later }).verdict).toBe(AffordVerdict.Tight);
  });
});
