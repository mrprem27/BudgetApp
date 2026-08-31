import { removeMemberFromGroup, addMemberToGroup, getGroupMembers } from '../db/queries/persons';
import { getMyExposure, getGroupNet } from '../db/queries/balances';
import { getGroupContext, getGroupMembersWithRoles, getSharedGroupsWith } from '../db/queries/groups';
import { isAdmin } from '../lib/permissions';
import { readRosterDoc, adoptGroup } from '../db/queries/syncDoc';
import { ingestPeerTxn } from '../db/queries/peerIngest';
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
 * roster simply omitted them — and absence from a roster is indistinguishable
 * from a roster that is merely stale, so the receiving device could not act on
 * it. They stayed a member on every other phone forever, with `ingestPeerTxn`
 * still accepting entries that named them.
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

  it('can no longer have entries written naming them', async () => {
    const s = flat();
    s.db.raw.prepare('UPDATE person SET remote_uid = ? WHERE id = ?').run('acct-priya', s.priya);
    await removeMemberFromGroup(asDb(s.db), s.gid, s.aarav, s.me);

    // A peer whose device has not seen the removal yet tries to park a share on
    // them. Refused, rather than quietly reviving a member nobody re-added.
    const r = await ingestPeerTxn(asDb(s.db), {
      authorUid: 'acct-priya', groupId: s.gid, version: 1, kind: 'expense',
      date: Date.now(), category: 'Food',
      payments: [{ personId: s.priya, amount: 100000 }],
      shares: [{ personId: s.me, amount: 50000 }, { personId: s.aarav, amount: 50000 }],
    });
    expect(r).toEqual({ ok: false, reason: 'not-a-member' });
  });
});

describe('the removal reaches the other phones', () => {
  it('is published on the roster with when it happened', async () => {
    const s = flat();
    await removeMemberFromGroup(asDb(s.db), s.gid, s.aarav, s.me);

    const doc = await readRosterDoc(asDb(s.db), s.gid);
    const entry = doc!.members.find(m => m.pid === s.aarav);
    // Present in the document, marked — NOT omitted. Omission is
    // indistinguishable from a stale roster.
    expect(entry).toBeDefined();
    expect(typeof entry!.removedAt).toBe('number');
  });

  it('applies on the receiving device without deleting anything', async () => {
    const s = flat();
    await removeMemberFromGroup(asDb(s.db), s.gid, s.aarav, s.me);
    const doc = await readRosterDoc(asDb(s.db), s.gid);

    // A second device that still has them as a member.
    const other = createTestDb();
    const otherMe = addPerson(other, 'Priya', true);
    addGroup(other, 'Flat', false, otherMe);
    await adoptGroup(asDb(other), s.gid, doc!);

    const active = other.raw.prepare(
      'SELECT person_id FROM group_member WHERE group_id = ? AND deleted_at IS NULL',
    ).all(s.gid) as { person_id: string }[];
    expect(active.map(r => r.person_id)).not.toContain(s.aarav);

    // The row and the person both survive — the row is what lets this device
    // carry the removal onward, and the person is referenced by their history.
    expect(other.raw.prepare('SELECT COUNT(*) AS c FROM group_member WHERE person_id = ?').get(s.aarav))
      .toEqual({ c: 1 });
    expect(other.raw.prepare('SELECT COUNT(*) AS c FROM person WHERE id = ?').get(s.aarav))
      .toEqual({ c: 1 });
  });

  it('brings them back cleanly when they are re-added', async () => {
    const s = flat();
    await removeMemberFromGroup(asDb(s.db), s.gid, s.aarav, s.me);
    await addMemberToGroup(asDb(s.db), s.gid, s.aarav, s.me);

    expect((await getGroupMembers(asDb(s.db), s.gid)).map(p => p.id)).toContain(s.aarav);
    // And the roster says so, rather than still carrying a removal date.
    const doc = await readRosterDoc(asDb(s.db), s.gid);
    expect(doc!.members.find(m => m.pid === s.aarav)?.removedAt).toBeNull();
  });
});
