import { loadHomeData } from '../lib/homeData';
import { loadReportsData } from '../lib/reportsData';
import { getMyGlobalBudgetSummary } from '../lib/budget';
import { getMyExposure } from '../db/queries/balances';
import { getAllGroups } from '../db/queries/groups';
import {
  createTestDb, addPerson, addGroup, addMember, addTxn, addCategory, budgetVia, type TestDb,
} from './helpers/testDb';
import type * as SQLite from 'expo-sqlite';

/**
 * ONE transaction, FOUR surfaces, one figure.
 *
 * `AGENTS.md` §13: "A figure that moves while the others do not is worse than all
 * of them moving: the app then contradicts itself and nothing tells the user which
 * number to believe." That is a rule about agreement BETWEEN surfaces, and until
 * this file there was nothing checking it — `homeData.test.ts`,
 * `budgetGlobalVsGroup.test.ts` and `screenData.test.ts` each exercise one surface
 * alone, so all four could drift apart with every test green.
 *
 * `IV-08` is listed in SYSTEM.md §5 as "unenforced, but single-sourced". Single-
 * sourcing is a reason to EXPECT agreement, not a mechanism that produces it: each
 * of the four reaches `myShareOf` down a different path, with its own window, its
 * own category fold and its own group filter. This is the mechanism.
 *
 * The case is the one AGENTS.md uses to explain the rule, and the one WALK-01.md
 * asks for by hand ("edit an amount and then check four screens agree"):
 *
 *     ₹300 in a shared group, split three ways, and I paid all of it.
 *       → my spending rises by ₹100, NOT ₹300      (Home, Reports, the budget bar)
 *       → the other ₹200 is owed TO me             (the balance)
 *
 * Deliberately NOT asserted here: cash. It moves by the full ₹300 because I
 * fronted it, and that is `IV-20` doing its job rather than a disagreement —
 * `cash.test.ts` and `cashSql.test.ts` own that.
 */

const asDb = (db: TestDb) => db as unknown as SQLite.SQLiteDatabase;

const BILL = 300_00;
const MY_SHARE = 100_00;
const OWED_TO_ME = BILL - MY_SHARE;

/**
 * `Date.now()`, not midday.
 *
 * Spend windows END AT `now` — "spent" is what happened, not what is scheduled —
 * so a fixture dated 12:00 is in the *future* for any run before noon, and under
 * `npm run test:calendar` the clock is pinned to midnight UTC on the swept date,
 * which puts midday beyond it on every one of the seven. `Date.now()` is always
 * in the past by the time a loader reads the clock. `homeData.test.ts` carries the
 * same note for the same reason.
 */
const today = () => Date.now();

async function setup() {
  const db = createTestDb();
  const me = addPerson(db, 'Me', true);
  const aarav = addPerson(db, 'Aarav');
  const priya = addPerson(db, 'Priya');

  const personal = addGroup(db, 'Personal', true);
  addMember(db, personal, me);

  const flat = addGroup(db, 'Roommates');
  for (const p of [me, aarav, priya]) addMember(db, flat, p);

  addCategory(db, 'Food');
  // A real category budget, so Home's budget block takes the category path
  // (`mine.spent`) rather than falling back to the hero figure — otherwise the
  // two agree trivially and this file proves nothing.
  await budgetVia(db, personal, [{ category: 'Food', cadence: 'monthly', amount: 5_000_00 }],
    { level: 'personal', actorId: me });

  return { db, me, aarav, priya, flat };
}

/** The four surfaces, read the way their screens read them. */
async function surfaces(db: TestDb, me: string) {
  const groups = await getAllGroups(asDb(db));
  const [home, reports, budget, exposure] = await Promise.all([
    loadHomeData(asDb(db), groups, 'month'),
    loadReportsData(asDb(db), new Date()),
    getMyGlobalBudgetSummary(asDb(db), me),
    getMyExposure(asDb(db), me),
  ]);
  return {
    home: home.spending,
    reports: reports.monthSpent,
    budgetBar: home.budget.spent,
    myBudget: budget.spent,
    owed: exposure.owed,
    owe: exposure.owe,
  };
}

/** ₹300 in the flat, three ways, paid by whoever `payer` says. */
function threeWaySplit(db: TestDb, flat: string, people: string[], payer: string) {
  return addTxn(db, {
    groupId: flat,
    kind: 'expense',
    date: today(),
    category: 'Food',
    payments: [{ personId: payer, amount: BILL }],
    shares: people.map(personId => ({ personId, amount: BILL / 3 })),
  });
}

describe('one split expense, four surfaces', () => {
  it('starts every surface at zero', async () => {
    const { db, me } = await setup();
    expect(await surfaces(db, me)).toMatchObject({
      home: 0, reports: 0, budgetBar: 0, myBudget: 0, owed: 0, owe: 0,
    });
  });

  it('moves my spending by my share on ALL of them, not by the bill', async () => {
    const { db, me, aarav, priya, flat } = await setup();
    threeWaySplit(db, flat, [me, aarav, priya], me);

    const s = await surfaces(db, me);

    // The claim that matters: every spending surface moved, and by the same figure.
    expect(s.home).toBe(MY_SHARE);
    expect(s.reports).toBe(MY_SHARE);
    expect(s.budgetBar).toBe(MY_SHARE);
    expect(s.myBudget).toBe(MY_SHARE);

    // Stated again as agreement rather than as four separate values, because THAT
    // is the invariant. A future change that moves all four to the same wrong
    // number should still fail — hence the explicit MY_SHARE assertions above.
    expect(new Set([s.home, s.reports, s.budgetBar, s.myBudget]).size).toBe(1);

    // And the remainder is a receivable, never spending.
    expect(s.owed).toBe(OWED_TO_ME);
    expect(s.owe).toBe(0);
  });

  it('comes out identical whether I fronted the bill or Aarav did', async () => {
    const mine = await setup();
    threeWaySplit(mine.db, mine.flat, [mine.me, mine.aarav, mine.priya], mine.me);

    const theirs = await setup();
    threeWaySplit(theirs.db, theirs.flat, [theirs.me, theirs.aarav, theirs.priya], theirs.aarav);

    const a = await surfaces(mine.db, mine.me);
    const b = await surfaces(theirs.db, theirs.me);

    // "The test that proves it" — AGENTS.md §13. Who fronted the cash changes the
    // DIRECTION of the balance and nothing else; my spending is identical.
    expect(b.home).toBe(a.home);
    expect(b.reports).toBe(a.reports);
    expect(b.budgetBar).toBe(a.budgetBar);
    expect(b.myBudget).toBe(a.myBudget);

    expect(a.owed).toBe(OWED_TO_ME);
    expect(a.owe).toBe(0);
    expect(b.owe).toBe(MY_SHARE);
    expect(b.owed).toBe(0);
  });

  /**
   * `DQ-26`. Investing is committed, spending is capped, and the two are two lines
   * that never add up into one number (`IV-17`).
   *
   * The invested figure is accumulated in the same loop as the spend figure —
   * `getCategorySpendingDetail` — precisely so they read the same rows over the
   * same window with the same approval filter. A separate query could include a
   * pending peer row that the spend figure excluded, and the Budget card would
   * then contradict itself with no way to tell which half was wrong.
   */
  describe('an investment sits beside the spend figure, never inside it', () => {
    const INVESTED = 10_000_00;

    async function withSip() {
      const { db, me, flat } = await setup();
      const personal = (await getAllGroups(asDb(db))).find(g => g.is_personal === 1)!;
      // The shape `transferToAsset` writes: settlement, payments-only, asset_id set.
      addTxn(db, {
        groupId: personal.id, kind: 'settlement', date: today(),
        category: 'Investment', assetId: 'gold',
        payments: [{ personId: me, amount: INVESTED }],
      });
      return { db, me, flat };
    }

    it('moves no spend figure on any surface', async () => {
      const { db, me } = await withSip();
      // Not consumption: it must reach no budget, no pace bar and no report total.
      expect(await surfaces(db, me)).toMatchObject({
        home: 0, reports: 0, budgetBar: 0, myBudget: 0,
      });
    });

    it('is reported, rather than silently omitted', async () => {
      const { db, me } = await withSip();
      const budget = await getMyGlobalBudgetSummary(asDb(db), me);
      expect(budget.invested).toBe(INVESTED);
      // …and is not folded into the figure it sits beside.
      expect(budget.spent).toBe(0);
    });

    it('does not count a redemption — selling is not investing', async () => {
      const { db, me } = await setup();
      const personal = (await getAllGroups(asDb(db))).find(g => g.is_personal === 1)!;
      // `transferFromAsset`'s shape: same asset_id, shares-only.
      addTxn(db, {
        groupId: personal.id, kind: 'settlement', date: today(),
        category: 'Investment', assetId: 'gold',
        shares: [{ personId: me, amount: INVESTED }],
      });
      const budget = await getMyGlobalBudgetSummary(asDb(db), me);
      expect(budget.invested).toBe(0);
    });

    it('does not count a person-to-person settlement', async () => {
      const { db, me, aarav, flat } = await setup();
      addTxn(db, {
        groupId: flat, kind: 'settlement', date: today(), category: 'Settlement',
        payments: [{ personId: me, amount: INVESTED }],
        shares: [{ personId: aarav, amount: INVESTED }],
      });
      // No `asset_id`, so nothing went into anything you own — paying Aarav back
      // is not investing, however much it looks like a settlement in the ledger.
      expect((await getMyGlobalBudgetSummary(asDb(db), me)).invested).toBe(0);
    });
  });

  it('keeps the four in step when the entry is soft-deleted', async () => {
    const { db, me, aarav, priya, flat } = await setup();
    const id = threeWaySplit(db, flat, [me, aarav, priya], me);

    db.raw.prepare('UPDATE txn SET is_deleted = 1 WHERE id = ?').run(id);

    // Deleting must reverse everything adding did, on every surface at once —
    // a surface that keeps the money is exactly the contradiction the rule names.
    expect(await surfaces(db, me)).toMatchObject({
      home: 0, reports: 0, budgetBar: 0, myBudget: 0, owed: 0, owe: 0,
    });
  });
});
