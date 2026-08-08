import { payoffFor } from '../lib/onboardingPayoff';

/**
 * The payoff stage reads the questionnaire's numbers back at the user — and both
 * income and budget are skippable, so every combination is reachable. The predecessor
 * of this logic (the budget step's "that's X% of your take-home" line) shipped a bug
 * where a zero income rendered "that's — of your take-home", which is exactly what
 * guarding both operands is for.
 */
describe('payoffFor', () => {
  it('reports headroom when income exceeds budget', () => {
    const p = payoffFor(45000, 27000);
    expect(p).not.toBeNull();
    expect(p!.amountPaise).toBe(18000 * 100);
    expect(p!.headline).toBe('a month left over');
    expect(p!.body).toContain('₹27,000');
  });

  it('does not report headroom when the budget equals take-home', () => {
    const p = payoffFor(40000, 40000);
    expect(p!.amountPaise).toBe(40000 * 100);
    expect(p!.headline).toBe('is your monthly cap');
    expect(p!.body).toContain('nothing spare');
  });

  it('flags a budget above take-home instead of showing negative headroom', () => {
    const p = payoffFor(30000, 50000);
    expect(p!.amountPaise).toBe(50000 * 100);
    // The bug this guards: income - budget would be -20000.
    expect(p!.amountPaise).toBeGreaterThan(0);
    expect(p!.body).toContain('dipping into savings');
  });

  it('handles a skipped income — budget alone is still meaningful', () => {
    const p = payoffFor(0, 27000);
    expect(p!.amountPaise).toBe(27000 * 100);
    expect(p!.headline).toBe('a month is your ceiling');
    // The real property: with income missing, the copy must not quote ANY figure —
    // income is the only number it could have interpolated, so a rupee sign here
    // would mean a missing value reached the screen.
    expect(p!.body).not.toMatch(/₹/);
    expect(p!.body).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('handles a skipped budget — income alone is still meaningful', () => {
    const p = payoffFor(45000, 0);
    expect(p!.amountPaise).toBe(45000 * 100);
    expect(p!.headline).toBe('a month coming in');
    expect(p!.body).not.toMatch(/₹/);
    expect(p!.body).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('never leaks a zero or non-finite figure into any body copy', () => {
    // The general form of the bug this replaced: a formatted amount built from a
    // value the user never supplied.
    for (const [income, budget] of [[0, 5000], [5000, 0], [0, 1], [1, 0]] as const) {
      const p = payoffFor(income, budget);
      expect(p).not.toBeNull();
      expect(p!.body).not.toMatch(/₹0\b/);
      expect(p!.body).not.toMatch(/NaN|undefined|Infinity/);
      expect(p!.headline).not.toMatch(/NaN|undefined|₹0\b/);
    }
  });

  it('returns null when both were skipped, so the stage is skipped entirely', () => {
    expect(payoffFor(0, 0)).toBeNull();
  });

  it('never produces a negative or NaN amount for any input', () => {
    const inputs = [0, 1, 999, 27000, 45000, 1e7];
    for (const income of inputs) {
      for (const budget of inputs) {
        const p = payoffFor(income, budget);
        if (p === null) { expect(income === 0 && budget === 0).toBe(true); continue; }
        expect(Number.isFinite(p.amountPaise)).toBe(true);
        expect(p.amountPaise).toBeGreaterThan(0);
        // Money is integer paise (AGENTS.md) — no fractional paise may survive.
        expect(Number.isInteger(p.amountPaise)).toBe(true);
      }
    }
  });

  it('ignores negative input rather than rendering a negative figure', () => {
    // The fields strip non-digits, so this is defensive — but a negative headline
    // would be a visible failure, not a silent one.
    const p = payoffFor(-5000, 10000);
    expect(p).not.toBeNull();
    expect(p!.amountPaise).toBeGreaterThan(0);
  });
});
