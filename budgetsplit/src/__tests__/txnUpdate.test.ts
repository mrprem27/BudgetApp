import { openTestDb, seedGroupAndMe } from './dbHarness';
import {
  insertTxnRows, updateTxn, getTxnById, insertItemizedTxn, updateItemizedTxn,
} from '../db/queries/transactions';

/**
 * `updateTxn` and `updateItemizedTxn` DELETE every payment and share row for a
 * transaction and reinsert from the input. Neither appeared in any test file,
 * despite being the two paths that rewrite money rows in place.
 *
 * That is the same shape as the bug in `f9d0e9c`: a scoped destructive replace,
 * where the interesting question is not what changes but **what survives**. The
 * suite had no way of expressing that, which is why it stayed green over a save
 * path that destroyed data.
 */
const ME = 'me';
const OTHER = 'other';

async function seed() {
  const db = await openTestDb();
  await seedGroupAndMe(db);
  await db.runAsync("INSERT INTO person (id, name, is_me, avatar_color) VALUES (?,?,0,'#fff')", [OTHER, 'Alex']);
  await db.runAsync("INSERT INTO group_member (group_id, person_id) VALUES ('g', ?)", [OTHER]);

  // Two transactions. The second exists purely to prove scope containment.
  for (const id of ['t1', 't2']) {
    await insertTxnRows(db, {
      groupId: 'g', kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
      payments: [{ personId: ME, amount: 100_000 }],
      shares: [{ personId: ME, amount: 50_000 }, { personId: OTHER, amount: 50_000 }],
    } as Parameters<typeof insertTxnRows>[1], id, Date.now());
  }
  return db;
}

const splitOf = async (db: Awaited<ReturnType<typeof openTestDb>>, id: string) => {
  const t = await getTxnById(db, id);
  return {
    payments: t!.payments.map(p => [p.personId, p.amount]).sort(),
    shares: t!.shares.map(s => [s.personId, s.amount]).sort(),
  };
};

const edit = (id: string, over: Partial<Parameters<typeof updateTxn>[1]> = {}) => ({
  id, groupId: 'g', kind: 'expense' as const, date: Date.now(), category: 'Food',
  payments: [{ personId: ME, amount: 100_000 }],
  shares: [{ personId: ME, amount: 50_000 }, { personId: OTHER, amount: 50_000 }],
  ...over,
});

describe('updateTxn replaces its own split', () => {
  it('rewrites payments and shares to exactly what was submitted', async () => {
    const db = await seed();
    await updateTxn(db, edit('t1', {
      payments: [{ personId: OTHER, amount: 80_000 }],
      shares: [{ personId: OTHER, amount: 80_000 }],
    }));
    expect(await splitOf(db, 't1')).toEqual({
      payments: [[OTHER, 80_000]],
      shares: [[OTHER, 80_000]],
    });
  });

  it('leaves the OLD payer behind — no stale row survives the replace', async () => {
    const db = await seed();
    await updateTxn(db, edit('t1', {
      payments: [{ personId: OTHER, amount: 100_000 }],
    }));
    const { payments } = await splitOf(db, 't1');
    expect(payments.find(([p]) => p === ME)).toBeUndefined();
  });

  it('does not touch any OTHER transaction — the delete is scoped', async () => {
    // The containment property. `f9d0e9c` was exactly this going wrong one level up.
    const db = await seed();
    const before = await splitOf(db, 't2');
    await updateTxn(db, edit('t1', { payments: [], shares: [] }));
    expect(await splitOf(db, 't2')).toEqual(before);
  });

  it('updates the scalar fields alongside the split', async () => {
    const db = await seed();
    await updateTxn(db, edit('t1', { category: 'Travel', note: 'cab', payMethod: 'card' }));
    const t = await getTxnById(db, 't1');
    expect(t).toMatchObject({ category: 'Travel', note: 'cab', pay_method: 'card' });
  });

  it('an empty split leaves the row present but with nothing allocated', async () => {
    // Documents the current contract rather than endorsing it: `updateTxn` does no
    // balance validation of its own — `validateShares` in useAddTxnForm is the gate,
    // so a caller bypassing it CAN write a transaction that allocates nothing. That
    // is worth knowing, and worth failing loudly if it ever changes.
    const db = await seed();
    await updateTxn(db, edit('t1', { payments: [], shares: [] }));
    const t = await getTxnById(db, 't1');
    expect(t).not.toBeNull();
    expect(t!.payments).toEqual([]);
    expect(t!.shares).toEqual([]);
  });

  it('payments and shares can be rewritten to disagree — the DB does not enforce balance', async () => {
    const db = await seed();
    await updateTxn(db, edit('t1', {
      payments: [{ personId: ME, amount: 100_000 }],
      shares: [{ personId: ME, amount: 10_000 }],
    }));
    const { payments, shares } = await splitOf(db, 't1');
    const sum = (rows: (string | number)[][]) => rows.reduce((s, r) => s + (r[1] as number), 0);
    // Pinned deliberately: three UI gates prevent this, and NONE of them live here.
    expect(sum(payments)).not.toBe(sum(shares));
  });
});

/**
 * `updateItemizedTxn` replaces line items on top of the payments and shares, so
 * it has one more table that can lose rows.
 */
describe('updateItemizedTxn replaces its own items', () => {
  const bill = (over: Partial<Parameters<typeof insertItemizedTxn>[1]> = {}) => ({
    groupId: 'g', kind: 'expense' as const, entryMode: 'itemized' as const,
    date: Date.now(), category: 'Food',
    payments: [{ personId: ME, amount: 100_000 }],
    shares: [{ personId: ME, amount: 100_000 }],
    items: [
      { name: 'Pizza', qty: 1, unitPrice: 60_000, assignedTo: [ME] },
      { name: 'Coke', qty: 2, unitPrice: 20_000, assignedTo: [ME] },
    ],
    ...over,
  });

  async function seedBill() {
    const db = await seed();
    const id = await insertItemizedTxn(db, bill() as Parameters<typeof insertItemizedTxn>[1]);
    const other = await insertItemizedTxn(db, bill() as Parameters<typeof insertItemizedTxn>[1]);
    return { db, id, other };
  }
  const itemsOf = (db: Awaited<ReturnType<typeof openTestDb>>, id: string) =>
    db.getAllAsync<{ name: string }>('SELECT name FROM line_item WHERE txn_id = ? ORDER BY name', [id]);

  it('replaces the item list rather than appending to it', async () => {
    const { db, id } = await seedBill();
    await updateItemizedTxn(db, id, bill({
      items: [{ name: 'Pasta', qty: 1, unitPrice: 80_000, assignedTo: [ME] }],
    }) as Parameters<typeof insertItemizedTxn>[1]);
    expect((await itemsOf(db, id)).map(i => i.name)).toEqual(['Pasta']);
  });

  it('does not touch another bill\'s line items', async () => {
    const { db, id, other } = await seedBill();
    const before = (await itemsOf(db, other)).map(i => i.name);
    await updateItemizedTxn(db, id, bill({ items: [] }) as Parameters<typeof insertItemizedTxn>[1]);
    expect((await itemsOf(db, other)).map(i => i.name)).toEqual(before);
  });

  it('clears the items when the edit removes them all', async () => {
    const { db, id } = await seedBill();
    await updateItemizedTxn(db, id, bill({ items: [] }) as Parameters<typeof insertItemizedTxn>[1]);
    expect(await itemsOf(db, id)).toEqual([]);
    // The transaction itself survives — an itemized bill with no items is still a bill.
    expect(await getTxnById(db, id)).not.toBeNull();
  });

  it('rewrites payments and shares alongside the items', async () => {
    const { db, id } = await seedBill();
    await updateItemizedTxn(db, id, bill({
      payments: [{ personId: OTHER, amount: 100_000 }],
      shares: [{ personId: OTHER, amount: 100_000 }],
    }) as Parameters<typeof insertItemizedTxn>[1]);
    expect(await splitOf(db, id)).toEqual({
      payments: [[OTHER, 100_000]], shares: [[OTHER, 100_000]],
    });
  });
});
