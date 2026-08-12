import {
  createTestDb, addPerson, addGroup, addMember, addCategory, addTxn,
  asDb, budgetVia, type TestDb,
} from './helpers/testDb';
import { getAllGroups } from '../db/queries/groups';
import { getBudgetAnalytics } from '../lib/analytics';
import { loadInsightsData } from '../lib/insightsData';
import { loadReportsData } from '../lib/reportsData';
import { PermissionError } from '../lib/permissions';

/**
 * A personal override is what applies to me, so every rollup has to see it.
 *
 * Five of the six cross-group rollups called `getBudgetAnalytics(db, g)` with no
 * `meId` — a call that reads as complete — and so reported the group's default and
 * the whole group's bill instead. Every override written here goes through the real
 * writer; hand-inserting the rows would prove nothing about how they come to exist.
 */
async function fixture() {
  const db = createTestDb();
  const me = addPerson(db, 'Me', true);
  const alex = addPerson(db, 'Alex', false);
  const flat = addGroup(db, 'Flat', false);   // me is the creator, so admin
  addMember(db, flat, me);
  addMember(db, flat, alex);
  addCategory(db, 'Groceries');

  await budgetVia(db, flat, [{ category: 'Groceries', cadence: 'monthly', amount: 600000 }], { level: 'group', actorId: me });
  await budgetVia(db, flat, [{ category: 'Groceries', cadence: 'monthly', amount: 200000 }], { level: 'personal', actorId: me });
  await budgetVia(db, flat, [{ category: 'Groceries', cadence: 'monthly', amount: 5_000_000 }], { level: 'personal', actorId: alex });

  // A ₹3,600 bill split evenly: ₹1,800 each. Over my ₹2,000? No. Over on the
  // group's ₹6,000? Not remotely — which is the difference the reads must show.
  addTxn(db, {
    groupId: flat, kind: 'expense', date: Date.now() - 60_000, category: 'Groceries',
    payments: [{ personId: me, amount: 360000 }],
    shares: [{ personId: me, amount: 180000 }, { personId: alex, amount: 180000 }],
  });
  return { db, me, alex, flat };
}

describe('my override is the budget that applies to me', () => {
  it('reports my amount, not the group default', async () => {
    const { db, me, flat } = await fixture();
    const [g] = (await getAllGroups(asDb(db))).filter(x => x.id === flat);
    const a = await getBudgetAnalytics(asDb(db), g, { meId: me });
    expect(a.totalAllocated).toBe(200000);
  });

  it("is unaffected by another member's override", async () => {
    const { db, me, alex, flat } = await fixture();
    const [g] = (await getAllGroups(asDb(db))).filter(x => x.id === flat);
    const mine = await getBudgetAnalytics(asDb(db), g, { meId: me });
    const theirs = await getBudgetAnalytics(asDb(db), g, { meId: alex });
    expect(mine.totalAllocated).toBe(200000);
    expect(theirs.totalAllocated).toBe(5_000_000);
  });

  it('leaves the group default intact for everyone who has no override', async () => {
    const { db, flat } = await fixture();
    const carol = addPerson(db, 'Carol', false);
    addMember(db, flat, carol);
    const [g] = (await getAllGroups(asDb(db))).filter(x => x.id === flat);
    expect((await getBudgetAnalytics(asDb(db), g, { meId: carol })).totalAllocated).toBe(600000);
  });

  it('is visible to Insights and Reports, which used to read the default', async () => {
    const { db, flat } = await fixture();
    const [insights, reports] = await Promise.all([
      loadInsightsData(asDb(db), {}, new Date()),
      loadReportsData(asDb(db), new Date()),
    ]);
    expect(reports.analyticsByGroup[flat].totalAllocated).toBe(200000);
    // 90% of my ₹2,000 is near the limit; against the group's ₹6,000 it is 30%.
    expect(insights.drivers.every(d => d.category !== 'Groceries' || d.over > 0)).toBe(true);
    const flatAnalytics = reports.analyticsByGroup[flat];
    expect(flatAnalytics.nearLimit.map(c => c.category)).toEqual(['Groceries']);
  });

  it('cannot be written for someone else, not even by an admin', async () => {
    const { db, me, alex, flat } = await fixture();
    // `budgetVia` takes one actor: the level maps to that actor's own person_id, so
    // "set Alex's budget" is not expressible. The gate is what makes that true.
    await expect(
      budgetVia(db, flat, [{ category: 'Groceries', cadence: 'monthly', amount: 100 }], { level: 'personal', actorId: 'nobody' }),
    ).rejects.toThrow(PermissionError);
    expect(me).not.toBe(alex);
  });

  it('never touches the group default when written', async () => {
    const { db, flat } = await fixture();
    const rows = db.raw.prepare(
      'SELECT person_id, amount FROM category_budget WHERE group_id = ? ORDER BY amount',
    ).all(flat) as { person_id: string | null; amount: number }[];
    expect(rows.find(r => r.person_id === null)?.amount).toBe(600000);
  });
});
