import { addMemberToGroup, removeMemberFromGroup } from '../db/queries/persons';
import { updateGroup, setSimplifyDebt } from '../db/queries/groups';
import { PermissionError } from '../lib/permissions';
import { applyRebalance, planRebalance } from '../lib/rebalance';
import { OTHERS_LABEL } from '../lib/categoryFold';
import type { CategoryBudgetStatus } from '../lib/budget';
import { createTestDb, addPerson, addGroup, addMember, asDb, type TestDb } from './helpers/testDb';

/**
 * The rules `permissions.ts` says are enforced at the query layer, actually
 * enforced at the query layer.
 *
 * The header made that claim while it was half true, which is worse than not
 * making it: membership was guarded as `if (actorId && …)` with `actorId`
 * OPTIONAL, so a caller that omitted it did not fail — it skipped the check
 * entirely. `group/[id]/edit.tsx` omitted it, so any member could open Edit
 * group, untick anybody including the creator, and save. Rename, default split
 * and simplify-debt had no capability at all.
 */

/** Aarav creates the flat; I am a plain member of it. */
function flatIDidNotCreate() {
  const db = createTestDb();
  const me = addPerson(db, 'Prem', true);
  const aarav = addPerson(db, 'Aarav');
  const gid = addGroup(db, 'Flat', false, aarav);
  addMember(db, gid, aarav, 'admin');
  addMember(db, gid, me, 'member');
  return { db, me, aarav, gid };
}

/** I create the flat, so I am its creator and therefore an admin. */
function myFlat() {
  const db = createTestDb();
  const me = addPerson(db, 'Prem', true);
  const aarav = addPerson(db, 'Aarav');
  const gid = addGroup(db, 'Flat', false, me);
  addMember(db, gid, me, 'admin');
  addMember(db, gid, aarav, 'member');
  return { db, me, aarav, gid };
}

const nameOf = (db: TestDb, gid: string) =>
  db.raw.prepare('SELECT name, simplify_debt FROM budget_group WHERE id = ?').get(gid);

/**
 * ACTIVE membership. Removal is soft — the row stays, marked with when they left
 * — so counting rows would report somebody who has gone as still present.
 */
const isMember = (db: TestDb, gid: string, pid: string) =>
  (db.raw.prepare(
    'SELECT COUNT(*) AS c FROM group_member WHERE group_id = ? AND person_id = ? AND deleted_at IS NULL',
  ).get(gid, pid) as { c: number }).c === 1;

describe('membership is admin-only, and the actor is not optional', () => {
  it('refuses a plain member adding somebody', async () => {
    const s = flatIDidNotCreate();
    const ravi = addPerson(s.db, 'Ravi');
    await expect(addMemberToGroup(asDb(s.db), s.gid, ravi, s.me)).rejects.toThrow(PermissionError);
    expect(isMember(s.db, s.gid, ravi)).toBe(false);
  });

  it('refuses a plain member removing somebody', async () => {
    const s = flatIDidNotCreate();
    await expect(removeMemberFromGroup(asDb(s.db), s.gid, s.aarav, s.me)).rejects.toThrow(PermissionError);
    expect(isMember(s.db, s.gid, s.aarav)).toBe(true);
  });

  /**
   * The creator is un-removable by ANYONE — including another admin, and
   * including themselves. A group with no permanent admin is a group nobody can
   * manage again, which is the state adoption used to produce and could not
   * repair.
   */
  it('refuses removing the creator, even by an admin', async () => {
    const db = createTestDb();
    const me = addPerson(db, 'Prem', true);
    const aarav = addPerson(db, 'Aarav');
    const gid = addGroup(db, 'Flat', false, aarav);
    addMember(db, gid, aarav, 'admin');
    addMember(db, gid, me, 'admin');          // I am an admin, not the creator

    await expect(removeMemberFromGroup(asDb(db), gid, aarav, me)).rejects.toThrow(PermissionError);
    expect(isMember(db, gid, aarav)).toBe(true);
  });

  it('refuses the creator removing themselves', async () => {
    const s = myFlat();
    await expect(removeMemberFromGroup(asDb(s.db), s.gid, s.me, s.me)).rejects.toThrow(PermissionError);
    expect(isMember(s.db, s.gid, s.me)).toBe(true);
  });

  it('lets an admin add and remove an ordinary member', async () => {
    // The narrowness check: a guard that refused everything would pass every test
    // above and break the app.
    const s = myFlat();
    const ravi = addPerson(s.db, 'Ravi');
    await addMemberToGroup(asDb(s.db), s.gid, ravi, s.me);
    expect(isMember(s.db, s.gid, ravi)).toBe(true);

    await removeMemberFromGroup(asDb(s.db), s.gid, ravi, s.me);
    expect(isMember(s.db, s.gid, ravi)).toBe(false);
  });
});

describe('group settings are admin-only', () => {
  it('refuses a plain member renaming the group or changing the split', async () => {
    const s = flatIDidNotCreate();
    await expect(updateGroup(asDb(s.db), s.gid, 'My Flat', 'coffee', '#FF6F61', 'shares', s.me))
      .rejects.toThrow(PermissionError);
    expect(nameOf(s.db, s.gid)).toMatchObject({ name: 'Flat' });
  });

  it('refuses a plain member changing how the group settles up', async () => {
    // Not cosmetic: this decides whether everyone is told "pay Rohan ₹2,000" or
    // two smaller direct payments, and it now travels on the roster.
    const s = flatIDidNotCreate();
    await expect(setSimplifyDebt(asDb(s.db), s.gid, false, s.me)).rejects.toThrow(PermissionError);
    expect(nameOf(s.db, s.gid)).toMatchObject({ simplify_debt: 1 });
  });

  it('lets an admin do both', async () => {
    const s = myFlat();
    await updateGroup(asDb(s.db), s.gid, 'Flat 3B', 'coffee', '#FF6F61', 'shares', s.me);
    await setSimplifyDebt(asDb(s.db), s.gid, false, s.me);
    expect(nameOf(s.db, s.gid)).toEqual({ name: 'Flat 3B', simplify_debt: 0 });
  });
});

/**
 * `Others` is a FOLD, not a category. `foldBudgetStatuses` invents it to gather
 * every budget line whose category is not in the catalog, so it has no row of its
 * own — and submitting it made `setCategoryBudgets` write a real one, while its
 * preservation rule kept the folded lines alongside it. The group's allocated
 * total jumped by their sum out of nowhere, and the next fold gathered them into
 * the now-real Others again.
 */
describe('a re-plan never touches the Others fold', () => {
  const row = (category: string, allocated: number, spent: number): CategoryBudgetStatus => ({
    category, cadence: 'monthly', allocated, spent,
    remaining: allocated - spent,
    pct: allocated > 0 ? Math.round((spent / allocated) * 100) : null,
    health: spent > allocated ? 'red' : 'green',
  });

  const statuses = [
    row('Food', 500000, 620000),        // over by ₹1,200
    row('Transport', 400000, 100000),   // ₹3,000 spare
    row(OTHERS_LABEL, 500000, 0),       // the fold — ₹5,000 that belongs to other lines
  ];

  it('never proposes taking money from it', () => {
    const plan = planRebalance(statuses, 'Food');
    expect(plan).not.toBeNull();
    expect(plan!.donors.map(d => d.category)).not.toContain(OTHERS_LABEL);
  });

  it('refuses to re-plan the fold itself', () => {
    expect(planRebalance(statuses, OTHERS_LABEL)).toBeNull();
  });

  it('never writes it as a budget line', () => {
    const plan = planRebalance(statuses, 'Food')!;
    const entries = applyRebalance(statuses, plan);
    expect(entries.map(e => e.category)).not.toContain(OTHERS_LABEL);
  });

  it('still redistributes, and the total is unchanged', () => {
    // The whole point of a re-plan: money moves between categories, and none is
    // created.
    const plan = planRebalance(statuses, 'Food')!;
    const entries = applyRebalance(statuses, plan);
    const before = statuses.filter(s => s.category !== OTHERS_LABEL)
      .reduce((sum, s) => sum + s.allocated, 0);
    const after = entries.reduce((sum, e) => sum + e.amount, 0);
    expect(after).toBe(before);
  });
});
