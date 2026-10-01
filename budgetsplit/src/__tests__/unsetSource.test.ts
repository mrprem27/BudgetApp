import { openTestDb, seedGroupAndMe } from './dbHarness';
import { insertTxnRows, getTxnById, getUnsetSourceTotal, setSourceForUnsetEntries } from '../db/queries/transactions';
import { PayMethod } from '../constants/enums';

/**
 * Money's "Paid from not set" line can be resolved in one step (`U-62`): every entry of mine with
 * no source (or "Other") takes the place you name — and nothing else changes.
 */
const ME = 'me';

async function seed() {
  const db = await openTestDb();
  await seedGroupAndMe(db);
  const add = (id: string, payMethod: PayMethod | null) => insertTxnRows(db, {
    groupId: 'g', kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food', payMethod,
    payments: [{ personId: ME, amount: 1000 }], shares: [{ personId: ME, amount: 1000 }],
  } as Parameters<typeof insertTxnRows>[1], id, Date.now());
  await add('none', null);
  await add('other', PayMethod.Other);
  await add('cash', PayMethod.Cash);
  return db;
}

describe('setting a source on entries that have none (U-62)', () => {
  it('adds up only the entries with no source or "Other"', async () => {
    const db = await seed();
    const total = await getUnsetSourceTotal(db, ME);
    expect(total).not.toBe(0);
    // Sourcing them all leaves nothing on the line.
    await setSourceForUnsetEntries(db, ME, PayMethod.Bank);
    expect(await getUnsetSourceTotal(db, ME)).toBe(0);
  });

  it('gives them the chosen place and leaves a recorded source alone', async () => {
    const db = await seed();
    expect(await setSourceForUnsetEntries(db, ME, PayMethod.Wallet)).toBe(2);
    expect((await getTxnById(db, 'none'))?.pay_method).toBe('wallet');
    expect((await getTxnById(db, 'other'))?.pay_method).toBe('wallet');
    expect((await getTxnById(db, 'cash'))?.pay_method).toBe('cash');
    expect(await getUnsetSourceTotal(db, ME)).toBe(0);
  });
});
