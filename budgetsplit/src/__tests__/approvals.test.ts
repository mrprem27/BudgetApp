import { insertTxn, softDeleteTxn, updateTxn } from '../db/queries/transactions';
import { approveTxn, rejectTxn, reopenApproval, getPendingApprovals } from '../db/queries/approval';
import { recordedRejections } from '../db/queries/syncApply';
import { queueCount } from '../db/queries/syncQueue';
import { setTrustState } from '../db/queries/persons';
import { B, ME_A, ME_B, type Db, sync, transport, aaravJoined } from './helpers/twoPhones';
import { syncOnce } from '../lib/sync/engine';

/**
 * Approvals and disputes over server sync (task S21): someone else's entry reaches my phone
 * with the server's answer to "does this wait for me?", and my decision goes back
 * as a mutation. Two phones, one real server, real app queries on both.
 *
 * The rule under test is AGENTS §13's: an entry counts for whoever wrote it at
 * once, and waits for everyone else it names until they accept it.
 */

/** Prem pays ₹1,000 for dinner in the flat, split with Aarav. */
async function dinner() {
  const w = await aaravJoined();
  const txnId = await insertTxn(w.a, {
    groupId: w.flat, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
    payments: [{ personId: ME_A, amount: 100000 }],
    shares: [{ personId: ME_A, amount: 50000 }, { personId: ME_B, amount: 50000 }],
  });
  await sync(w.a, w.d1, 'u-prem');
  await sync(w.b, w.d1, B);
  return { ...w, txnId };
}

const approval = (db: Db, txnId: string) =>
  db.raw.prepare('SELECT state, pending_delete FROM txn_approval WHERE txn_id = ?').get(txnId) as
    { state: string; pending_delete: number } | undefined;
const serverApproval = (w: { d1: import('./server/helpers/d1').TestD1 }, txnId: string) =>
  w.d1.prepare('SELECT status, is_pending_delete, deleted_at IS NOT NULL AS gone FROM approvals WHERE id = ?')
    .bind(`${txnId}:${B}`).first<{ status: string; is_pending_delete: number; gone: number }>();
const dispute = (db: Db, txnId: string) =>
  db.raw.prepare('SELECT by_uid, cleared FROM txn_dispute WHERE txn_id = ?').get(txnId) as
    { by_uid: string; cleared: number } | undefined;
const myShare = (db: Db, txnId: string) =>
  (db.raw.prepare('SELECT amount FROM txn_share WHERE txn_id = ? AND person_id = ?').get(txnId, ME_B) as { amount: number } | undefined)?.amount;
const isDeleted = (db: Db, txnId: string) =>
  (db.raw.prepare('SELECT is_deleted FROM txn WHERE id = ?').get(txnId) as { is_deleted: number } | undefined)?.is_deleted;

describe('an entry someone else wrote', () => {
  it('arrives waiting for me, with its author, and counts for them at once', async () => {
    const { a, b, txnId } = await dinner();
    expect(b.raw.prepare('SELECT author_person_id FROM txn WHERE id = ?').get(txnId)).toEqual({ author_person_id: ME_A });
    expect(approval(b, txnId)).toEqual({ state: 'pending', pending_delete: 0 });
    expect((await getPendingApprovals(b)).map(p => p.txn_id)).toEqual([txnId]);
    // The author was never asked.
    expect(approval(a, txnId)).toBeUndefined();
  });

  it('applies at once when I trust its author', async () => {
    const w = await aaravJoined();
    await setTrustState(w.b, ME_A, 'trusted');
    await sync(w.b, w.d1, B);
    const txnId = await insertTxn(w.a, {
      groupId: w.flat, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
      payments: [{ personId: ME_A, amount: 1000 }],
      shares: [{ personId: ME_A, amount: 500 }, { personId: ME_B, amount: 500 }],
    });
    await sync(w.a, w.d1, 'u-prem');
    await sync(w.b, w.d1, B);
    expect(approval(w.b, txnId)?.state).toBe('approved');
  });
});

describe('my decision travels', () => {
  it('accepting reaches the server, and a pull does not ask again', async () => {
    const w = await dinner();
    await approveTxn(w.b, w.txnId);
    await sync(w.b, w.d1, B);
    expect(await serverApproval(w, w.txnId)).toMatchObject({ status: 'approved', gone: 0 });
    expect(approval(w.b, w.txnId)?.state).toBe('approved');
    expect(await queueCount(w.b)).toBe(0);
    expect(await recordedRejections(w.b)).toEqual([]);
  });

  it('refusing raises a dispute the author pulls; taking it back clears it', async () => {
    const w = await dinner();
    await rejectTxn(w.b, w.txnId);
    await sync(w.b, w.d1, B);
    expect(await serverApproval(w, w.txnId)).toMatchObject({ status: 'rejected' });
    await sync(w.a, w.d1, 'u-prem');
    expect(dispute(w.a, w.txnId)).toEqual({ by_uid: B, cleared: 0 });
    // Refusing hides it from MY ledger, never from theirs.
    expect(isDeleted(w.b, w.txnId)).toBe(1);
    expect(isDeleted(w.a, w.txnId)).toBe(0);

    await reopenApproval(w.b, w.txnId);
    await sync(w.b, w.d1, B);
    await sync(w.a, w.d1, 'u-prem');
    expect(await serverApproval(w, w.txnId)).toMatchObject({ status: 'pending' });
    expect(dispute(w.a, w.txnId)?.cleared).toBe(1);
    expect(approval(w.b, w.txnId)?.state).toBe('pending');
  });

  it('an answer not yet sent is not overwritten by a pull', async () => {
    const w = await dinner();
    await approveTxn(w.b, w.txnId);
    // Meanwhile Prem edits it, so the server asks again — and Aarav's push is lost.
    await updateTxn(w.a, {
      id: w.txnId, groupId: w.flat, kind: 'expense', date: Date.now(), category: 'Food',
      payments: [{ personId: ME_A, amount: 120000 }],
      shares: [{ personId: ME_A, amount: 60000 }, { personId: ME_B, amount: 60000 }],
    } as never);
    await sync(w.a, w.d1, 'u-prem');
    const lossy = { ...transport(w.d1, B), push: async () => ({ lastMutationId: 0 }) };
    await syncOnce(w.b, lossy, B);
    expect(await serverApproval(w, w.txnId)).toMatchObject({ status: 'pending' });
    // The new figure arrived; my answer, still unsent, stands.
    expect(myShare(w.b, w.txnId)).toBe(60000);
    expect(approval(w.b, w.txnId)?.state).toBe('approved');
    // And it goes up once the network does.
    await sync(w.b, w.d1, B);
    expect(await serverApproval(w, w.txnId)).toMatchObject({ status: 'approved' });
  });
});

describe('the author changes their mind', () => {
  it('an edit that no longer names me withdraws the question, and the entry stops hiding', async () => {
    const w = await dinner();
    await updateTxn(w.a, {
      id: w.txnId, groupId: w.flat, kind: 'expense', date: Date.now(), category: 'Food',
      payments: [{ personId: ME_A, amount: 100000 }], shares: [{ personId: ME_A, amount: 100000 }],
    } as never);
    await sync(w.a, w.d1, 'u-prem');
    await sync(w.b, w.d1, B);
    expect(await serverApproval(w, w.txnId)).toMatchObject({ gone: 1 });
    expect(approval(w.b, w.txnId)).toBeUndefined();
  });

  it('deleting one I accepted keeps it counting until I agree (DQ-31), then it goes', async () => {
    const w = await dinner();
    await approveTxn(w.b, w.txnId);
    await sync(w.b, w.d1, B);
    await softDeleteTxn(w.a, w.txnId);
    await sync(w.a, w.d1, 'u-prem');
    await sync(w.b, w.d1, B);
    // Still counting: approved, with the question attached — never 'pending'.
    expect(approval(w.b, w.txnId)).toEqual({ state: 'approved', pending_delete: 1 });
    expect((await getPendingApprovals(w.b)).map(p => p.txn_id)).toEqual([w.txnId]);
    expect(isDeleted(w.b, w.txnId)).toBe(0);
    expect(myShare(w.b, w.txnId)).toBe(50000);

    await approveTxn(w.b, w.txnId);
    await sync(w.b, w.d1, B);
    expect(await serverApproval(w, w.txnId)).toMatchObject({ gone: 1 });
    expect(isDeleted(w.b, w.txnId)).toBe(1);
    expect(await queueCount(w.b)).toBe(0);
  });

  it('a trusted author editing one I refused asks me again, never overrides me (MW-22)', async () => {
    const w = await aaravJoined();
    await setTrustState(w.b, ME_A, 'trusted');
    await sync(w.b, w.d1, B);
    const txnId = await insertTxn(w.a, {
      groupId: w.flat, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
      payments: [{ personId: ME_A, amount: 100000 }],
      shares: [{ personId: ME_A, amount: 50000 }, { personId: ME_B, amount: 50000 }],
    });
    await sync(w.a, w.d1, 'u-prem');
    await sync(w.b, w.d1, B);
    await rejectTxn(w.b, txnId);
    await sync(w.b, w.d1, B);
    expect(await serverApproval(w, txnId)).toMatchObject({ status: 'rejected' });

    await updateTxn(w.a, {
      id: txnId, groupId: w.flat, kind: 'expense', date: Date.now(), category: 'Food',
      payments: [{ personId: ME_A, amount: 120000 }],
      shares: [{ personId: ME_A, amount: 60000 }, { personId: ME_B, amount: 60000 }],
    } as never);
    await sync(w.a, w.d1, 'u-prem');
    await sync(w.b, w.d1, B);
    // Trust says "apply at once", but my refusal outranks it: the edit is a new question.
    expect(await serverApproval(w, txnId)).toMatchObject({ status: 'pending', gone: 0 });
    expect(approval(w.b, txnId)?.state).toBe('pending');
    expect((await getPendingApprovals(w.b)).map(p => p.txn_id)).toEqual([txnId]);
    // Back on my phone to be answered, at the new figure, counting for nothing yet.
    expect(isDeleted(w.b, txnId)).toBe(0);
    expect(myShare(w.b, txnId)).toBe(60000);
  });

  it('refusing the retraction keeps the entry, on the server too', async () => {
    const w = await dinner();
    await approveTxn(w.b, w.txnId);
    await sync(w.b, w.d1, B);
    await softDeleteTxn(w.a, w.txnId);
    await sync(w.a, w.d1, 'u-prem');
    await sync(w.b, w.d1, B);

    await rejectTxn(w.b, w.txnId);
    await sync(w.b, w.d1, B);
    expect(await serverApproval(w, w.txnId)).toEqual({ status: 'approved', is_pending_delete: 0, gone: 0 });
    expect(approval(w.b, w.txnId)).toEqual({ state: 'approved', pending_delete: 0 });
    expect(isDeleted(w.b, w.txnId)).toBe(0);
    expect(myShare(w.b, w.txnId)).toBe(50000);
  });
});
