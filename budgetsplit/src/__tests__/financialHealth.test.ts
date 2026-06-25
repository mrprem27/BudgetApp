import { computeHealthScore } from '../lib/financialHealth';

describe('computeHealthScore', () => {
  it('rates a healthy profile as great', () => {
    // Under pace, saving 30%, spending down 22%, all cats on track, no debt
    const r = computeHealthScore({
      spendPaise: 700000, incomePaise: 1000000, prevSpendPaise: 900000,
      budgetAllocated: 100000, budgetSpent: 40000, dayOfMonth: 20, daysInMonth: 30,
      categoriesOver: 0, categoriesNear: 0, totalBudgeted: 3,
      worstCategoryPct: null, worstCategoryName: null, netOwedPaise: 0,
    });
    expect(r.score).toBe(100);
    expect(r.band).toBe('great');
  });

  it('penalizes overspend, low savings and debt', () => {
    // 1.8× pace, spending > income, up 38% MoM, 3 cats over, owing 50% of income
    const r = computeHealthScore({
      spendPaise: 1100000, incomePaise: 1000000, prevSpendPaise: 800000,
      budgetAllocated: 100000, budgetSpent: 90000, dayOfMonth: 15, daysInMonth: 30,
      categoriesOver: 3, categoriesNear: 1, totalBudgeted: 5,
      worstCategoryPct: 145, worstCategoryName: 'Dining', netOwedPaise: 500000,
    });
    expect(r.score).toBeLessThan(40);
    expect(r.band).toBe('poor');
  });

  it('handles no budget / no income neutrally', () => {
    // All zeros → every signal returns neutral points
    // spendPace(12) + category(10) + cashFlow(10) + momentum(12) + debt(15) = 59
    const r = computeHealthScore({
      spendPaise: 0, incomePaise: 0, prevSpendPaise: 0,
      budgetAllocated: 0, budgetSpent: 0, dayOfMonth: 1, daysInMonth: 30,
      categoriesOver: 0, categoriesNear: 0, totalBudgeted: 0,
      worstCategoryPct: null, worstCategoryName: null, netOwedPaise: 0,
    });
    expect(r.score).toBe(59);
    expect(r.band).toBe('fair');
  });

  it('clamps to 0–100', () => {
    const r = computeHealthScore({
      spendPaise: 500000, incomePaise: 1000000, prevSpendPaise: 0,
      budgetAllocated: 0, budgetSpent: 0, dayOfMonth: 15, daysInMonth: 30,
      categoriesOver: 0, categoriesNear: 0, totalBudgeted: 0,
      worstCategoryPct: null, worstCategoryName: null, netOwedPaise: -100,
    });
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});
