import { loadReportsData } from '../lib/reportsData';
import { loadInsightsData } from '../lib/insightsData';
import { getBudgetAnalytics } from '../lib/analytics';
import { getAllGroups } from '../db/queries/groups';
import { getAffordSnapshot } from '../db/queries/savings';
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
    // Fixed dates: `earlier` must be a different month, and the old setMonth(0)
    // form landed in the selected month every January, leaking ₹95,000 in.
    const thisMonth = new Date(2026, 5, 15, 12, 0, 0, 0);   // 15 Jun 2026
    const earlier = new Date(2026, 0, 20, 12, 0, 0, 0);     // 20 Jan 2026

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

  // `now` passed explicitly, as the getBudgetAnalytics tests above do: month spend
  // is spend-to-date, so a mid-month fixture only counts once `now` reaches it.
  it('surfaces an over-budget category as a driver', async () => {
    const { db, me, personal } = setup();
    addCategory(db, 'Food');
    setCategoryBudget(db, { groupId: personal, category: 'Food', amount: 10000 });
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 25000, date: at(midMonth()), category: 'Food' });

    const d = await loadInsightsData(asDb(db), {}, midMonth());
    expect(d.drivers.map(x => x.category)).toContain('Food');
    expect(d.monthSpend).toBe(25000);
  });

  it('computes a what-if cut against the current month spend', async () => {
    const { db, me, personal } = setup();
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 100000, date: at(midMonth()) });

    const d = await loadInsightsData(asDb(db), {}, midMonth());
    expect(d.monthSpend).toBe(100000);
    expect(d.whatIf).toBeDefined();
  });

  // Guards the my-share basis: every other fixture is single-member, where my
  // share equals the group total, so the old sum-all implementation passed them.
  it('counts only my share of a shared-group expense', async () => {
    const { db, me, personal } = setup();
    const flatmate = addPerson(db, 'Flatmate', false);
    const shared = addGroup(db, 'Flat', false);
    addMember(db, shared, me);
    addMember(db, shared, flatmate);

    // ₹1,000 dinner split evenly. Mine is ₹500; the group spent ₹1,000.
    addTxn(db, {
      groupId: shared, kind: 'expense', date: at(midMonth()), category: 'Food',
      payments: [{ personId: me, amount: 100000 }],
      shares: [{ personId: me, amount: 50000 }, { personId: flatmate, amount: 50000 }],
    });
    // Plus a purely personal ₹200, wholly mine.
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 20000, date: at(midMonth()), category: 'Travel' });

    const d = await loadInsightsData(asDb(db), {}, midMonth());
    expect(d.monthSpend).toBe(70000);              // 500 + 200, not 1000 + 200
    expect(d.whatIf).toEqual({ name: 'Food', monthly: 50000 });
  });

  it('excludes future-dated spend from month-to-date', async () => {
    const { db, me, personal } = setup();
    const early = midMonth(); early.setDate(2);
    const later = midMonth(); later.setDate(20);
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 30000, date: at(early) });
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 70000, date: at(later) });

    // As of the 10th, only the 2nd's expense has happened yet.
    const d = await loadInsightsData(asDb(db), {}, (() => { const n = midMonth(); n.setDate(10); return n; })());
    expect(d.monthSpend).toBe(30000);
  });
});

describe('getAffordSnapshot — monthly income basis', () => {
  const setup = () => {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const personal = addGroup(db, 'Personal', true);
    addMember(db, personal, me);
    return { db, me, personal };
  };

  it('prefers an active recurring income rule over the 30-day sample', async () => {
    const { db, me, personal } = setup();
    // The salary rule onboarding writes: ₹85,000/month.
    addTxn(db, {
      groupId: personal, kind: 'income', date: Date.now(), category: 'Salary',
      payments: [{ personId: me, amount: 8500000 }], recurFreq: 'monthly',
    });
    // A stray ₹1,200 reimbursement actually logged in the window.
    addTxn(db, {
      groupId: personal, kind: 'income', date: Date.now() - 86400000, category: 'Other',
      payments: [{ personId: me, amount: 120000 }],
    });

    const snap = await getAffordSnapshot(asDb(db));
    expect(snap.incomeSource).toBe('rule');
    expect(snap.monthlyIncome).toBe(8500000);
    // The bug this fixes: ₹5,000 against the ₹1,200 sample was 417%.
    expect(Math.round((500000 / snap.monthlyIncome) * 100)).toBe(6);
  });

  it('normalises a non-monthly income rule to a monthly figure', async () => {
    const { db, me, personal } = setup();
    addTxn(db, {
      groupId: personal, kind: 'income', date: Date.now(), category: 'Salary',
      payments: [{ personId: me, amount: 1200000 }], recurFreq: 'yearly',
    });
    const snap = await getAffordSnapshot(asDb(db));
    expect(snap.monthlyIncome).toBe(100000);   // 12L/yr → 1L/mo
  });

  it('falls back to the 30-day sample when no income rule exists, and says so', async () => {
    const { db, me, personal } = setup();
    addTxn(db, {
      groupId: personal, kind: 'income', date: Date.now() - 86400000, category: 'Other',
      payments: [{ personId: me, amount: 120000 }],
    });
    const snap = await getAffordSnapshot(asDb(db));
    expect(snap.incomeSource).toBe('recent');
    expect(snap.monthlyIncome).toBe(120000);
  });

  it('reports none when there is no income at all, so no share is shown', async () => {
    const { db } = setup();
    const snap = await getAffordSnapshot(asDb(db));
    expect(snap.incomeSource).toBe('none');
    expect(snap.monthlyIncome).toBe(0);
  });

  it("ignores another member's income in a shared group", async () => {
    const { db, me, personal } = setup();
    const other = addPerson(db, 'Flatmate', false);
    const shared = addGroup(db, 'Flat', false);
    addMember(db, shared, me);
    addMember(db, shared, other);
    addTxn(db, {
      groupId: shared, kind: 'income', date: Date.now(), category: 'Salary',
      payments: [{ personId: other, amount: 9900000 }], recurFreq: 'monthly',
    });
    const snap = await getAffordSnapshot(asDb(db));
    expect(snap.incomeSource).toBe('none');
  });
});
