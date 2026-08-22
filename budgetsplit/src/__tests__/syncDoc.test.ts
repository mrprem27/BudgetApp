import {
  readEntryDoc, markSynced, pullCursor, setPullCursor, toPeerEnvelope, personResolver,
} from '../db/queries/syncDoc';
import { sealEntry, openEntry, newGroupKey } from '../lib/groupCrypto';
import { insertTxn } from '../db/queries/transactions';
import { ingestPeerTxn } from '../db/queries/peerIngest';
import { createTestDb, addPerson, addGroup, addMember, addCategory, asDb, type TestDb } from './helpers/testDb';

/**
 * The wire, end to end, without a network.
 *
 * Everything between "an entry exists on my phone" and "the same entry exists on
 * theirs" can be exercised locally: read it into a document, seal it, open it,
 * resolve the people, and hand it to `ingestPeerTxn`. What cannot be tested here
 * is the HTTP in the middle, and only that.
 *
 * This is worth doing precisely because the document is hand-written on both
 * sides. A field added to `readEntryDoc` and forgotten in `toPeerEnvelope` would
 * typecheck and lose money quietly.
 */

const BILL = 4_000_00;

async function twoDevices() {
  const db = createTestDb();
  const me = addPerson(db, 'Me', true);
  const aarav = addPerson(db, 'Aarav');
  await db.runAsync("UPDATE person SET remote_uid = 'acct-me' WHERE id = ?", [me]);
  await db.runAsync("UPDATE person SET remote_uid = 'acct-aarav' WHERE id = ?", [aarav]);
  const flat = addGroup(db, 'Flat');
  addMember(db, flat, me);
  addMember(db, flat, aarav);
  addCategory(db, 'Food');
  return { db, me, aarav, flat };
}

describe('reading an entry for the wire', () => {
  it('carries both ways of naming every person', async () => {
    const { db, me, aarav, flat } = await twoDevices();
    const id = await insertTxn(asDb(db), {
      groupId: flat, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
      payments: [{ personId: me, amount: BILL }],
      shares: [{ personId: me, amount: BILL / 2 }, { personId: aarav, amount: BILL / 2 }],
    });

    const entry = await readEntryDoc(asDb(db), id);
    expect(entry).not.toBeNull();
    // Account id AND local id, because neither covers everyone: a group can hold
    // a flatmate who has no account, and dropping them would reassign their share.
    expect(entry!.doc.shares.map(s => s.person)).toEqual(
      expect.arrayContaining([{ uid: 'acct-me', pid: me }, { uid: 'acct-aarav', pid: aarav }]),
    );
    // Nothing has been sent yet, so the first push claims v1.
    expect(entry!.version).toBe(1);
  });

  it('claims one past whatever the server last accepted', async () => {
    const { db, me, flat } = await twoDevices();
    const id = await insertTxn(asDb(db), {
      groupId: flat, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
      payments: [{ personId: me, amount: BILL }],
      shares: [{ personId: me, amount: BILL }],
    });
    await markSynced(asDb(db), id, 3);
    expect((await readEntryDoc(asDb(db), id))!.version).toBe(4);
  });

  it('is null for an entry that no longer exists', async () => {
    // A queued row whose txn is gone. The drain drops it rather than retrying
    // forever or failing the whole batch.
    const { db } = await twoDevices();
    expect(await readEntryDoc(asDb(db), 'no-such-entry')).toBeNull();
  });
});

describe('the whole round trip, minus the HTTP', () => {
  it('an entry I wrote arrives on their device with the same numbers', async () => {
    const mine = await twoDevices();
    const id = await insertTxn(asDb(mine.db), {
      groupId: mine.flat, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
      payments: [{ personId: mine.me, amount: BILL }],
      shares: [{ personId: mine.me, amount: BILL / 2 }, { personId: mine.aarav, amount: BILL / 2 }],
    });
    const entry = (await readEntryDoc(asDb(mine.db), id))!;

    const key = await newGroupKey();
    const sealed = await sealEntry(entry.doc, key, mine.flat, id, entry.version);

    /*
     * THEIR device. Different person-id uuids for the same two humans, which is
     * the whole reason `PersonRef` carries an account id — a bare local id would
     * resolve to nobody, or worse, to the wrong person.
     */
    const theirs = createTestDb();
    const themLocal = addPerson(theirs, 'Aarav', true);
    const meLocal = addPerson(theirs, 'Me');
    await theirs.runAsync("UPDATE person SET remote_uid = 'acct-aarav' WHERE id = ?", [themLocal]);
    await theirs.runAsync("UPDATE person SET remote_uid = 'acct-me' WHERE id = ?", [meLocal]);
    // Adopted under the SAME id — that is what group sharing is, and it is why
    // the group half of the wire needs no mapping at all.
    await theirs.runAsync(
      `INSERT INTO budget_group (id, name, icon, color, carry_over, is_shared, is_archived,
                                 is_personal, simplify_debt, default_split, created_at)
       VALUES (?, 'Flat', 'home', '#20C4B8', 0, 1, 0, 0, 1, 'equal', ?)`,
      [mine.flat, Date.now()],
    );
    addMember(theirs, mine.flat, themLocal);
    addMember(theirs, mine.flat, meLocal);
    addCategory(theirs, 'Food');

    const doc = await openEntry<typeof entry.doc>(sealed, key, mine.flat, id, entry.version);
    expect(doc).not.toBeNull();

    const resolve = await personResolver(asDb(theirs));
    const envelope = toPeerEnvelope(resolve, mine.flat, id, entry.version, false, doc!);
    expect(envelope).not.toBeNull();

    const result = await ingestPeerTxn(asDb(theirs), envelope!);
    expect(result).toMatchObject({ ok: true, txnId: id });

    // The shares landed on THEIR person ids, not mine.
    const shares = await theirs.getAllAsync<{ person_id: string; amount: number }>(
      'SELECT person_id, amount FROM txn_share WHERE txn_id = ?', [id],
    );
    expect(shares).toHaveLength(2);
    expect(shares.map(s => s.person_id).sort()).toEqual([meLocal, themLocal].sort());
    expect(shares.every(s => s.amount === BILL / 2)).toBe(true);
  });

  it('refuses an entry naming someone this device cannot identify', async () => {
    /*
     * The alternative is guessing, and a share attached to the wrong person is a
     * wrong number in someone's ledger that nothing downstream ever catches.
     */
    const { db, me, aarav, flat } = await twoDevices();
    const resolve = await personResolver(asDb(db));
    const doc = {
      kind: 'expense' as const, date: Date.now(), category: 'Food',
      note: null, payMethod: null, recurFreq: null, recurInterval: null, recurEnd: null,
      author: { uid: 'acct-aarav', pid: aarav },
      payments: [{ person: { uid: 'acct-stranger', pid: 'their-local-id' }, amount: BILL }],
      shares: [{ person: { uid: 'acct-me', pid: me }, amount: BILL }],
    };
    expect(toPeerEnvelope(resolve, flat, 'e1', 1, false, doc)).toBeNull();
  });

  it('refuses an entry whose author has no account', async () => {
    // `ingestPeerTxn` matches the author by remote_uid. Without one there is
    // nobody to trust or review — only somebody to guess at.
    const { db, me, flat } = await twoDevices();
    const resolve = await personResolver(asDb(db));
    const doc = {
      kind: 'expense' as const, date: Date.now(), category: 'Food',
      note: null, payMethod: null, recurFreq: null, recurInterval: null, recurEnd: null,
      author: { uid: null, pid: 'someone' },
      payments: [{ person: { uid: 'acct-me', pid: me }, amount: BILL }],
      shares: [{ person: { uid: 'acct-me', pid: me }, amount: BILL }],
    };
    expect(toPeerEnvelope(resolve, flat, 'e1', 1, false, doc)).toBeNull();
  });

  it('falls back to the local id for a member with no account', async () => {
    // The flatmate who will never sign in but still owes for the gas. Resolvable
    // only once the roster is adopted, which is why both ids travel.
    const { db, me, flat } = await twoDevices();
    const gasGuy = addPerson(db, 'Ravi');
    addMember(db, flat, gasGuy);
    const resolve = await personResolver(asDb(db));
    expect(resolve({ uid: null, pid: gasGuy })).toBe(gasGuy);
    expect(resolve({ uid: null, pid: 'not-a-person' })).toBeNull();
  });
});

describe('the pull cursor', () => {
  it('is per group, so one busy group cannot skip a quiet one', async () => {
    const { db } = await twoDevices();
    await setPullCursor(asDb(db), 'group-a', 5000);
    expect(await pullCursor(asDb(db), 'group-a')).toBe(5000);
    expect(await pullCursor(asDb(db), 'group-b')).toBe(0);
  });

  it('starts at zero, so a device that has never synced gets everything', async () => {
    const { db } = await twoDevices();
    expect(await pullCursor(asDb(db), 'anything')).toBe(0);
  });
});
