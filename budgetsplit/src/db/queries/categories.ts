import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';

export type CategoryKind = 'expense' | 'income';

export type Category = {
  id: string;
  group_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  kind: CategoryKind;
};

export async function getCategoriesForGroup(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  kind: CategoryKind = 'expense',
): Promise<Category[]> {
  return db.getAllAsync<Category>(
    'SELECT * FROM category WHERE group_id = ? AND kind = ? ORDER BY name ASC',
    [groupId, kind],
  );
}

/**
 * Categories ordered by how often they've been used in this group (most used
 * first), then alphabetically. Filtered to the given kind (expense by default).
 */
export async function getCategoriesByFrequency(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  kind: CategoryKind = 'expense',
): Promise<Category[]> {
  return db.getAllAsync<Category>(
    `SELECT c.* FROM category c
       LEFT JOIN (
         SELECT category, COUNT(*) AS cnt
         FROM txn
         WHERE group_id = ? AND is_deleted = 0
         GROUP BY category
       ) u ON u.category = c.name
     WHERE c.group_id = ? AND c.kind = ?
     ORDER BY COALESCE(u.cnt, 0) DESC, c.name ASC`,
    [groupId, groupId, kind],
  );
}

export async function insertCategory(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  name: string,
  icon: string | null,
  color: string | null,
  kind: CategoryKind = 'expense',
): Promise<Category> {
  const id = uuid();
  await db.runAsync(
    'INSERT INTO category (id, group_id, name, icon, color, kind) VALUES (?, ?, ?, ?, ?, ?)',
    [id, groupId, name, icon, color, kind],
  );
  return { id, group_id: groupId, name, icon, color, kind };
}

export async function deleteCategory(db: SQLite.SQLiteDatabase, categoryId: string): Promise<void> {
  await db.runAsync('DELETE FROM category WHERE id = ?', [categoryId]);
}
