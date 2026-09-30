import { openTestDb, seedGroupAndMe } from './dbHarness';
import { recordBalanceAdjustment } from '../db/queries/spendPower';
import { getCashPosition } from '../db/queries/savings';
import { getTransactionsInRange } from '../db/queries/transactions';
import { settlementView } from '../lib/settlementView';
import { myShareOf } from '../lib/splitMath';

/**
 * Bringing a place to what it really holds (`U-64`): one Balance adjustment entry moves exactly
 * that place and Spendable by the gap — and is never spending, income or a debt.
 */
async function seed() {
  const db = await openTestDb();
  await seedGroupAndMe(db, { groupId: 'p', isPersonal: 1 });
  return db;
}

describe('balance adjustments (U-64)', () => {
  it('moves only the named place, by the gap, either way', async () => {
    const db = await seed();
    const before = await getCashPosition(db);
    await recordBalanceAdjustment(db, 'wallet', 50_000);
    await recordBalanceAdjustment(db, 'bank', -20_000);
    const after = await getCashPosition(db);
    expect(after.byBucket!.wallet - before.byBucket!.wallet).toBe(50_000);
    expect(after.byBucket!.bank - before.byBucket!.bank).toBe(-20_000);
    expect(after.byBucket!.cash).toBe(before.byBucket!.cash);
    expect(after.available - before.available).toBe(30_000);
  });

  it('is its own kind of settlement: not spending, not a transfer with anyone', async () => {
    const db = await seed();
    await recordBalanceAdjustment(db, 'cash', -1_000);
    const [t] = await getTransactionsInRange(db, null, 0, Date.now() + 1);
    expect(t.kind).toBe('settlement');
    expect(settlementView(t).kind).toBe('adjust');
    expect(myShareOf(t, 'me')).toBe(0);
  });

  it('records nothing when there is no gap', async () => {
    const db = await seed();
    expect(await recordBalanceAdjustment(db, 'bank', 0)).toBeNull();
  });
});
