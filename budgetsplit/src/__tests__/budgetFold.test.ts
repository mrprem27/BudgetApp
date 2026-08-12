import { foldBudgetStatuses, rollUpBudgets, type CategoryBudgetStatus } from '../lib/budget';
import { OTHERS_LABEL } from '../lib/categoryFold';

/**
 * Budget lines follow the same catalog rule as spend.
 *
 * `category_budget.category` is a loose name, not a foreign key, so a group
 * default can budget "Gym" while your catalog has no Gym. Spend on Gym already
 * folded into Others (`foldUncategorized`); its *budget* did not, and sat in the
 * list as a category you do not have. Adopting the category un-folds it with the
 * amount intact — nothing is redistributed.
 */
const row = (
  category: string, allocated: number, spent: number,
  cadence: CategoryBudgetStatus['cadence'] = 'monthly',
): CategoryBudgetStatus => ({
  category, cadence, allocated, spent,
  remaining: allocated - spent,
  pct: allocated > 0 ? Math.round((spent / allocated) * 100) : null,
  health: 'green',
});

const known = (...names: string[]) => new Set(names);
const find = (rows: CategoryBudgetStatus[], name: string) => rows.find(r => r.category === name);

describe('foldBudgetStatuses', () => {
  const rows = [row('Groceries', 500000, 100000), row('Gym', 200000, 50000)];

  it('folds a line whose category is not in the catalog', () => {
    const out = foldBudgetStatuses(rows, known('Groceries'));
    expect(find(out, 'Gym')).toBeUndefined();
    expect(find(out, OTHERS_LABEL)).toMatchObject({ allocated: 200000, spent: 50000 });
  });

  it('un-folds it, unchanged, once the category is adopted', () => {
    const out = foldBudgetStatuses(rows, known('Groceries', 'Gym'));
    expect(find(out, 'Gym')).toMatchObject({ allocated: 200000, spent: 50000 });
    expect(find(out, OTHERS_LABEL)).toBeUndefined();
  });

  it('NEVER moves money — the total is identical either way', () => {
    // The property the whole design rests on: this is presentation, not arithmetic.
    const before = foldBudgetStatuses(rows, known('Groceries'));
    const after = foldBudgetStatuses(rows, known('Groceries', 'Gym'));
    const total = (rs: CategoryBudgetStatus[]) => rs.reduce((s, r) => s + r.allocated, 0);
    expect(total(before)).toBe(700000);
    expect(total(after)).toBe(700000);
  });

  it('leaves rollUpBudgets untouched, folded or not', () => {
    const lines = rows.map(r => ({ cadence: r.cadence, amount: r.allocated }));
    const on = new Date(2026, 0, 15);
    expect(rollUpBudgets(lines, 'monthly', on).amount).toBe(700000);
  });

  it('combines several unknown categories into ONE Others row', () => {
    const out = foldBudgetStatuses(
      [row('Groceries', 500000, 0), row('Gym', 200000, 20000), row('Yoga', 100000, 30000)],
      known('Groceries'),
    );
    expect(out).toHaveLength(2);
    expect(find(out, OTHERS_LABEL)).toMatchObject({ allocated: 300000, spent: 50000 });
  });

  it('keeps cadences apart — a daily and a monthly line share no window', () => {
    const out = foldBudgetStatuses(
      [row('Gym', 200000, 20000, 'monthly'), row('Chai', 10000, 4000, 'daily')],
      known(),
    );
    const others = out.filter(r => r.category === OTHERS_LABEL);
    expect(others).toHaveLength(2);
    expect(others.find(r => r.cadence === 'daily')).toMatchObject({ allocated: 10000 });
    expect(others.find(r => r.cadence === 'monthly')).toMatchObject({ allocated: 200000 });
  });

  it('recomputes the folded percentage from the merged totals', () => {
    const out = foldBudgetStatuses([row('Gym', 200000, 100000), row('Yoga', 200000, 0)], known());
    // 100,000 spent of 400,000 allocated — not the average of 50% and 0%.
    expect(find(out, OTHERS_LABEL)!.pct).toBe(25);
  });

  it('marks a folded bucket over budget when the merge tips it over', () => {
    const out = foldBudgetStatuses([row('Gym', 100000, 90000), row('Yoga', 100000, 130000)], known());
    expect(find(out, OTHERS_LABEL)!.health).toBe('red');
  });

  it('treats a real "Others" category in the catalog as itself, not a bucket', () => {
    const out = foldBudgetStatuses([row(OTHERS_LABEL, 100000, 10000)], known(OTHERS_LABEL));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ category: OTHERS_LABEL, allocated: 100000 });
  });

  it('is a no-op when every category is known', () => {
    const out = foldBudgetStatuses(rows, known('Groceries', 'Gym'));
    expect(out.map(r => r.category).sort()).toEqual(['Groceries', 'Gym']);
  });

  it('handles an empty list', () => {
    expect(foldBudgetStatuses([], known('Groceries'))).toEqual([]);
  });
});
