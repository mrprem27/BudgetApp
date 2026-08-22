import { readRosterDoc, adoptGroup, toPeerEnvelope, personResolver } from '../db/queries/syncDoc';
import { mergePerson } from '../db/queries/persons';
import { ingestPeerTxn } from '../db/queries/peerIngest';
import { insertTxn } from '../db/queries/transactions';
import { readEntryDoc } from '../db/queries/syncDoc';
import { createTestDb, addPerson, addGroup, addMember, addCategory, asDb, type TestDb } from './helpers/testDb';

/**
 * The receiving half of sharing a group.
 *
 * Everything else about sync worked and this did not: the sender published,
 * wrapped and invited, the invitee accepted — and then every entry was refused as
 * `not-a-member`, silently, on every sync, forever. Nothing created the group on
 * their device, and the entries named people their phone had no rows for.
 *
 * The roster travels as an ordinary sealed entry under a reserved id, so it
 * inherits versioning, the AAD binding and the encryption, and the server needs
 * no change and learns no names.
 */

const BILL = 4_000_00;

/** The sender: a flat with me, Aarav (account) and Ravi (no account). */
async function sender() {
  const db = createTestDb();
  const me = addPerson(db, 'Me', true);
  const aarav = addPerson(db, 'Aarav');
  const ravi = addPerson(db, 'Ravi');
  await db.runAsync("UPDATE person SET remote_uid = 'acct-me' WHERE id = ?", [me]);
  await db.runAsync("UPDATE person SET remote_uid = 'acct-aarav' WHERE id = ?", [aarav]);
  const flat = addGroup(db, 'Flat');
  addMember(db, flat, me); addMember(db, flat, aarav); addMember(db, flat, ravi);
  addCategory(db, 'Food');
  return { db, me, aarav, ravi, flat };
}

/** The receiver: knows only themselves. */
function receiver(uid: string, name = 'Aarav') {
  const db = createTestDb();
  const self = addPerson(db, name, true);
  db.raw.prepare('UPDATE person SET remote_uid = ? WHERE id = ?').run(uid, self);
  addCategory(db, 'Food');
  return { db, self };
}

describe('adopting a group', () => {
  it('creates the group under the SHARED id, so no mapping is ever needed', async () => {
    const s = await sender();
    const doc = (await readRosterDoc(asDb(s.db), s.flat))!;
    const r = receiver('acct-aarav');

    await adoptGroup(asDb(r.db), s.flat, doc);

    const g = await r.db.getFirstAsync<{ id: string; name: string; is_personal: number }>(
      'SELECT id, name, is_personal FROM budget_group WHERE id = ?', [s.flat],
    );
    expect(g).toMatchObject({ id: s.flat, name: 'Flat', is_personal: 0 });
  });

  it('resolves ME to my own row rather than making a copy of myself', async () => {
    // The account id is what makes this work — without it the receiver would end
    // up with two of themselves and a balance split between them.
    const s = await sender();
    const doc = (await readRosterDoc(asDb(s.db), s.flat))!;
    const r = receiver('acct-aarav');

    await adoptGroup(asDb(r.db), s.flat, doc);

    const mes = await r.db.getAllAsync('SELECT id FROM person WHERE remote_uid = ?', ['acct-aarav']);
    expect(mes).toHaveLength(1);
    const isMe = await r.db.getFirstAsync<{ id: string }>('SELECT id FROM person WHERE is_me = 1');
    expect(mes[0]).toMatchObject({ id: isMe!.id });
  });

  it('adopts the publisher\'s id for someone with no account', async () => {
    /*
     * Ravi will never sign in, so there is no account id to match him by — the
     * only thing entries can name him by is the publisher's local id. Minting a
     * fresh uuid here would leave every entry referencing somebody who does not
     * exist.
     */
    const s = await sender();
    const doc = (await readRosterDoc(asDb(s.db), s.flat))!;
    const r = receiver('acct-aarav');

    await adoptGroup(asDb(r.db), s.flat, doc);

    const ravi = await r.db.getFirstAsync<{ id: string; name: string }>(
      'SELECT id, name FROM person WHERE id = ?', [s.ravi],
    );
    expect(ravi).toMatchObject({ id: s.ravi, name: 'Ravi' });
  });

  it('is safe to apply twice — a roster is republished on every share', async () => {
    const s = await sender();
    const doc = (await readRosterDoc(asDb(s.db), s.flat))!;
    const r = receiver('acct-aarav');

    await adoptGroup(asDb(r.db), s.flat, doc);
    await adoptGroup(asDb(r.db), s.flat, doc);

    const people = await r.db.getAllAsync('SELECT id FROM person');
    const members = await r.db.getAllAsync('SELECT person_id FROM group_member WHERE group_id = ?', [s.flat]);
    expect(people).toHaveLength(3);   // me + Aarav's row folded, Ravi, and the sender
    expect(members).toHaveLength(3);
  });
});

/**
 * The whole point: an entry that used to be refused now lands.
 */
describe('an entry arriving into an adopted group', () => {
  it('is accepted, where before adoption it was refused as not-a-member', async () => {
    const s = await sender();
    const id = await insertTxn(asDb(s.db), {
      groupId: s.flat, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
      payments: [{ personId: s.me, amount: BILL }],
      shares: [{ personId: s.me, amount: BILL / 2 }, { personId: s.aarav, amount: BILL / 2 }],
    });
    const entry = (await readEntryDoc(asDb(s.db), id))!;
    const r = receiver('acct-aarav');

    // Before: nothing here, so the group lookup fails.
    const before = toPeerEnvelope(
      await personResolver(asDb(r.db)), s.flat, id, entry.version, false, entry.doc,
    );
    expect(before).toBeNull();   // cannot even resolve the people

    // After adopting the roster, the same entry resolves and lands.
    await adoptGroup(asDb(r.db), s.flat, (await readRosterDoc(asDb(s.db), s.flat))!);
    const envelope = toPeerEnvelope(
      await personResolver(asDb(r.db)), s.flat, id, entry.version, false, entry.doc,
    )!;
    expect(envelope).not.toBeNull();

    // The author must carry an account, and the entry must land on real rows.
    await r.db.runAsync("UPDATE person SET trust_state = 'trusted' WHERE remote_uid = 'acct-me'");
    expect(await ingestPeerTxn(asDb(r.db), envelope)).toMatchObject({ ok: true, txnId: id });

    const shares = await r.db.getAllAsync<{ person_id: string }>(
      'SELECT person_id FROM txn_share WHERE txn_id = ?', [id],
    );
    expect(shares).toHaveLength(2);
  });
});

/**
 * Two people with one name.
 *
 * Reported, never resolved. The app cannot tell "Priya my flatmate" from "Priya
 * from work", and merging the wrong two splits a balance across rows that never
 * reconcile. Keeping them apart is always recoverable; merging is not.
 */
describe('a name that already exists here', () => {
  it('reports the clash instead of merging', async () => {
    const s = await sender();
    const doc = (await readRosterDoc(asDb(s.db), s.flat))!;
    const r = receiver('acct-aarav');
    const myRavi = addPerson(r.db, 'Ravi');   // unrelated Ravi, already here

    const clashes = await adoptGroup(asDb(r.db), s.flat, doc);

    expect(clashes).toEqual([
      expect.objectContaining({ incomingId: s.ravi, existingId: myRavi, name: 'Ravi' }),
    ]);
    // Both rows still exist — nothing was decided on the user's behalf.
    const ravis = await r.db.getAllAsync("SELECT id FROM person WHERE name = 'Ravi'");
    expect(ravis).toHaveLength(2);
  });

  it('merges only when told to, moving every reference', async () => {
    const s = await sender();
    const r = receiver('acct-aarav');
    const myRavi = addPerson(r.db, 'Ravi');
    await adoptGroup(asDb(r.db), s.flat, (await readRosterDoc(asDb(s.db), s.flat))!);

    await mergePerson(asDb(r.db), s.ravi, myRavi);

    const ravis = await r.db.getAllAsync("SELECT id FROM person WHERE name = 'Ravi'");
    expect(ravis).toEqual([{ id: myRavi }]);
    // The membership moved rather than being dropped with the row.
    const members = await r.db.getAllAsync<{ person_id: string }>(
      'SELECT person_id FROM group_member WHERE group_id = ? AND person_id = ?', [s.flat, myRavi],
    );
    expect(members).toHaveLength(1);
  });

  it('merging two people already on the same transaction does not collide', async () => {
    /*
     * The composite primary key on txn_share is (txn_id, person_id), so a bare
     * UPDATE would fail against a row that is already there. Both people being on
     * one bill is exactly the case a merge is for.
     */
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const a = addPerson(db, 'Ravi');
    const b = addPerson(db, 'Ravi');
    const g = addGroup(db, 'Flat');
    addMember(db, g, me); addMember(db, g, a); addMember(db, g, b);
    addCategory(db, 'Food');
    const id = await insertTxn(asDb(db), {
      groupId: g, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
      payments: [{ personId: me, amount: 300 }],
      shares: [{ personId: a, amount: 100 }, { personId: b, amount: 100 }, { personId: me, amount: 100 }],
    });

    await expect(mergePerson(asDb(db), a, b)).resolves.toBeUndefined();

    const shares = await db.getAllAsync('SELECT person_id FROM txn_share WHERE txn_id = ?', [id]);
    expect(shares).toHaveLength(2);   // the two Ravis became one
  });
});
