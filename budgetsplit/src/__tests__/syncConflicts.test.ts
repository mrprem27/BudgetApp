jest.mock('expo-file-system', () => require('./__mocks__/expoFileSystem'));

import { syncOnce } from '../lib/sync/engine';
import { selfPersonId } from '../lib/sync/ids';
import { uploadToAccount, replaceWithAccount } from '../lib/sync/firstSignIn';
import { insertTxn, updateTxn } from '../db/queries/transactions';
import { recordedRejections } from '../db/queries/syncApply';
import { queueCount } from '../db/queries/syncQueue';
import { syncIssuesFor, openConflicts, keepYours, keepTheirs } from '../db/queries/syncConflicts';
import { USER, ACCOUNT, transport, server, freshPhone, type Db } from './helpers/syncWorld';

/**
 * "Keep yours or theirs?" (task S17), end to end on the real Worker code: two
 * phones on one account change the same transaction; the slower one is told, and
 * either answer leaves both phones and the server agreeing.
 */

const ME = selfPersonId(USER);
const amountOn = (db: Db, id: string) =>
  (db.raw.prepare('SELECT SUM(amount) AS n FROM txn_payment WHERE txn_id = ?').get(id) as { n: number }).n;
const edit = (db: Db, id: string, groupId: string, amount: number) => updateTxn(db, {
  id, groupId, kind: 'expense', date: Date.UTC(2026, 8, 2), category: 'Food',
  payments: [{ personId: ME, amount }], shares: [{ personId: ME, amount }],
});

/** Phone A writes ₹400; phone B restores it, changes it to ₹450 and syncs; A, still at the old version, changes it to ₹500. */
async function clash() {
  const d1 = await server();
  const a = await freshPhone('a-me');
  await uploadToAccount(a, ACCOUNT);
  const personal = (a.raw.prepare('SELECT id FROM budget_group WHERE is_personal = 1').get() as { id: string }).id;
  const id = await insertTxn(a, {
    groupId: personal, kind: 'expense', entryMode: 'quick', date: Date.UTC(2026, 8, 2), category: 'Food',
    payments: [{ personId: ME, amount: 40000 }], shares: [{ personId: ME, amount: 40000 }],
  });
  await syncOnce(a, transport(d1), USER);

  const b = await freshPhone('b-me');
  await replaceWithAccount(b, transport(d1), ACCOUNT);
  await edit(b, id, personal, 45000);
  await syncOnce(b, transport(d1), USER);

  await edit(a, id, personal, 50000);
  await syncOnce(a, transport(d1), USER);
  return { d1, a, b, id, personal };
}

const serverAmount = async (d1: Awaited<ReturnType<typeof server>>, id: string) =>
  d1.prepare('SELECT SUM(amount) AS n FROM transaction_payers WHERE transaction_id = ?').bind(id).first<number>('n');

describe('a money conflict keeps both sides', () => {
  it('the slower phone takes the server\'s copy, and keeps its own beside it', async () => {
    const { d1, a, id } = await clash();
    expect(await serverAmount(d1, id)).toBe(45000);
    expect(amountOn(a, id)).toBe(45000);                     // theirs, on the phone
    const [issue] = await syncIssuesFor(a, id);
    expect(issue.kind).toBe('conflict');
    const sum = (r: Record<string, unknown> | undefined) =>
      ((r?.payers ?? []) as Array<{ amount: number }>).reduce((s, p) => s + p.amount, 0);
    expect(sum(issue.yours)).toBe(50000);                     // yours, kept
    expect(sum(issue.theirs)).toBe(45000);
    expect((await openConflicts(a)).map(c => c.txnId)).toEqual([id]);
  });

  it('"Keep yours" puts it back and sends it on top of theirs — every phone ends on yours', async () => {
    const { d1, a, b, id } = await clash();
    const [issue] = await syncIssuesFor(a, id);
    expect(await keepYours(a, issue.mutationId, USER)).toBe(true);
    expect(amountOn(a, id)).toBe(50000);
    expect(await queueCount(a)).toBe(1);

    await syncOnce(a, transport(d1), USER);
    expect(await serverAmount(d1, id)).toBe(50000);
    expect((await recordedRejections(a)).filter(r => r.code === 'conflict')).toHaveLength(1);   // no second clash
    await syncOnce(b, transport(d1), USER);
    expect(amountOn(b, id)).toBe(50000);
    expect(await syncIssuesFor(a, id)).toEqual([]);
  });

  it('"Keep theirs" changes nothing and stops asking', async () => {
    const { d1, a, id } = await clash();
    const [issue] = await syncIssuesFor(a, id);
    await keepTheirs(a, issue.mutationId);
    expect(amountOn(a, id)).toBe(45000);
    expect(await queueCount(a)).toBe(0);
    expect(await syncIssuesFor(a, id)).toEqual([]);
    expect(await openConflicts(a)).toEqual([]);
    await syncOnce(a, transport(d1), USER);
    expect(await serverAmount(d1, id)).toBe(45000);
  });
});
