import { proposeOverspendRaid, getCashPosition } from '../db/queries/savings';
import { getMyExposure } from '../db/queries/balances';
import { createTestDb, addPerson, addGroup, addMember, addTxn, asDb, type TestDb } from './helpers/testDb';

/**
 * Fronting the bill must not cost you a savings goal.
 *
 * `CASH_TOTALS_SQL` counts *my payments*, so paying ₹4,000 for a four-way dinner
 * takes the whole ₹4,000 out of cash while ₹3,000 is on its way back. Before
 * this, that dip alone was enough for `proposeOverspendRaid` to offer to
 * liquidate a goal — to cover money friends owed me.
 *
 * It is not an edge case either: India is a ledger culture, settling is a
 * monthly ritual, and a balance sits for weeks. See `lib/safeToSpend.ts:30` for
 * why Safe-to-Spend deliberately does NOT net the same figure.
 */
describe('proposeOverspendRaid — receivables', () => {
  const FOUR_WAY_DINNER = 400000; // ₹4,000
  const MY_SHARE = 100000;        // ₹1,000
  const OWED_BACK = 300000;       // ₹3,000

  /** ₹11,000 opening cash with ₹10,000 already earmarked → ₹1,000 available. */
  async function setup() {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const a = addPerson(db, 'Aarav', false);
    const b = addPerson(db, 'Bilal', false);
    const c = addPerson(db, 'Chetna', false);
    const g = addGroup(db, 'Flat', false);
    for (const p of [me, a, b, c]) addMember(db, g, p);

    await db.runAsync(`INSERT INTO settings (key, value) VALUES ('money.opening_cash', ?)`, ['1100000']);
    await db.runAsync(
      `INSERT INTO savings_goal (id, name, target, priority, allocation, frequency, locked, is_archived, sort_order, created_at)
       VALUES ('goal-phone', 'Phone', 5000000, 'want', 0, 'none', 0, 0, 0, 0)`,
    );
    await db.runAsync(
      `INSERT INTO savings_txn (id, goal_id, amount, kind, source, date, created_at)
       VALUES ('st-1', 'goal-phone', 1000000, 'allocate', 'manual', 0, 0)`,
    );
    return { db, me, a, b, c, g };
  }

  /** ₹4,000 paid by me, split four ways. */
  function addDinner(db: TestDb, g: string, people: string[], me: string) {
    addTxn(db, {
      groupId: g, kind: 'expense', date: Date.now(), category: 'Food',
      payments: [{ personId: me, amount: FOUR_WAY_DINNER }],
      shares: people.map(personId => ({ personId, amount: MY_SHARE })),
    });
  }

  it('does not touch a goal while the receivable covers the shortfall', async () => {
    const { db, me, a, b, c, g } = await setup();
    addDinner(db, g, [me, a, b, c], me);

    // Cash is genuinely ₹3,000 under — and ₹3,000 is genuinely coming back.
    expect((await getCashPosition(asDb(db))).available).toBe(-OWED_BACK);
    expect((await getMyExposure(asDb(db), me)).owed).toBe(OWED_BACK);

    const raid = await proposeOverspendRaid(asDb(db));
    expect(raid.total).toBe(0);
    expect(raid.withdrawals).toHaveLength(0);
  });

  it('raids only the part the receivable does not cover', async () => {
    const { db, me, a, b, c, g } = await setup();
    addDinner(db, g, [me, a, b, c], me);
    // ₹2,000 of my own spending on top — nobody owes me any of this.
    addTxn(db, {
      groupId: g, kind: 'expense', date: Date.now(), category: 'Food',
      payments: [{ personId: me, amount: 200000 }],
      shares: [{ personId: me, amount: 200000 }],
    });

    expect((await getCashPosition(asDb(db))).available).toBe(-500000);
    expect((await getMyExposure(asDb(db), me)).owed).toBe(OWED_BACK);

    // ₹5,000 short, ₹3,000 of it already owed back → ₹2,000, not ₹5,000.
    const raid = await proposeOverspendRaid(asDb(db));
    expect(raid.total).toBe(200000);
    expect(raid.withdrawals).toEqual([
      { goalId: 'goal-phone', name: 'Phone', amount: 200000 },
    ]);
  });

  it('does not count a written-off balance as cover', async () => {
    // Writing someone off is a decision that the money is not coming back. Covering
    // a shortfall with it would be covering it with nothing — and the price of
    // being wrong here is a liquidated savings goal.
    const { db, me, a, b, c, g } = await setup();
    addDinner(db, g, [me, a, b, c], me);
    await db.runAsync("UPDATE person SET receivable_state = 'written_off' WHERE id != ?", [me]);

    expect((await getMyExposure(asDb(db), me)).owed).toBe(OWED_BACK);
    // Still owed, still shown — just not counted.
    expect((await getMyExposure(asDb(db), me)).owedExpected).toBe(0);

    const raid = await proposeOverspendRaid(asDb(db));
    expect(raid.total).toBe(OWED_BACK);
  });

  it('counts only the people still expected to pay', async () => {
    const { db, me, a, b, c, g } = await setup();
    addDinner(db, g, [me, a, b, c], me);
    // One of the three written off → ₹1,000 of the ₹3,000 stops counting.
    await db.runAsync("UPDATE person SET receivable_state = 'written_off' WHERE id = ?", [a]);

    const exp = await getMyExposure(asDb(db), me);
    expect(exp.owed).toBe(OWED_BACK);
    expect(exp.owedExpected).toBe(200000);

    const raid = await proposeOverspendRaid(asDb(db));
    expect(raid.total).toBe(100000);
  });

  it('still raids in full when nothing is owed back', async () => {
    const { db, me, g } = await setup();
    // The same ₹4,000, but consumed entirely by me — a plain overspend.
    addTxn(db, {
      groupId: g, kind: 'expense', date: Date.now(), category: 'Food',
      payments: [{ personId: me, amount: FOUR_WAY_DINNER }],
      shares: [{ personId: me, amount: FOUR_WAY_DINNER }],
    });

    expect((await getMyExposure(asDb(db), me)).owed).toBe(0);
    const raid = await proposeOverspendRaid(asDb(db));
    expect(raid.total).toBe(OWED_BACK);
  });
});
