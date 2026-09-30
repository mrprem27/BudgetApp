import { computeBadges, type BadgeInputs } from '../lib/badges';

const base: BadgeInputs = {
  streak: 0, txnCount: 0, safeToSpend: null, lowSoon: false, incomeConsistency: null,
  owe: 0, owed: 0, hasShared: false, goalsDone: 0, goalsCount: 0, budgetPct: null, dayOfMonth: 5, assetCount: 0,
};
const byId = (i: Partial<BadgeInputs>) => Object.fromEntries(computeBadges({ ...base, ...i }).map(b => [b.id, b]));

describe('computeBadges (U-59)', () => {
  it('starts a new user with what is next, not with failures', () => {
    const b = byId({});
    expect(b.streak7.earned).toBe(false);
    expect(b.streak7.progress).toBe('7 more days in a row');
    expect(b.entries25.progress).toBe('25 more entries');
    // Nothing about budgets, goals, income or people until there is something to judge.
    expect(b.onBudget).toBeUndefined();
    expect(b.goal).toBeUndefined();
    expect(b.steadyIncome).toBeUndefined();
    expect(b.allSquare).toBeUndefined();
  });

  it('upgrades a badge rather than showing both levels', () => {
    const b = byId({ streak: 31, txnCount: 120 });
    expect(b.streak30.earned).toBe(true);
    expect(b.streak7).toBeUndefined();
    expect(b.entries100.earned).toBe(true);
  });

  it('takes "covered to payday" from the engine, and never while it is still learning', () => {
    expect(byId({ safeToSpend: null }).covered.earned).toBe(false);
    expect(byId({ safeToSpend: 500, lowSoon: false }).covered.earned).toBe(true);
    expect(byId({ safeToSpend: 500, lowSoon: true }).covered.earned).toBe(false);
    expect(byId({ safeToSpend: -1 }).covered.earned).toBe(false);
  });

  it('counts "on budget" only once most of the month is behind you', () => {
    expect(byId({ budgetPct: 60, dayOfMonth: 5 }).onBudget.earned).toBe(false);
    expect(byId({ budgetPct: 60, dayOfMonth: 22 }).onBudget.earned).toBe(true);
    expect(byId({ budgetPct: 130, dayOfMonth: 22 }).onBudget.earned).toBe(false);
  });

  it('is all square only when nothing is owed either way', () => {
    expect(byId({ hasShared: true }).allSquare.earned).toBe(true);
    expect(byId({ hasShared: true, owed: 100 }).allSquare.earned).toBe(false);
  });

  it('lists earned badges first, with no progress line', () => {
    const list = computeBadges({ ...base, assetCount: 2 });
    expect(list[0].id).toBe('investor');
    expect(list[0].progress).toBeUndefined();
  });
});
