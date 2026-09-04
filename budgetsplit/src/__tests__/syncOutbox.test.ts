import { insertTxn, insertItemizedTxn, updateTxn, softDeleteTxn } from '../db/queries/transactions';
import { pendingUploads, pendingUploadCount, markDelivered, MAX_PER_DRAIN } from '../db/queries/syncOutbox';
import { ingestPeerTxn } from '../db/queries/peerIngest';
import { deleteGroup } from '../db/queries/groups';
import { pullCursor, setPullCursor, archiveVanishedGroup } from '../db/queries/syncDoc';
import { createTestDb, addPerson, addGroup, addMember, asDb, type TestDb } from './helpers/testDb';

/**
 * The outbox exists to make one guarantee: **a write to a shared entry cannot
 * commit without being queued.** A missed write is silent divergence — the failure
 * mode with no symptom, where two people's ledgers disagree and neither is told.
 *
 * The dangerous part is that there is no single choke point. Four separate
 * `INSERT INTO txn` statements exist in this codebase, and only one goes through
 * `insertTxnRows`. Every one of them gets a test here.
 */
describe('sync outbox', () => {
  async function setup() {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const friend = addPerson(db, 'Aarav', false);
    const personal = addGroup(db, 'Personal', true);
    const shared = addGroup(db, 'Flat');
    addMember(db, personal, me);
    addMember(db, shared, me);
    addMember(db, shared, friend);
    return { db, me, friend, personal, shared };
  }

  const expense = (groupId: string, me: string) => ({
    groupId, kind: 'expense' as const, entryMode: 'quick' as const,
    date: Date.now(), category: 'Food',
    payments: [{ personId: me, amount: 50000 }],
    shares: [{ personId: me, amount: 50000 }],
  });

  it('queues a shared-group entry the moment it is written', async () => {
    const { db, me, shared } = await setup();
    const id = await insertTxn(asDb(db), expense(shared, me));
    expect((await pendingUploads(asDb(db), [shared])).map(r => r.entry_id)).toEqual([id]);
  });

  it('never queues anything personal', async () => {
    // The filter lives inside the statement, not at each call site, because
    // payCardBill, moveToInvestments, the voice drain and onboarding all write
    // into the personal group through shared plumbing. Any of them forgetting
    // would upload someone's private finances.
    const { db, me, personal } = await setup();
    await insertTxn(asDb(db), expense(personal, me));
    expect(await pendingUploadCount(asDb(db))).toBe(0);
  });

  it('queues an itemized bill, which does not go through insertTxnRows', async () => {
    // The second of the four INSERT statements. A hook on insertTxnRows alone
    // would have missed every itemized bill, silently.
    const { db, me, shared } = await setup();
    const id = await insertItemizedTxn(asDb(db), {
      ...expense(shared, me), entryMode: 'itemized',
      items: [{ name: 'Coffee', qty: 1, unitPrice: 50000, assignedTo: [me] }],
    });
    expect((await pendingUploads(asDb(db), [shared])).map(r => r.entry_id)).toContain(id);
  });

  it('collapses repeated edits of one entry into a single queued row', async () => {
    // Keyed on entry_id, because the drain re-reads current state. Five edits are
    // one delivery, and the newest amount is the one that travels.
    const { db, me, shared } = await setup();
    const id = await insertTxn(asDb(db), expense(shared, me));
    for (const amount of [10000, 20000, 30000]) {
      await updateTxn(asDb(db), {
        id, groupId: shared, kind: 'expense', date: Date.now(), category: 'Food',
        payments: [{ personId: me, amount }], shares: [{ personId: me, amount }],
      });
    }
    expect(await pendingUploadCount(asDb(db))).toBe(1);
  });

  it('queues a soft delete — an absence still has to travel', async () => {
    const { db, me, shared } = await setup();
    const id = await insertTxn(asDb(db), expense(shared, me));
    await markDelivered(asDb(db), id);
    await softDeleteTxn(asDb(db), id);
    expect((await pendingUploads(asDb(db), [shared])).map(r => r.entry_id)).toEqual([id]);
  });

  it('follows an entry moved from personal into a shared group', async () => {
    // `group_id` is editable — the destination pill is live in edit mode.
    const { db, me, personal, shared } = await setup();
    const id = await insertTxn(asDb(db), expense(personal, me));
    expect(await pendingUploadCount(asDb(db))).toBe(0);

    await updateTxn(asDb(db), {
      id, groupId: shared, kind: 'expense', date: Date.now(), category: 'Food',
      payments: [{ personId: me, amount: 50000 }], shares: [{ personId: me, amount: 50000 }],
    });
    expect((await pendingUploads(asDb(db), [shared])).map(r => r.entry_id)).toEqual([id]);
  });

  /**
   * The echo test. If an inbound entry queued itself, two devices would bounce the
   * same expense back and forth forever, each re-delivering what the other just
   * sent.
   */
  it('never queues an entry that arrived from someone else', async () => {
    const { db, me, friend, shared } = await setup();
    await db.runAsync("UPDATE person SET remote_uid = 'acct-aarav' WHERE id = ?", [friend]);
    await db.runAsync("UPDATE person SET trust_state = 'trusted' WHERE id = ?", [friend]);

    const res = await ingestPeerTxn(asDb(db), {
      authorUid: 'acct-aarav', groupId: shared, version: 1, kind: 'expense',
      date: Date.now(), category: 'Food',
      payments: [{ personId: friend, amount: 40000 }],
      shares: [{ personId: me, amount: 20000 }, { personId: friend, amount: 20000 }],
    });
    expect(res.ok).toBe(true);
    expect(await pendingUploadCount(asDb(db))).toBe(0);
  });

  /**
   * SYNC-F18 — head-of-line starvation.
   *
   * A page is `ORDER BY queued_at ASC LIMIT 50`, and the drain used to fetch that
   * page and then skip past every row whose group it had no key for, without
   * removing it. So an unshared group holding more than fifty rows — the ordinary
   * state of a group you made months ago and never invited anyone to — filled every
   * page forever, and a group you HAD shared never got its turn. Nothing aged them
   * out, so the jam was permanent rather than temporary.
   *
   * Fifty-one, not fifty: fifty exactly would still leave room for nothing, but it
   * would pass a version of this bug that used `<` somewhere. One past the cap is
   * the first count that can starve.
   */
  it('is not starved by an older group this device cannot send', async () => {
    const { db, me, shared } = await setup();
    const unshared = addGroup(db, 'Weekend Plans');
    addMember(db, unshared, me);

    for (let i = 0; i < MAX_PER_DRAIN + 1; i += 1) {
      await insertTxn(asDb(db), expense(unshared, me));
    }
    const wanted = await insertTxn(asDb(db), expense(shared, me));

    // Everything is queued — nothing was dropped for being unsendable.
    expect(await pendingUploadCount(asDb(db))).toBe(MAX_PER_DRAIN + 2);

    // But a drain that can only open `shared` is offered only `shared`'s row,
    // however much older the other group's backlog is.
    const page = await pendingUploads(asDb(db), [shared]);
    expect(page.map(r => r.entry_id)).toEqual([wanted]);
  });

  it('asks for nothing when this device can open no group at all', async () => {
    // `IN ()` is a syntax error in SQLite, so the empty case has to short-circuit
    // rather than build a query — and it is the normal state before sharing.
    const { db, me, shared } = await setup();
    await insertTxn(asDb(db), expense(shared, me));
    expect(await pendingUploads(asDb(db), [])).toEqual([]);
    expect(await pendingUploadCount(asDb(db))).toBe(1);
  });

  it('forgets an entry only once it has been delivered', async () => {
    // At-least-once, like voiceDrain: delete after the server accepts, never
    // before. A re-delivered entry is already handled; a dropped one is not.
    const { db, me, shared } = await setup();
    const id = await insertTxn(asDb(db), expense(shared, me));
    expect(await pendingUploadCount(asDb(db))).toBe(1);
    await markDelivered(asDb(db), id);
    expect(await pendingUploadCount(asDb(db))).toBe(0);
  });

  /**
   * Deleting a group is the second route to the defect a restore had: queued rows
   * left pointing at entries that no longer exist. `sync_outbox.entry_id`
   * REFERENCES `txn(id)`, and `deleteGroup` hard-deletes every txn in the group.
   */
  it('clears the queue and the cursor when its group is deleted', async () => {
    const { db, me, shared } = await setup();
    await insertTxn(asDb(db), expense(shared, me));
    await setPullCursor(asDb(db), shared, 12345);
    expect(await pendingUploadCount(asDb(db))).toBe(1);

    await deleteGroup(asDb(db), shared, me);

    expect(await pendingUploadCount(asDb(db))).toBe(0);
    // And the cursor, so re-joining later does not start from a timestamp that
    // skips the group's entire history.
    expect(await pullCursor(asDb(db), shared)).toBe(0);
  });

  /**
   * A shared group that stopped existing on the server.
   *
   * The owner deleted it for everyone, or I was removed. Either way this device
   * has to stop syncing it — and must NOT delete anything, because my share of
   * every entry in it already counted as my spending in months that are closed.
   * Erasing them would rewrite my own budget history for a decision that was not
   * mine, with no undo.
   */
  describe('a group that vanished', () => {
    it('archives it, stops syncing it, and deletes nothing', async () => {
      const { db, me, shared } = await setup();
      const id = await insertTxn(asDb(db), expense(shared, me));
      await setPullCursor(asDb(db), shared, 9999);
      expect(await pendingUploadCount(asDb(db))).toBe(1);

      expect(await archiveVanishedGroup(asDb(db), shared)).toBe(true);

      // Out of the active list, and nothing left trying to reach a group that is gone.
      const g = await db.getFirstAsync<{ is_archived: number }>(
        'SELECT is_archived FROM budget_group WHERE id = ?', [shared],
      );
      expect(g?.is_archived).toBe(1);
      expect(await pendingUploadCount(asDb(db))).toBe(0);
      expect(await pullCursor(asDb(db), shared)).toBe(0);

      // The money is untouched. This is the assertion that matters.
      const txn = await db.getFirstAsync<{ id: string; is_deleted: number }>(
        'SELECT id, is_deleted FROM txn WHERE id = ?', [id],
      );
      expect(txn).toMatchObject({ id, is_deleted: 0 });
      const shares = await db.getAllAsync('SELECT * FROM txn_share WHERE txn_id = ?', [id]);
      expect(shares.length).toBeGreaterThan(0);
    });

    it('says nothing the second time, so it is announced once', async () => {
      const { db, shared } = await setup();
      expect(await archiveVanishedGroup(asDb(db), shared)).toBe(true);
      expect(await archiveVanishedGroup(asDb(db), shared)).toBe(false);
    });

    it('says nothing about a group this device does not have', async () => {
      const { db } = await setup();
      expect(await archiveVanishedGroup(asDb(db), 'never-heard-of-it')).toBe(false);
    });
  });

});
