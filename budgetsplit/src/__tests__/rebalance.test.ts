import { planRebalance, applyRebalance } from '../lib/rebalance';
import type { CategoryBudgetStatus } from '../lib/budget';

const line = (
  category: string,
  allocated: number,
  spent: number,
  cadence: CategoryBudgetStatus['cadence'] = 'monthly',
): CategoryBudgetStatus => ({
  category, cadence, allocated, spent,
  remaining: allocated - spent,
  pct: allocated > 0 ? (spent / allocated) * 100 : null,
  health: 'none',
});

describe('planRebalance', () => {
  it('covers an overspend from the category with the most headroom', () => {
    const plan = planRebalance([
      line('Dining', 5000, 8000),   // 3000 over
      line('Fuel', 10000, 2000),    // 8000 headroom
      line('Coffee', 3000, 2500),   // 500 headroom
    ], 'Dining')!;
    expect(plan.overspend).toBe(3000);
    expect(plan.covered).toBe(3000);
    expect(plan.partial).toBe(false);
    expect(plan.donors).toEqual([
      { category: 'Fuel', allocated: 10000, newAllocated: 7000, taken: 3000 },
    ]);
  });

  it('disturbs the fewest categories, largest headroom first', () => {
    // Trimming a little from many lines reads as noise and cannot be remembered.
    const plan = planRebalance([
      line('Dining', 1000, 6000),  // 5000 over
      line('Small', 1000, 500),    // 500
      line('Big', 9000, 1000),     // 8000
    ], 'Dining')!;
    expect(plan.donors.map(d => d.category)).toEqual(['Big']);
  });

  it('spills into a second donor only when the first cannot cover it', () => {
    const plan = planRebalance([
      line('Dining', 1000, 6000),  // 5000 over
      line('A', 4000, 1000),       // 3000
      line('B', 3000, 1000),       // 2000
    ], 'Dining')!;
    expect(plan.donors.map(d => [d.category, d.taken])).toEqual([['A', 3000], ['B', 2000]]);
    expect(plan.partial).toBe(false);
  });

  it('never pushes a donor below what it has already spent', () => {
    // A limit under spend-to-date is instantly over budget too — that moves the red
    // bar rather than removing it.
    const plan = planRebalance([
      line('Dining', 1000, 9000),  // 8000 over
      line('Fuel', 10000, 9500),   // only 500 of headroom despite a big allocation
    ], 'Dining')!;
    expect(plan.donors[0].taken).toBe(500);
    expect(plan.donors[0].newAllocated).toBe(9500);
    expect(plan.partial).toBe(true);
    expect(plan.covered).toBe(500);
  });

  it('ignores other cadences, whose headroom is not spendable this month', () => {
    const plan = planRebalance([
      line('Dining', 1000, 3000),
      line('Insurance', 90000, 0, 'yearly'),
    ], 'Dining');
    expect(plan).toBeNull();
  });

  it('returns null when the category is not actually over', () => {
    expect(planRebalance([line('Dining', 5000, 1000), line('Fuel', 5000, 0)], 'Dining')).toBeNull();
    expect(planRebalance([line('Dining', 5000, 5000), line('Fuel', 5000, 0)], 'Dining')).toBeNull();
  });

  it('returns null when nothing has headroom to give', () => {
    expect(planRebalance([line('Dining', 1000, 3000), line('Fuel', 1000, 1000)], 'Dining')).toBeNull();
  });

  it('returns null for a category that does not exist', () => {
    expect(planRebalance([line('Dining', 1000, 3000)], 'Nope')).toBeNull();
  });
});

describe('applyRebalance', () => {
  const statuses = [line('Dining', 5000, 8000), line('Fuel', 10000, 2000), line('Rent', 20000, 20000)];

  it('leaves the month total unchanged — this redistributes, never increases', () => {
    const plan = planRebalance(statuses, 'Dining')!;
    const before = statuses.reduce((s, x) => s + x.allocated, 0);
    const after = applyRebalance(statuses, plan).reduce((s, x) => s + x.amount, 0);
    expect(after).toBe(before);
  });

  it('raises the over-budget line by exactly what was covered', () => {
    const plan = planRebalance(statuses, 'Dining')!;
    const out = applyRebalance(statuses, plan);
    expect(out.find(x => x.category === 'Dining')!.amount).toBe(5000 + plan.covered);
  });

  it('passes untouched categories through unchanged', () => {
    // setCategoryBudgets replaces every line, so an omission would delete a budget.
    const plan = planRebalance(statuses, 'Dining')!;
    const out = applyRebalance(statuses, plan);
    expect(out.find(x => x.category === 'Rent')!.amount).toBe(20000);
    expect(out).toHaveLength(statuses.length);
  });

  it('preserves each line’s cadence', () => {
    const mixed = [line('Dining', 1000, 3000), line('Fuel', 9000, 1000), line('Ins', 5000, 0, 'yearly')];
    const plan = planRebalance(mixed, 'Dining')!;
    const out = applyRebalance(mixed, plan);
    expect(out.find(x => x.category === 'Ins')!.cadence).toBe('yearly');
  });
});
