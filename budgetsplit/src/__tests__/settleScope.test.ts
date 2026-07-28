import { planAllGroupsSettlement, type TransferScopes } from '../lib/settleScope';

const scopes = (groups: Array<[string, number]>): TransferScopes => ({
  groups: groups.map(([groupId, amount]) => ({
    groupId, name: groupId, amount, from: 'me', to: 'you',
  })),
  all: { amount: groups.reduce((s, [, a]) => s + a, 0), from: 'me', to: 'you' },
});

const total = (plan: Array<{ amount: number }>) => plan.reduce((s, p) => s + p.amount, 0);

describe('planAllGroupsSettlement', () => {
  it('fills the largest balance first', () => {
    const plan = planAllGroupsSettlement(scopes([['a', 10000], ['b', 50000]]), 50000, 'me', 'you');
    expect(plan[0].groupId).toBe('b');
  });

  it('always allocates exactly the requested amount', () => {
    const plan = planAllGroupsSettlement(scopes([['a', 30000], ['b', 20000]]), 45000, 'me', 'you');
    expect(total(plan)).toBe(45000);
  });

  it('splits across groups when one balance is not enough', () => {
    const plan = planAllGroupsSettlement(scopes([['a', 30000], ['b', 20000]]), 45000, 'me', 'you');
    expect(plan).toEqual([
      { groupId: 'a', from: 'me', to: 'you', amount: 30000 },
      { groupId: 'b', from: 'me', to: 'you', amount: 15000 },
    ]);
  });

  it('stops early when the amount is covered by the first group', () => {
    const plan = planAllGroupsSettlement(scopes([['a', 30000], ['b', 20000]]), 10000, 'me', 'you');
    expect(plan).toEqual([{ groupId: 'a', from: 'me', to: 'you', amount: 10000 }]);
  });

  it('uses the caller-chosen direction, not the stored per-group direction', () => {
    // Stored scope entries say me→you; caller settles the other way.
    const plan = planAllGroupsSettlement(scopes([['a', 30000]]), 30000, 'you', 'me');
    expect(plan[0].from).toBe('you');
    expect(plan[0].to).toBe('me');
  });

  it('ignores groups with a zero or negative balance', () => {
    const plan = planAllGroupsSettlement(
      scopes([['zero', 0], ['neg', -5000], ['real', 20000]]), 20000, 'me', 'you',
    );
    expect(plan.map(p => p.groupId)).toEqual(['real']);
  });

  it('returns an empty plan when there is nothing to settle', () => {
    expect(planAllGroupsSettlement(scopes([]), 10000, 'me', 'you')).toEqual([]);
    expect(planAllGroupsSettlement(scopes([['a', 0]]), 10000, 'me', 'you')).toEqual([]);
    expect(planAllGroupsSettlement(scopes([['a', -100]]), 10000, 'me', 'you')).toEqual([]);
  });

  it('returns an empty plan for a zero or negative amount', () => {
    expect(planAllGroupsSettlement(scopes([['a', 30000]]), 0, 'me', 'you')).toEqual([]);
    expect(planAllGroupsSettlement(scopes([['a', 30000]]), -500, 'me', 'you')).toEqual([]);
  });

  it('never emits a zero-amount row', () => {
    const plan = planAllGroupsSettlement(scopes([['a', 30000], ['b', 20000]]), 30000, 'me', 'you');
    expect(plan.every(p => p.amount > 0)).toBe(true);
  });

  // Documented behaviour: overpayment beyond the known balances lands on the last
  // (smallest) ranked group, so the written rows still sum to what the user paid.
  it('puts an overpayment remainder on the last ranked group', () => {
    const plan = planAllGroupsSettlement(scopes([['a', 30000], ['b', 20000]]), 80000, 'me', 'you');
    expect(total(plan)).toBe(80000);
    expect(plan[plan.length - 1].groupId).toBe('b');
    expect(plan[plan.length - 1].amount).toBe(50000); // 20000 owed + 30000 excess
  });

  it('puts the whole overpayment on the only group when there is just one', () => {
    const plan = planAllGroupsSettlement(scopes([['a', 5000]]), 12000, 'me', 'you');
    expect(plan).toEqual([{ groupId: 'a', from: 'me', to: 'you', amount: 12000 }]);
  });

  it('handles many groups without losing or inventing paise', () => {
    const many = Array.from({ length: 12 }, (_, i) => [`g${i}`, (i + 1) * 1000] as [string, number]);
    const plan = planAllGroupsSettlement(scopes(many), 25000, 'me', 'you');
    expect(total(plan)).toBe(25000);
    expect(plan.every(p => p.amount > 0)).toBe(true);
  });

  it('does not mutate the input scopes', () => {
    const s = scopes([['a', 10000], ['b', 50000]]);
    const before = s.groups.map(g => g.groupId);
    planAllGroupsSettlement(s, 60000, 'me', 'you');
    expect(s.groups.map(g => g.groupId)).toEqual(before);
  });
});
