import type * as SQLite from 'expo-sqlite';
import { getMyActivity, type MyActivityItem } from '../db/queries/transactions';
import { getAllGroups } from '../db/queries/groups';
import { getAllPersons } from '../db/queries/persons';
import { getMyExposure } from '../db/queries/balances';
import { getMyGlobalBudgetSummary } from './budget';
import { getRecurringForGroup, getSkipsMap } from '../db/queries/recurring';

/** Everything the Personal screen shows: my activity across groups, my budget, and owe/lent. */
export async function loadPersonal(db: SQLite.SQLiteDatabase, meId: string) {
  const [activity, persons, groups, exp, budget] = await Promise.all([
    getMyActivity(db, meId),
    getAllPersons(db),
    getAllGroups(db),
    getMyExposure(db, meId),
    getMyGlobalBudgetSummary(db, meId),
  ]);
  // The Personal group's OWN rules — the same list a group's Recurring tab shows for that group.
  // (Every rule everywhere is Money → Recurring; this is not that list again.)
  const personal = groups.find(g => g.is_personal === 1);
  const recurringRules = personal ? (await getRecurringForGroup(db, personal.id)).filter(r => r.recur_state !== 'ended') : [];
  const recurSkips = await getSkipsMap(db, recurringRules.map(r => r.id));
  // Owe / Lent — single source of truth (netted per person).
  return { persons, activity, groups, budget, recurringRules, recurSkips, summary: { owe: exp.owe, lent: exp.owed } };
}

export type ActivityScope = 'personal' | 'groups' | 'all';

/** Which ledger the scope chip picked: personal, every group, or all of it. */
export function scopeActivity(activity: MyActivityItem[], scope: ActivityScope): MyActivityItem[] {
  return activity.filter(a =>
    scope === 'all' ? true
    : scope === 'personal' ? a.isPersonal
    : !a.isPersonal);
}
