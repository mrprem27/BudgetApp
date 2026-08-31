import {
  deleteGroup, leaveGroup, unarchiveGroup, stopSyncingGroup, getAllGroups, getGroupById,
} from '../db/queries/groups';
import { getTransactionsInRange } from '../db/queries/transactions';
import { getMyExposure } from '../db/queries/balances';
import { readRosterDoc } from '../db/queries/syncDoc';
import { PermissionError } from '../lib/permissions';
import { createTestDb, addPerson, addGroup, addMember, addTxn, addCategory, asDb, type TestDb } from './helpers/testDb';

/**
 * Deleting a group used to destroy the deleter's own history, and then bring the
 * group back.
 *
 * It hard-deleted every txn, share, payment and line item. My share of each of
 * those bills had already counted as my spending, in months that were already
 * closed — so pressing Delete silently rewrote figures I had made decisions on,
 * with no undo. `archiveVanishedGroup` refuses to do that to me when somebody
 * ELSE deletes a group; there was no principled reason to be harsher to the one
 * person who can do it by accident.
 *
 * And it came back. Nothing told the server, so `sync_group` was still live, and
 * the local cursor row had just been deleted — so the next pull started from
 * zero, fetched `__roster__` first, and `adoptGroup` rebuilt the group from it.
 * Empty, because the entries were gone locally, and unadministrable, because
 * adoption carried no creator. The delete produced a husk instead of nothing.
 */

const BILL = 468000;   // ₹4,680

function flat() {
  const db = createTestDb();
  const me = addPerson(db, 'Prem', true);
  const aarav = addPerson(db, 'Aarav');
  const gid = addGroup(db, 'Flat', false, me);
  addMember(db, gid, me, 'admin');
  addMember(db, gid, aarav, 'member');
  addCategory(db, 'Food');
  addTxn(db, {
    groupId: gid, kind: 'expense', date: Date.now(), category: 'Food',
    payments: [{ personId: me, amount: BILL }],
    shares: [{ personId: me, amount: BILL / 2 }, { personId: aarav, amount: BILL / 2 }],
  });
  return { db, me, aarav, gid };
}

/** A flat Aarav created, that I am merely a member of. */
function theirFlat() {
  const db = createTestDb();
  const me = addPerson(db, 'Prem', true);
  const aarav = addPerson(db, 'Aarav');
  const gid = addGroup(db, 'Flat', false, aarav);
  addMember(db, gid, aarav, 'admin');
  addMember(db, gid, me, 'member');
  addCategory(db, 'Food');
  addTxn(db, {
    groupId: gid, kind: 'expense', date: Date.now(), category: 'Food',
    payments: [{ personId: aarav, amount: BILL }],
    shares: [{ personId: me, amount: BILL / 2 }, { personId: aarav, amount: BILL / 2 }],
  });
  return { db, me, aarav, gid };
}

const counts = (db: TestDb) => ({
  txn: (db.raw.prepare('SELECT COUNT(*) AS c FROM txn').get() as { c: number }).c,
  shares: (db.raw.prepare('SELECT COUNT(*) AS c FROM txn_share').get() as { c: number }).c,
  payments: (db.raw.prepare('SELECT COUNT(*) AS c FROM txn_payment').get() as { c: number }).c,
});

describe('deleting a group keeps my own history', () => {
  it('deletes no transaction, share or payment', async () => {
    const s = flat();
    const before = counts(s.db);

    expect(await deleteGroup(asDb(s.db), s.gid, s.me)).toMatchObject({ ok: true });

    expect(counts(s.db)).toEqual(before);
  });

  it('leaves the months it happened in exactly as they were', async () => {
    const s = flat();
    const before = await getTransactionsInRange(asDb(s.db), null, 0, Date.now() + 1000);
    const exposureBefore = await getMyExposure(asDb(s.db), s.me);

    await deleteGroup(asDb(s.db), s.gid, s.me);

    expect(await getTransactionsInRange(asDb(s.db), null, 0, Date.now() + 1000)).toEqual(before);
    expect(await getMyExposure(asDb(s.db), s.me)).toEqual(exposureBefore);
  });

  it('marks it ended and takes it out of the active list', async () => {
    const s = flat();
    await deleteGroup(asDb(s.db), s.gid, s.me);

    const g = await getGroupById(asDb(s.db), s.gid);
    expect(g?.deleted_at).toEqual(expect.any(Number));
    expect(g?.is_archived).toBe(1);
    expect((await getAllGroups(asDb(s.db))).map(x => x.id)).not.toContain(s.gid);
  });

  it('stops trying to sync, including the disputes cursor', async () => {
    const s = flat();
    await s.db.runAsync(`INSERT INTO settings (key, value) VALUES ('sync.cursor.${s.gid}', '99')`);
    await s.db.runAsync(`INSERT INTO settings (key, value) VALUES ('sync.cursor.${s.gid}#disputes', '99')`);

    await deleteGroup(asDb(s.db), s.gid, s.me);

    // A queued row would retry against a group the server has tombstoned, forever.
    // The `#disputes` cursor is the one this path used to forget.
    expect(s.db.raw.prepare('SELECT COUNT(*) AS c FROM sync_outbox WHERE group_id = ?').get(s.gid))
      .toEqual({ c: 0 });
    expect(s.db.raw.prepare("SELECT COUNT(*) AS c FROM settings WHERE key LIKE ?").get(`sync.cursor.${s.gid}%`))
      .toEqual({ c: 0 });
  });

  it('cannot be un-archived back into existence', async () => {
    // `is_archived` is "out of my list, still mine". `deleted_at` is "this ended,
    // and I know it". Restoring the second would put back a group that exists for
    // nobody, still queueing at a server that has tombstoned it.
    const s = flat();
    await deleteGroup(asDb(s.db), s.gid, s.me);
    expect(await unarchiveGroup(asDb(s.db), s.gid)).toBe(false);
    expect((await getGroupById(asDb(s.db), s.gid))?.is_archived).toBe(1);
  });

  it('is still creator-only', async () => {
    const s = theirFlat();
    await expect(deleteGroup(asDb(s.db), s.gid, s.me)).rejects.toThrow(PermissionError);
    expect((await getGroupById(asDb(s.db), s.gid))?.deleted_at).toBeNull();
  });
});

describe('leaving a group', () => {
  it('was impossible, and now works', async () => {
    const s = theirFlat();
    expect(await leaveGroup(asDb(s.db), s.gid, s.me)).toEqual({ ok: true });

    // Out of the group...
    const active = s.db.raw.prepare(
      'SELECT COUNT(*) AS c FROM group_member WHERE group_id = ? AND person_id = ? AND deleted_at IS NULL',
    ).get(s.gid, s.me);
    expect(active).toEqual({ c: 0 });
    // ...and out of the active list.
    expect((await getAllGroups(asDb(s.db))).map(x => x.id)).not.toContain(s.gid);
  });

  it('keeps everything I shared, for me and for them', async () => {
    const s = theirFlat();
    const before = counts(s.db);
    const exposureBefore = await getMyExposure(asDb(s.db), s.me);

    await leaveGroup(asDb(s.db), s.gid, s.me);

    expect(counts(s.db)).toEqual(before);
    // What I owe does not evaporate because I left.
    expect((await getMyExposure(asDb(s.db), s.me)).owe).toBe(exposureBefore.owe);
  });

  it('publishes my departure before anything stops it being publishable', async () => {
    const s = theirFlat();
    await leaveGroup(asDb(s.db), s.gid, s.me);

    // The roster carries it, marked — this is how the others find out at all.
    const doc = await readRosterDoc(asDb(s.db), s.gid);
    expect(doc!.members.find(m => m.pid === s.me)?.removedAt).toEqual(expect.any(Number));
    // And the dirty flag is still set, so the caller can publish it. Dropping the
    // queue before publishing would leave nothing able to send it.
    expect(s.db.raw.prepare('SELECT COUNT(*) AS c FROM settings WHERE key = ?')
      .get(`sync.roster.dirty.${s.gid}`)).toEqual({ c: 1 });
  });

  it('stops syncing only once the caller says so', async () => {
    const s = theirFlat();
    await leaveGroup(asDb(s.db), s.gid, s.me);
    await stopSyncingGroup(asDb(s.db), s.gid);

    expect(s.db.raw.prepare('SELECT COUNT(*) AS c FROM settings WHERE key LIKE ?')
      .get(`sync.%.${s.gid}`)).toEqual({ c: 0 });
    expect(s.db.raw.prepare('SELECT COUNT(*) AS c FROM sync_outbox WHERE group_id = ?').get(s.gid))
      .toEqual({ c: 0 });
  });

  it('refuses the creator, whose exit is Delete', async () => {
    // A group with no un-removable admin is a group nobody can manage again, and
    // that is the state the whole creator rule exists to prevent.
    const s = flat();
    expect(await leaveGroup(asDb(s.db), s.gid, s.me)).toEqual({ ok: false, reason: 'creator' });
  });

  it('refuses the personal group', async () => {
    const db = createTestDb();
    const me = addPerson(db, 'Prem', true);
    const personal = addGroup(db, 'Personal', true, me);
    addMember(db, personal, me, 'admin');
    expect(await leaveGroup(asDb(db), personal, me)).toEqual({ ok: false, reason: 'personal' });
  });
});
