import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';

export type BudgetCadence = 'once' | 'daily' | 'monthly' | 'yearly';

export type CategoryBudget = {
  id: string;
  group_id: string;
  category: string;
  cadence: BudgetCadence;
  amount: number; // paise
};

/**
 * All budget lines for a group — one per category, each with its own cadence.
 * Budget cadence is independent of transaction recurrence (Spec §18).
 */
export async function getCategoryBudgets(
  db: SQLite.SQLiteDatabase,
  groupId: string,
): Promise<CategoryBudget[]> {
  const rows = await db.getAllAsync<CategoryBudget & { period?: string }>(
    'SELECT id, group_id, category, cadence, amount FROM category_budget WHERE group_id = ?',
    [groupId],
  );
  // De-dupe by category (legacy data may have had monthly+yearly rows) — keep last.
  const byCategory = new Map<string, CategoryBudget>();
  for (const r of rows) {
    byCategory.set(r.category, {
      id: r.id, group_id: r.group_id, category: r.category,
      cadence: (r.cadence ?? 'monthly') as BudgetCadence, amount: r.amount,
    });
  }
  return Array.from(byCategory.values());
}

/**
 * Replaces the full set of budget lines for a group in one transaction.
 * Entries with amount <= 0 are dropped. The legacy `period` column is written
 * as a constant so the table's UNIQUE(group_id, category, period) yields exactly
 * one row per category.
 */
export async function setCategoryBudgets(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  entries: Array<{ category: string; cadence: BudgetCadence; amount: number }>,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM category_budget WHERE group_id = ?', [groupId]);
    for (const e of entries) {
      if (e.amount > 0) {
        await db.runAsync(
          'INSERT INTO category_budget (id, group_id, category, period, cadence, amount) VALUES (?, ?, ?, ?, ?, ?)',
          [uuid(), groupId, e.category, 'monthly', e.cadence, e.amount],
        );
      }
    }
  });
}
