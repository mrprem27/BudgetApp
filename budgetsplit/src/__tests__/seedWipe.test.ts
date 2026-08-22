import { openTestDb } from './dbHarness';
import { resetToEmpty, loadDemoData } from '../db/seedDemo';
import { getMoneyProfile, setMoneyProfile } from '../db/queries/moneyProfile';
import { openingTotal } from '../lib/cash';

/**
 * "Erase all data" has to actually leave an empty app.
 *
 * `wipeAllData` spares the `settings` table on purpose — migration markers live
 * there and must survive a wipe — but the money profile lives there too. So a
 * freshly-erased app still reported the previous cash, investments and credit,
 * and after a demo load that meant Plan showing ₹3,00,000 with no transactions
 * anywhere to explain it.
 */
describe('resetToEmpty clears the money profile', () => {
  it('leaves nothing behind after a demo load', async () => {
    const db = await openTestDb();
    await loadDemoData(db);
    // The demo now spreads its opening across buckets, so assert the TOTAL —
    // which is the invariant that matters and the one that survives the split.
    expect(openingTotal(await getMoneyProfile(db))).toBeGreaterThan(0);

    await resetToEmpty(db);
    const profile = await getMoneyProfile(db);
    expect(profile).toMatchObject({
      openingCash: 0, investments: 0, creditLimit: 0, creditUsed: 0,
    });
    // The timestamps go too — a null `updatedAt` is what "never set" looks like,
    // and `cardBaselineAt` falling back to a stale one would bound card spend
    // against a balance that no longer exists.
    expect(profile.updatedAt).toBeNull();
    expect(profile.cardBaselineAt).toBeNull();
  });

  it('clears a hand-entered profile too, not just the demo one', async () => {
    const db = await openTestDb();
    await setMoneyProfile(db, { openingCash: 12345, investments: 6789, creditLimit: 0, creditUsed: 0 });
    await resetToEmpty(db);
    expect((await getMoneyProfile(db)).openingCash).toBe(0);
  });

  it('does not wipe the settings table wholesale', async () => {
    // The migration markers in `settings` are exactly why `wipeAllData` spares it.
    // A `money.%` sweep must not turn into a table drop.
    const db = await openTestDb();
    await db.runAsync("INSERT INTO settings (key, value) VALUES ('category_global_v1', 'done')");
    await resetToEmpty(db);
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'category_global_v1'",
    );
    expect(row?.value).toBe('done');
  });
});
