jest.mock('expo-file-system', () => require('./__mocks__/expoFileSystem'));

import { createTestDb } from './helpers/testDb';
import { combinePeople } from '../db/queries/personRemap';
import { insertGroup } from '../db/queries/groups';
import { addMemberToGroup, setGroupTrust, getGroupTrustFor } from '../db/queries/persons';
import { insertTxn, insertItemizedTxn } from '../db/queries/transactions';
import { getGroupNet } from '../db/queries/balances';
import { syncOnce } from '../lib/sync/engine';
import { uploadToAccount, replaceWithAccount } from '../lib/sync/firstSignIn';
import { selfPersonId } from '../lib/sync/ids';
import { USER, ACCOUNT, transport, server, freshPhone, type Db } from './helpers/syncWorld';

/**
 * "Same person as…" (`DQ-94` part 2, task P2): two placeholders picked by hand
 * are the same human. `combinePeople(db, keepId, dropId)` folds `dropId`'s
 * entries, splits, item assignments and trust onto `keepId` and retires it —
 * locally first (this file), then end to end on the real Worker (the two-phone
 * test at the bottom), which is what actually proves the OTHER phone loses its
 * own copy of the dropped placeholder too.
 */

const ME = 'local-me';

async function world() {
  const db = createTestDb();
  db.raw.prepare("INSERT INTO person (id, name, avatar_color, is_me) VALUES (?, 'Prem', '#20C4B8', 1)").run(ME);
  const aarav = 'p-aarav';
  const also = 'p-also-aarav'; // the same human, typed in twice
  db.raw.prepare("INSERT INTO person (id, name, avatar_color, is_me) VALUES (?, 'Aarav', '#8B7CF8', 0)").run(aarav);
  db.raw.prepare("INSERT INTO person (id, name, avatar_color, is_me) VALUES (?, 'Aarav K', '#3ECF8E', 0)").run(also);
  const g = await insertGroup(db, 'Flat', 'home', '#20C4B8', [], 'equal', ME);
  await addMemberToGroup(db, g.id, aarav, ME);
  await addMemberToGroup(db, g.id, also, ME);
  return { db, aarav, also, groupId: g.id };
}

describe('combinePeople — local fold', () => {
  it('moves splits, payments, item assignments and a trust override; the dropped person is gone; the group balance is unchanged', async () => {
    const { db, aarav, also, groupId } = await world();
    await setGroupTrust(db, aarav, groupId, 'trusted');

    const txnId = await insertTxn(db, {
      groupId, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
      payments: [{ personId: ME, amount: 30000 }],
      shares: [{ personId: ME, amount: 15000 }, { personId: aarav, amount: 15000 }],
    });
    await insertItemizedTxn(db, {
      groupId, kind: 'expense', entryMode: 'itemized', date: Date.now(), category: 'Food',
      payments: [{ personId: ME, amount: 15000 }],
      shares: [{ personId: aarav, amount: 15000 }],
      items: [{ name: 'Pizza', qty: 1, unitPrice: 15000, assignedTo: [aarav] }],
    });

    const netBefore = await getGroupNet(db, groupId);

    await combinePeople(db, also, aarav);

    // The dropped person is gone.
    expect(db.raw.prepare('SELECT id FROM person WHERE id = ?').get(aarav)).toBeUndefined();
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM group_member WHERE group_id = ? AND person_id = ?').get(groupId, aarav))
      .toEqual({ n: 0 });

    // Splits and payments moved.
    expect(db.raw.prepare('SELECT person_id FROM txn_share WHERE txn_id = ? AND person_id <> ?').get(txnId, ME))
      .toEqual({ person_id: also });
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM txn_share WHERE person_id = ?').get(aarav)).toEqual({ n: 0 });

    // The item assignment moved.
    const item = db.raw.prepare('SELECT assigned_to FROM line_item').get() as { assigned_to: string };
    expect(JSON.parse(item.assigned_to)).toEqual([also]);

    // The trust override moved.
    expect(await getGroupTrustFor(db, aarav)).toEqual([]);
    expect(await getGroupTrustFor(db, also)).toEqual([{ group_id: groupId, trust_state: 'trusted' }]);

    // Balances: the same money, now under one key.
    const netAfter = await getGroupNet(db, groupId);
    expect(netAfter[also]).toBe(netBefore[aarav]);
    expect(netAfter[ME]).toBe(netBefore[ME]);
    expect(netAfter[aarav]).toBeUndefined();
  });

  it('sums money that would otherwise collide, rather than dropping one side', async () => {
    const { db, aarav, also, groupId } = await world();
    // The same bill, split between BOTH — the two rows really are the same
    // human's share, so folding them must add up, not pick one.
    const txnId = await insertTxn(db, {
      groupId, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
      payments: [{ personId: ME, amount: 30000 }],
      shares: [{ personId: aarav, amount: 10000 }, { personId: also, amount: 20000 }],
    });

    await combinePeople(db, also, aarav);

    expect(db.raw.prepare('SELECT amount FROM txn_share WHERE txn_id = ? AND person_id = ?').get(txnId, also))
      .toEqual({ amount: 30000 });
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM txn_share WHERE txn_id = ?').get(txnId)).toEqual({ n: 1 }); // just also, summed
  });

  it('drops the redundant membership rather than duplicating it, when both are already in the group', async () => {
    const { db, aarav, also, groupId } = await world();
    // Both are members already (`world()` adds both) — combining must not try
    // to insert a second (group_id, person_id) row and crash.
    await expect(combinePeople(db, also, aarav)).resolves.toBeUndefined();
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM group_member WHERE group_id = ? AND person_id = ?').get(groupId, also))
      .toEqual({ n: 1 });
  });

  it("keeps the kept person's own name and contact details on a clash", async () => {
    const { db, aarav, also } = await world();
    db.raw.prepare('UPDATE person SET email = ? WHERE id = ?').run('aarav@x.in', aarav);
    db.raw.prepare('UPDATE person SET email = ? WHERE id = ?').run('kept@x.in', also);

    await combinePeople(db, also, aarav);

    const row = db.raw.prepare('SELECT name, email FROM person WHERE id = ?').get(also) as { name: string; email: string };
    expect(row).toEqual({ name: 'Aarav K', email: 'kept@x.in' });
  });

  it("fills in what the kept person never set, from the dropped one", async () => {
    const { db, aarav, also } = await world();
    db.raw.prepare('UPDATE person SET email = ? WHERE id = ?').run('aarav@x.in', aarav);

    await combinePeople(db, also, aarav);

    expect(db.raw.prepare('SELECT email FROM person WHERE id = ?').get(also)).toEqual({ email: 'aarav@x.in' });
  });

  it('is refused for "me"', async () => {
    const { db, aarav } = await world();
    await expect(combinePeople(db, ME, aarav)).rejects.toThrow();
    await expect(combinePeople(db, aarav, ME)).rejects.toThrow();
    // Nothing moved.
    expect(db.raw.prepare('SELECT id FROM person WHERE id = ?').get(aarav)).toBeDefined();
  });

  it('is refused for two people linked to two different accounts', async () => {
    const { db, aarav, also } = await world();
    db.raw.prepare('UPDATE person SET remote_uid = ? WHERE id = ?').run('account-a', aarav);
    db.raw.prepare('UPDATE person SET remote_uid = ? WHERE id = ?').run('account-b', also);
    await expect(combinePeople(db, also, aarav)).rejects.toThrow();
    expect(db.raw.prepare('SELECT id FROM person WHERE id = ?').get(aarav)).toBeDefined();
  });

  it('does nothing when asked to combine a person with themselves', async () => {
    const { db, aarav } = await world();
    await expect(combinePeople(db, aarav, aarav)).resolves.toBeUndefined();
    expect(db.raw.prepare('SELECT id FROM person WHERE id = ?').get(aarav)).toBeDefined();
  });
});

describe('combinePeople — two phones, one account', () => {
  it('a fold made on one phone reaches the other: entries are re-pointed and its own copy of the dropped person is gone too', async () => {
    const d1 = await server();
    const a = await freshPhone('a-me');
    await uploadToAccount(a, ACCOUNT);
    const ME = selfPersonId(USER); // "a-me" itself moved to this id at sign-in (identityRemap)

    const g = await insertGroup(a, 'Flat', 'home', '#20C4B8', [], 'equal', ME);
    const aarav = 'p-aarav';
    const also = 'p-also';
    a.raw.prepare("INSERT INTO person (id, name, avatar_color, is_me) VALUES (?, 'Aarav', '#8B7CF8', 0)").run(aarav);
    a.raw.prepare("INSERT INTO person (id, name, avatar_color, is_me) VALUES (?, 'Aarav K', '#3ECF8E', 0)").run(also);
    await addMemberToGroup(a, g.id, aarav, ME);
    await addMemberToGroup(a, g.id, also, ME);
    const txnId = await insertTxn(a, {
      groupId: g.id, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
      payments: [{ personId: ME, amount: 30000 }],
      shares: [{ personId: ME, amount: 15000 }, { personId: aarav, amount: 15000 }],
    });
    await syncOnce(a, transport(d1), USER);

    // Phone B pulls the same group down, including both placeholders.
    const b = await freshPhone('b-me') as Db;
    await replaceWithAccount(b, transport(d1), ACCOUNT);
    expect(b.raw.prepare('SELECT id FROM person WHERE id = ?').get(aarav)).toBeDefined();
    expect(b.raw.prepare('SELECT id FROM person WHERE id = ?').get(also)).toBeDefined();

    // Phone A combines them.
    await combinePeople(a, also, aarav);
    await syncOnce(a, transport(d1), USER);

    // Phone B pulls the news.
    await syncOnce(b, transport(d1), USER);

    expect(b.raw.prepare('SELECT id FROM person WHERE id = ?').get(aarav)).toBeUndefined();
    expect(b.raw.prepare('SELECT person_id FROM txn_share WHERE txn_id = ? AND person_id <> ?').get(txnId, ME))
      .toEqual({ person_id: also });
    expect(b.raw.prepare('SELECT COUNT(*) AS n FROM group_member WHERE group_id = ? AND person_id = ?').get(g.id, aarav))
      .toEqual({ n: 0 });
  });
});
