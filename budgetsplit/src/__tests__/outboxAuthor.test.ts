import { softDeleteTxn, restoreTxn, updateTxn } from '../db/queries/transactions';
import { rejectTxn } from '../db/queries/approval';
import { createTestDb, addPerson, addGroup, addMember, addTxn, addCategory, asDb, type TestDb } from './helpers/testDb';

/**
 * What must never reach the outbox: an entry somebody else wrote.
 *
 * The drain re-reads each queued row at send time and pushes its CURRENT state
 * under my account, so queueing a peer's entry publishes whatever I did to it
 * locally as the authoritative version. The live case was rejection: refusing a
 * **trusted** peer's expense soft-deletes it here, the soft delete queued it, and
 * the tombstone went up — deleting their expense from every phone in the group.
 *
 * `NOT_AWAITING_APPROVAL` could not catch it. An entry from a trusted author is
 * applied on arrival and never gets a `txn_approval` row, so there was nothing
 * for that predicate to exclude.
 */

const queued = (db: TestDb): string[] =>
  (db.raw.prepare('SELECT entry_id FROM sync_outbox ORDER BY entry_id').all() as { entry_id: string }[])
    .map(r => r.entry_id);

/** A shared group with me and one peer, and a `peerTxn` helper that writes their entry. */
function scene() {
  const db = createTestDb();
  const me = addPerson(db, 'Me', true);
  const peer = addPerson(db, 'Aarav');
  const gid = addGroup(db, 'Flat');
  addMember(db, gid, me);
  addMember(db, gid, peer);
  addCategory(db, 'Food');

  const peerTxn = (): string => {
    const id = addTxn(db, {
      groupId: gid, kind: 'expense', date: Date.now(), category: 'Food',
      payments: [{ personId: peer, amount: 240000 }],
      shares: [{ personId: me, amount: 120000 }, { personId: peer, amount: 120000 }],
    });
    // What `ingestPeerTxn` writes: authored by them, arrived over sync. A TRUSTED
    // author gets no txn_approval row at all — that is the whole trap.
    db.raw.prepare("UPDATE txn SET author_person_id = ?, source = 'peer' WHERE id = ?").run(peer, id);
    db.raw.prepare('DELETE FROM sync_outbox').run();
    return id;
  };

  const myTxn = (): string => {
    const id = addTxn(db, {
      groupId: gid, kind: 'expense', date: Date.now(), category: 'Food',
      payments: [{ personId: me, amount: 100000 }],
      shares: [{ personId: me, amount: 50000 }, { personId: peer, amount: 50000 }],
    });
    db.raw.prepare('DELETE FROM sync_outbox').run();
    return id;
  };

  return { db, me, peer, gid, peerTxn, myTxn };
}

describe('the outbox never carries a peer entry', () => {
  it('rejecting a trusted peer entry does not broadcast the deletion', async () => {
    const s = scene();
    const id = s.peerTxn();

    await rejectTxn(asDb(s.db), id);

    // Locally refused...
    expect(s.db.raw.prepare('SELECT is_deleted FROM txn WHERE id = ?').get(id))
      .toEqual({ is_deleted: 1 });
    // ...and their copy is left alone. The objection travels as a dispute.
    expect(queued(s.db)).toEqual([]);
    expect(s.db.raw.prepare('SELECT dispute_state FROM txn_approval WHERE txn_id = ?').get(id))
      .toEqual({ dispute_state: 'raise' });
  });

  it('soft-deleting a peer entry does not queue it', async () => {
    const s = scene();
    const id = s.peerTxn();
    await softDeleteTxn(asDb(s.db), id);
    expect(queued(s.db)).toEqual([]);
  });

  it('restoring a peer entry does not queue it', async () => {
    const s = scene();
    const id = s.peerTxn();
    await softDeleteTxn(asDb(s.db), id);
    await restoreTxn(asDb(s.db), id);
    expect(queued(s.db)).toEqual([]);
  });

  it('editing a peer entry does not queue it', async () => {
    const s = scene();
    const id = s.peerTxn();
    await updateTxn(asDb(s.db), {
      id, groupId: s.gid, kind: 'expense', entryMode: 'quick', date: Date.now(),
      category: 'Food', note: 'corrected',
      payments: [{ personId: s.peer, amount: 200000 }],
      shares: [{ personId: s.me, amount: 100000 }, { personId: s.peer, amount: 100000 }],
    });
    expect(queued(s.db)).toEqual([]);
  });
});

describe('the outbox still carries my own entries', () => {
  // The guard has to be narrow. A version of it that stopped my own edits from
  // travelling would be a worse bug than the one it fixes, and silent in the
  // same way.
  it('queues my entry on create, edit, delete and restore', async () => {
    const s = scene();

    const id = addTxn(s.db, {
      groupId: s.gid, kind: 'expense', date: Date.now(), category: 'Food',
      payments: [{ personId: s.me, amount: 100000 }],
      shares: [{ personId: s.me, amount: 50000 }, { personId: s.peer, amount: 50000 }],
    });
    // `addTxn` is a fixture and writes rows directly, so prove each real path.
    s.db.raw.prepare('DELETE FROM sync_outbox').run();

    await updateTxn(asDb(s.db), {
      id, groupId: s.gid, kind: 'expense', entryMode: 'quick', date: Date.now(),
      category: 'Food', note: 'edited',
      payments: [{ personId: s.me, amount: 120000 }],
      shares: [{ personId: s.me, amount: 60000 }, { personId: s.peer, amount: 60000 }],
    });
    expect(queued(s.db)).toEqual([id]);

    s.db.raw.prepare('DELETE FROM sync_outbox').run();
    await softDeleteTxn(asDb(s.db), id);
    expect(queued(s.db)).toEqual([id]);

    s.db.raw.prepare('DELETE FROM sync_outbox').run();
    await restoreTxn(asDb(s.db), id);
    expect(queued(s.db)).toEqual([id]);
  });

  it('still refuses to queue anything from a personal group', async () => {
    // The older guard, retested here because both now live in the same statement
    // and a rewrite could drop either.
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const personal = addGroup(db, 'Personal', true);
    addMember(db, personal, me);
    const id = addTxn(db, {
      groupId: personal, kind: 'expense', date: Date.now(), category: 'Food',
      payments: [{ personId: me, amount: 50000 }], shares: [{ personId: me, amount: 50000 }],
    });
    db.raw.prepare('DELETE FROM sync_outbox').run();

    await softDeleteTxn(asDb(db), id);
    expect(queued(db)).toEqual([]);
  });
});
