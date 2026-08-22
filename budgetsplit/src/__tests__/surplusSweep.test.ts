import { planSurplusSweep } from '../lib/savingsEngine';
import type { GoalLike } from '../lib/savingsEngine';

/**
 * A sweep that forgets where the money came from is not a round trip.
 *
 * The planner's whole job is to name the bucket it draws from, so a later
 * withdrawal can return it there. Everything else it does — ordering, capping —
 * mirrors `planAutoAllocations`, because a sweep and a scheduled allocation are
 * the same act with different triggers.
 */

const goal = (over: Partial<GoalLike & { locked: number }> = {}) => ({
  id: 'g1', target: 100000, allocation: 0, frequency: 'none' as const,
  priority: 'need' as const, anchor: 0, locked: 0, ...over,
});

describe('planSurplusSweep', () => {
  it('names the bucket it draws from, on every allocation', () => {
    const out = planSurplusSweep([goal()], {}, 50000, { bank: 200000 });
    expect(out).toEqual([{ goalId: 'g1', amount: 50000, sourceAsset: 'bank' }]);
  });

  it('refuses when no single bucket can cover it', () => {
    // ₹800 split across two buckets that hold ₹500 each. Taking it from one would
    // overdraw that bucket; splitting needs a policy nobody has chosen. So neither.
    expect(planSurplusSweep([goal()], {}, 80000, { bank: 50000, cash: 50000 })).toEqual([]);
  });

  it('draws from the fullest bucket when more than one could cover it', () => {
    const out = planSurplusSweep([goal()], {}, 10000, { bank: 20000, cash: 900000 });
    expect(out[0].sourceAsset).toBe('cash');
  });

  it('refuses a surplus that is not real', () => {
    expect(planSurplusSweep([goal()], {}, 0, { bank: 900000 })).toEqual([]);
    expect(planSurplusSweep([goal()], {}, -5000, { bank: 900000 })).toEqual([]);
  });

  it('never overshoots a target', () => {
    // ₹1,000 target, ₹900 already saved, ₹5,000 surplus → ₹100, not ₹5,000.
    const out = planSurplusSweep([goal()], { g1: 90000 }, 500000, { bank: 900000 });
    expect(out).toEqual([{ goalId: 'g1', amount: 10000, sourceAsset: 'bank' }]);
  });

  it('leaves a locked goal alone', () => {
    expect(planSurplusSweep([goal({ locked: 1 })], {}, 50000, { bank: 900000 })).toEqual([]);
  });

  it('leaves a goal that is already there alone', () => {
    expect(planSurplusSweep([goal()], { g1: 100000 }, 50000, { bank: 900000 })).toEqual([]);
  });

  it('funds in the same order scheduled allocations use', () => {
    // Emergency before Need before Want — two different orders for the same act
    // would be indefensible.
    const goals = [
      goal({ id: 'want', priority: 'want', target: 100000 }),
      goal({ id: 'emer', priority: 'emergency', target: 100000 }),
      goal({ id: 'need', priority: 'need', target: 100000 }),
    ];
    const out = planSurplusSweep(goals, {}, 250000, { bank: 900000 });
    expect(out.map(a => a.goalId)).toEqual(['emer', 'need', 'want']);
  });

  it('stops when the surplus runs out, rather than spreading it thin', () => {
    const goals = [
      goal({ id: 'a', priority: 'emergency', target: 100000 }),
      goal({ id: 'b', priority: 'want', target: 100000 }),
    ];
    const out = planSurplusSweep(goals, {}, 120000, { bank: 900000 });
    expect(out).toEqual([
      { goalId: 'a', amount: 100000, sourceAsset: 'bank' },
      { goalId: 'b', amount: 20000, sourceAsset: 'bank' },
    ]);
  });
});
