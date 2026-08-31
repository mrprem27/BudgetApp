import { mergePerson, MergePersonError } from '../db/queries/persons';
import { getGroupNet } from '../db/queries/balances';
import { createTestDb, addPerson, addGroup, addMember, addTxn, asDb, type TestDb } from './helpers/testDb';

/**
 * Merging two people must not change how much money exists.
 *
 * A sync name collision produces exactly the case this file is about: the roster
 * introduces a "Priya" who is already here, so both rows can sit on the SAME
 * expense. The old merge moved the composite-key tables with `INSERT OR IGNORE`
 * then `DELETE` — the insert was ignored because the survivor already had a row,
 * and the delete then took the other amount away. Payments and shares stopped
 * agreeing, silently and permanently, because `validateShares` runs on write and
 * never again.
 *
 * These tests are the boundary: every reference moves, nothing is invented, and
 * the merge refuses rather than guesses when the two rows disagree about who
 * they are.
 */

const sum = (db: TestDb, table: 'txn_payment' | 'txn_share', txnId: string) =>
  (db.raw.prepare(`SELECT COALESCE(SUM(amount), 0) AS t FROM ${table} WHERE txn_id = ?`)
    .get(txnId) as { t: number }).t;

describe('mergePerson — money', () => {
  it('adds the two amounts when both rows are on the same expense', async () => {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const keep = addPerson(db, 'Priya');
    const dupe = addPerson(db, 'Priya');
    const gid = addGroup(db, 'Flat');
    [me, keep, dupe].forEach(p => addMember(db, gid, p));

    // ₹3,600 paid by me, split three ways — but two of those three are the same
    // human under two rows. 120000 paise each.
    const txnId = addTxn(db, {
      groupId: gid,
      kind: 'expense',
      date: Date.now(),
      category: 'Food',
      payments: [{ personId: me, amount: 360000 }],
      shares: [
        { personId: me, amount: 120000 },
        { personId: keep, amount: 120000 },
        { personId: dupe, amount: 120000 },
      ],
    });

    await mergePerson(asDb(db), dupe, keep);

    // The invariant every balance in the app rests on.
    expect(sum(db, 'txn_payment', txnId)).toBe(360000);
    expect(sum(db, 'txn_share', txnId)).toBe(360000);

    // And it landed on the survivor rather than vanishing: one person, two shares.
    const priya = db.raw.prepare('SELECT amount FROM txn_share WHERE txn_id = ? AND person_id = ?')
      .get(txnId, keep) as { amount: number };
    expect(priya.amount).toBe(240000);
    expect(db.raw.prepare('SELECT COUNT(*) AS c FROM txn_share WHERE txn_id = ?').get(txnId))
      .toEqual({ c: 2 });
  });

  it('leaves the group net unchanged', async () => {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const keep = addPerson(db, 'Aarav');
    const dupe = addPerson(db, 'Aarav');
    const gid = addGroup(db, 'Trip');
    [me, keep, dupe].forEach(p => addMember(db, gid, p));

    addTxn(db, {
      groupId: gid, kind: 'expense', date: Date.now(), category: 'Travel',
      payments: [{ personId: keep, amount: 200000 }],
      shares: [{ personId: me, amount: 100000 }, { personId: dupe, amount: 100000 }],
    });

    const before = await getGroupNet(asDb(db), gid);
    const combined = (before[keep] ?? 0) + (before[dupe] ?? 0);

    await mergePerson(asDb(db), dupe, keep);

    const after = await getGroupNet(asDb(db), gid);
    // My position cannot move because two of someone else's rows became one.
    expect(after[me]).toBe(before[me]);
    expect(after[keep]).toBe(combined);
    expect(after[dupe]).toBeUndefined();
  });
});

describe('mergePerson — references', () => {
  it("moves the group's creator, so the group keeps an admin", async () => {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const keep = addPerson(db, 'Priya');
    const dupe = addPerson(db, 'Priya');
    // The duplicate is the one recorded as creator — the case that used to leave
    // `created_by` dangling and the group permanently unadministrable.
    const gid = addGroup(db, 'Roommates', false, dupe);
    [me, keep, dupe].forEach(p => addMember(db, gid, p));

    await mergePerson(asDb(db), dupe, keep);

    expect(db.raw.prepare('SELECT created_by FROM budget_group WHERE id = ?').get(gid))
      .toEqual({ created_by: keep });
  });

  it('keeps the stronger role rather than demoting an admin', async () => {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const keep = addPerson(db, 'Aarav');
    const dupe = addPerson(db, 'Aarav');
    const gid = addGroup(db, 'Flat');
    addMember(db, gid, me);
    addMember(db, gid, keep, 'member');
    addMember(db, gid, dupe, 'admin');

    await mergePerson(asDb(db), dupe, keep);

    expect(db.raw.prepare('SELECT role FROM group_member WHERE group_id = ? AND person_id = ?')
      .get(gid, keep)).toEqual({ role: 'admin' });
  });

  it('moves authorship and the member audit trail', async () => {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const keep = addPerson(db, 'Rohan');
    const dupe = addPerson(db, 'Rohan');
    const gid = addGroup(db, 'Flat');
    [me, keep, dupe].forEach(p => addMember(db, gid, p));

    const txnId = addTxn(db, {
      groupId: gid, kind: 'expense', date: Date.now(), category: 'Food',
      payments: [{ personId: me, amount: 50000 }], shares: [{ personId: me, amount: 50000 }],
    });
    db.raw.prepare('UPDATE txn SET author_person_id = ? WHERE id = ?').run(dupe, txnId);
    db.raw.prepare(
      `INSERT INTO audit_log (id, entity_type, entity_id, group_id, action, summary, created_at)
       VALUES ('a1', 'member', ?, ?, 'created', 'Added Rohan', ?)`,
    ).run(dupe, gid, Date.now());

    await mergePerson(asDb(db), dupe, keep);

    expect(db.raw.prepare('SELECT author_person_id FROM txn WHERE id = ?').get(txnId))
      .toEqual({ author_person_id: keep });
    expect(db.raw.prepare("SELECT entity_id FROM audit_log WHERE id = 'a1'").get())
      .toEqual({ entity_id: keep });
  });

  it('leaves nothing behind pointing at the merged-away row', async () => {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const keep = addPerson(db, 'Priya');
    const dupe = addPerson(db, 'Priya');
    const gid = addGroup(db, 'Flat');
    [me, keep, dupe].forEach(p => addMember(db, gid, p));

    addTxn(db, {
      groupId: gid, kind: 'expense', date: Date.now(), category: 'Food',
      payments: [{ personId: dupe, amount: 80000 }], shares: [{ personId: dupe, amount: 80000 }],
    });
    db.raw.prepare(
      `INSERT INTO category_budget (id, group_id, category, period, amount, cadence, person_id)
       VALUES ('cb1', ?, 'Food', 'monthly', 500000, 'monthly', ?)`,
    ).run(gid, dupe);
    db.raw.prepare(
      `INSERT INTO pending_txn (id, date, amount, description, kind, direction, created_at, counterparty_id)
       VALUES ('p1', ?, 1000, 'Dinner', 'expense', 'debit', ?, ?)`,
    ).run(Date.now(), Date.now(), dupe);

    await mergePerson(asDb(db), dupe, keep);

    const orphans = [
      ['txn_payment', 'person_id'], ['txn_share', 'person_id'], ['group_member', 'person_id'],
      ['person_group_trust', 'person_id'], ['category_budget', 'person_id'],
      ['txn', 'author_person_id'], ['budget_group', 'created_by'],
      ['pending_txn', 'counterparty_id'], ['pending_txn', 'author_person_id'],
      ['pending_txn', 'payer_person_id'], ['person', 'id'],
    ] as const;
    for (const [table, column] of orphans) {
      const row = db.raw.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE ${column} = ?`).get(dupe);
      expect({ table, column, ...(row as { c: number }) }).toEqual({ table, column, c: 0 });
    }
  });
});

describe('mergePerson — refusals', () => {
  it('refuses when the two rows are linked to different accounts', async () => {
    const db = createTestDb();
    addPerson(db, 'Me', true);
    const keep = addPerson(db, 'Priya');
    const dupe = addPerson(db, 'Priya');
    db.raw.prepare('UPDATE person SET remote_uid = ? WHERE id = ?').run('uid-a', keep);
    db.raw.prepare('UPDATE person SET remote_uid = ? WHERE id = ?').run('uid-b', dupe);

    await expect(mergePerson(asDb(db), dupe, keep)).rejects.toThrow(MergePersonError);
    // Refused means nothing moved, not "mostly nothing".
    expect(db.raw.prepare('SELECT COUNT(*) AS c FROM person').get()).toEqual({ c: 3 });
  });

  it('refuses to merge you into someone else', async () => {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const other = addPerson(db, 'Aarav');

    await expect(mergePerson(asDb(db), me, other)).rejects.toThrow(MergePersonError);
    expect(db.raw.prepare('SELECT COUNT(*) AS c FROM person WHERE is_me = 1').get()).toEqual({ c: 1 });
  });

  it('carries the account id onto the survivor when only one side has it', async () => {
    const db = createTestDb();
    addPerson(db, 'Me', true);
    const keep = addPerson(db, 'Priya');
    const dupe = addPerson(db, 'Priya');
    db.raw.prepare('UPDATE person SET remote_uid = ? WHERE id = ?').run('uid-a', dupe);

    await mergePerson(asDb(db), dupe, keep);

    expect(db.raw.prepare('SELECT remote_uid FROM person WHERE id = ?').get(keep))
      .toEqual({ remote_uid: 'uid-a' });
  });

  it('keeps the more cautious trust value on disagreement', async () => {
    const db = createTestDb();
    addPerson(db, 'Me', true);
    const keep = addPerson(db, 'Aarav');
    const dupe = addPerson(db, 'Aarav');
    db.raw.prepare("UPDATE person SET trust_state = 'trusted' WHERE id = ?").run(keep);
    db.raw.prepare("UPDATE person SET trust_state = 'review' WHERE id = ?").run(dupe);

    await mergePerson(asDb(db), dupe, keep);

    // A merge must never widen what someone may write on your ledger.
    expect(db.raw.prepare('SELECT trust_state FROM person WHERE id = ?').get(keep))
      .toEqual({ trust_state: 'review' });
  });
});
