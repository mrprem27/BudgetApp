import { fundGoal, withdrawFromGoal, fundedByAsset, getGoalSavedMap } from '../db/queries/savings';
import { createTestDb, asDb } from './helpers/testDb';

/**
 * Money goes back where it came from.
 *
 * Funding a goal from the bank and returning it as "cash" is not a round trip: it
 * silently rewrites where the user's money is, and every figure built on that is
 * then wrong. `source_asset` is what makes the return leg answerable, and
 * `fundedByAsset` is what bounds it — a single row cannot say how much of a
 * two-bucket goal a given bucket may take back.
 */
describe('a goal remembers which bucket funded it', () => {
  async function goal(db: ReturnType<typeof createTestDb>) {
    await db.runAsync(
      `INSERT INTO savings_goal (id, name, target, priority, allocation, frequency, locked, is_archived, sort_order, created_at)
       VALUES ('g1', 'Phone', 5000000, 'want', 0, 'none', 0, 0, 0, 0)`,
    );
  }

  it('records the bucket on the way in', async () => {
    const db = createTestDb();
    await goal(db);
    await fundGoal(asDb(db), 'g1', 300000, 'manual', undefined, 'bank');
    expect(await fundedByAsset(asDb(db), 'g1')).toEqual({ bank: 300000 });
  });

  it('nets a withdrawal against the bucket it returns to', async () => {
    const db = createTestDb();
    await goal(db);
    await fundGoal(asDb(db), 'g1', 300000, 'manual', undefined, 'bank');
    await withdrawFromGoal(asDb(db), 'g1', 100000, undefined, 'bank');
    expect(await fundedByAsset(asDb(db), 'g1')).toEqual({ bank: 200000 });
  });

  it('keeps two buckets apart inside one goal', async () => {
    // The case a single column cannot answer on its own: ₹3,000 from bank and
    // ₹2,000 from wallet. Withdrawing ₹4,000 to the bank must be refusable, and
    // only a per-bucket balance says so. FIFO or pro-rata would invent a fact.
    const db = createTestDb();
    await goal(db);
    await fundGoal(asDb(db), 'g1', 300000, 'manual', undefined, 'bank');
    await fundGoal(asDb(db), 'g1', 200000, 'manual', undefined, 'wallet');

    const held = await fundedByAsset(asDb(db), 'g1');
    expect(held).toEqual({ bank: 300000, wallet: 200000 });
    // The goal holds ₹5,000 in total, but the bank may only take back ₹3,000.
    expect((await getGoalSavedMap(asDb(db)))['g1']).toBe(500000);
    expect(held.bank).toBeLessThan(500000);
  });

  it('keeps a pre-column balance unattributed rather than guessing one', async () => {
    // Every row written before source_asset existed has none. Assigning it a
    // bucket would be the silent-drain mistake in a different place.
    const db = createTestDb();
    await goal(db);
    await fundGoal(asDb(db), 'g1', 400000);          // no asset given
    expect(await fundedByAsset(asDb(db), 'g1')).toEqual({ unknown: 400000 });
  });

  it('does not let one bucket\'s withdrawal eat another\'s balance', async () => {
    const db = createTestDb();
    await goal(db);
    await fundGoal(asDb(db), 'g1', 300000, 'manual', undefined, 'bank');
    await fundGoal(asDb(db), 'g1', 200000, 'manual', undefined, 'wallet');
    await withdrawFromGoal(asDb(db), 'g1', 200000, undefined, 'wallet');

    // Wallet is emptied; the bank's ₹3,000 is untouched.
    expect(await fundedByAsset(asDb(db), 'g1')).toEqual({ bank: 300000 });
  });
});
