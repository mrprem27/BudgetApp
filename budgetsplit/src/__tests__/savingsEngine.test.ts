import { periodsElapsed, advanceAnchor, planAutoAllocations, planOverspendRaid, type GoalLike, type RaidGoal } from '../lib/savingsEngine';

const jan1 = new Date('2026-01-01T00:00:00Z').getTime();
const apr1 = new Date('2026-04-01T00:00:00Z').getTime();

describe('periodsElapsed / advanceAnchor', () => {
  it('counts whole months', () => {
    expect(periodsElapsed('monthly', jan1, apr1)).toBe(3);
    expect(periodsElapsed('monthly', jan1, jan1)).toBe(0);
  });
  it('counts weeks and days', () => {
    const d = new Date('2026-01-22T00:00:00Z').getTime();
    expect(periodsElapsed('weekly', jan1, d)).toBe(3);
    expect(periodsElapsed('daily', jan1, d)).toBe(21);
  });
  it('advances the anchor by whole periods', () => {
    expect(advanceAnchor('monthly', jan1, 3)).toBe(apr1);
    expect(advanceAnchor('monthly', jan1, 0)).toBe(jan1);
  });
});

const goal = (id: string, priority: GoalLike['priority'], allocation: number, target: number, anchor = jan1): GoalLike =>
  ({ id, priority, allocation, target, anchor, frequency: 'monthly' });

describe('planAutoAllocations', () => {
  it('funds each goal its allocation × elapsed periods when cash is ample', () => {
    const plan = planAutoAllocations([goal('a', 'high', 1000, 100000)], {}, 100000, apr1);
    expect(plan).toEqual([{ goalId: 'a', amount: 3000, newAnchor: apr1 }]);
  });

  it('caps at the remaining-to-target', () => {
    const plan = planAutoAllocations([goal('a', 'high', 1000, 2500)], { a: 0 }, 100000, apr1);
    expect(plan[0].amount).toBe(2500); // 3×1000 capped at target 2500
  });

  it('prioritises High over Low when cash is short', () => {
    const goals = [goal('low', 'low', 1000, 100000), goal('hi', 'high', 1000, 100000)];
    const plan = planAutoAllocations(goals, {}, 2000, apr1); // each due 3000, cash only 2000
    const hi = plan.find(p => p.goalId === 'hi')!;
    const low = plan.find(p => p.goalId === 'low');
    expect(hi.amount).toBe(2000);     // high goal funded first
    expect(low?.amount ?? 0).toBe(0); // nothing left for low
  });

  it('advances the anchor only for funded periods when short', () => {
    // due 3000 (3 months), cash funds 2000 = 2 whole periods → anchor moves 2 months
    const plan = planAutoAllocations([goal('a', 'high', 1000, 100000)], {}, 2000, apr1);
    expect(plan[0].amount).toBe(2000);
    expect(plan[0].newAnchor).toBe(advanceAnchor('monthly', jan1, 2));
  });

  it('skips goals with no allocation, no cadence, or no elapsed period', () => {
    const goals: GoalLike[] = [
      { id: 'x', priority: 'high', allocation: 0, target: 100, anchor: jan1, frequency: 'monthly' },
      { id: 'y', priority: 'high', allocation: 1000, target: 100000, anchor: jan1, frequency: 'none' },
      { id: 'z', priority: 'high', allocation: 1000, target: 100000, anchor: jan1, frequency: 'monthly' },
    ];
    const plan = planAutoAllocations(goals, {}, 100000, jan1); // now == anchor → 0 periods
    expect(plan).toEqual([]);
  });
});

describe('planOverspendRaid', () => {
  const g = (id: string, priority: RaidGoal['priority'], locked = 0): RaidGoal => ({ id, priority, locked });
  it('raids lowest-priority unlocked goals first, protecting high & locked', () => {
    const goals = [g('hi', 'high'), g('lo', 'low'), g('mid', 'medium'), g('lk', 'low', 1)];
    const saved = { hi: 5000, lo: 3000, mid: 4000, lk: 9999 };
    const out = planOverspendRaid(goals, saved, 5000);
    // low first (3000), then medium (2000) — high & locked untouched
    expect(out).toEqual([{ goalId: 'lo', amount: 3000 }, { goalId: 'mid', amount: 2000 }]);
  });
  it('covers only what the goals hold when the deficit exceeds savings', () => {
    const goals = [g('a', 'low'), g('b', 'medium')];
    const out = planOverspendRaid(goals, { a: 1000, b: 1000 }, 5000);
    expect(out).toEqual([{ goalId: 'a', amount: 1000 }, { goalId: 'b', amount: 1000 }]); // partial
  });
  it('returns nothing when there is no deficit', () => {
    expect(planOverspendRaid([g('a', 'low')], { a: 1000 }, 0)).toEqual([]);
  });
});
