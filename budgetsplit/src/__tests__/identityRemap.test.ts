import { createTestDb, type TestDb } from './helpers/testDb';
import { remapIdentity } from '../db/queries/identity';
import { selfPersonId } from '../lib/sync/ids';
import { insertGroup } from '../db/queries/groups';
import { addMemberToGroup } from '../db/queries/persons';
import { insertTxn, insertItemizedTxn } from '../db/queries/transactions';
import { getGroupNet } from '../db/queries/balances';
import { getSafeToSpend } from '../db/queries/spendPower';
import { insertAsset } from '../db/queries/assets';

/**
 * The identity remap (task S13) — the riskiest step in the sync rebuild. A wrong
 * answer here re-authors history to a stranger or splits the ledger silently, so
 * every test is a preservation test: the same figures before and after, and every
 * reference actually moved rather than merely "not obviously broken".
 */

const USER = 'u-remap';
const NEW = selfPersonId(USER);

const OLD = 'local-uuid-me';

async function world() {
  const db = createTestDb();
  db.raw.prepare("INSERT INTO person (id, name, avatar_color, is_me) VALUES (?, 'Prem', '#20C4B8', 1)").run(OLD);
  const aaravId = 'p-aarav';
  db.raw.prepare("INSERT INTO person (id, name, avatar_color, is_me) VALUES (?, 'Aarav', '#8B7CF8', 0)").run(aaravId);
  const shared = await insertGroup(db, 'Flat', 'home', '#20C4B8', [], 'equal', OLD);
  await addMemberToGroup(db, shared.id, aaravId, OLD);
  return { db, oldId: OLD, aaravId, shared: shared.id };
}

describe('remapIdentity — preservation', () => {
  it('rejects an account with no local identity', async () => {
    const db = createTestDb();
    expect(await remapIdentity(db, { userId: USER })).toEqual({ ok: false, reason: 'no-me' });
  });

  it('rejects an account when this device\'s own identity is ambiguous', async () => {
    const db = createTestDb();
    db.raw.prepare("INSERT INTO person (id, name, avatar_color, is_me) VALUES ('a','A','#000',1)").run();
    db.raw.prepare("INSERT INTO person (id, name, avatar_color, is_me) VALUES ('b','B','#000',1)").run();
    expect(await remapIdentity(db, { userId: USER })).toEqual({ ok: false, reason: 'ambiguous-me' });
  });

  it('refuses to remap onto an id that already belongs to somebody else', async () => {
    const { db } = await world();
    db.raw.prepare(`INSERT INTO person (id, name, avatar_color, is_me) VALUES (?, 'Ghost', '#000', 0)`).run(NEW);
    expect(await remapIdentity(db, { userId: USER })).toEqual({ ok: false, reason: 'id-taken' });
  });

  it('is idempotent: remapping the same account twice changes nothing the second time', async () => {
    const { db } = await world();
    const first = await remapIdentity(db, { userId: USER, email: 'me@x.in' });
    expect(first).toMatchObject({ ok: true, changed: true, newId: NEW });
    const second = await remapIdentity(db, { userId: USER, email: 'me@x.in' });
    expect(second).toEqual({ ok: true, oldId: NEW, newId: NEW, changed: false });
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM person WHERE is_me = 1').get()).toEqual({ n: 1 });
  });

  it('never overwrites an email the user already set locally', async () => {
    const { db, oldId } = await world();
    db.raw.prepare('UPDATE person SET email = ? WHERE id = ?').run('typed-by-hand@x.in', oldId);
    await remapIdentity(db, { userId: USER, email: 'verified@x.in' });
    expect(db.raw.prepare('SELECT email FROM person WHERE id = ?').get(NEW)).toEqual({ email: 'typed-by-hand@x.in' });
  });

  it('re-points every reference that named the old id, and leaves everyone else untouched', async () => {
    const { db, oldId, aaravId, shared } = await world();
    // A group I created, and a personal budget override in someone else's group.
    const mine = await insertGroup(db, 'Mine', 'home', '#20C4B8', [], 'equal', oldId);
    db.raw.prepare("INSERT INTO category_budget (id, group_id, category, amount, person_id) VALUES ('b1', ?, 'Food', 50000, ?)")
      .run(shared, oldId);
    // A Review draft naming me three ways.
    db.raw.prepare(
      "INSERT INTO pending_txn (id, date, amount, description, kind, direction, created_at, author_person_id, payer_person_id, counterparty_id) VALUES ('pt1', 1, 100, 'x', 'expense', 'debit', 1, ?, ?, ?)",
    ).run(oldId, oldId, oldId);
    // An expense Aarav authored (peer-style), naming me in an audit row.
    await db.raw.prepare(
      "INSERT INTO txn (id, group_id, kind, entry_mode, date, category, author_person_id, sync_version, is_deleted, created_at, updated_at) VALUES ('t-peer', ?, 'expense', 'quick', 1, 'Food', ?, 1, 0, 1, 1)",
    ).run(shared, aaravId);
    db.raw.prepare("INSERT INTO audit_log (id, entity_type, entity_id, group_id, action, summary, created_at, actor_person_id) VALUES ('a1','txn','t-peer',?, 'created','x',1,?)")
      .run(shared, oldId);
    // A shared expense: I paid, split with Aarav.
    const txnId = await insertTxn(db, {
      groupId: shared, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
      payments: [{ personId: oldId, amount: 30000 }],
      shares: [{ personId: oldId, amount: 15000 }, { personId: aaravId, amount: 15000 }],
    });
    // An itemised bill assigning one line to me.
    await insertItemizedTxn(db, {
      groupId: shared, kind: 'expense', entryMode: 'itemized', date: Date.now(), category: 'Food',
      payments: [{ personId: oldId, amount: 15000 }],
      shares: [{ personId: oldId, amount: 15000 }],
      items: [{ name: 'Pizza', qty: 1, unitPrice: 15000, assignedTo: [oldId] }],
    });

    const netBefore = await getGroupNet(db, shared);

    const r = await remapIdentity(db, { userId: USER });
    expect(r).toMatchObject({ ok: true, changed: true, oldId, newId: NEW });

    // The identity row itself.
    expect(db.raw.prepare('SELECT id, remote_uid FROM person WHERE is_me = 1').get()).toEqual({ id: NEW, remote_uid: USER });
    expect(db.raw.prepare('SELECT id FROM person WHERE id = ?').get(oldId)).toBeUndefined();

    // Every reference moved.
    expect(db.raw.prepare('SELECT created_by FROM budget_group WHERE id = ?').get(mine.id)).toEqual({ created_by: NEW });
    expect(db.raw.prepare('SELECT person_id FROM category_budget WHERE id = ?').get('b1')).toEqual({ person_id: NEW });
    expect(db.raw.prepare('SELECT author_person_id, payer_person_id, counterparty_id FROM pending_txn WHERE id = ?').get('pt1'))
      .toEqual({ author_person_id: NEW, payer_person_id: NEW, counterparty_id: NEW });
    expect(db.raw.prepare('SELECT actor_person_id FROM audit_log WHERE id = ?').get('a1')).toEqual({ actor_person_id: NEW });
    expect(db.raw.prepare('SELECT person_id FROM txn_payment WHERE txn_id = ?').get(txnId)).toEqual({ person_id: NEW });
    const shares = db.raw.prepare('SELECT person_id FROM txn_share WHERE txn_id = ? ORDER BY person_id').all(txnId) as Array<{ person_id: string }>;
    expect(shares.map(s => s.person_id).sort()).toEqual([NEW, aaravId].sort());

    // The line item's JSON assignment.
    const item = db.raw.prepare('SELECT assigned_to FROM line_item').get() as { assigned_to: string };
    expect(JSON.parse(item.assigned_to)).toEqual([NEW]);

    // Somebody else's row: entirely untouched.
    expect(db.raw.prepare('SELECT author_person_id FROM txn WHERE id = ?').get('t-peer')).toEqual({ author_person_id: aaravId });

    // The group balance is preserved — same numbers, new key.
    const netAfter = await getGroupNet(db, shared);
    expect(netAfter[NEW]).toBe(netBefore[oldId]);
    expect(netAfter[aaravId]).toBe(netBefore[aaravId]);
    expect(netAfter[oldId]).toBeUndefined();
  });

  it('preserves cash, net worth and Safe-to-Spend exactly', async () => {
    const { db, oldId, shared } = await world();
    await insertAsset(db, { name: 'Gold', balance: 500000 });
    await insertTxn(db, {
      groupId: shared, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
      payments: [{ personId: oldId, amount: 30000 }], shares: [{ personId: oldId, amount: 15000 }],
    });

    // A fixed instant for both reads: getSafeToSpend buckets by day, and two
    // real-clock calls a test apart must not be allowed to cross a boundary and
    // fail for a reason that has nothing to do with the remap.
    const now = Date.now();
    const before = await getSafeToSpend(db, now);
    await remapIdentity(db, { userId: USER });
    const after = await getSafeToSpend(db, now);

    expect(after).toEqual(before);
  });

  it('a failure partway leaves every row exactly as it was', async () => {
    const { db, oldId, shared } = await world();
    db.raw.prepare("INSERT INTO category_budget (id, group_id, category, amount, person_id) VALUES ('b1', ?, 'Food', 50000, ?)")
      .run(shared, oldId);
    const before = db.raw.prepare('SELECT id, remote_uid FROM person WHERE is_me = 1').get();
    const budgetBefore = db.raw.prepare('SELECT person_id FROM category_budget WHERE id = ?').get('b1');

    // Force the transaction to fail on its last statement (an unknown column).
    const real = db.runAsync.bind(db);
    let calls = 0;
    (db as unknown as { runAsync: TestDb['runAsync'] }).runAsync = async (sql, params) => {
      calls++;
      if (sql.startsWith('UPDATE person SET id')) throw new Error('simulated crash');
      return real(sql, params);
    };
    await expect(remapIdentity(db, { userId: USER })).rejects.toThrow('simulated crash');
    expect(calls).toBeGreaterThan(1);   // the earlier UPDATEs really did run, then rolled back

    expect(db.raw.prepare('SELECT id, remote_uid FROM person WHERE is_me = 1').get()).toEqual(before);
    expect(db.raw.prepare('SELECT person_id FROM category_budget WHERE id = ?').get('b1')).toEqual(budgetBefore);
  });
});
