import { getFriendBalances, getMyExposure, getGroupNet } from '../db/queries/balances';
import { simplify } from '../lib/settle';
import { createTestDb, addPerson, addGroup, addMember, addTxn, asDb, type TestDb } from './helpers/testDb';

/**
 * A balance may only ever be simplified among people who share a group.
 *
 * `simplify` is a greedy match over whatever net it is handed — largest debtor
 * against largest creditor, whether or not those two have ever met. Run over the
 * GLOBAL net it invented settlements between strangers, and `getFriendBalances`
 * then kept only the legs naming me and dropped the rest.
 *
 * The result was the worst thing this app can say: **"Settled up"** on Home,
 * Personal, Insights, the Groups tab and Reminders, while the group's own screen
 * still showed the debt. Nothing reconciled them and nothing told the user which
 * number to believe.
 */

/** I owe Aarav ₹500 in one group; Priya owes me ₹500 in another. They never meet. */
function twoUnconnectedGroups() {
  const db = createTestDb();
  const me = addPerson(db, 'Me', true);
  const aarav = addPerson(db, 'Aarav');
  const priya = addPerson(db, 'Priya');

  const flat = addGroup(db, 'Flat');
  addMember(db, flat, me);
  addMember(db, flat, aarav);
  // Aarav paid ₹1,000, split evenly → I owe him ₹500.
  addTxn(db, {
    groupId: flat, kind: 'expense', date: Date.now(), category: 'Food',
    payments: [{ personId: aarav, amount: 100000 }],
    shares: [{ personId: me, amount: 50000 }, { personId: aarav, amount: 50000 }],
  });

  const trip = addGroup(db, 'Trip');
  addMember(db, trip, me);
  addMember(db, trip, priya);
  // I paid ₹1,000, split evenly → Priya owes me ₹500.
  addTxn(db, {
    groupId: trip, kind: 'expense', date: Date.now(), category: 'Travel',
    payments: [{ personId: me, amount: 100000 }],
    shares: [{ personId: me, amount: 50000 }, { personId: priya, amount: 50000 }],
  });

  return { db, me, aarav, priya, flat, trip };
}

describe('friend balances are simplified per group, never globally', () => {
  it('keeps both debts instead of cancelling them against each other', async () => {
    const s = twoUnconnectedGroups();
    const balances = await getFriendBalances(asDb(s.db), s.me);
    const by = new Map(balances.map(b => [b.personId, b.net]));

    // Negative = I owe them. Positive = they owe me.
    expect(by.get(s.aarav)).toBe(-50000);
    expect(by.get(s.priya)).toBe(50000);
  });

  it('does not report "settled up" while a group screen shows a debt', async () => {
    const s = twoUnconnectedGroups();
    const exposure = await getMyExposure(asDb(s.db), s.me);

    // The net genuinely IS zero — I owe as much as I am owed. But `owe` and
    // `owed` are the figures the headlines read, and they were both zero.
    expect(exposure.owe).toBe(50000);
    expect(exposure.owed).toBe(50000);
    expect(exposure.net).toBe(0);

    // And the group screen, which was always right, still agrees.
    const flatNet = await getGroupNet(asDb(s.db), s.flat);
    expect(simplify(flatNet)).toEqual([{ from: s.me, to: s.aarav, amount: 50000 }]);
  });

  it('cancels across groups for the SAME person, which is the intended netting', async () => {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const aarav = addPerson(db, 'Aarav');

    const flat = addGroup(db, 'Flat');
    [me, aarav].forEach(p => addMember(db, flat, p));
    addTxn(db, {
      groupId: flat, kind: 'expense', date: Date.now(), category: 'Food',
      payments: [{ personId: aarav, amount: 100000 }],
      shares: [{ personId: me, amount: 50000 }, { personId: aarav, amount: 50000 }],
    });

    const trip = addGroup(db, 'Trip');
    [me, aarav].forEach(p => addMember(db, trip, p));
    addTxn(db, {
      groupId: trip, kind: 'expense', date: Date.now(), category: 'Travel',
      payments: [{ personId: me, amount: 100000 }],
      shares: [{ personId: me, amount: 50000 }, { personId: aarav, amount: 50000 }],
    });

    const balances = await getFriendBalances(asDb(db), me);
    expect(balances.find(b => b.personId === aarav)?.net).toBe(0);
  });

  it('still routes a debt through someone inside the same group', async () => {
    // The narrowness check: per-group simplification must keep working. Everyone
    // here shares one group, so pairing me with whoever holds the credit is both
    // correct and settleable.
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const aarav = addPerson(db, 'Aarav');
    const priya = addPerson(db, 'Priya');
    const flat = addGroup(db, 'Flat');
    [me, aarav, priya].forEach(p => addMember(db, flat, p));

    // Priya fronted ₹900 for all three. Aarav and I each owe ₹300.
    addTxn(db, {
      groupId: flat, kind: 'expense', date: Date.now(), category: 'Food',
      payments: [{ personId: priya, amount: 90000 }],
      shares: [
        { personId: me, amount: 30000 },
        { personId: aarav, amount: 30000 },
        { personId: priya, amount: 30000 },
      ],
    });

    const balances = await getFriendBalances(asDb(db), me);
    const by = new Map(balances.map(b => [b.personId, b.net]));
    expect(by.get(priya)).toBe(-30000);
    expect(by.get(aarav)).toBe(0);
  });
});
