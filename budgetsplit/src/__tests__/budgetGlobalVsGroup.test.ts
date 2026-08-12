import {
  createTestDb, addPerson, addGroup, addMember, addCategory, addTxn, addSimpleExpense,
  asDb, budgetVia, type TestDb,
} from './helpers/testDb';
import { getAllGroups, sharedGroupsOf } from '../db/queries/groups';
import { getMyGlobalBudgetSummary } from '../lib/budget';
import { getBudgetAnalytics } from '../lib/analytics';
import { loadHomeData } from '../lib/homeData';
import { loadInsightsData } from '../lib/insightsData';
import { loadSavingsTabData } from '../lib/savingsTabData';
import { loadReportsData } from '../lib/reportsData';
import { loadCategoryDetail, categoryPeriodBudget } from '../lib/categoryDetailData';

/**
 * My Budget and a group's budget are incompatible bases and must never share a
 * total: the global cap already covers the spend happening inside every group.
 *
 * The reported symptom was a category detail hero reading "₹14,000 your budget" —
 * a global ₹8,000 plus a group's ₹6,000 — and the same addition was live in the
 * Plan forecast and the Savings rollup. Every figure below is asserted through the
 * assembler a screen actually calls, with the fixture built by the real writers.
 */
/** A minute ago, so every "window ends at now" read includes it. `loadHomeData`
 *  takes no injectable clock, so the fixture has to sit in the real past. */
const now = () => new Date();
const justNow = () => Date.now() - 60_000;

async function fixture() {
  const db = createTestDb();
  const me = addPerson(db, 'Me', true);
  const alex = addPerson(db, 'Alex', false);
  const personal = addGroup(db, 'Personal', true);
  addMember(db, personal, me);
  const flat = addGroup(db, 'Flat', false);
  addMember(db, flat, me);
  addMember(db, flat, alex);
  addCategory(db, 'Groceries');

  // My Budget: ₹8,000/mo for Groceries. The Flat's own default: ₹6,000 per person.
  await budgetVia(db, personal, [{ category: 'Groceries', cadence: 'monthly', amount: 800000 }], { level: 'group', actorId: me });
  await budgetVia(db, flat, [{ category: 'Groceries', cadence: 'monthly', amount: 600000 }], { level: 'group', actorId: me });

  const when = justNow();
  // ₹3,000 personal, plus a ₹4,000 Flat bill split evenly — my share is ₹2,000.
  addSimpleExpense(db, { groupId: personal, personId: me, amount: 300000, date: when, category: 'Groceries' });
  addTxn(db, {
    groupId: flat, kind: 'expense', date: when, category: 'Groceries',
    payments: [{ personId: me, amount: 400000 }],
    shares: [{ personId: me, amount: 200000 }, { personId: alex, amount: 200000 }],
  });
  return { db, me, alex, personal, flat };
}

describe('My Budget is never added to a group budget', () => {
  it('reports the global cap alone, not the sum', async () => {
    const { db, me } = await fixture();
    const mine = await getMyGlobalBudgetSummary(asDb(db), me, { now: now() });
    expect(mine.allocated).toBe(800000);
    expect(mine.allocated).not.toBe(1400000);
  });

  it('measures it against my share across every group', async () => {
    const { db, me } = await fixture();
    const mine = await getMyGlobalBudgetSummary(asDb(db), me, { now: now() });
    // ₹3,000 personal + my ₹2,000 half of the Flat bill. The whole ₹4,000 bill would be 700000.
    expect(mine.spent).toBe(500000);
  });

  it('keeps the global cap out of every group rollup', async () => {
    const { db, me } = await fixture();
    const groups = sharedGroupsOf(await getAllGroups(asDb(db)));
    const total = (await Promise.all(
      groups.map(g => getBudgetAnalytics(asDb(db), g, { meId: me })),
    )).reduce((s, a) => s + a.totalAllocated, 0);
    expect(total).toBe(600000);
  });

  it('gives Home, Insights and Plan the same one figure', async () => {
    const { db, me } = await fixture();
    const groups = await getAllGroups(asDb(db));
    const [home, insights, plan] = await Promise.all([
      loadHomeData(asDb(db), groups, 'month'),
      loadInsightsData(asDb(db), {}, now()),
      loadSavingsTabData(asDb(db), now()),
    ]);
    expect([home.budget.allocated, insights.budget, plan.forecastBudget]).toEqual([800000, 800000, 800000]);
    // Both halves of Plan's "over budget" line share the basis. Its spend side used
    // to sum every member's share, so the comparison was wrong in both directions.
    expect([home.budget.spent, insights.monthSpend, plan.monthSpend]).toEqual([500000, 500000, 500000]);
  });

  it("charges Home's pace bar my share of a shared bill, not the whole bill", async () => {
    const { db, me } = await fixture();
    const home = await loadHomeData(asDb(db), await getAllGroups(asDb(db)), 'month');
    expect(home.budget.spent).toBe(500000);
  });

  it('counts a category budgeted both globally and in a group once', async () => {
    const { db } = await fixture();
    const home = await loadHomeData(asDb(db), await getAllGroups(asDb(db)), 'month');
    expect(home.healthInputs?.totalBudgeted).toBe(1);
  });

  it('gives Reports no group-budget bar for the personal group', async () => {
    const { db, personal, flat } = await fixture();
    const d = await loadReportsData(asDb(db), now());
    expect(Object.keys(d.analyticsByGroup)).toEqual([flat]);
    expect(d.analyticsByGroup[personal]).toBeUndefined();
    // ...and the figure it would have got wrong is reported as mine instead.
    expect(d.myBudget.allocated).toBe(800000);
  });

  it('shows the category hero my cap, with the group limit as its own row', async () => {
    const { db, flat } = await fixture();
    const from = new Date(now().getFullYear(), 0, 1).getTime();
    const detail = await loadCategoryDetail(asDb(db), { category: 'Groceries', from, to: Date.now() });

    expect(categoryPeriodBudget(detail.globalLines, 'monthly', now()).amount).toBe(800000);
    expect(detail.groupLimits).toHaveLength(1);
    expect(detail.groupLimits[0].groupId).toBe(flat);
    expect(categoryPeriodBudget(detail.groupLimits[0].lines, 'monthly', now()).amount).toBe(600000);
  });
});
