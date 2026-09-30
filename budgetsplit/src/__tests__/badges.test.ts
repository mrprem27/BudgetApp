import { computeBadges, bestStreak, type BadgeInputs, type BadgeRow } from '../lib/badges';

// 22 Sep 2026, midday, local time.
const NOW = new Date(2026, 8, 22, 12).getTime();
const day = (m: number, d: number, spent = 0, income = 0): BadgeRow => ({ date: new Date(2026, m, d, 10).getTime(), spent, income });

const base: BadgeInputs = {
  nowMs: NOW, rows: [], safeToSpend: null, lowSoon: false, incomeConsistency: null,
  owe: 0, owed: 0, hasShared: false, goalsDone: 0, goalsCount: 0, budgetPct: null, assetCount: 0,
};
const byId = (i: Partial<BadgeInputs>) => Object.fromEntries(computeBadges({ ...base, ...i }).map(b => [b.id, b]));

describe('badges are targets that stay in play (U-65)', () => {
  it('has something in each of the three kinds from day one', () => {
    const groups = new Set(computeBadges(base).map(b => b.group));
    expect(groups).toEqual(new Set(['month', 'milestone', 'now']));
  });

  it('"Every week" counts this month only, one entry per week block', () => {
    const three = byId({ rows: [day(8, 2), day(8, 9), day(8, 20), day(7, 28)] }).everyWeek;
    expect(three.status).toBe('3 of 4 weeks this month');
    expect(three.level).toBe(0);
    expect(byId({ rows: [day(8, 2), day(8, 9), day(8, 20), day(8, 22)] }).everyWeek.level).toBe(1);
  });

  it('"Kept more than spent" judges this month, not last', () => {
    expect(byId({ rows: [day(8, 1, 0, 50_000), day(8, 5, 20_000)] }).keptMore.level).toBe(1);
    expect(byId({ rows: [day(7, 1, 0, 50_000), day(8, 5, 20_000)] }).keptMore.level).toBe(0);
  });

  it('counts good months of the year toward a level that restarts each January', () => {
    const rows = [0, 1, 2].map(m => day(m, 5, 1_000, 5_000)).concat(day(8, 3, 9_000, 1_000));
    const gy = byId({ rows }).goodYear;
    expect(gy.level).toBe(1);
    expect(gy.status).toBe('3 months so far · next at 6');
    // Last year's months do not count toward this year.
    const old = byId({ rows: [{ date: new Date(2025, 5, 5).getTime(), spent: 0, income: 9_000 }] }).goodYear;
    expect(old.level).toBe(0);
  });

  it('levels the streak on the best run, and shows the one you are on', () => {
    const rows = Array.from({ length: 8 }, (_, i) => day(7, 1 + i)).concat(day(8, 21), day(8, 22));
    const s = byId({ rows }).streak;
    expect(s.level).toBe(1);
    expect(s.status).toBe('Now 2 days · best 8 days · next at 30');
  });

  it('waits for the 20th before "On budget" counts', () => {
    expect(byId({ budgetPct: 60, nowMs: new Date(2026, 8, 5).getTime() }).onBudget.level).toBe(0);
    expect(byId({ budgetPct: 60 }).onBudget.level).toBe(1);
    expect(byId({ budgetPct: 130 }).onBudget.level).toBe(0);
  });

  it('takes "covered to payday" from the engine, never while it is still learning', () => {
    expect(byId({ safeToSpend: null }).covered.level).toBe(0);
    expect(byId({ safeToSpend: 500 }).covered.level).toBe(1);
    expect(byId({ safeToSpend: 500, lowSoon: true }).covered.level).toBe(0);
  });

  it('only asks about people, income or a budget when there is something to judge', () => {
    const b = byId({});
    expect(b.allSquare).toBeUndefined();
    expect(b.steadyIncome).toBeUndefined();
    expect(b.onBudget).toBeUndefined();
    expect(byId({ hasShared: true }).allSquare.level).toBe(1);
  });

  it('gives every badge an explanation and a progress between 0 and 1', () => {
    for (const b of computeBadges({ ...base, rows: [day(8, 1, 100, 0)], budgetPct: 150, hasShared: true, incomeConsistency: 'variable' })) {
      expect(b.explain.length).toBeGreaterThan(20);
      expect(b.progress).toBeGreaterThanOrEqual(0);
      expect(b.progress).toBeLessThanOrEqual(1);
    }
  });
});

describe('bestStreak', () => {
  it('finds the longest run of consecutive days', () => {
    const d = (m: number, x: number) => new Date(2026, m, x, 9).getTime();
    expect(bestStreak([d(0, 1), d(0, 2), d(0, 3), d(0, 5), d(0, 31), d(1, 1)])).toBe(3);
    expect(bestStreak([])).toBe(0);
  });
});
