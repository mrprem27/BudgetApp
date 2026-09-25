import { removeMemberFromGroup, addMemberToGroup, getGroupMembers } from '../db/queries/persons';
import { getMyExposure, getGroupNet } from '../db/queries/balances';
import { getGroupContext, getGroupMembersWithRoles, getSharedGroupsWith, getAllGroups } from '../db/queries/groups';
import { isAdmin } from '../lib/permissions';
import { getTransactionsInRange } from '../db/queries/transactions';
import { createTestDb, addPerson, addGroup, addMember, addTxn, addCategory, asDb, type TestDb } from './helpers/testDb';

/**
 * **Removal ends a relationship, never a record.**
 *
 * What someone spent is a fact about the past; who they are to this group now is
 * a fact about the present. Only the second is anyone's to change — so removing
 * somebody must leave every entry, every share and every balance exactly where it
 * was, and must reach the other phones.
 *
 * It used to do neither. The `group_member` row was hard-deleted, so the next
 * roster simply omitted them — and absence is indistinguishable from a copy that
 * is merely stale, so the receiving device could not act on it. They stayed a
 * member on every other phone forever. Now the row is soft-deleted and queued,
 * so what goes up is the removal itself, dated, rather than a silence.
 */

const OWED = 234000;   // ₹2,340, owed by Aarav to me

/** Me (creator), Aarav and Priya in a flat. Aarav owes me ₹2,340. */
function flat() {
  const db = createTestDb();
  const me = addPerson(db, 'Prem', true);
  const aarav = addPerson(db, 'Aarav');
  const priya = addPerson(db, 'Priya');
  const gid = addGroup(db, 'Flat', false, me);
  addMember(db, gid, me, 'admin');
  addMember(db, gid, aarav, 'member');
  addMember(db, gid, priya, 'member');
  addCategory(db, 'Food');

  // I paid ₹4,680, split evenly between me and Aarav.
  addTxn(db, {
    groupId: gid, kind: 'expense', date: Date.now(), category: 'Food',
    payments: [{ personId: me, amount: OWED * 2 }],
    shares: [{ personId: me, amount: OWED }, { personId: aarav, amount: OWED }],
  });
  return { db, me, aarav, priya, gid };
}

const counts = (db: TestDb) => ({
  txn: (db.raw.prepare('SELECT COUNT(*) AS c FROM txn').get() as { c: number }).c,
  shares: (db.raw.prepare('SELECT COUNT(*) AS c FROM txn_share').get() as { c: number }).c,
  payments: (db.raw.prepare('SELECT COUNT(*) AS c FROM txn_payment').get() as { c: number }).c,
});

describe('removing a member keeps every record', () => {
  it('touches no transaction, share or payment', async () => {
    const s = flat();
    const before = counts(s.db);

    await removeMemberFromGroup(asDb(s.db), s.gid, s.aarav, s.me);

    expect(counts(s.db)).toEqual(before);
  });

  it('leaves their history readable, in the months it happened in', async () => {
    // The proof that a closed month stays closed. My share of that bill has
    // already counted as my spending, and nothing about removing somebody may
    // rewrite it.
    const s = flat();
    const before = await getTransactionsInRange(asDb(s.db), s.gid, 0, Date.now() + 1000);

    await removeMemberFromGroup(asDb(s.db), s.gid, s.aarav, s.me);

    const after = await getTransactionsInRange(asDb(s.db), s.gid, 0, Date.now() + 1000);
    expect(after).toEqual(before);
  });

  it('still reports the money they owe, so it can be settled', async () => {
    const s = flat();
    const before = await getMyExposure(asDb(s.db), s.me);
    const groupNetBefore = await getGroupNet(asDb(s.db), s.gid);
    expect(before.owed).toBe(OWED);

    await removeMemberFromGroup(asDb(s.db), s.gid, s.aarav, s.me);

    // They are out of the group, and the debt is not. Dropping them from the
    // exposure would make ₹2,340 disappear from every owe/owed headline while the
    // group's own screen still showed it.
    const after = await getMyExposure(asDb(s.db), s.me);
    expect(after.owed).toBe(OWED);
    expect(after.perPerson.find(p => p.personId === s.aarav)?.net).toBe(OWED);
    // The group's own figures are derived from entries, not membership, so they
    // must not move either.
    expect(await getGroupNet(asDb(s.db), s.gid)).toEqual(groupNetBefore);
  });

  it('drops them off the list once there is nothing outstanding', async () => {
    // A former member with a settled balance is not a friend I share anything
    // with, and should not sit in the list forever.
    const db = createTestDb();
    const me = addPerson(db, 'Prem', true);
    const aarav = addPerson(db, 'Aarav');
    const gid = addGroup(db, 'Flat', false, me);
    addMember(db, gid, me, 'admin');
    addMember(db, gid, aarav, 'member');

    await removeMemberFromGroup(asDb(db), gid, aarav, me);

    const exposure = await getMyExposure(asDb(db), me);
    expect(exposure.perPerson.map(p => p.personId)).not.toContain(aarav);
  });
});

describe('a removed member is out of the group everywhere it matters', () => {
  it('is gone from the member list and the roles list', async () => {
    const s = flat();
    await removeMemberFromGroup(asDb(s.db), s.gid, s.aarav, s.me);

    expect((await getGroupMembers(asDb(s.db), s.gid)).map(p => p.id)).not.toContain(s.aarav);
    expect((await getGroupMembersWithRoles(asDb(s.db), s.gid)).map(r => r.person_id))
      .not.toContain(s.aarav);
  });

  it('keeps no permissions in a group they have left', async () => {
    // An admin who left could otherwise still remove the people still in it.
    const db = createTestDb();
    const me = addPerson(db, 'Prem', true);
    const aarav = addPerson(db, 'Aarav');
    const gid = addGroup(db, 'Flat', false, me);
    addMember(db, gid, me, 'admin');
    addMember(db, gid, aarav, 'admin');

    await removeMemberFromGroup(asDb(db), gid, aarav, me);

    const ctx = await getGroupContext(asDb(db), gid, aarav);
    expect(ctx.actorRole).toBeNull();
    expect(isAdmin(ctx)).toBe(false);
  });

  it('stops being somebody I share a group with', async () => {
    const s = flat();
    await removeMemberFromGroup(asDb(s.db), s.gid, s.aarav, s.me);
    expect(await getSharedGroupsWith(asDb(s.db), s.me, s.aarav)).toEqual([]);
  });
});

/** What the drain will send for this membership: the queued row, and the row it reads. */
function queuedMembership(db: TestDb, gid: string, pid: string) {
  const queued = db.raw.prepare(
    "SELECT op FROM sync_queue WHERE local_table = 'group_member' AND local_id = ?",
  ).get(`${gid}|${pid}`) as { op: string } | undefined;
  const row = db.raw.prepare('SELECT deleted_at FROM group_member WHERE group_id = ? AND person_id = ?')
    .get(gid, pid) as { deleted_at: number | null } | undefined;
  return { queued: queued?.op ?? null, deletedAt: row?.deleted_at };
}

describe('the removal reaches the other phones', () => {
  it('is queued for the server with when it happened', async () => {
    const s = flat();
    await removeMemberFromGroup(asDb(s.db), s.gid, s.aarav, s.me);

    // An UPSERT of a row that still exists, marked — NOT a delete, and not an
    // omission. The drain reads `deleted_at` off it; a hard-deleted row would
    // leave it nothing to send.
    const m = queuedMembership(s.db, s.gid, s.aarav);
    expect(m.queued).toBe('upsert');
    expect(m.deletedAt).toEqual(expect.any(Number));
  });

  it('brings them back cleanly when they are re-added', async () => {
    const s = flat();
    await removeMemberFromGroup(asDb(s.db), s.gid, s.aarav, s.me);
    await addMemberToGroup(asDb(s.db), s.gid, s.aarav, s.me);

    expect((await getGroupMembers(asDb(s.db), s.gid)).map(p => p.id)).toContain(s.aarav);
    // And what goes up says so, rather than still carrying a removal date.
    expect(queuedMembership(s.db, s.gid, s.aarav)).toEqual({ queued: 'upsert', deletedAt: null });
  });
});

/**
 * SYNC-F23 — "Shared" was a stored flag that nothing ever updated.
 *
 * `budget_group.is_shared` was hard-coded 0 on create and 1 on (v1) adoption, and
 * no statement anywhere UPDATEd it. So the destination picker showed "Shared" only
 * on groups you RECEIVED, and never on a group you shared yourself — wrong for
 * exactly the case you would most expect it on. Server sync does not carry it at all. It is counted now, and a count
 * cannot drift because it is the thing itself.
 */
describe('a group knows how many people are in it', () => {
  it('counts the members, and does not trust is_shared', async () => {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const aarav = addPerson(db, 'Aarav');
    const gid = addGroup(db, 'Flat', false, me);
    addMember(db, gid, me, 'admin');
    addMember(db, gid, aarav, 'member');

    const [flat] = (await getAllGroups(asDb(db))).filter(g => g.id === gid);
    expect(flat.member_count).toBe(2);
    // The stored flag says otherwise, which is the whole point.
    expect(flat.is_shared).toBe(0);
  });

  it('drops back to one when the other person is removed', async () => {
    // Removal is soft, so the row survives — the count has to respect
    // `memberActive` or a departed member keeps the group looking shared.
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const aarav = addPerson(db, 'Aarav');
    const gid = addGroup(db, 'Flat', false, me);
    addMember(db, gid, me, 'admin');
    addMember(db, gid, aarav, 'member');

    await removeMemberFromGroup(asDb(db), gid, aarav, me);

    const [flat] = (await getAllGroups(asDb(db))).filter(g => g.id === gid);
    expect(flat.member_count).toBe(1);
  });
});
