import { computeTransferScopes, planAllGroupsSettlement } from '../lib/settleScope';
import { getFriendBalances } from '../db/queries/balances';
import { computeContributions } from '../lib/groupDetail';
import { removeMemberFromGroup } from '../db/queries/persons';
import { archiveGroupSafe } from '../db/queries/groups';
import { createTestDb, addPerson, addGroup, addMember, addTxn, addCategory, asDb, type TestDb } from './helpers/testDb';

/**
 * A settle-up figure you cannot actually pay into is a misdirected payment, not a
 * display quirk.
 *
 * The per-group rows came from `getAllGroups`, which excludes archived groups,
 * while the combined "All groups" figure came from `getGlobalNet`, whose only
 * scope clause is `is_personal = 0`. So an archived balance was in the total and
 * in no row — and `planAllGroupsSettlement` can only allocate to rows.
 */

const OWED = 500000;   // ₹5,000

/** Aarav and me in two groups: a live flat, and a trip I archived. */
function twoGroups() {
  const db = createTestDb();
  const me = addPerson(db, 'Prem', true);
  const aarav = addPerson(db, 'Aarav');
  addCategory(db, 'Food');

  const flat = addGroup(db, 'Flat', false, me);
  const trip = addGroup(db, 'Goa Trip', false, me);
  [flat, trip].forEach(g => { addMember(db, g, me, 'admin'); addMember(db, g, aarav, 'member'); });

  // Aarav fronted both, so I owe him in each.
  addTxn(db, {
    groupId: flat, kind: 'expense', date: Date.now(), category: 'Food',
    payments: [{ personId: aarav, amount: 400000 }],
    shares: [{ personId: me, amount: 200000 }, { personId: aarav, amount: 200000 }],
  });
  addTxn(db, {
    groupId: trip, kind: 'expense', date: Date.now(), category: 'Food',
    payments: [{ personId: aarav, amount: OWED * 2 }],
    shares: [{ personId: me, amount: OWED }, { personId: aarav, amount: OWED }],
  });
  return { db, me, aarav, flat, trip };
}

describe('the settle total is the sum of its own rows', () => {
  it('lists an archived group rather than hiding its balance in the total', async () => {
    const s = twoGroups();
    await archiveGroupSafe(asDb(s.db), s.trip);

    const scopes = await computeTransferScopes(asDb(s.db), s.me, s.aarav);
    expect(scopes.groups.map(g => g.groupId).sort()).toEqual([s.flat, s.trip].sort());
    // Labelled, because an archived group in a settle list is otherwise one the
    // user cannot find anywhere else.
    expect(scopes.groups.find(g => g.groupId === s.trip)?.name).toContain('Archived');
  });

  it('adds up: the headline equals the rows', async () => {
    const s = twoGroups();
    await archiveGroupSafe(asDb(s.db), s.trip);

    const scopes = await computeTransferScopes(asDb(s.db), s.me, s.aarav);
    const rows = scopes.groups.reduce((sum, g) => sum + g.amount, 0);
    expect(scopes.all.amount).toBe(rows);
    expect(scopes.all.from).toBe(s.me);   // I owe Aarav in both
  });

  it('agrees with the friend balance, which is the same population', async () => {
    const s = twoGroups();
    await archiveGroupSafe(asDb(s.db), s.trip);

    const scopes = await computeTransferScopes(asDb(s.db), s.me, s.aarav);
    const net = (await getFriendBalances(asDb(s.db), s.me))
      .find(b => b.personId === s.aarav)?.net ?? 0;
    expect(scopes.all.amount).toBe(Math.abs(net));
  });

  /**
   * The payment that went to the wrong place. Paying the full "All groups" figure
   * used to allocate only across LIVE scope, so the archived group's share landed
   * in the flat — leaving the flat in credit while the trip still showed the debt.
   */
  it('spreads a full settle-up across both groups instead of dumping it in one', async () => {
    const s = twoGroups();
    await archiveGroupSafe(asDb(s.db), s.trip);

    const scopes = await computeTransferScopes(asDb(s.db), s.me, s.aarav);
    const plan = planAllGroupsSettlement(scopes, scopes.all.amount, s.me, s.aarav);

    expect(plan.map(p => p.groupId).sort()).toEqual([s.flat, s.trip].sort());
    expect(plan.reduce((sum, p) => sum + p.amount, 0)).toBe(scopes.all.amount);
    // And no group gets more than it was owed, so neither ends up in credit.
    for (const p of plan) {
      const scope = scopes.groups.find(g => g.groupId === p.groupId)!;
      expect(p.amount).toBeLessThanOrEqual(scope.amount);
    }
  });
});

/**
 * "Who paid what" divided a total that counted EVERY payer by the CURRENT member
 * count, so a departed member's spending stayed in the numerator and their head
 * left the denominator.
 */
describe('fair share counts the same people as the total', () => {
  it('does not inflate the per-head figure when somebody has left', async () => {
    const db = createTestDb();
    const me = addPerson(db, 'Prem', true);
    const aarav = addPerson(db, 'Aarav');
    const gid = addGroup(db, 'Flat', false, me);
    addMember(db, gid, me, 'admin');
    addMember(db, gid, aarav, 'member');
    addCategory(db, 'Food');

    const txns = [
      { payments: [{ personId: me, amount: 100000 }], shares: [{ personId: me, amount: 100000 }] },
      { payments: [{ personId: aarav, amount: 100000 }], shares: [{ personId: aarav, amount: 100000 }] },
    ].map(t => ({
      id: addTxn(db, { groupId: gid, kind: 'expense', date: Date.now(), category: 'Food', ...t }),
      ...t,
    }));

    await removeMemberFromGroup(asDb(db), gid, aarav, me);

    // Only I remain, so only my ₹1,000 is "who paid what" among the people here.
    const rows = txns.map(t => ({
      is_deleted: 0, kind: 'expense' as const, payments: t.payments, shares: t.shares,
    })) as never[];
    const members = [{ id: me, name: 'Prem', avatar_color: '#000', is_me: 1 }] as never[];

    const c = computeContributions(rows, members, {});
    expect(c.total).toBe(100000);
    // The rows must sum to the total shown above them, and the fair share must be
    // that total over the people in those rows.
    expect(c.rows.reduce((s, r) => s + r.paid, 0)).toBe(c.total);
    expect(c.fairShare).toBe(100000);
  });
});
