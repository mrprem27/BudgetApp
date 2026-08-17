import { computeSafeToSpend, goalRemainingThisCycle } from '../lib/safeToSpend';
import { getSafeToSpend } from '../db/queries/spendPower';
import { createTestDb, addPerson, addGroup, addMember, addTxn, type TestDb } from './helpers/testDb';
import type * as SQLite from 'expo-sqlite';

const asDb = (db: TestDb) => db as unknown as SQLite.SQLiteDatabase;

describe('computeSafeToSpend', () => {
  it('subtracts every claim from liquid cash', () => {
    const s = computeSafeToSpend({ available: 100000, upcomingBills: 30000, goalRemaining: 20000, netIOwe: 10000 });
    expect(s.amount).toBe(40000);
  });

  it('goes negative honestly when over-committed', () => {
    const s = computeSafeToSpend({ available: 10000, upcomingBills: 30000, goalRemaining: 0, netIOwe: 0 });
    expect(s.amount).toBe(-20000);
  });

  it('clamps claim terms at zero but lets available stay negative', () => {
    const s = computeSafeToSpend({ available: -5000, upcomingBills: -100, goalRemaining: NaN, netIOwe: -1 });
    expect(s.amount).toBe(-5000);
    expect(s.upcomingBills).toBe(0);
    expect(s.goalRemaining).toBe(0);
  });
});

describe('goalRemainingThisCycle', () => {
  const goal = (id: string, monthlyRate: number, saved = 0, target = 1000000) => ({ id, monthlyRate, saved, target });

  it('sums the unfunded remainder per goal', () => {
    const out = goalRemainingThisCycle(
      [goal('a', 50000), goal('b', 30000)],
      { a: 20000 },
    );
    expect(out).toBe(30000 + 30000);
  });

  it('an over-funded month claims nothing more', () => {
    expect(goalRemainingThisCycle([goal('a', 50000)], { a: 80000 })).toBe(0);
  });

  it('completed goals and zero-rate goals claim nothing', () => {
    expect(goalRemainingThisCycle([goal('done', 50000, 1000000, 1000000), goal('idle', 0)], {})).toBe(0);
  });
});

/**
 * Assembly wiring: the number Home leads with must reflect real rows. The
 * settlement-exposure subtraction is the term no benchmark app has — it is the
 * split-app half of this app doing its job in the money half.
 */
describe('getSafeToSpend (db)', () => {
  it('returns zeros on an empty database instead of inventing a figure', async () => {
    const db = createTestDb();
    addPerson(db, 'Me', true);
    const s = await getSafeToSpend(asDb(db));
    expect(s.amount).toBe(0);
  });

  it('subtracts what I owe a friend, net, from spendable cash', async () => {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const friend = addPerson(db, 'Aarav', false);
    const personal = addGroup(db, 'Personal', true);
    addMember(db, personal, me);
    const shared = addGroup(db, 'Flat', false);
    addMember(db, shared, me);
    addMember(db, shared, friend);

    // Income gives me cash…
    addTxn(db, {
      groupId: personal, kind: 'income', date: Date.now() - 86400000, category: 'Salary',
      payments: [{ personId: me, amount: 100000 }], shares: [],
    });
    // …and a friend-paid dinner leaves me owing my ₹300 share.
    addTxn(db, {
      groupId: shared, kind: 'expense', date: Date.now() - 3600000, category: 'Food',
      payments: [{ personId: friend, amount: 60000 }],
      shares: [{ personId: me, amount: 30000 }, { personId: friend, amount: 30000 }],
    });

    const s = await getSafeToSpend(asDb(db));
    expect(s.available).toBe(100000);
    expect(s.netIOwe).toBe(30000);
    expect(s.amount).toBe(70000);
  });
});
