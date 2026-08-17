import { applyOverspendRaid } from '../db/queries/savings';
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

/**
 * `priority` (emergency/need/want) is the coarse fund-order tag; `sort_order`
 * is the fine-grained drag rank *within* a tag. These helpers default every
 * goal to `'need'` unless a test is specifically about tag ordering, so
 * sort_order-only tests aren't accidentally dominated by tag differences.
 */
const goal = (
  id: string, priority: GoalLike['priority'], allocation: number, target: number,
  anchor = jan1, sort_order = 0,
): GoalLike => ({ id, priority, allocation, target, anchor, sort_order, frequency: 'monthly' });

describe('planAutoAllocations', () => {
  it('funds each goal its allocation × elapsed periods when cash is ample', () => {
    const plan = planAutoAllocations([goal('a', 'need', 1000, 100000)], {}, 100000, apr1);
    expect(plan).toEqual([{ goalId: 'a', amount: 3000, newAnchor: apr1 }]);
  });

  it('caps at the remaining-to-target', () => {
    const plan = planAutoAllocations([goal('a', 'need', 1000, 2500)], { a: 0 }, 100000, apr1);
    expect(plan[0].amount).toBe(2500); // 3×1000 capped at target 2500
  });

  it('within the same tag, funds the lower sort_order first when cash is short', () => {
    const goals = [goal('low', 'need', 1000, 100000, jan1, 1), goal('hi', 'need', 1000, 100000, jan1, 0)];
    const plan = planAutoAllocations(goals, {}, 2000, apr1); // each due 3000, cash only 2000
    const hi = plan.find(p => p.goalId === 'hi')!;
    const low = plan.find(p => p.goalId === 'low');
    expect(hi.amount).toBe(2000);     // sort_order 0 funded first
    expect(low?.amount ?? 0).toBe(0); // nothing left for sort_order 1
  });

  it('funds emergency before need before want, even against sort_order', () => {
    // 'want' is dragged to sort_order 0 (would fund first if tag didn't dominate);
    // 'emergency' sits at sort_order 2. Tag must still decide this.
    const goals = [
      goal('want', 'want', 1000, 100000, jan1, 0),
      goal('need', 'need', 1000, 100000, jan1, 1),
      goal('emergency', 'emergency', 1000, 100000, jan1, 2),
    ];
    const plan = planAutoAllocations(goals, {}, 3000, apr1); // each due 3000, cash for exactly one
    expect(plan.find(p => p.goalId === 'emergency')!.amount).toBe(3000);
    expect(plan.find(p => p.goalId === 'need')?.amount ?? 0).toBe(0);
    expect(plan.find(p => p.goalId === 'want')?.amount ?? 0).toBe(0);
  });

  it('advances the anchor only for funded periods when short', () => {
    // due 3000 (3 months), cash funds 2000 = 2 whole periods → anchor moves 2 months
    const plan = planAutoAllocations([goal('a', 'need', 1000, 100000)], {}, 2000, apr1);
    expect(plan[0].amount).toBe(2000);
    expect(plan[0].newAnchor).toBe(advanceAnchor('monthly', jan1, 2));
  });

  it('skips goals with no allocation, no cadence, or no elapsed period', () => {
    const goals: GoalLike[] = [
      { id: 'x', priority: 'need', allocation: 0, target: 100, anchor: jan1, frequency: 'monthly' },
      { id: 'y', priority: 'need', allocation: 1000, target: 100000, anchor: jan1, frequency: 'none' },
      { id: 'z', priority: 'need', allocation: 1000, target: 100000, anchor: jan1, frequency: 'monthly' },
    ];
    const plan = planAutoAllocations(goals, {}, 100000, jan1); // now == anchor → 0 periods
    expect(plan).toEqual([]);
  });
});

describe('planOverspendRaid', () => {
  // `target` defaults high enough that these goals are never "complete" — the
  // completed-goal case gets its own describe below.
  const g = (
    id: string, priority: RaidGoal['priority'], locked = 0, target = 1_000_000, sort_order = 0,
  ): RaidGoal => ({ id, priority, locked, target, sort_order });

  it('never raids an emergency goal, regardless of sort_order', () => {
    // sort_order 0 would be raided first if tag didn't protect it outright.
    const goals = [g('shield', 'emergency', 0, 1_000_000, 0), g('want1', 'want', 0, 1_000_000, 3)];
    const out = planOverspendRaid(goals, { shield: 5000, want1: 3000 }, 5000);
    expect(out).toEqual([{ goalId: 'want1', amount: 3000 }]); // shield untouched
  });

  it('raids want goals before need goals, protecting emergency & locked', () => {
    const goals = [
      g('shield', 'emergency', 0, 1_000_000, 0),
      g('want1', 'want', 0, 1_000_000, 3),
      g('need1', 'need', 0, 1_000_000, 2),
      g('locked_want', 'want', 1, 1_000_000, 4),
    ];
    const saved = { shield: 5000, want1: 3000, need1: 4000, locked_want: 9999 };
    const out = planOverspendRaid(goals, saved, 5000);
    // want first (3000), then need (2000) — emergency & locked untouched
    expect(out).toEqual([{ goalId: 'want1', amount: 3000 }, { goalId: 'need1', amount: 2000 }]);
  });

  it('covers only what the goals hold when the deficit exceeds savings', () => {
    const goals = [g('a', 'want', 0, 1_000_000, 1), g('b', 'need', 0, 1_000_000, 0)];
    const out = planOverspendRaid(goals, { a: 1000, b: 1000 }, 5000);
    expect(out).toEqual([{ goalId: 'a', amount: 1000 }, { goalId: 'b', amount: 1000 }]); // partial
  });
  it('returns nothing when there is no deficit', () => {
    expect(planOverspendRaid([g('a', 'want')], { a: 1000 }, 0)).toEqual([]);
  });
});

describe('applyOverspendRaid — consent is the whole point (V2-10)', () => {
  function fakeDb() {
    const inserts: unknown[][] = [];
    return {
      inserts,
      db: {
        withTransactionAsync: async (fn: () => Promise<void>) => { await fn(); },
        runAsync: async (_sql: string, args: unknown[]) => { inserts.push(args); },
      } as unknown as Parameters<typeof applyOverspendRaid>[0],
    };
  }

  it('writes exactly the withdrawals it was handed, not a recomputed plan', async () => {
    // The prompt named these goals; re-planning inside apply could quietly take from
    // a different one if anything changed between showing and agreeing.
    const { db, inserts } = fakeDb();
    const out = await applyOverspendRaid(db, [
      { goalId: 'g1', name: 'Goa Trip', amount: 3000 },
      { goalId: 'g2', name: 'Laptop', amount: 2000 },
    ]);
    expect(out.total).toBe(5000);
    expect(out.withdrawals.map(w => w.goalId)).toEqual(['g1', 'g2']);
    expect(inserts).toHaveLength(2);
  });

  it('moves nothing at all for an empty plan', async () => {
    const { db, inserts } = fakeDb();
    const out = await applyOverspendRaid(db, []);
    expect(out).toEqual({ withdrawals: [], total: 0 });
    expect(inserts).toHaveLength(0);
  });

  it('ignores zero and negative amounts rather than writing them', async () => {
    const { db, inserts } = fakeDb();
    const out = await applyOverspendRaid(db, [
      { goalId: 'g1', name: 'A', amount: 0 },
      { goalId: 'g2', name: 'B', amount: -500 },
      { goalId: 'g3', name: 'C', amount: 1200 },
    ]);
    expect(out.total).toBe(1200);
    expect(inserts).toHaveLength(1);
  });

  it('is a no-op when every amount is unusable', async () => {
    const { db, inserts } = fakeDb();
    expect((await applyOverspendRaid(db, [{ goalId: 'g', name: 'A', amount: 0 }])).total).toBe(0);
    expect(inserts).toHaveLength(0);
  });
});

/**
 * Two defects the suite above could not see: it only ever built goals with
 * distinct priorities, so the `sort_order = 0` tie never occurred, and it never
 * gave a goal enough saved to be complete.
 */
describe('planOverspendRaid protects finished goals', () => {
  const goal = (id: string, target: number, sort_order = 0): RaidGoal =>
    ({ id, priority: 'need', locked: 0, target, sort_order });

  it('never raids a goal that has reached its target', () => {
    const goals = [goal('done', 10000), goal('open', 50000)];
    const out = planOverspendRaid(goals, { done: 10000, open: 20000 }, 30000);
    expect(out).toEqual([{ goalId: 'open', amount: 20000 }]);
  });

  it('treats an overfunded goal as finished too', () => {
    const goals = [goal('over', 10000)];
    expect(planOverspendRaid(goals, { over: 15000 }, 5000)).toEqual([]);
  });

  it('still raids a goal that is one rupee short', () => {
    const goals = [goal('nearly', 10000)];
    expect(planOverspendRaid(goals, { nearly: 9900 }, 5000)).toEqual([{ goalId: 'nearly', amount: 5000 }]);
  });
});

describe('funding and raiding are mirror images before anyone drags', () => {
  it('raids the goal that would be funded LAST, not first', () => {
    // Every goal at the schema default sort_order = 0. Pre-fix the stable sort
    // left both orders identical to the input, so the first goal in the list was
    // funded first *and* raided first.
    const goals: RaidGoal[] = [
      { id: 'first', priority: 'need', locked: 0, target: 100000, sort_order: 0 },
      { id: 'second', priority: 'need', locked: 0, target: 100000, sort_order: 0 },
      { id: 'third', priority: 'need', locked: 0, target: 100000, sort_order: 0 },
    ];
    const out = planOverspendRaid(goals, { first: 5000, second: 5000, third: 5000 }, 5000);
    expect(out).toEqual([{ goalId: 'third', amount: 5000 }]);
  });

  it('an explicit drag order still wins over the tie-break', () => {
    const goals: RaidGoal[] = [
      { id: 'a', priority: 'need', locked: 0, target: 100000, sort_order: 0 },
      { id: 'b', priority: 'need', locked: 0, target: 100000, sort_order: 1 },
      { id: 'c', priority: 'need', locked: 0, target: 100000, sort_order: 2 },
    ];
    const out = planOverspendRaid(goals, { a: 5000, b: 5000, c: 5000 }, 5000);
    expect(out).toEqual([{ goalId: 'c', amount: 5000 }]); // bottom of the list
  });
});
