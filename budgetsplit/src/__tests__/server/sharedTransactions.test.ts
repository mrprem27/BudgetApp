import { createD1, type TestD1 } from './helpers/d1';
import { addMember, insert, makeGroup, makeUser, syncCols } from './helpers/fixtures';
import { applyPush, ensureDevice, type Mutation } from '../../../../server/api/sync/push';
import { pull } from '../../../../server/api/sync/pull';
import { ENTITIES } from '../../../../server/api/sync/routes';

/**
 * Shared transactions, approvals and disputes on the server (task S19). The trust
 * model is the app's, unchanged — the server runs the same `requiresMyApproval`
 * the phone ran in `ingestPeerTxn`, so the rule can no longer be skipped by a
 * phone that doesn't run it.
 */

const T0 = 1_750_000_000_000;
let mid = 0;
async function push(db: TestD1, userId: string, ms: Array<Omit<Mutation, 'id'>>) {
  const last = (await ensureDevice(db, userId, `dev-${userId}`, T0))!;
  return applyPush({ db, userId, deviceId: `dev-${userId}`, now: T0 }, ms.map(m => ({ ...m, id: ++mid })), last, ENTITIES);
}
const lastRejection = (db: TestD1) =>
  db.prepare('SELECT code, message FROM sync_rejections ORDER BY mutation_id DESC LIMIT 1').first<{ code: string; message: string }>();
const approval = (db: TestD1, txnId: string, userId: string) =>
  db.prepare('SELECT status, is_pending_delete, deleted_at IS NOT NULL AS gone FROM approvals WHERE id = ?').bind(`${txnId}:${userId}`).first();

/** Prem owns a group; Aarav (an account) is an active member; Riya is a placeholder. */
async function world() {
  const db = createD1();
  const prem = await makeUser(db);
  const aarav = await makeUser(db);
  const g = await makeGroup(db, prem.userId);
  await addMember(db, g, prem.personId, prem.userId, { role: 'admin' });
  await addMember(db, g, aarav.personId, prem.userId);
  await insert(db, 'people', { id: 'p-riya', user_id: null, created_by: prem.userId, created_at: T0 });
  await addMember(db, g, 'p-riya', prem.userId, { display_name: 'Riya' });
  return { db, prem, aarav, g };
}

async function trust(db: TestD1, who: { userId: string }, of: { personId: string }, level: 'trusted' | 'review') {
  await insert(db, 'trust_settings', {
    id: `${who.userId}:${of.personId}:*`, ...syncCols(who.userId, who.userId), user_id: who.userId,
    person_id: of.personId, group_id: null, level,
  });
}

const txn = (txnId: string, g: string, payers: Array<[string, number]>, splits: Array<[string, number]>, kind = 'expense', baseVersion = 0): Omit<Mutation, 'id'> => ({
  entity: 'transactions', op: 'upsert', entityId: txnId, baseVersion,
  data: {
    group_id: g, kind, amount: payers.reduce((a, [, n]) => a + n, 0), date: T0, category: kind === 'settlement' ? 'Settle up' : 'Food',
    payers: payers.map(([person_id, amount]) => ({ person_id, amount })),
    splits: splits.map(([person_id, amount]) => ({ person_id, amount })),
  },
});
const answer = (txnId: string, userId: string, status: string): Omit<Mutation, 'id'> =>
  ({ entity: 'approvals', op: 'upsert', entityId: `${txnId}:${userId}`, baseVersion: 0, data: { status } });

describe('who has to be asked', () => {
  it('an expense naming Aarav waits for him; it counts for its author at once; a placeholder is never asked', async () => {
    const { db, prem, aarav, g } = await world();
    await push(db, prem.userId, [txn('t1', g, [[prem.personId, 90000]], [[prem.personId, 30000], [aarav.personId, 30000], ['p-riya', 30000]])]);
    expect(await approval(db, 't1', aarav.userId)).toMatchObject({ status: 'pending' });
    expect(await db.prepare('SELECT COUNT(*) AS n FROM approvals WHERE transaction_id = ?').bind('t1').first('n')).toBe(1);
    // It reaches him in HIS scope, as his decision.
    const res = await pull(db, aarav.userId, `dev-${aarav.userId}`, {});
    expect(res.scopes.find(s => s.id === aarav.userId)?.rows.approvals?.[0]).toMatchObject({ transaction_id: 't1', status: 'pending' });
  });

  it('if he trusts Prem, his share of an expense applies at once', async () => {
    const { db, prem, aarav, g } = await world();
    await trust(db, aarav, prem, 'trusted');
    await push(db, prem.userId, [txn('t1', g, [[prem.personId, 60000]], [[prem.personId, 30000], [aarav.personId, 30000]])]);
    expect(await approval(db, 't1', aarav.userId)).toMatchObject({ status: 'approved' });
  });

  it('"I paid you" always waits, whatever the trust (DQ-28)', async () => {
    const { db, prem, aarav, g } = await world();
    await trust(db, aarav, prem, 'trusted');
    await push(db, prem.userId, [txn('s1', g, [[prem.personId, 50000]], [[aarav.personId, 50000]], 'settlement')]);
    expect(await approval(db, 's1', aarav.userId)).toMatchObject({ status: 'pending' });
    // And an expense claiming HE paid waits too, trusted or not.
    await push(db, prem.userId, [txn('t2', g, [[aarav.personId, 40000]], [[prem.personId, 40000]])]);
    expect(await approval(db, 't2', aarav.userId)).toMatchObject({ status: 'pending' });
  });
});

describe('who may change it', () => {
  it('Aarav editing Prem\'s transaction is refused, even by a direct API call (SYNC-F15)', async () => {
    const { db, prem, aarav, g } = await world();
    await push(db, prem.userId, [txn('t1', g, [[prem.personId, 60000]], [[prem.personId, 30000], [aarav.personId, 30000]])]);
    await push(db, aarav.userId, [txn('t1', g, [[prem.personId, 6000]], [[prem.personId, 3000], [aarav.personId, 3000]], 'expense', 1)]);
    expect(await lastRejection(db)).toMatchObject({ code: 'forbidden' });
    expect(await db.prepare('SELECT amount FROM transactions WHERE id = ?').bind('t1').first('amount')).toBe(60000);
  });

  it('only the person asked can answer', async () => {
    const { db, prem, aarav, g } = await world();
    await push(db, prem.userId, [txn('t1', g, [[prem.personId, 60000]], [[prem.personId, 30000], [aarav.personId, 30000]])]);
    await push(db, prem.userId, [answer('t1', aarav.userId, 'approved')]);
    expect(await lastRejection(db)).toMatchObject({ code: 'forbidden' });
    expect(await approval(db, 't1', aarav.userId)).toMatchObject({ status: 'pending' });
  });

  it('an edit asks again', async () => {
    const { db, prem, aarav, g } = await world();
    await push(db, prem.userId, [txn('t1', g, [[prem.personId, 60000]], [[prem.personId, 30000], [aarav.personId, 30000]])]);
    await push(db, aarav.userId, [answer('t1', aarav.userId, 'approved')]);
    await push(db, prem.userId, [txn('t1', g, [[prem.personId, 80000]], [[prem.personId, 40000], [aarav.personId, 40000]], 'expense', 1)]);
    expect(await approval(db, 't1', aarav.userId)).toMatchObject({ status: 'pending' });
  });
});

describe('objecting', () => {
  it('rejecting raises a dispute Prem pulls, with Aarav as the actor; approving withdraws it', async () => {
    const { db, prem, aarav, g } = await world();
    await push(db, prem.userId, [txn('t1', g, [[prem.personId, 60000]], [[prem.personId, 30000], [aarav.personId, 30000]])]);
    await push(db, aarav.userId, [answer('t1', aarav.userId, 'rejected')]);
    expect(await approval(db, 't1', aarav.userId)).toMatchObject({ status: 'rejected' });

    const res = await pull(db, prem.userId, `dev-${prem.userId}`, {});
    const scope = res.scopes.find(s => s.id === g)!;
    expect(scope.rows.disputes?.[0]).toMatchObject({ transaction_id: 't1', user_id: aarav.userId, withdrawn_at: null });
    expect(await db.prepare("SELECT actor_id FROM activity_log WHERE summary = 'Said this isn’t right'").first('actor_id')).toBe(aarav.userId);

    await push(db, aarav.userId, [answer('t1', aarav.userId, 'approved')]);
    expect(await db.prepare('SELECT withdrawn_at IS NOT NULL AS w FROM disputes WHERE transaction_id = ?').bind('t1').first('w')).toBe(1);
  });
});

describe('deleting something already accepted (DQ-31)', () => {
  it('keeps counting until Aarav agrees; agreeing lets it go', async () => {
    const { db, prem, aarav, g } = await world();
    await push(db, prem.userId, [txn('t1', g, [[prem.personId, 60000]], [[prem.personId, 30000], [aarav.personId, 30000]])]);
    await push(db, aarav.userId, [answer('t1', aarav.userId, 'approved')]);
    await push(db, prem.userId, [{ entity: 'transactions', op: 'delete', entityId: 't1', baseVersion: 1 }]);
    expect(await approval(db, 't1', aarav.userId)).toMatchObject({ status: 'pending', is_pending_delete: 1, gone: 0 });
    await push(db, aarav.userId, [answer('t1', aarav.userId, 'approved')]);
    expect(await approval(db, 't1', aarav.userId)).toMatchObject({ gone: 1 });
  });

  it('refusing keeps the entry; one still waiting simply goes', async () => {
    const { db, prem, aarav, g } = await world();
    await push(db, prem.userId, [txn('t1', g, [[prem.personId, 60000]], [[prem.personId, 30000], [aarav.personId, 30000]])]);
    await push(db, aarav.userId, [answer('t1', aarav.userId, 'approved')]);
    await push(db, prem.userId, [{ entity: 'transactions', op: 'delete', entityId: 't1', baseVersion: 1 }]);
    await push(db, aarav.userId, [answer('t1', aarav.userId, 'rejected')]);
    expect(await approval(db, 't1', aarav.userId)).toMatchObject({ status: 'approved', is_pending_delete: 0, gone: 0 });

    await push(db, prem.userId, [txn('t2', g, [[prem.personId, 60000]], [[prem.personId, 30000], [aarav.personId, 30000]])]);
    await push(db, prem.userId, [{ entity: 'transactions', op: 'delete', entityId: 't2', baseVersion: 1 }]);
    expect(await approval(db, 't2', aarav.userId)).toMatchObject({ gone: 1 });
  });
});
