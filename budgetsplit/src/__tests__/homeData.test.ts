import { loadHomeData } from '../lib/homeData';
import { getAllGroups } from '../db/queries/groups';
import { createTestDb, addPerson, addGroup, addMember, addSimpleExpense, addTxn, addCategory, setCategoryBudget, type TestDb } from './helpers/testDb';
import type * as SQLite from 'expo-sqlite';

/**
 * `homeData` decides what the Dashboard shows — the most-viewed screen in the
 * app — and had no test. It composes several well-covered engines (budget,
 * forecast, financialHealth, exposure) in ways none of them can verify.
 *
 * These run the real assembler against a real in-process SQLite via the
 * `testDb` adapter, so the whole query stack executes. They target the branches
 * that change what a user sees, not line coverage.
 */

const asDb = (db: TestDb) => db as unknown as SQLite.SQLiteDatabase;

/**
 * A moment today that has already happened. Spend windows now END AT `now` rather
 * than at the end of the period ("spent" is what happened, not what is scheduled),
 * so a fixture dated midday was in the *future* for any run before noon — the whole
 * suite passed after lunch and failed before it. `Date.now()` is always in the past
 * by the time the loader reads the clock.
 */
const today = () => Date.now();
const daysAgo = (n: number) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return d.getTime(); };

function setup() {
  const db = createTestDb();
  const me = addPerson(db, 'Me', true);
  const personal = addGroup(db, 'Personal', true);
  addMember(db, personal, me);
  return { db, me, personal, groups: [] as never[] };
}

/** loadHomeData takes the groups list from the store, mirroring the screen. */
async function load(db: TestDb, tab: 'today' | 'month' | 'year') {
  const groups = await getAllGroups(asDb(db));
  return loadHomeData(asDb(db), groups, tab);
}

describe('loadHomeData — empty state', () => {
  it('reports zeros rather than throwing when there is no data at all', async () => {
    const { db } = setup();
    const d = await load(db, 'month');
    expect(d.spending).toBe(0);
    expect(d.income).toBe(0);
    expect(d.catRows).toEqual([]);
    expect(d.oweTotal).toBe(0);
    expect(d.owedTotal).toBe(0);
  });

  it('produces no forecast before there is spend to extrapolate from', async () => {
    const { db } = setup();
    const d = await load(db, 'month');
    expect(d.forecast?.ready ?? false).toBe(false);
  });
});

describe('loadHomeData — period scoping', () => {
  it('counts only today for the day tab', async () => {
    const { db, me, personal } = setup();
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 10000, date: today() });
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 50000, date: daysAgo(10) });

    expect((await load(db, 'today')).spending).toBe(10000);
  });

  it('counts the month so far for the month tab', async () => {
    const { db, me, personal } = setup();
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 10000, date: today() });
    // 10 days back can fall in the previous month near month start; use a date
    // that is definitely in this month.
    const inMonth = new Date(); inMonth.setDate(1); inMonth.setHours(0, 0, 0, 1);
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 50000, date: inMonth.getTime() });

    const d = await load(db, 'month');
    // Both land in this month; if today IS the 1st they're the same day, still 60000.
    expect(d.spending).toBe(60000);
  });

  it('separates income from spending', async () => {
    const { db, me, personal } = setup();
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 30000, date: today() });
    addTxn(db, {
      groupId: personal, kind: 'income', date: today(), category: 'Salary',
      payments: [{ personId: me, amount: 500000 }],
      shares: [{ personId: me, amount: 500000 }],
    });

    const d = await load(db, 'month');
    expect(d.spending).toBe(30000);
    expect(d.income).toBe(500000);
  });
});

describe('loadHomeData — the recur_freq invariant', () => {
  it('never counts a recurring RULE template as spend', async () => {
    const { db, me, personal } = setup();
    // A rule for ₹200/month. It is an instruction, not money spent.
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 20000, date: today(), recurFreq: 'monthly' });

    const d = await load(db, 'month');
    expect(d.spending).toBe(0);
    expect(d.catRows).toEqual([]);
  });

  it('counts a real expense alongside a rule for the same amount exactly once', async () => {
    const { db, me, personal } = setup();
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 20000, date: today(), recurFreq: 'monthly' });
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 20000, date: today() });

    expect((await load(db, 'month')).spending).toBe(20000);
  });

  it('ignores soft-deleted transactions', async () => {
    const { db, me, personal } = setup();
    const d1 = addSimpleExpense(db, { groupId: personal, personId: me, amount: 20000, date: today() });
    db.raw.prepare('UPDATE txn SET is_deleted = 1 WHERE id = ?').run(d1);

    expect((await load(db, 'month')).spending).toBe(0);
  });
});

describe('loadHomeData — category ranking', () => {
  it('ranks categories by my share, largest first', async () => {
    const { db, me, personal } = setup();
    addCategory(db, 'Food');
    addCategory(db, 'Rent');
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 10000, date: today(), category: 'Food' });
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 90000, date: today(), category: 'Rent' });

    const d = await load(db, 'month');
    expect(d.catRows.map(r => r.name)).toEqual(['Rent', 'Food']);
    expect(d.catTotal).toBe(100000);
  });

  it('folds names absent from the catalog into a single "Others" row', async () => {
    // Imported or renamed categories aren't in the catalog until adopted; they
    // must not each appear as their own rank row (foldUncategorized).
    const { db, me, personal } = setup();
    addCategory(db, 'Food');
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 10000, date: today(), category: 'Food' });
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 20000, date: today(), category: 'AMZN-MKTP' });
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 30000, date: today(), category: 'UPI-1234' });

    const d = await load(db, 'month');
    expect(d.catRows.map(r => r.name).sort()).toEqual(['Food', 'Others']);
    // Nothing is lost in the fold.
    expect(d.catTotal).toBe(60000);
    expect(d.catRows.find(r => r.name === 'Others')?.paise).toBe(50000);
  });

  it('counts only MY share of a shared expense', async () => {
    const { db, me } = setup();
    const other = addPerson(db, 'Alex');
    const shared = addGroup(db, 'Flat');
    addMember(db, shared, me);
    addMember(db, shared, other);
    // ₹1000 bill split evenly; I paid all of it but only consumed half.
    addTxn(db, {
      groupId: shared, kind: 'expense', date: today(), category: 'Food',
      payments: [{ personId: me, amount: 100000 }],
      shares: [{ personId: me, amount: 50000 }, { personId: other, amount: 50000 }],
    });

    expect((await load(db, 'month')).spending).toBe(50000);
  });
});

describe('loadHomeData — budget rollup', () => {
  it('returns the MONTHLY allocation unchanged for every tab', async () => {
    // The assembler always reports the monthly figure; scaling it to the active
    // period (÷ days for Today, × 12 for Year) is the screen's job, in
    // app/(tabs)/index.tsx. Pinned here so the two don't both start scaling.
    const { db, personal } = setup();
    addCategory(db, 'Total');
    setCategoryBudget(db, { groupId: personal, category: 'Total', amount: 3000000 });

    const [day, month, year] = await Promise.all([load(db, 'today'), load(db, 'month'), load(db, 'year')]);
    expect(month.budget.allocated).toBe(3000000);
    expect(day.budget.allocated).toBe(month.budget.allocated);
    expect(year.budget.allocated).toBe(month.budget.allocated);
  });

  it('counts spend against the budget', async () => {
    const { db, me, personal } = setup();
    addCategory(db, 'Food');
    setCategoryBudget(db, { groupId: personal, category: 'Food', amount: 100000 });
    addSimpleExpense(db, { groupId: personal, personId: me, amount: 40000, date: today(), category: 'Food' });

    const d = await load(db, 'month');
    expect(d.budget.allocated).toBe(100000);
    expect(d.budget.spent).toBe(40000);
  });
});

describe('loadHomeData — forecast scope', () => {
  // The `forecast` and `dashboardInsights` flags used to gate this. Both are gone:
  // they hid a fragment of a card, and the card already self-hides when the
  // forecast isn't credible. What's left is the one real rule — the month tab.
  it('computes a forecast on the month tab', async () => {
    const { db, me, personal } = setup();
    for (let i = 0; i < 8; i++) {
      addSimpleExpense(db, { groupId: personal, personId: me, amount: 10000, date: daysAgo(i) });
    }
    expect((await load(db, 'month')).forecast).not.toBeNull();
  });

  it('never computes a forecast outside the month tab', async () => {
    const { db, me, personal } = setup();
    for (let i = 0; i < 8; i++) {
      addSimpleExpense(db, { groupId: personal, personId: me, amount: 10000, date: daysAgo(i) });
    }
    expect((await load(db, 'today')).forecast).toBeNull();
    expect((await load(db, 'year')).forecast).toBeNull();
  });
});
