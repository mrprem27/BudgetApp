import { createD1, type TestD1 } from './helpers/d1';
import { addMember, makeGroup, makeUser } from './helpers/fixtures';
import { applyPush, ensureDevice, type Mutation } from '../../../../server/api/sync/push';
import { ENTITIES } from '../../../../server/api/sync/routes';

/**
 * Push for groups and the transaction bundle (SPEC-SERVER.md §2.5, §2.7; task S6).
 *
 * The bundle is where money lives, so the tests lean on refusal: an unbalanced
 * transaction, a stranger in the split, a stale edit, a claimed author — each must
 * leave nothing behind, not half a transaction.
 */

const T0 = 1_750_000_000_000;
let deviceN = 0;

async function push(db: TestD1, userId: string, mutations: Mutation[], now = T0, deviceId = `dev-${userId}`) {
  const last = (await ensureDevice(db, userId, deviceId, now))!;
  return applyPush({ db, userId, deviceId, now }, mutations, last, ENTITIES);
}
const rejections = async (db: TestD1) =>
  (await db.prepare('SELECT mutation_id, code, message FROM sync_rejections ORDER BY created_at, mutation_id')
    .all<{ mutation_id: number; code: string; message: string }>()).results;
const count = (db: TestD1, sql: string, ...b: unknown[]) => db.prepare(sql).bind(...b).first<number>('n');

const newGroup = (id: number, groupId: string, kind = 'personal'): Mutation => ({
  id, entity: 'groups', op: 'upsert', entityId: groupId, baseVersion: 0,
  data: { kind, name: kind === 'personal' ? 'Personal' : 'Flat', icon: 'home', color: '#20C4B8', owner_display_name: 'Prem' },
});

function txn(id: number, txnId: string, groupId: string, me: string, over: Record<string, unknown> = {}, baseVersion = 0): Mutation {
  return {
    id, entity: 'transactions', op: 'upsert', entityId: txnId, baseVersion,
    data: {
      group_id: groupId, kind: 'expense', amount: 30000, date: T0, category: 'Food',
      payers: [{ person_id: me, amount: 30000 }], splits: [{ person_id: me, amount: 30000 }],
      ...over,
    },
  };
}

async function personalWorld() {
  const db = createD1();
  const me = await makeUser(db);
  await push(db, me.userId, [newGroup(1, 'g-personal')]);
  return { db, me, g: 'g-personal' };
}

describe('push — groups', () => {
  it('creates a group with its own scope and its owner as the first admin', async () => {
    const { db, me, g } = await personalWorld();
    expect(await db.prepare('SELECT * FROM groups WHERE id = ?').bind(g).first()).toMatchObject({
      kind: 'personal', owner_id: me.userId, scope_id: g, version: 1, seq: 1,
    });
    expect(await db.prepare('SELECT role, status, display_name FROM group_members WHERE group_id = ?').bind(g).first())
      .toEqual({ role: 'admin', status: 'active', display_name: 'Prem' });
    expect(await count(db, "SELECT COUNT(*) AS n FROM activity_log WHERE scope_id = ? AND action = 'created'", g)).toBe(1);
  });

  it('refuses a second personal group', async () => {
    const { db, me } = await personalWorld();
    await push(db, me.userId, [newGroup(2, 'g-personal-2')]);
    expect((await rejections(db)).map(r => r.code)).toEqual(['invalid']);
    expect(await count(db, 'SELECT COUNT(*) AS n FROM sync_scopes WHERE id = ?', 'g-personal-2')).toBe(0);
  });

  it('lets an admin rename a group and refuses a plain member — the app\'s own isAdmin', async () => {
    const db = createD1();
    const owner = await makeUser(db);
    const plain = await makeUser(db);
    const g = await makeGroup(db, owner.userId);
    await addMember(db, g, owner.personId, owner.userId, { role: 'admin' });
    await addMember(db, g, plain.personId, owner.userId);
    const rename = (id: number, name: string): Mutation => ({
      id, entity: 'groups', op: 'upsert', entityId: g, baseVersion: 1, data: { name },
    });
    await push(db, plain.userId, [rename(1, 'Hijacked')]);
    await push(db, owner.userId, [rename(1, 'Flat 4B')]);
    expect(await db.prepare('SELECT name FROM groups WHERE id = ?').bind(g).first('name')).toBe('Flat 4B');
    expect((await rejections(db)).map(r => r.code)).toEqual(['forbidden']);
  });

  it('never changes a group\'s kind', async () => {
    const { db, me, g } = await personalWorld();
    await push(db, me.userId, [{ id: 2, entity: 'groups', op: 'upsert', entityId: g, baseVersion: 1, data: { kind: 'shared' } }]);
    expect((await rejections(db)).map(r => r.code)).toEqual(['invalid']);
  });

  it('lets only the owner delete a group, and never the personal one', async () => {
    const db = createD1();
    const owner = await makeUser(db);
    const admin = await makeUser(db);
    const g = await makeGroup(db, owner.userId);
    await addMember(db, g, owner.personId, owner.userId, { role: 'admin' });
    await addMember(db, g, admin.personId, owner.userId, { role: 'admin' });
    const del: Mutation = { id: 1, entity: 'groups', op: 'delete', entityId: g, baseVersion: 1 };
    await push(db, admin.userId, [del]);
    expect(await db.prepare('SELECT deleted_at FROM groups WHERE id = ?').bind(g).first('deleted_at')).toBeNull();
    await push(db, owner.userId, [del]);
    expect(await db.prepare('SELECT deleted_at FROM groups WHERE id = ?').bind(g).first('deleted_at')).toBe(T0);

    await push(db, owner.userId, [newGroup(2, 'mine'), { id: 3, entity: 'groups', op: 'delete', entityId: 'mine', baseVersion: 1 }]);
    expect((await rejections(db)).map(r => r.code)).toEqual(['forbidden', 'invalid']);
  });
});

describe('push — the transaction bundle', () => {
  it('writes the whole bundle, with the author and every stamp taken from the session', async () => {
    const { db, me, g } = await personalWorld();
    const somebody = 'user:someone-else';
    await push(db, me.userId, [txn(2, 't1', g, me.personId, {
      author_id: somebody, created_by: 'x', version: 50,
      tags: ['Goa', 'Goa', ' '], items: [{ id: 'i1', name: 'Pizza', quantity: 1, unit_price: 30000, assigned_to: 'all' }],
    })]);
    const me2 = await db.prepare('SELECT id FROM people WHERE user_id = ?').bind(me.userId).first('id');
    expect(await db.prepare('SELECT * FROM transactions WHERE id = ?').bind('t1').first()).toMatchObject({
      author_id: me2, created_by: me.userId, version: 1, amount: 30000, scope_id: g,
    });
    expect(await count(db, 'SELECT COUNT(*) AS n FROM transaction_tags WHERE transaction_id = ?', 't1')).toBe(1);
    expect(await count(db, 'SELECT COUNT(*) AS n FROM transaction_items WHERE transaction_id = ?', 't1')).toBe(1);
    expect(await count(db, 'SELECT COUNT(*) AS n FROM transaction_history WHERE transaction_id = ?', 't1')).toBe(1);
    expect(await count(db, "SELECT COUNT(*) AS n FROM activity_log WHERE entity_id = ? AND entity = 'txn'", 't1')).toBe(1);
  });

  it('refuses an unbalanced transaction and leaves nothing behind', async () => {
    const { db, me, g } = await personalWorld();
    const mine = me.personId;
    await push(db, me.userId, [
      txn(2, 't-payers', g, mine, { payers: [{ person_id: mine, amount: 29999 }] }),
      txn(3, 't-splits', g, mine, { splits: [{ person_id: mine, amount: 1 }] }),
      txn(4, 't-zero', g, mine, { amount: 0 }),
      txn(5, 't-negative', g, mine, { splits: [{ person_id: mine, amount: -30000 }] }),
    ]);
    expect((await rejections(db)).map(r => r.code)).toEqual(['invalid', 'invalid', 'invalid', 'invalid']);
    expect(await count(db, 'SELECT COUNT(*) AS n FROM transactions')).toBe(0);
    expect(await count(db, 'SELECT COUNT(*) AS n FROM transaction_payers')).toBe(0);
  });

  it('refuses anyone in the split who is not an active member of the group', async () => {
    const { db, me, g } = await personalWorld();
    const mine = me.personId;
    await push(db, me.userId, [txn(2, 't1', g, mine, {
      splits: [{ person_id: mine, amount: 15000 }, { person_id: 'stranger', amount: 15000 }],
    })]);
    expect((await rejections(db)).map(r => r.code)).toEqual(['forbidden']);
    expect(await count(db, 'SELECT COUNT(*) AS n FROM transactions')).toBe(0);
  });

  it('versions every edit, keeps its history, and refuses a stale one', async () => {
    const { db, me, g } = await personalWorld();
    const mine = me.personId;
    const pay = (n: number) => ({ payers: [{ person_id: mine, amount: n }], splits: [{ person_id: mine, amount: n }] });
    await push(db, me.userId, [txn(2, 't1', g, mine), txn(3, 't1', g, mine, { amount: 45000, ...pay(45000) }, 1)]);
    await push(db, me.userId, [txn(1, 't1', g, mine, { amount: 1, ...pay(1) }, 1)], T0, 'other-phone');
    expect(await db.prepare('SELECT version, amount FROM transactions WHERE id = ?').bind('t1').first())
      .toEqual({ version: 2, amount: 45000 });
    expect(await count(db, 'SELECT COUNT(*) AS n FROM transaction_history WHERE transaction_id = ?', 't1')).toBe(2);
    expect((await rejections(db)).map(r => r.code)).toEqual(['conflict']);
  });

  it('keeps a repeat rule, its skips, and an occurrence that points at it', async () => {
    const { db, me, g } = await personalWorld();
    const mine = me.personId;
    await push(db, me.userId, [
      txn(2, 'rent', g, mine, { recurrence: { frequency: 'monthly', interval: 1 }, skips: [T0 + 1] }),
      txn(3, 'rent-oct', g, mine, { recurring_rule_id: 'rent', occurrence_date: T0 + 2 }),
    ]);
    expect(await db.prepare('SELECT frequency, status, mode FROM recurring_rules WHERE transaction_id = ?').bind('rent').first())
      .toEqual({ frequency: 'monthly', status: 'active', mode: 'auto' });
    expect(await count(db, 'SELECT COUNT(*) AS n FROM recurring_skips WHERE rule_id = ?', 'rent')).toBe(1);
    expect(await db.prepare('SELECT recurring_rule_id FROM transactions WHERE id = ?').bind('rent-oct').first('recurring_rule_id')).toBe('rent');
    expect(await rejections(db)).toEqual([]);
  });

  it('holds income in the personal group', async () => {
    const { db, me, g } = await personalWorld();
    const mine = me.personId;
    await push(db, me.userId, [txn(2, 'salary', g, mine, { kind: 'income', category: 'Salary' })]);
    expect(await rejections(db)).toEqual([]);
  });

  it('accepts a transaction in a shared group now that approvals exist (S19; was refused until then)', async () => {
    const db = createD1();
    const me = await makeUser(db);
    const shared = await makeGroup(db, me.userId);
    await addMember(db, shared, me.personId, me.userId, { role: 'admin' });
    await push(db, me.userId, [txn(1, 't1', shared, me.personId)]);
    expect(await rejections(db)).toEqual([]);
    expect(await count(db, 'SELECT COUNT(*) AS n FROM transactions WHERE id = ?', 't1')).toBe(1);
  });

  it('never moves a transaction to another group', async () => {
    const db = createD1();
    const me = await makeUser(db);
    const other = await makeGroup(db, me.userId, { kind: 'personal', name: 'Old' });
    await addMember(db, other, me.personId, me.userId, { role: 'admin' });
    await push(db, me.userId, [txn(1, 't1', other, me.personId)]);
    // A second personal group, reached by deleting the first.
    await db.prepare('UPDATE groups SET deleted_at = 1 WHERE id = ?').bind(other).run();
    const fresh = await makeGroup(db, me.userId, { kind: 'personal', name: 'New' });
    await addMember(db, fresh, me.personId, me.userId, { role: 'admin' });
    await push(db, me.userId, [txn(2, 't1', fresh, me.personId, {}, 1)]);
    expect((await rejections(db)).map(r => r.code)).toEqual(['invalid']);
  });

  it('soft-deletes, versions the deletion, and writes it to history', async () => {
    const { db, me, g } = await personalWorld();
    await push(db, me.userId, [
      txn(2, 't1', g, me.personId),
      { id: 3, entity: 'transactions', op: 'delete', entityId: 't1', baseVersion: 1 },
    ], T0 + 9);
    expect(await db.prepare('SELECT deleted_at, version FROM transactions WHERE id = ?').bind('t1').first())
      .toEqual({ deleted_at: T0 + 9, version: 2 });
    expect(await count(db, 'SELECT COUNT(*) AS n FROM transaction_history WHERE transaction_id = ?', 't1')).toBe(2);
  });

  it('only lets the author change a transaction', async () => {
    const db = createD1();
    const me = await makeUser(db);
    const g = await makeGroup(db, me.userId, { kind: 'personal', name: 'Personal' });
    await addMember(db, g, me.personId, me.userId, { role: 'admin' });
    await push(db, me.userId, [txn(1, 't1', g, me.personId)]);
    // Force the row to look like someone else's, as it would in a shared group.
    await db.prepare("INSERT INTO people (id, user_id, created_by, created_at) VALUES ('p-aarav', NULL, ?, 1)").bind(me.userId).run();
    await db.prepare("UPDATE transactions SET author_id = 'p-aarav' WHERE id = 't1'").run();
    await push(db, me.userId, [txn(2, 't1', g, me.personId, {}, 1)]);
    expect((await rejections(db)).map(r => r.code)).toEqual(['forbidden']);
  });
});

void deviceN;
