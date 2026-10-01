import { loadRecurringSpentThisYear } from './recurringData';
import type * as SQLite from 'expo-sqlite';
import {
  getAllGroups, getArchivedGroups, unarchiveGroup, archiveGroupSafe, insertGroup, listableGroups,
  getGroupById, getGroupContext, getGroupMembersWithRoles, setMemberRole, updateGroup, deleteGroup, leaveGroup, setSimplifyDebt,
  type BudgetGroup, type SplitMode,
} from '../db/queries/groups';
import {
  getMe, getAllPersons, getGroupMembers, insertPerson, addMemberToGroup, removeMemberFromGroup, updatePersonName, setTrustState, type Person,
} from '../db/queries/persons';
import { getMyExposure, getGroupNet } from '../db/queries/balances';
import { getBudgetAnalytics } from './analytics';
import { budgetHealth, isGlobalBudgetGroup, getMyGlobalBudgetSummary, getCategoryBudgetStatus, type CategoryBudgetStatus } from './budget';
import { getTransactionsForGroup } from '../db/queries/transactions';
import { getRecurringForGroup, getSkipsMap } from '../db/queries/recurring';
import { getCategoryBudgetRows, setCategoryBudgets } from '../db/queries/categoryBudgets';
import type { BudgetAnalytics } from './analytics';

/** What turning splitting off would hide: shared groups, and money still unsettled either way. */
export async function splittingFootprint(db: SQLite.SQLiteDatabase): Promise<{ shared: number; outstanding: number }> {
  const [grps, me] = await Promise.all([getAllGroups(db), getMe(db)]);
  const exp = me ? await getMyExposure(db, me.id) : null;
  return { shared: grps.filter(g => g.is_personal !== 1).length, outstanding: exp ? exp.owe + exp.owed : 0 };
}

/** One group card's figures: budget use, spend, members and my net. */
export type GroupHealth = { pct: number | null; health: 'green' | 'amber' | 'red' | 'none'; spent: number; members: number; over: number; net: number };

/**
 * Everything the Groups tab shows besides the list itself.
 *
 * `archived` holds only groups that can COME BACK. A group its owner deleted (or
 * that ended for me) is archived too, but `unarchiveGroup` refuses it — so it was
 * offered here as "tap to restore" and the tap did nothing, with a success buzz.
 */
export async function loadGroupsTab(db: SQLite.SQLiteDatabase, groups: BudgetGroup[]) {
  const [archived, me] = await Promise.all([getArchivedGroups(db), getMe(db)]);
  const meId = me?.id ?? '';
  const health: Record<string, GroupHealth> = {};
  const memberMap: Record<string, Person[]> = {};
  await Promise.all(groups.map(async g => {
    // The Personal card's bar is My Budget — its lines are the global cap, and
    // measuring them against Personal-group spend alone overstated headroom for
    // anyone who also spends in a shared group.
    const [budget, mems, gnet] = await Promise.all([
      isGlobalBudgetGroup(g) ? getMyGlobalBudgetSummary(db, meId) : getBudgetAnalytics(db, g, { meId }),
      getGroupMembers(db, g.id),
      getGroupNet(db, g.id),
    ]);
    const pct = 'utilizationPct' in budget ? budget.utilizationPct : budget.pct;
    const spent = 'totalSpent' in budget ? budget.totalSpent : budget.spent;
    const over = 'overBudget' in budget ? budget.overBudget.length : budget.rows.filter(r => r.health === 'red').length;
    health[g.id] = { pct, health: budgetHealth(pct), spent, over, members: mems.length, net: me ? (gnet[me.id] ?? 0) : 0 };
    memberMap[g.id] = mems;
  }));
  const persons = await getAllPersons(db);
  return {
    archived: listableGroups(archived.filter(g => g.deleted_at == null)),
    health,
    memberMap,
    allPersons: persons.filter(p => !p.is_me),
    // Single source of truth: getMyExposure (per-person, after all settlements).
    friends: me ? (await getMyExposure(db, me.id)).perPerson : [],
  };
}

/** Bring an archived group back. False when it cannot come back (it ended). */
export const restoreGroup = unarchiveGroup;
export const archiveGroup = archiveGroupSafe;

/** A new friend typed into the group form. */
export const addPersonToPool = insertPerson;

/** Create a group with me in it, as its admin. Null when there is no "me" yet. */
export async function createGroup(
  db: SQLite.SQLiteDatabase,
  g: { name: string; icon: string; color: string; memberIds: string[]; split: SplitMode },
): Promise<BudgetGroup | null> {
  const me = await getMe(db);
  if (!me) return null;
  // Creator passed explicitly: you are creating it, so you administer it.
  return insertGroup(db, g.name, g.icon, g.color, [me.id, ...g.memberIds], g.split, me.id);
}

// --- One group's edit screen -------------------------------------------------

/** The group's current values, who can be picked, and what I may do here. */
export async function loadGroupEdit(db: SQLite.SQLiteDatabase, id: string | undefined) {
  const group = id ? await getGroupById(db, id) : null;
  if (!id || !group) return { group: null, allPersons: [] as Person[], initialMembers: [] as string[], meId: '', ctx: null, myNet: 0 };
  const [mems, persons, me] = await Promise.all([getGroupMembers(db, id), getAllPersons(db), getMe(db)]);
  const meId = me?.id;
  const ctx = meId ? await getGroupContext(db, id, meId) : null;
  return {
    group,
    allPersons: persons.filter(p => p.id !== meId),
    initialMembers: mems.filter(p => p.id !== meId).map(p => p.id),
    meId: meId ?? '',
    ctx,
    // Where I stand in this group, so leaving can say the figure rather than
    // block on it. Read from the group's own net — never recomputed here.
    myNet: meId ? (await getGroupNet(db, id))[meId] ?? 0 : 0,
  };
}

/**
 * Save an edited group: its fields, then the members added and removed.
 * `meId` is not optional — passing nothing used to skip the permission check,
 * which let any member add or remove anyone, including the un-removable creator.
 */
export async function saveGroupEdit(
  db: SQLite.SQLiteDatabase,
  id: string,
  meId: string,
  f: { name: string; icon: string; color: string; split: SplitMode; isPersonal: boolean; initialMembers: string[]; members: string[] },
): Promise<void> {
  await updateGroup(db, id, f.name, f.icon, f.color, f.split, meId);
  if (f.isPersonal) return;
  for (const pid of f.members.filter(m => !f.initialMembers.includes(m))) await addMemberToGroup(db, id, pid, meId);
  for (const pid of f.initialMembers.filter(m => !f.members.includes(m))) await removeMemberFromGroup(db, id, pid, meId);
}

export { deleteGroup, leaveGroup };

// --- One group's Members screen ----------------------------------------------

/** Who is in the group, what each owes, the roles, and what I may do. */
export async function loadGroupMembers(db: SQLite.SQLiteDatabase, groupId: string) {
  const me = await getMe(db);
  const meId = me?.id ?? '';
  const [members, allPersons, net, roles, ctx, group] = await Promise.all([
    getGroupMembers(db, groupId),
    getAllPersons(db),
    getGroupNet(db, groupId),
    getGroupMembersWithRoles(db, groupId),
    getGroupContext(db, groupId, meId),
    getGroupById(db, groupId),
  ]);
  return { members, allPersons, net, roles, ctx, meId, group };
}

export { addMemberToGroup, removeMemberFromGroup, setMemberRole, updatePersonName };

// --- The group hub ---------------------------------------------------------

/** A group with its ledger, members, balances, budget and recurring rules. */
export async function loadGroupHub(db: SQLite.SQLiteDatabase, id: string) {
  const [group, txns, members, me] = await Promise.all([
    getGroupById(db, id), getTransactionsForGroup(db, id), getGroupMembers(db, id), getMe(db),
  ]);
  const net = await getGroupNet(db, id);
  let ctx: Awaited<ReturnType<typeof getGroupContext>> | null = null;
  let overrideCount = 0;
  let catStatus: CategoryBudgetStatus[] = [];
  let analytics: BudgetAnalytics | null = null;
  let recurringRules: Awaited<ReturnType<typeof getRecurringForGroup>> = [];
  let recurSkips = new Map<string, Set<number>>();
  if (group) {
    const meId = me?.id ?? '';
    const [cs, an, gctx, budgetRows] = await Promise.all([
      getCategoryBudgetStatus(db, group, { meId }),
      getBudgetAnalytics(db, group, { meId }),
      getGroupContext(db, id, meId),
      getCategoryBudgetRows(db, id),
    ]);
    ctx = gctx;
    overrideCount = budgetRows.filter(r => r.person_id === meId && r.amount > 0).length;
    catStatus = cs;
    analytics = an;
    // Paused rules stay listed, same as the global screen: hiding them made a
    // rule paused from its own screen vanish from the tab you came back to, with
    // Resume reachable only by remembering the deep link.
    // Stopped rules included: the Recurring tab lists them behind its own Stopped row (`U-54`).
    recurringRules = await getRecurringForGroup(db, id);
    recurSkips = await getSkipsMap(db, recurringRules.map(r => r.id));
  }
  const recurringSpent = recurringRules.length > 0 ? await loadRecurringSpentThisYear(db, id) : 0;
  return { group, txns, members, me, net, catStatus, analytics, recurringRules, recurSkips, recurringSpent, ctx, overrideCount };
}

export { setSimplifyDebt, setTrustState, setCategoryBudgets };

/**
 * Trust each of these people. Each is written on its own, and one that fails
 * does not undo the ones before it — returns how many were saved.
 */
export async function trustPeople(db: SQLite.SQLiteDatabase, people: Person[]): Promise<number> {
  let saved = 0;
  for (const m of people) { await setTrustState(db, m.id, 'trusted'); saved++; }
  return saved;
}

/** The groups a LIST shows: everything but the implicit two-person groups made for one friend. */
export { listableGroups };
