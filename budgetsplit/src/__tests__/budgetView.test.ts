import fs from 'fs';
import type * as SQLite from 'expo-sqlite';
import { createTestDb, addPerson, addGroup, addMember, addTxn, addCategory, setCategoryBudget, type TestDb } from './helpers/testDb';
import { budgetRowsAt, getBudgetView } from '../lib/budget';

const asDb = (db: TestDb) => db as unknown as SQLite.SQLiteDatabase;
// 15 October 2026: a 31-day month in a 365-day year.
const NOW = new Date(2026, 9, 15, 12);
const R = (rupees: number) => rupees * 100;

// U-89: Daily / Monthly / Yearly on the Budget tab. A line counts in its own period and every
// longer one, never a shorter one.
describe('budgetRowsAt: one row per category at a period', () => {
  const lines = [
    { category: 'Chai', cadence: 'daily' as const, amount: R(50) },
    { category: 'Rent', cadence: 'monthly' as const, amount: R(20_000) },
    { category: 'Trips', cadence: 'yearly' as const, amount: R(24_000) },
  ];
  const cats = (rows: { category: string }[]) => rows.map(r => r.category).sort();

  it('by the day: only daily limits can be judged', () => {
    const rows = budgetRowsAt(lines, { Chai: R(30) }, 'daily', NOW);
    expect(cats(rows)).toEqual(['Chai']);
    expect(rows[0]).toMatchObject({ allocated: R(50), spent: R(30), cadence: 'daily', pct: 60 });
  });

  it('by the month: a daily limit fills the month, a yearly one does not divide into it', () => {
    const rows = budgetRowsAt(lines, {}, 'monthly', NOW);
    expect(cats(rows)).toEqual(['Chai', 'Rent']);
    expect(rows.find(r => r.category === 'Chai')!.allocated).toBe(R(50) * 31);
    expect(rows.find(r => r.category === 'Rent')!.allocated).toBe(R(20_000));
  });

  it('by the year: everything fills it, each by its own multiple', () => {
    const rows = budgetRowsAt(lines, {}, 'yearly', NOW);
    expect(cats(rows)).toEqual(['Chai', 'Rent', 'Trips']);
    expect(rows.find(r => r.category === 'Chai')!.allocated).toBe(R(50) * 365);
    expect(rows.find(r => r.category === 'Rent')!.allocated).toBe(R(20_000) * 12);
    expect(rows.find(r => r.category === 'Trips')!.allocated).toBe(R(24_000));
  });

  it('a category with two lines is one row, the sum of what rolls up', () => {
    const both = [
      { category: 'Food', cadence: 'daily' as const, amount: R(100) },
      { category: 'Food', cadence: 'monthly' as const, amount: R(1_000) },
    ];
    expect(budgetRowsAt(both, {}, 'monthly', NOW)[0].allocated).toBe(R(100) * 31 + R(1_000));
    expect(budgetRowsAt(both, {}, 'daily', NOW)[0].allocated).toBe(R(100));
  });
});

describe('getBudgetView: the headline and the rows are one reading', () => {
  function setup() {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const home = addGroup(db, 'Personal', true);
    addMember(db, home, me);
    for (const c of ['Chai', 'Rent', 'Trips']) addCategory(db, c);
    setCategoryBudget(db, { groupId: home, category: 'Chai', cadence: 'daily', amount: R(50) });
    setCategoryBudget(db, { groupId: home, category: 'Rent', cadence: 'monthly', amount: R(20_000) });
    setCategoryBudget(db, { groupId: home, category: 'Trips', cadence: 'yearly', amount: R(24_000) });
    const spend = (category: string, rupees: number, date: Date) => addTxn(db, {
      groupId: home, kind: 'expense', date: date.getTime(), category,
      payments: [{ personId: me, amount: R(rupees) }], shares: [{ personId: me, amount: R(rupees) }],
    });
    spend('Chai', 30, new Date(2026, 9, 15, 9));       // today
    spend('Chai', 40, new Date(2026, 9, 3, 9));        // this month
    spend('Rent', 20_000, new Date(2026, 9, 2, 9));    // this month
    spend('Trips', 9_000, new Date(2026, 5, 10, 9));   // this year
    return { db, me };
  }

  it('reads the same budget three ways, and names what each leaves out', async () => {
    const { db, me } = setup();
    const day = await getBudgetView(asDb(db), me, null, 'daily', NOW);
    expect(day).toMatchObject({ allocated: R(50), spent: R(30), pooledCount: 2, pooled: R(44_000) });

    const month = await getBudgetView(asDb(db), me, null, 'monthly', NOW);
    expect(month).toMatchObject({ allocated: R(50) * 31 + R(20_000), spent: R(70) + R(20_000), pooledCount: 1 });

    const year = await getBudgetView(asDb(db), me, null, 'yearly', NOW);
    expect(year).toMatchObject({ allocated: R(50) * 365 + R(20_000) * 12 + R(24_000), spent: R(70) + R(20_000) + R(9_000), pooledCount: 0 });

    for (const v of [day, month, year]) {
      expect(v.rows.reduce((t, r) => t + r.allocated, 0)).toBe(v.allocated);
      expect(v.rows.reduce((t, r) => t + r.spent, 0)).toBe(v.spent);
    }
  });

  it('is empty, not broken, with no budget', async () => {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    addMember(db, addGroup(db, 'Personal', true), me);
    expect(await getBudgetView(asDb(db), me, null, 'monthly', NOW)).toMatchObject({ allocated: 0, rows: [], pooledCount: 0, pct: null });
  });
});

describe('the Budget tab always shows the switch', () => {
  it('Personal and every group render the period view, which owns the switch', () => {
    expect(fs.readFileSync('app/(people)/personal.tsx', 'utf8')).toMatch(/<BudgetPeriodView\s+groupId=\{null\}/);
    expect(fs.readFileSync('src/components/finance/group/BudgetTab.tsx', 'utf8')).toMatch(/<BudgetPeriodView\s+groupId=\{groupId\}/);
    const list = fs.readFileSync('src/components/finance/budget/BudgetList.tsx', 'utf8');
    expect(list).toMatch(/<TabPills tabs=\{PERIODS\} active=\{period\}/);
    // Shown even when nothing can be read at this period, so you can switch away from it.
    expect(list.indexOf('{periods}')).toBeLessThan(list.indexOf('<SummaryCard'));
  });
  it('a re-plan is offered on the monthly view only', () => {
    expect(fs.readFileSync('src/components/finance/group/BudgetTab.tsx', 'utf8')).toMatch(/period === 'monthly' && c\.remaining < 0/);
  });
});
