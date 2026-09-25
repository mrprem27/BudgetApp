import { eraseAccount } from '../../../../server/api/sync/erase';
import { mayAdminister } from '../../../../server/api/sync/utils/access';
import { insertGroup } from '../../db/queries/groups';
import { insertTxn } from '../../db/queries/transactions';
import { insertAsset } from '../../db/queries/assets';
import { insertPerson } from '../../db/queries/persons';
import { insertGoal } from '../../db/queries/savings';
import { convertToRecurring } from '../../db/queries/recurring';
import { A, B, ME_A, ME_B, sync, aaravJoined } from '../helpers/twoPhones';

/**
 * Deleting an account erases the account's copy of the ledger (S22, `B-09`).
 *
 * Built from what the real app writes and syncs — a personal ledger, a group
 * only Prem is in, and a shared flat with Aarav — then erased in one batch on a
 * harness that enforces foreign keys the way D1 does. What's Prem's alone must be
 * gone; what's the flat's must survive, for Aarav.
 */

const SCOPED = [
  'profiles', 'friends', 'group_preferences', 'categories', 'assets', 'savings_goals', 'savings_transactions',
  'money_profiles', 'user_preferences', 'imported_transactions', 'approvals', 'trust_settings', 'activity_log',
  'groups', 'group_members', 'budgets', 'transactions', 'disputes',
];

async function world() {
  const w = await aaravJoined();
  await insertAsset(w.a, { name: 'Gold', balance: 500000 });
  await insertGoal(w.a, { name: 'Trip', target: 2000000, priority: 'want' } as never);
  const personal = `personal-${A}`;
  const lunch = await insertTxn(w.a, {
    groupId: personal, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
    payments: [{ personId: ME_A, amount: 25000 }], shares: [{ personId: ME_A, amount: 25000 }],
  });
  // A repeating bill: a rule, and an occurrence naming it — the one cycle in the schema.
  await convertToRecurring(w.a, lunch, 'monthly', 1);
  const solo = await insertGroup(w.a, 'Side project', 'briefcase', '#20C4B8', [], 'equal', ME_A);
  await insertTxn(w.a, {
    groupId: solo.id, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
    payments: [{ personId: ME_A, amount: 1000 }], shares: [{ personId: ME_A, amount: 1000 }],
  });
  const dinner = await insertTxn(w.a, {
    groupId: w.flat, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
    payments: [{ personId: ME_A, amount: 100000 }],
    shares: [{ personId: ME_A, amount: 50000 }, { personId: ME_B, amount: 50000 }],
  });
  await sync(w.a, w.d1, A);
  await sync(w.b, w.d1, B);
  return { ...w, personal, lunch, solo: solo.id, dinner };
}

const count = (w: { d1: import('./helpers/d1').TestD1 }, table: string, where: string, ...binds: unknown[]) =>
  w.d1.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).bind(...binds).first<number>('n');

describe('erasing an account', () => {
  it('commits in one batch with foreign keys enforced', async () => {
    const w = await world();
    // Sanity: there is something to erase, or this proves nothing.
    expect(await count(w, 'transactions', 'scope_id = ?', w.personal)).toBe(2);
    expect(await count(w, 'recurring_rules', 'transaction_id = ?', w.lunch)).toBe(1);
    expect(await count(w, 'assets', 'scope_id = ?', A)).toBe(1);
    await expect(w.d1.batch(await eraseAccount(w.d1, A, Date.now()))).resolves.toBeDefined();
  });

  it('leaves nothing in the scopes that were theirs alone', async () => {
    const w = await world();
    await w.d1.batch(await eraseAccount(w.d1, A, Date.now()));
    for (const scope of [A, w.personal, w.solo]) {
      for (const t of SCOPED) expect([t, await count(w, t, 'scope_id = ?', scope)]).toEqual([t, 0]);
      expect(await count(w, 'sync_scopes', 'id = ?', scope)).toBe(0);
    }
    expect(await count(w, 'transaction_splits', 'transaction_id = ?', w.lunch)).toBe(0);
    expect(await count(w, 'recurring_rules', 'transaction_id = ?', w.lunch)).toBe(0);
    expect(await count(w, 'devices', 'user_id = ?', A)).toBe(0);
  });

  it('keeps the shared flat whole for Aarav, and tells his phone Prem has left', async () => {
    const w = await world();
    await w.d1.batch(await eraseAccount(w.d1, A, Date.now()));
    expect(await count(w, 'transactions', 'id = ?', w.dinner)).toBe(1);
    expect(await count(w, 'transaction_splits', 'transaction_id = ?', w.dinner)).toBe(2);
    expect(await w.d1.prepare('SELECT status FROM group_members WHERE id = ?').bind(`${w.flat}:${ME_A}`).first('status')).toBe('left');
    // Aarav's own things are untouched.
    expect(await count(w, 'approvals', 'scope_id = ?', B)).toBe(1);

    await sync(w.b, w.d1, B);
    expect(w.b.raw.prepare('SELECT deleted_at IS NOT NULL AS gone FROM group_member WHERE group_id = ? AND person_id = ?')
      .get(w.flat, ME_A)).toEqual({ gone: 1 });
    expect(w.b.raw.prepare('SELECT COUNT(*) AS n FROM txn WHERE id = ? AND is_deleted = 0').get(w.dinner)).toEqual({ n: 1 });
  });

  it('hands a shared group to the next person, so it is never left with no admin (SYNC-F20)', async () => {
    const w = await world();
    expect(await mayAdminister(w.d1, w.flat, B)).toBe(false);
    await w.d1.batch(await eraseAccount(w.d1, A, Date.now()));
    expect(await w.d1.prepare('SELECT owner_id FROM groups WHERE id = ?').bind(w.flat).first('owner_id')).toBe(B);
    expect(await w.d1.prepare('SELECT role FROM group_members WHERE id = ?').bind(`${w.flat}:${ME_B}`).first('role')).toBe('admin');
    expect(await mayAdminister(w.d1, w.flat, B)).toBe(true);

    await sync(w.b, w.d1, B);
    expect(w.b.raw.prepare('SELECT created_by FROM budget_group WHERE id = ?').get(w.flat)).toEqual({ created_by: ME_B });
  });

  it('takes a group shared only with friends who have no account, and those friends', async () => {
    // What "Delete account" left behind on the live server: a demo group with
    // typed-in friends survived, because anyone at all in it counted as "someone
    // else". Nobody without an account can read it, so nobody keeps it.
    const w = await world();
    const ravi = await insertPerson(w.a, 'Ravi', '#F0A500');
    const trip = await insertGroup(w.a, 'Trip', 'map', '#22D3EE', [ravi.id], 'equal', ME_A);
    await insertTxn(w.a, {
      groupId: trip.id, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
      payments: [{ personId: ME_A, amount: 2000 }],
      shares: [{ personId: ME_A, amount: 1000 }, { personId: ravi.id, amount: 1000 }],
    });
    await sync(w.a, w.d1, A);
    expect(await count(w, 'groups', 'id = ?', trip.id)).toBe(1);

    await w.d1.batch(await eraseAccount(w.d1, A, Date.now()));
    for (const t of SCOPED) expect([t, await count(w, t, 'scope_id = ?', trip.id)]).toEqual([t, 0]);
    expect(await count(w, 'people', 'id = ?', ravi.id)).toBe(0);
    // The flat Aarav keeps still names Prem's person, so that row stays.
    expect(await count(w, 'people', 'id = ?', ME_A)).toBe(1);
  });
});
