import { writePendingSettlement } from '../lib/confirmSettlement';
import { getTransactionsInRange } from '../db/queries/transactions';
import { getMyExposure } from '../db/queries/balances';
import { createTestDb, addPerson, addGroup, addMember, addTxn, type TestDb } from './helpers/testDb';
import type * as SQLite from 'expo-sqlite';

const asDb = (db: TestDb) => db as unknown as SQLite.SQLiteDatabase;

/**
 * Confirming a handed-off settle-up writes real money movement, so this asserts
 * against the ledger and the exposure figures rather than against the return value.
 */
describe('writePendingSettlement', () => {
  function setup() {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const friend = addPerson(db, 'Aarav', false);
    const g1 = addGroup(db, 'Flat', false);
    addMember(db, g1, me);
    addMember(db, g1, friend);
    const g2 = addGroup(db, 'Trip', false);
    addMember(db, g2, me);
    addMember(db, g2, friend);
    return { db, me, friend, g1, g2 };
  }

  it('writes one settlement per plan, in the right direction', async () => {
    const { db, me, friend, g1, g2 } = setup();
    await writePendingSettlement(asDb(db), {
      plans: [
        { groupId: g1, from: me, to: friend, amount: 30000 },
        { groupId: g2, from: me, to: friend, amount: 20000 },
      ],
      amountPaise: 50000,
      payeeName: 'Aarav',
      category: 'Repayment',
      date: Date.now(),
      startedAt: Date.now(),
    });

    const rows = await getTransactionsInRange(asDb(db), null, 0, Date.now() + 1000);
    const settlements = rows.filter(t => t.kind === 'settlement');
    expect(settlements).toHaveLength(2);
    for (const s of settlements) {
      expect(s.payments[0].personId).toBe(me);
      expect(s.shares[0].personId).toBe(friend);
      expect(s.category).toBe('Repayment');
    }
    expect(settlements.map(s => s.group_id).sort()).toEqual([g1, g2].sort());
  });

  it('clears what I owe, so confirming is the same as saving by hand', async () => {
    const { db, me, friend, g1 } = setup();
    // Aarav paid ₹600 and I owe my ₹300 half.
    addTxn(db, {
      groupId: g1, kind: 'expense', date: Date.now(), category: 'Food',
      payments: [{ personId: friend, amount: 60000 }],
      shares: [{ personId: me, amount: 30000 }, { personId: friend, amount: 30000 }],
    });
    expect((await getMyExposure(asDb(db), me)).owe).toBe(30000);

    await writePendingSettlement(asDb(db), {
      plans: [{ groupId: g1, from: me, to: friend, amount: 30000 }],
      amountPaise: 30000,
      payeeName: 'Aarav',
      category: 'Repayment',
      date: Date.now(),
      startedAt: Date.now(),
    });

    expect((await getMyExposure(asDb(db), me)).owe).toBe(0);
  });

  it('carries the date the user picked, not the confirm time', async () => {
    const { db, me, friend, g1 } = setup();
    const picked = Date.now() - 3 * 86_400_000;
    await writePendingSettlement(asDb(db), {
      plans: [{ groupId: g1, from: me, to: friend, amount: 10000 }],
      amountPaise: 10000,
      payeeName: 'Aarav',
      category: 'Repayment',
      date: picked,
      startedAt: Date.now(),
    });
    const rows = await getTransactionsInRange(asDb(db), null, 0, Date.now() + 1000);
    expect(rows.find(t => t.kind === 'settlement')?.date).toBe(picked);
  });
});
