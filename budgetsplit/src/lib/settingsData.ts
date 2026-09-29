import type * as SQLite from 'expo-sqlite';
import { getMe, getAllPersons, updatePersonName, setPersonUpiVpa } from '../db/queries/persons';
import { getPendingCount } from '../db/queries/pending';
import { getAllGroups } from '../db/queries/groups';
import { getMyGlobalBudgetRows } from '../db/queries/categoryBudgets';
import { getCategories } from '../db/queries/categories';
import { seedGlobalCategories } from '../db/seedCategories';
import { rollUpBudgets } from './budget';
import { buildAllGroupsExportCsv } from './groupExport';

/**
 * What the Settings tab's rows say about the data behind them. The self-heal write
 * is idempotent (only fires on an empty catalog), so it is safe inside a loader
 * that re-runs on focus.
 */
export async function loadSettingsTab(db: SQLite.SQLiteDatabase) {
  const [me, allPersons] = await Promise.all([getMe(db), getAllPersons(db)]);
  let count = (await getCategories(db, 'expense')).length;
  if (count === 0) { await seedGlobalCategories(db); count = (await getCategories(db, 'expense')).length; }
  // Just the lines, rolled up — no spend queries: a settings row must not run an
  // all-groups scan to render its subtitle.
  const myBudget = me ? await getMyGlobalBudgetRows(db, me.id) : [];
  return {
    me,
    contactCount: allPersons.filter(p => !p.is_me).length,
    budgetMonthly: rollUpBudgets(myBudget, 'monthly', new Date()).amount,
    categoryCount: count,
    pendingCount: await getPendingCount(db),
  };
}

/** Every group's transactions as one CSV. */
export async function exportAllGroups(db: SQLite.SQLiteDatabase) {
  return buildAllGroupsExportCsv(db, await getAllGroups(db));
}

export const saveMyName = updatePersonName;
/** Your own UPI handle; empty clears it. */
export const saveMyVpa = setPersonUpiVpa;
