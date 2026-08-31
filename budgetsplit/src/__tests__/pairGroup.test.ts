import { getOrCreatePairGroup, listableGroups, getAllGroups, archiveGroupSafe } from '../db/queries/groups';
import { getFriendBalances, getMyExposure } from '../db/queries/balances';
import { getGroupContext } from '../db/queries/groups';
import { isAdmin } from '../lib/permissions';
import { insertTxn } from '../db/queries/transactions';
import { createTestDb, addPerson, addGroup, addMember, addCategory, asDb, type TestDb } from './helpers/testDb';

/**
 * Splitting with one friend, with no group involved.
 *
 * Only shared groups sync — enforced inside `queueEntry`'s own SQL — so "I bought
 * lunch, Aarav owes me half" had nowhere to live that could travel. It went into
 * the Personal group and stopped there, which made the single most ordinary thing
 * anybody does with a splitting app the one thing sync could not carry.
 *
 * A pair group is an ordinary shared group, and that is the whole design: it
 * inherits the roster, the key wrap, versioning, the cursor, trust and approval,
 * and adds no new sync machinery. The alternative — a friend-scoped primitive —
 * would be a second money model that has to agree with the first forever.
 */

const BILL = 100000;   // ₹1,000

function scene() {
  const db = createTestDb();
  const me = addPerson(db, 'Prem', true);
  const aarav = addPerson(db, 'Aarav');
  // The Personal group has to exist: it is what a 1:1 expense used to fall into.
  const personal = addGroup(db, 'Personal', true, me);
  addMember(db, personal, me, 'admin');
  addCategory(db, 'Food');
  return { db, me, aarav, personal };
}

describe('a pair group is created on first use, and reused', () => {
  it('makes one group for that person', async () => {
    const s = scene();
    const g = await getOrCreatePairGroup(asDb(s.db), s.me, s.aarav);

    expect(g.pair_person_id).toBe(s.aarav);
    expect(g.name).toBe('Aarav');
    // NOT personal — this is the whole point. `queueEntry` refuses a personal
    // group in its own SQL, so a pair group marked personal would silently never
    // sync while looking like it did.
    expect(g.is_personal).toBe(0);
  });

  it('returns the same group the second time, never a duplicate', async () => {
    const s = scene();
    const first = await getOrCreatePairGroup(asDb(s.db), s.me, s.aarav);
    const second = await getOrCreatePairGroup(asDb(s.db), s.me, s.aarav);

    expect(second.id).toBe(first.id);
    expect(s.db.raw.prepare('SELECT COUNT(*) AS c FROM budget_group WHERE pair_person_id = ?')
      .get(s.aarav)).toEqual({ c: 1 });
  });

  it('has both people in it, and me as its admin', async () => {
    // `insertGroup` carries the creator/admin defaulting whose absence produced
    // groups nobody could manage. Hand-rolling the insert here would lose it.
    const s = scene();
    const g = await getOrCreatePairGroup(asDb(s.db), s.me, s.aarav);

    const members = s.db.raw.prepare(
      'SELECT person_id FROM group_member WHERE group_id = ? AND deleted_at IS NULL ORDER BY person_id',
    ).all(g.id) as { person_id: string }[];
    expect(members.map(m => m.person_id).sort()).toEqual([s.me, s.aarav].sort());
    expect(isAdmin(await getGroupContext(asDb(s.db), g.id, s.me))).toBe(true);
  });

  it('keeps a name the user edited', async () => {
    const s = scene();
    const g = await getOrCreatePairGroup(asDb(s.db), s.me, s.aarav);
    await s.db.runAsync('UPDATE budget_group SET name = ? WHERE id = ?', ['Aarav · flat', g.id]);
    await s.db.runAsync('UPDATE person SET name = ? WHERE id = ?', ['Aarav Kumar', s.aarav]);

    // Seeded from the person and then frozen. Re-deriving it would undo an edit
    // every time they were renamed.
    expect((await getOrCreatePairGroup(asDb(s.db), s.me, s.aarav)).name).toBe('Aarav · flat');
  });

  it('un-archives rather than duplicating', async () => {
    const s = scene();
    const g = await getOrCreatePairGroup(asDb(s.db), s.me, s.aarav);
    await archiveGroupSafe(asDb(s.db), g.id);

    const again = await getOrCreatePairGroup(asDb(s.db), s.me, s.aarav);
    expect(again.id).toBe(g.id);
    expect(again.is_archived).toBe(0);
  });
});

/**
 * The assertion this file exists for.
 *
 * AGENTS §13's rule is that your position must come out identical however a bill
 * was recorded. Applied to the new shape: an expense split with somebody through
 * their pair group must net exactly the same as the same expense in a shared
 * group you made by hand. If those two ever differ, the app contradicts itself
 * and nothing tells the user which number to believe.
 */
describe('the money is identical to a hand-made shared group', () => {
  async function halfShared(db: TestDb, me: string, other: string, groupId: string) {
    await insertTxn(asDb(db), {
      groupId, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
      payments: [{ personId: me, amount: BILL }],
      shares: [{ personId: me, amount: BILL / 2 }, { personId: other, amount: BILL / 2 }],
    });
  }

  it('nets the same, both per person and in total', async () => {
    // Hand-made group.
    const a = scene();
    const manual = addGroup(a.db, 'Flat', false, a.me);
    addMember(a.db, manual, a.me, 'admin');
    addMember(a.db, manual, a.aarav, 'member');
    await halfShared(a.db, a.me, a.aarav, manual);

    // Pair group.
    const b = scene();
    const pair = await getOrCreatePairGroup(asDb(b.db), b.me, b.aarav);
    await halfShared(b.db, b.me, b.aarav, pair.id);

    const manualBal = await getFriendBalances(asDb(a.db), a.me);
    const pairBal = await getFriendBalances(asDb(b.db), b.me);
    expect(pairBal.find(x => x.personId === b.aarav)?.net)
      .toBe(manualBal.find(x => x.personId === a.aarav)?.net);
    expect(pairBal.find(x => x.personId === b.aarav)?.net).toBe(BILL / 2);

    const manualExp = await getMyExposure(asDb(a.db), a.me);
    const pairExp = await getMyExposure(asDb(b.db), b.me);
    expect({ owe: pairExp.owe, owed: pairExp.owed, net: pairExp.net })
      .toEqual({ owe: manualExp.owe, owed: manualExp.owed, net: manualExp.net });
  });

  it('queues the entry for sync, which a personal group never would', async () => {
    const s = scene();
    const pair = await getOrCreatePairGroup(asDb(s.db), s.me, s.aarav);
    await halfShared(s.db, s.me, s.aarav, pair.id);

    const queued = s.db.raw.prepare('SELECT COUNT(*) AS c FROM sync_outbox WHERE group_id = ?')
      .get(pair.id);
    expect(queued).toEqual({ c: 1 });
  });

  it('does not queue the same expense put in Personal — the behaviour this replaces', async () => {
    const s = scene();
    await halfShared(s.db, s.me, s.aarav, s.personal);
    expect(s.db.raw.prepare('SELECT COUNT(*) AS c FROM sync_outbox').get()).toEqual({ c: 0 });
  });
});

describe('hiding them is presentational, and only presentational', () => {
  it('keeps them out of a groups LIST', async () => {
    const s = scene();
    const pair = await getOrCreatePairGroup(asDb(s.db), s.me, s.aarav);
    const all = await getAllGroups(asDb(s.db));

    expect(all.map(g => g.id)).toContain(pair.id);
    expect(listableGroups(all).map(g => g.id)).not.toContain(pair.id);
  });

  it('still counts them in every balance', async () => {
    // The failure this guards: a filter in the QUERY instead of the list would
    // put money into a group no figure counted.
    const s = scene();
    const pair = await getOrCreatePairGroup(asDb(s.db), s.me, s.aarav);
    await insertTxn(asDb(s.db), {
      groupId: pair.id, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
      payments: [{ personId: s.me, amount: BILL }],
      shares: [{ personId: s.me, amount: BILL / 2 }, { personId: s.aarav, amount: BILL / 2 }],
    });

    expect((await getMyExposure(asDb(s.db), s.me)).owed).toBe(BILL / 2);
  });
});
