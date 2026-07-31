import { loadReportsData } from '../lib/reportsData';
import { loadInsightsData } from '../lib/insightsData';
import { getBudgetAnalytics } from '../lib/analytics';
import { getAllGroups } from '../db/queries/groups';
import { createTestDb, addPerson, addGroup, addMember, addSimpleExpense, addTxn, addCategory, setCategoryBudget, type TestDb } from './helpers/testDb';
import type * as SQLite from 'expo-sqlite';

/**
 * The remaining screen-data assemblers: Reports, Insights and the budget
 * analytics engine they both build on. Like homeData, these composed several
 * tested engines in untested ways — the coverage gap DEBT_TRACKER.md missed.
 *
 * Run against a real in-process SQLite through the `testDb` adapter, so the
 * queries execute rather than being mocked.
 */

const asDb = (db: TestDb) => db as unknown as SQLite.SQLiteDatabase;

/** Mid-month midday, so month/prev-month windows are unambiguous. */
const midMonth = () => { const d = new Date(); d.setDate(15); d.setHours(12, 0, 0, 0); return d; };
const at = (d: Date) => d.getTime();

function setup() {
  const db = createTestDb();
  const me = addPerson(db, 'Me', true);
  const personal = addGroup(db, 'Personal', true);
  addMember(db, personal, me);
  return { db, me, personal };
}

describe('getBudgetAnalytics', () => {
  it('returns an empty analysis when no budgets exist, without querying spend', async () => {
    const { db, me, personal } = setup();
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 50000, date: at(midMonth()) });

    const [grp] = await getAllGroups(asDb(db));
    const a = await getBudgetAnalytics(asDb(db), grp, midMonth());
    expect(a.totalAllocated).toBe(0);
    expect(a.overBudget).toEqual([]);
    expect(a.nearLimit).toEqual([]);
  });

  it('classifies a category as over budget past 100%', async () => {
    const { db, me, personal } = setup();
    addCategory(db, 'Food');
    setCategoryBudget(db, { groupId: personal, category: 'Food', amount: 10000 });
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 15000, date: at(midMonth()), category: 'Food' });

    const [grp] = await getAllGroups(asDb(db));
    const a = await getBudgetAnalytics(asDb(db), grp, midMonth());
    expect(a.overBudget.map(c => c.category)).toEqual(['Food']);
    expect(a.totalAllocated).toBe(10000);
    expect(a.totalSpent).toBe(15000);
  });

  it('classifies 80–99% as near the limit, and below as under', async () => {
    const { db, me, personal } = setup();
    addCategory(db, 'Food');
    addCategory(db, 'Travel');
    setCategoryBudget(db, { groupId: personal, category: 'Food', amount: 10000 });
    setCategoryBudget(db, { groupId: personal, category: 'Travel', amount: 10000 });
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 8500, date: at(midMonth()), category: 'Food' });
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 1000, date: at(midMonth()), category: 'Travel' });

    const [grp] = await getAllGroups(asDb(db));
    const a = await getBudgetAnalytics(asDb(db), grp, midMonth());
    expect(a.nearLimit.map(c => c.category)).toEqual(['Food']);
    expect(a.underBudget.map(c => c.category)).toEqual(['Travel']);
  });

  it('never counts a recurring rule template against a budget', async () => {
    const { db, me, personal } = setup();
    addCategory(db, 'Rent');
    setCategoryBudget(db, { groupId: personal, category: 'Rent', amount: 100000 });
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 90000, date: at(midMonth()), category: 'Rent', recurFreq: 'monthly' });

    const [grp] = await getAllGroups(asDb(db));
    const a = await getBudgetAnalytics(asDb(db), grp, midMonth());
    expect(a.totalSpent).toBe(0);
  });
});

describe('loadReportsData', () => {
  it('survives an empty database', async () => {
    const { db } = setup();
    const d = await loadReportsData(asDb(db), midMonth());
    expect(d.monthSpent).toBe(0);
    expect(d.monthEarned).toBe(0);
    expect(d.yearExpense).toBe(0);
  });

  it('separates month spend from month earnings', async () => {
    const { db, me, personal } = setup();
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 30000, date: at(midMonth()) });
    addTxn(db, {
      groupId: personal, kind: 'income', date: at(midMonth()), category: 'Salary',
      payments: [{ personId: me, amount: 500000 }], shares: [{ personId: me, amount: 500000 }],
    });

    const d = await loadReportsData(asDb(db), midMonth());
    expect(d.monthSpent).toBe(30000);
    expect(d.monthEarned).toBe(500000);
  });

  it('scopes the previous month separately from the selected one', async () => {
    const { db, me, personal } = setup();
    const thisMonth = midMonth();
    const prev = new Date(thisMonth); prev.setMonth(prev.getMonth() - 1);

    addSimpleExpense(db, { groupId: personal, personId: me, amount: 10000, date: at(thisMonth) });
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 70000, date: at(prev) });

    const d = await loadReportsData(asDb(db), thisMonth);
    expect(d.monthSpent).toBe(10000);
    expect(d.prevSpent).toBe(70000);
  });

  it('excludes recurring rule templates from every total', async () => {
    const { db, me, personal } = setup();
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 40000, date: at(midMonth()), recurFreq: 'monthly' });

    const d = await loadReportsData(asDb(db), midMonth());
    expect(d.monthSpent).toBe(0);
    expect(d.yearExpense).toBe(0);
  });

  it('reports the largest single expense and top category for the YEAR', async () => {
    // biggestTxn is a paise amount (not a transaction), and both it and
    // yearTopCat are year-scoped — the "year in review" block, not the month.
    const { db, me, personal } = setup();
    const thisMonth = midMonth();
    const earlier = new Date(thisMonth); earlier.setMonth(0); earlier.setDate(20);

    addSimpleExpense(db, { groupId: personal, personId: me, amount: 10000, date: at(thisMonth), category: 'Food' });
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 95000, date: at(earlier), category: 'Rent' });

    const d = await loadReportsData(asDb(db), thisMonth);
    expect(d.biggestTxn).toBe(95000);   // from January, still the year's biggest
    expect(d.yearTopCat).toBe('Rent');
    expect(d.monthSpent).toBe(10000);   // but the month total ignores it
  });
});

describe('loadInsightsData', () => {
  it('survives an empty database', async () => {
    const { db } = setup();
    const d = await loadInsightsData(asDb(db));
    expect(d.monthSpend).toBe(0);
    expect(d.shifts).toEqual([]);
    expect(d.drivers).toEqual([]);
  });

  it('skips the savings query when the flag is off', async () => {
    const { db } = setup();
    const off = await loadInsightsData(asDb(db), { savingsInsights: false });
    expect(off.savings).toEqual([]);
  });

  it('surfaces an over-budget category as a driver', async () => {
    const { db, me, personal } = setup();
    addCategory(db, 'Food');
    setCategoryBudget(db, { groupId: personal, category: 'Food', amount: 10000 });
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 25000, date: at(midMonth()), category: 'Food' });

    const d = await loadInsightsData(asDb(db));
    expect(d.drivers.map(x => x.category)).toContain('Food');
    expect(d.monthSpend).toBe(25000);
  });

  it('computes a what-if cut against the current month spend', async () => {
    const { db, me, personal } = setup();
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 100000, date: at(midMonth()) });

    const d = await loadInsightsData(asDb(db));
    expect(d.monthSpend).toBe(100000);
    expect(d.whatIf).toBeDefined();
  });
});
