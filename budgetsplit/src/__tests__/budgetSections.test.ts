import { sectionSummary } from '../lib/budgetSections';
import { budgetHealth } from '../lib/budget';

const line = (cadence: 'daily' | 'monthly' | 'yearly', spent: number, allocated: number) => {
  const pct = Math.round((spent / allocated) * 100);
  return { cadence, spent, allocated, health: budgetHealth(pct) as 'green' | 'amber' | 'red' | 'none' };
};

describe('sectionSummary (U-55)', () => {
  it('sums a section of monthly lines into one spent / budget', () => {
    const s = sectionSummary([line('monthly', 3000, 5000), line('monthly', 1000, 5000)]);
    expect(s).toMatchObject({ cadence: 'monthly', spent: 4000, allocated: 10000, pct: 40, health: 'green', otherCount: 0 });
  });

  it('never adds a yearly line into a monthly figure', () => {
    const s = sectionSummary([line('monthly', 3000, 5000), line('yearly', 20000, 24000)]);
    expect(s).toMatchObject({ cadence: 'monthly', spent: 3000, allocated: 5000, otherCount: 1 });
  });

  it('reads in the one cadence it has when nothing is monthly', () => {
    const s = sectionSummary([line('yearly', 20000, 24000)]);
    expect(s).toMatchObject({ cadence: 'yearly', spent: 20000, allocated: 24000, pct: 83, health: 'amber', otherCount: 0 });
  });

  it('names a line that is over even when the section total is under', () => {
    const s = sectionSummary([line('monthly', 6000, 5000), line('monthly', 0, 20000)]);
    expect(s.health).toBe('green');
    expect(s.overCount).toBe(1);
  });

  it('uses the same health bands as every other budget figure', () => {
    for (const [spent, alloc] of [[0, 100], [79, 100], [80, 100], [100, 100], [150, 100]]) {
      const s = sectionSummary([line('monthly', spent, alloc)]);
      expect(s.health).toBe(budgetHealth(s.pct));
    }
  });
});
