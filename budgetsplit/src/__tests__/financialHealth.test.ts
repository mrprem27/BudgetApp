import { computeHealthScore, suggestImprovement, GATE_MIN_DAYS, GATE_MIN_TXNS, type HealthInputs } from '../lib/financialHealth';

/** A profile that clears the minimum-data gate; override per test. */
const inputs = (over: Partial<HealthInputs> = {}): HealthInputs => ({
  income90: 15000000,        // ₹1.5L over 90d (₹50k/mo)
  spend90: 9000000,          // ₹90k over 90d (₹30k/mo) → keeping 40%
  budgetAllocated: 3500000,  // ₹35k/mo budget
  budgetSpent: 1500000,
  dayOfMonth: 15,
  daysInMonth: 30,
  liquid: 12000000,          // ₹1.2L cash → 4 months runway
  goalCommitMonthly: 500000,
  goalFundedThisMonth: 500000,
  creditUsed: 0,
  netIOwe: 0,
  upcomingBills: 2000000,
  goalsCount: 2,
  hasBudget: true,
  dataDays: 90,
  hasIncome: true,
  txnCount: 60,
  ...over,
});

describe('minimum-data gate', () => {
  // THE regression this restructure exists for: the old rubric paid an empty
  // database 59/100 "Fair" out of neutral defaults. Reverting the gate makes
  // this fail.
  it('refuses to score an empty ledger', () => {
    const r = computeHealthScore(inputs({ dataDays: 0, hasIncome: false, txnCount: 0, income90: 0, spend90: 0, liquid: 0, goalCommitMonthly: 0, goalsCount: 0, hasBudget: false, budgetAllocated: 0, upcomingBills: 0 }));
    expect(r.gate.ok).toBe(false);
    expect(r.gate.needs).toHaveLength(3);
    expect(r.gate.needs.every(n => !n.done)).toBe(true);
  });

  it('each gate requirement reports its own progress', () => {
    const r = computeHealthScore(inputs({ dataDays: GATE_MIN_DAYS - 1, txnCount: GATE_MIN_TXNS, hasIncome: true }));
    expect(r.gate.ok).toBe(false);
    expect(r.gate.needs.filter(n => n.done)).toHaveLength(2);
  });

  it('opens once history, income and volume all exist', () => {
    expect(computeHealthScore(inputs()).gate.ok).toBe(true);
  });

  it('never suggests an improvement while gated', () => {
    const i = inputs({ dataDays: 3 });
    expect(suggestImprovement(i, computeHealthScore(i))).toBeNull();
  });
});

describe('four equal-weighted pillars', () => {
  it('produces the four FinHealth pillars on a full profile', () => {
    const r = computeHealthScore(inputs());
    expect(r.dimensions.map(d => d.label)).toEqual(['Spend', 'Save', 'Borrow', 'Plan']);
  });

  it('a strong profile lands in the Healthy tier', () => {
    const r = computeHealthScore(inputs());
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.band).toBe('healthy');
  });

  it('overspending, no cushion and heavy debt land in Vulnerable', () => {
    const r = computeHealthScore(inputs({
      spend90: 18000000,          // spending > income
      budgetSpent: 4000000,       // way over pace
      liquid: 100000,             // no runway
      creditUsed: 4000000,        // 80% of a month's income
      goalFundedThisMonth: 0,
      upcomingBills: 2000000,     // bills exceed cash
    }));
    expect(r.score).toBeLessThan(40);
    expect(r.band).toBe('vulnerable');
  });

  it('the score is the plain average of the pillar percentages', () => {
    const r = computeHealthScore(inputs());
    const avg = Math.round(r.dimensions.reduce((s, d) => s + d.pct, 0) / r.dimensions.length);
    expect(r.score).toBe(avg);
  });

  it('a factor with no data leaves both numerator and denominator', () => {
    // No budget, no goals: budget-pace and goal-funding vanish rather than
    // paying default points — the remaining factors carry the score alone.
    const r = computeHealthScore(inputs({ hasBudget: false, budgetAllocated: 0, goalCommitMonthly: 0, goalsCount: 0 }));
    const labels = r.factors.map(f => f.label);
    expect(labels).not.toContain('Budget pace');
    expect(labels).not.toContain('Goal funding');
    expect(r.dimensions.map(d => d.label)).toEqual(['Spend', 'Save', 'Borrow', 'Plan']);
  });

  it('debt load counts card balance and owed money together, against income', () => {
    const clear = computeHealthScore(inputs());
    const owing = computeHealthScore(inputs({ creditUsed: 2000000, netIOwe: 1500000 }));
    expect(owing.score).toBeLessThan(clear.score);
    const f = owing.factors.find(x => x.label === 'Debt load')!;
    expect(f.severity).not.toBe('good');
  });
});

describe('suggestImprovement', () => {
  it('projects by re-running the real formula, never inventing a number', () => {
    const i = inputs({ creditUsed: 3000000 });
    const r = computeHealthScore(i);
    const imp = suggestImprovement(i, r);
    expect(imp).not.toBeNull();
    expect(imp!.toScore).toBeGreaterThan(imp!.fromScore);
    // Verify against an actual recomputation.
    expect(computeHealthScore({ ...i, creditUsed: 0, netIOwe: 0 }).score).toBe(imp!.toScore);
  });

  it('returns null when the profile is already strong', () => {
    const i = inputs();
    expect(suggestImprovement(i, computeHealthScore(i))).toBeNull();
  });

  /**
   * Null is reserved for a *good* score. A low one must always come with something
   * to read — the app telling you that you are doing badly and then declining to
   * say at what is the guilt cycle in its purest form, and it was reachable: every
   * lever can miss the ≥5-point materiality bar, and `Cash runway` / `Bills covered`
   * have no lever at all (they move by saving, which the other levers express).
   */
  describe('never goes silent on a weak score', () => {
    /** Weak everywhere, and weakest on a factor with no projectable lever. */
    const struggling = inputs({
      income90: 3000000, spend90: 2900000, liquid: 100000,
      upcomingBills: 5000000, creditUsed: 0, netIOwe: 0,
      budgetSpent: 3400000, goalCommitMonthly: 0, goalFundedThisMonth: 0, goalsCount: 0,
    });

    it('names the weakest factor when nothing projects', () => {
      const r = computeHealthScore(struggling);
      expect(r.band).not.toBe('healthy');
      const imp = suggestImprovement(struggling, r);
      expect(imp).not.toBeNull();
      expect(imp!.detail.length).toBeGreaterThan(0);
      expect(imp!.factorLabel).toBeTruthy();
    });

    it('claims no gain it cannot deliver', () => {
      const r = computeHealthScore(struggling);
      const imp = suggestImprovement(struggling, r);
      // Equal scores are the *proof* the fallback ran rather than a lever, and the
      // signal `HealthSheet` reads to hide the "47 → 58" row entirely. Asserting
      // `>=` here would have passed on either branch and tested nothing.
      expect(imp!.fromScore).toBe(r.score);
      expect(imp!.toScore).toBe(imp!.fromScore);
    });

    it('still says nothing while the score is gated', () => {
      const gated = inputs({ ...struggling, dataDays: 3, txnCount: 2 });
      expect(suggestImprovement(gated, computeHealthScore(gated))).toBeNull();
    });
  });
});
