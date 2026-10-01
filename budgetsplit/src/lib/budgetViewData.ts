import type * as SQLite from 'expo-sqlite';
import { getMe } from '../db/queries/persons';
import { getBudgetView, type BudgetView, type Period } from './budget';

/** The Budget tab at one period: My Budget (`groupId` null) or one group's. */
export async function loadBudgetView(db: SQLite.SQLiteDatabase, groupId: string | null, target: Period): Promise<BudgetView | null> {
  const me = await getMe(db);
  return me ? getBudgetView(db, me.id, groupId, target) : null;
}
