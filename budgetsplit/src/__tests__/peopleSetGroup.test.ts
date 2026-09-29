import { getOrCreatePairGroup, getOrCreatePeopleSetGroup, listableGroups, getAllGroups, archiveGroupSafe, isPeopleSet } from '../db/queries/groups';
import { getFriendBalances } from '../db/queries/balances';
import { insertTxn } from '../db/queries/transactions';
import { createTestDb, addPerson, addGroup, addMember, addCategory, asDb } from './helpers/testDb';

/**
 * "Spent with Aarav and Meera" — not a group the user ever sees.
 *
 * Underneath it is an ordinary shared group for exactly that set of people (so it
 * splits, balances and syncs), kept out of every list by `listableGroups`.
 */

const BILL = 90000; // ₹900, three ways = ₹300 each

function scene() {
  const db = createTestDb();
  const me = addPerson(db, 'Prem', true);
  const aarav = addPerson(db, 'Aarav');
  const meera = addPerson(db, 'Meera');
  const priya = addPerson(db, 'Priya');
  const personal = addGroup(db, 'Personal', true, me);
  addMember(db, personal, me, 'admin');
  addCategory(db, 'Food');
  return { db, me, aarav, meera, priya };
}

describe('a people-set group', () => {
  it('holds me and exactly those people, marked hidden', async () => {
    const s = scene();
    const g = await getOrCreatePeopleSetGroup(asDb(s.db), s.me, [s.aarav, s.meera]);
    const members = (s.db.raw.prepare('SELECT person_id FROM group_member WHERE group_id = ? AND deleted_at IS NULL').all(g.id) as { person_id: string }[])
      .map(m => m.person_id).sort();
    expect(members).toEqual([s.me, s.aarav, s.meera].sort());
    expect(isPeopleSet(g)).toBe(true);
    expect(g.is_personal).toBe(0);
    expect(g.name).toBe('Aarav, Meera');
  });

  it('is reused for the same set in any order, never duplicated', async () => {
    const s = scene();
    const a = await getOrCreatePeopleSetGroup(asDb(s.db), s.me, [s.aarav, s.meera]);
    const b = await getOrCreatePeopleSetGroup(asDb(s.db), s.me, [s.meera, s.aarav]);
    expect(b.id).toBe(a.id);
  });

  it('is a different group for a different set', async () => {
    const s = scene();
    const ab = await getOrCreatePeopleSetGroup(asDb(s.db), s.me, [s.aarav, s.meera]);
    const abp = await getOrCreatePeopleSetGroup(asDb(s.db), s.me, [s.aarav, s.meera, s.priya]);
    const ap = await getOrCreatePeopleSetGroup(asDb(s.db), s.me, [s.aarav, s.priya]);
    expect(new Set([ab.id, abp.id, ap.id]).size).toBe(3);
  });

  it('un-archives rather than duplicating', async () => {
    const s = scene();
    const g = await getOrCreatePeopleSetGroup(asDb(s.db), s.me, [s.aarav, s.meera]);
    await archiveGroupSafe(asDb(s.db), g.id);
    const again = await getOrCreatePeopleSetGroup(asDb(s.db), s.me, [s.aarav, s.meera]);
    expect(again.id).toBe(g.id);
    expect(again.is_archived).toBe(0);
  });

  it('refuses fewer than two other people', async () => {
    const s = scene();
    await expect(getOrCreatePeopleSetGroup(asDb(s.db), s.me, [s.aarav])).rejects.toThrow();
    await expect(getOrCreatePeopleSetGroup(asDb(s.db), s.me, [s.aarav, s.me])).rejects.toThrow();
  });

  it('never appears in the Groups list, but still exists for money', async () => {
    const s = scene();
    const g = await getOrCreatePeopleSetGroup(asDb(s.db), s.me, [s.aarav, s.meera]);
    await getOrCreatePairGroup(asDb(s.db), s.me, s.priya);
    const all = await getAllGroups(asDb(s.db));
    expect(all.some(x => x.id === g.id)).toBe(true);
    expect(listableGroups(all).map(x => x.name)).toEqual(['Personal']);
  });

  it('nets each person their share, like any shared group', async () => {
    const s = scene();
    const g = await getOrCreatePeopleSetGroup(asDb(s.db), s.me, [s.aarav, s.meera]);
    await insertTxn(asDb(s.db), {
      groupId: g.id, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
      payments: [{ personId: s.me, amount: BILL }],
      shares: [{ personId: s.me, amount: BILL / 3 }, { personId: s.aarav, amount: BILL / 3 }, { personId: s.meera, amount: BILL / 3 }],
    });
    const bal = await getFriendBalances(asDb(s.db), s.me);
    expect(bal.find(x => x.personId === s.aarav)?.net).toBe(BILL / 3);
    expect(bal.find(x => x.personId === s.meera)?.net).toBe(BILL / 3);
  });
});
