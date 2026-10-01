import type * as SQLite from 'expo-sqlite';
import { createTestDb, addPerson, addGroup, addMember, addTxn, addSimpleExpense, type TestDb } from './helpers/testDb';
import { getRecurringSpent } from '../db/queries/recurring';

const asDb = (db: TestDb) => db as unknown as SQLite.SQLiteDatabase;
const at = (m: number, d: number, y = 2026) => new Date(y, m, d, 12).getTime();
const FROM = new Date(2026, 0, 1).getTime();
const NOW = at(9, 1);

/** An entry a repeat rule posted: an ordinary expense that names its rule. */
function posted(db: TestDb, groupId: string, ruleId: string, date: number, shares: { personId: string; amount: number }[]) {
  const id = addTxn(db, { groupId, kind: 'expense', date, category: 'Rent', payments: [{ personId: shares[0].personId, amount: shares.reduce((s, x) => s + x.amount, 0) }], shares });
  db.raw.prepare('UPDATE txn SET parent_recur_id = ? WHERE id = ?').run(ruleId, id);
  return id;
}

// The Recurring card's "Spent this year": real entries from the ledger, not monthly × 12.
describe('getRecurringSpent', () => {
  function setup() {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const asha = addPerson(db, 'Asha');
    const home = addGroup(db, 'Personal', true);
    const flat = addGroup(db, 'Flat');
    for (const g of [home, flat]) addMember(db, g, me);
    addMember(db, flat, asha);
    const rent = addSimpleExpense(db, { groupId: home, personId: me, amount: 2_000_000, date: at(0, 2), category: 'Rent', recurFreq: 'monthly' });
    const wifi = addSimpleExpense(db, { groupId: flat, personId: me, amount: 100_000, date: at(0, 5), category: 'WiFi', recurFreq: 'monthly' });
    return { db, me, asha, home, flat, rent, wifi };
  }

  it('adds my share of what rules posted this year, and nothing else', async () => {
    const { db, me, asha, home, flat, rent, wifi } = setup();
    posted(db, home, rent, at(0, 2), [{ personId: me, amount: 2_000_000 }]);
    posted(db, home, rent, at(1, 2), [{ personId: me, amount: 2_000_000 }]);
    // A shared rule: half is mine.
    posted(db, flat, wifi, at(2, 5), [{ personId: me, amount: 50_000 }, { personId: asha, amount: 50_000 }]);
    // Not counted: an ordinary expense, last year's occurrence, one dated after now, a deleted one,
    // and the rule templates themselves (the rent rule alone is ₹20,000).
    addSimpleExpense(db, { groupId: home, personId: me, amount: 999_999, date: at(3, 1) });
    posted(db, home, rent, at(11, 2, 2025), [{ personId: me, amount: 2_000_000 }]);
    posted(db, home, rent, at(10, 2), [{ personId: me, amount: 2_000_000 }]);
    const gone = posted(db, home, rent, at(4, 2), [{ personId: me, amount: 2_000_000 }]);
    db.raw.prepare('UPDATE txn SET is_deleted = 1 WHERE id = ?').run(gone);

    expect(await getRecurringSpent(asDb(db), me, FROM, NOW)).toBe(4_050_000);
  });

  it('can be one group\'s', async () => {
    const { db, me, asha, home, flat, rent, wifi } = setup();
    posted(db, home, rent, at(0, 2), [{ personId: me, amount: 2_000_000 }]);
    posted(db, flat, wifi, at(2, 5), [{ personId: me, amount: 50_000 }, { personId: asha, amount: 50_000 }]);
    expect(await getRecurringSpent(asDb(db), me, FROM, NOW, flat)).toBe(50_000);
    expect(await getRecurringSpent(asDb(db), me, FROM, NOW, home)).toBe(2_000_000);
  });

  it('is zero, not null, with nothing posted', async () => {
    const { db, me } = setup();
    expect(await getRecurringSpent(asDb(db), me, FROM, NOW)).toBe(0);
  });
});
