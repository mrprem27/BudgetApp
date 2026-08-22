import { moveToInvestments } from '../db/queries/spendPower';
import { getMoneyProfile } from '../db/queries/moneyProfile';
import { getCashPosition } from '../db/queries/savings';
import { createTestDb, addPerson, addGroup, addMember, asDb } from './helpers/testDb';

/**
 * Buying an investment is moving money, not spending it.
 *
 * It used to be logged as an expense — `smartCategory` still maps "sip", "mutual
 * fund" and "zerodha" to the `Investments / SIP` EXPENSE category. That is wrong
 * three ways at once: it is not consumption (AGENTS §13), it eats a budget it has
 * no business eating, and net worth FALLS by the amount because cash drops while
 * `money.investments` never moves.
 */
describe('moveToInvestments', () => {
  async function setup() {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const personal = addGroup(db, 'Personal', true);
    addMember(db, personal, me);
    await db.runAsync("INSERT INTO settings (key, value) VALUES ('money.opening_bank', '1000000')");
    return { db, me };
  }

  it('raises investments by exactly what left the bucket', async () => {
    const { db } = await setup();
    await moveToInvestments(asDb(db), 250000);
    expect((await getMoneyProfile(asDb(db))).investments).toBe(250000);
  });

  it('leaves net worth flat — the whole point', async () => {
    const { db } = await setup();
    const before = await getCashPosition(asDb(db));
    await moveToInvestments(asDb(db), 250000);
    const after = await getCashPosition(asDb(db));

    // Cash goes down by the amount...
    expect(after.available).toBe(before.available - 250000);
    // ...and investments go up by the same, so the two cancel. An expense would
    // have dropped cash with nothing on the other side.
    expect((await getMoneyProfile(asDb(db))).investments).toBe(250000);
  });

  it('takes it out of the bucket it actually came from', async () => {
    const { db } = await setup();
    await moveToInvestments(asDb(db), 250000);
    const pos = await getCashPosition(asDb(db));
    expect(pos.byBucket?.bank).toBe(1000000 - 250000);
    expect(pos.byBucket?.cash).toBe(0);
  });

  it('refuses an amount that is not one', async () => {
    const { db } = await setup();
    await expect(moveToInvestments(asDb(db), 0)).rejects.toThrow();
    await expect(moveToInvestments(asDb(db), -100)).rejects.toThrow();
    await expect(moveToInvestments(asDb(db), NaN)).rejects.toThrow();
  });

  it('records it as a settlement with no counterparty, so analysis ignores it', async () => {
    // §12: settlements are excluded from category breakdowns and budgets. That is
    // what stops an investment eating a budget the way the expense version did.
    const { db } = await setup();
    const id = await moveToInvestments(asDb(db), 250000);
    const row = await db.getFirstAsync<{ kind: string; category: string }>(
      'SELECT kind, category FROM txn WHERE id = ?', [id],
    );
    expect(row?.kind).toBe('settlement');
    expect(row?.category).toBe('Investment');
    const shares = await db.getAllAsync('SELECT * FROM txn_share WHERE txn_id = ?', [id]);
    expect(shares).toHaveLength(0);
  });
});
