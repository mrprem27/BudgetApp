import type * as SQLite from 'expo-sqlite';
import { getMyActivity, type MyActivityItem } from '../db/queries/transactions';
import { getAllGroups } from '../db/queries/groups';
import { getAllPersons } from '../db/queries/persons';
import { getMyExposure } from '../db/queries/balances';
import { getMyGlobalBudgetSummary } from './budget';

/** Everything the Personal screen shows: my activity across groups, my budget, and owe/lent. */
export async function loadPersonal(db: SQLite.SQLiteDatabase, meId: string) {
  const [activity, persons, groups, exp, budget] = await Promise.all([
    getMyActivity(db, meId),
    getAllPersons(db),
    getAllGroups(db),
    getMyExposure(db, meId),
    getMyGlobalBudgetSummary(db, meId),
  ]);
  // Owe / Lent — single source of truth (netted per person).
  return { persons, activity, groups, budget, summary: { owe: exp.owe, lent: exp.owed } };
}

/** Which ledger the scope chip picked: personal, every group, all of it, or one group by id. */
export function scopeActivity(activity: MyActivityItem[], scope: string): MyActivityItem[] {
  return activity.filter(a =>
    scope === 'all' ? true
    : scope === 'personal' ? a.isPersonal
    : scope === 'groups' ? !a.isPersonal
    : a.group_id === scope);
}
