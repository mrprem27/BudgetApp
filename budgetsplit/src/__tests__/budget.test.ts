import { getDaysInMonth } from 'date-fns';
import type * as SQLite from 'expo-sqlite';
import { getPeriodRange, getCategoryBudgetStatus } from '../lib/budget';
import { getBudgetAnalytics } from '../lib/analytics';
import {
  createTestDb, addPerson, addGroup, addMember, addCategory, addSimpleExpense,
  setCategoryBudget, type TestDb,
} from './helpers/testDb';

// Local-time ms helper (budget.ts uses date-fns, which works in local time).
const at = (y: number, m: number, d: number, h = 0, mi = 0, s = 0, ms = 0) =>
  new Date(y, m, d, h, mi, s, ms).getTime();

describe('getPeriodRange', () => {
  it('daily spans local midnight to 23:59:59.999', () => {
    const { from, to } = getPeriodRange('daily', new Date(2026, 5, 15, 13, 30));
    expect(from).toBe(at(2026, 5, 15));
    expect(to).toBe(at(2026, 5, 15, 23, 59, 59, 999));
  });

  it('monthly spans the first to the last day of the month (Feb 2026 = 28 days)', () => {
    const { from, to } = getPeriodRange('monthly', new Date(2026, 1, 10));
    expect(from).toBe(at(2026, 1, 1));
    expect(to).toBe(at(2026, 1, 28, 23, 59, 59, 999));
  });

  it('yearly spans Jan 1 to Dec 31', () => {
    const { from, to } = getPeriodRange('yearly', new Date(2026, 7, 20));
    expect(from).toBe(at(2026, 0, 1));
    expect(to).toBe(at(2026, 11, 31, 23, 59, 59, 999));
  });
});

// getPriorPeriodRange's tests went with it — it existed only to compute the
// previous period's unused budget for group-level carry-over, which was removed
// (nothing ever wrote budget_group.limit_*, so it could not run).


/**
 * "Spent" is what happened, not what is scheduled, and an aggregate's numerator
 * and denominator have to share a window. Neither was true before.
 */
describe('spend windows end at now, not at the end of the period', () => {
  const asDb = (db: TestDb) => db as unknown as SQLite.SQLiteDatabase;

  function setup() {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const g = addGroup(db, 'Flat', false);
    addMember(db, g, me);
    addCategory(db, 'Food');
    return { db, me, g };
  }

  const group = (id: string) => ({ id, name: 'Flat', is_personal: 0 } as never);

  it('excludes a transaction dated later this month', async () => {
    const { db, me, g } = setup();
    setCategoryBudget(db, { groupId: g, category: 'Food', amount: 100000 });
    // The checklist's example: a ₹50,000 fee dated the 28th, logged on the 2nd.
    const later = new Date(); later.setDate(later.getDate() + 3);
    addSimpleExpense(db, { groupId: g, personId: me, amount: 5_000_000, date: later.getTime(), category: 'Food' });

    const rows = await getCategoryBudgetStatus(asDb(db), group(g), { meId: me });
    const food = rows.find(r => r.category === 'Food')!;
    expect(food.spent).toBe(0);
    // ...and therefore does not blow the budget four weeks before the money moves.
    expect(food.health).not.toBe('red');
  });

  it('still counts a transaction dated earlier today', async () => {
    const { db, me, g } = setup();
    setCategoryBudget(db, { groupId: g, category: 'Food', amount: 100000 });
    addSimpleExpense(db, { groupId: g, personId: me, amount: 40000, date: Date.now() - 60_000, category: 'Food' });

    const rows = await getCategoryBudgetStatus(asDb(db), group(g), { meId: me });
    expect(rows.find(r => r.category === 'Food')!.spent).toBe(40000);
  });
});

/**
 * `utilizationPct` used to divide spend measured in each line's OWN window by a
 * raw sum of mixed-cadence allocations. It fed the group Budget tab, Reports, the
 * Groups list, Home's health engine and the Plan forecast. This is the assertion
 * that would have caught it.
 */
describe('getBudgetAnalytics aggregates over one window, rate lines only', () => {
  const asDb = (db: TestDb) => db as unknown as SQLite.SQLiteDatabase;
  const group = (id: string) => ({ id, name: 'Flat', is_personal: 0 } as never);

  function setup() {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const g = addGroup(db, 'Flat', false);
    addMember(db, g, me);
    addCategory(db, 'Food');
    addCategory(db, 'Trips');
    return { db, me, g };
  }

  it('leaves a yearly budget out of the monthly allocation and reports it as pooled', async () => {
    const { db, me, g } = setup();
    setCategoryBudget(db, { groupId: g, category: 'Food', amount: 500000, cadence: 'monthly' });
    setCategoryBudget(db, { groupId: g, category: 'Trips', amount: 2_400_000, cadence: 'yearly' });

    const a = await getBudgetAnalytics(asDb(db), group(g), { meId: me });
    expect(a.totalAllocated).toBe(500000);          // was 2,900,000
    expect(a.pooledAllocated).toBe(2_400_000);
    expect(a.pooledCount).toBe(1);
  });

  it('excludes pooled-category spend from the ratio too, not just the allocation', async () => {
    const { db, me, g } = setup();
    setCategoryBudget(db, { groupId: g, category: 'Food', amount: 500000, cadence: 'monthly' });
    setCategoryBudget(db, { groupId: g, category: 'Trips', amount: 2_400_000, cadence: 'yearly' });
    addSimpleExpense(db, { groupId: g, personId: me, amount: 250000, date: Date.now() - 60_000, category: 'Food' });
    addSimpleExpense(db, { groupId: g, personId: me, amount: 2_000_000, date: Date.now() - 60_000, category: 'Trips' });

    const a = await getBudgetAnalytics(asDb(db), group(g), { meId: me });
    // Dropping the allocation but keeping the spend would read 450% used.
    expect(a.totalSpent).toBe(250000);
    expect(a.utilizationPct).toBe(50);
  });

  it('rolls a daily line into the monthly allocation rather than ignoring it', async () => {
    const { db, me, g } = setup();
    setCategoryBudget(db, { groupId: g, category: 'Food', amount: 10000, cadence: 'daily' });
    const now = new Date();
    const a = await getBudgetAnalytics(asDb(db), group(g), { meId: me, now });
    expect(a.totalAllocated).toBe(10000 * getDaysInMonth(now));
    // `monthlyBudgetTotal` drove the projection comparison and used to filter to
    // `cadence === 'monthly'`, so a daily budget contributed nothing at all.
    expect(a.monthlyBudgetTotal).toBe(a.totalAllocated);
  });
});
