import type * as SQLite from 'expo-sqlite';
import { getCategories, type Category } from '../db/queries/categories';
import { getFinanceSnapshot } from '../db/queries/engineSnapshot';
import type { FinanceSnapshot } from './engine/types';

/** What the Afford screen asks the engine with: one snapshot, and the category chips. */
export async function loadAffordData(db: SQLite.SQLiteDatabase): Promise<{ snapshot: FinanceSnapshot; categories: Category[] }> {
  const [snapshot, categories] = await Promise.all([getFinanceSnapshot(db), getCategories(db)]);
  return { snapshot, categories };
}
