import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';

export type CategoryKind = 'expense' | 'income' | 'transfer';

export type Category = {
  id: string;
  /** NULL = global catalog (the only kind of category now). */
  group_id: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  kind: CategoryKind;
  section: string | null;
};

/** The whole global catalog for a kind (categories are no longer per-group). */
export async function getCategories(
  db: SQLite.SQLiteDatabase,
  kind: CategoryKind = 'expense',
): Promise<Category[]> {
  return db.getAllAsync<Category>(
    'SELECT * FROM category WHERE kind = ? ORDER BY name ASC',
    [kind],
  );
}

/** txn.kind values that map to each category kind (settlements → 'transfer'). */
const TXN_KINDS_FOR: Record<CategoryKind, string[]> = {
  expense: ['expense'],
  income: ['income'],
  transfer: ['settlement'],
};

/**
 * Category names used on transactions of a kind that are NOT in the global
 * catalog — "uncategorized" (from imports, renames, or a co-member's category).
 * Returned with usage counts, most-used first. These fold into "Others" in
 * analytics until adopted.
 */
export async function getUncategorizedNames(
  db: SQLite.SQLiteDatabase,
  kind: CategoryKind = 'expense',
): Promise<Array<{ name: string; count: number }>> {
  const txnKinds = TXN_KINDS_FOR[kind];
  const placeholders = txnKinds.map(() => '?').join(',');
  return db.getAllAsync<{ name: string; count: number }>(
    `SELECT t.category AS name, COUNT(*) AS count
       FROM txn t
      WHERE t.is_deleted = 0
        AND t.kind IN (${placeholders})
        AND t.category NOT IN (SELECT name FROM category WHERE kind = ?)
      GROUP BY t.category
      ORDER BY count DESC, name ASC`,
    [...txnKinds, kind],
  );
}

/**
 * The global catalog for a kind, ordered by how often each category has been
 * used **in the given group** (most-used first, per the "current-group-first"
 * rule), then alphabetically. The catalog itself is global; `groupId` only
 * scopes the usage ranking so Quick Add stays relevant in-context.
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
     WHERE c.kind = ?
     ORDER BY COALESCE(u.cnt, 0) DESC, c.name ASC`,
    [groupId, kind],
  );
}

/** Insert a category into the global catalog (group_id is always NULL now). */
export async function insertCategory(
  db: SQLite.SQLiteDatabase,
  name: string,
  icon: string | null,
  color: string | null,
  kind: CategoryKind = 'expense',
  section: string | null = null,
): Promise<Category> {
  const id = uuid();
  await db.runAsync(
    'INSERT INTO category (id, group_id, name, icon, color, kind, section) VALUES (?, NULL, ?, ?, ?, ?, ?)',
    [id, name, icon, color, kind, section],
  );
  return { id, group_id: null, name, icon, color, kind, section };
}

/**
 * Delete a category and its matching budget line. Budget lines key off the
 * category *name* (not its id), so deleting only the `category` row used to
 * leave an orphan `category_budget` that no UI could reach. Past `txn.category`
 * strings are intentionally kept — they're historical labels, not live links.
 */
/**
 * Rename a category and propagate the new name to every transaction and budget
 * line that used the old one, across ALL groups. Categories are global and key
 * off the name string (not an id), so this keeps every past reference in sync in
 * one transaction. Caller must ensure `newName` isn't already used by another
 * category of the same kind (the category UNIQUE(name,kind) constraint rejects it).
 */
export async function renameCategory(db: SQLite.SQLiteDatabase, categoryId: string, newName: string): Promise<void> {
  const n = newName.trim();
  if (!n) return;
  await db.withTransactionAsync(async () => {
    const cat = await db.getFirstAsync<{ name: string }>(
      'SELECT name FROM category WHERE id = ?', [categoryId],
    );
    if (!cat || cat.name === n) return;
    await db.runAsync('UPDATE category SET name = ? WHERE id = ?', [n, categoryId]);
    await db.runAsync('UPDATE txn SET category = ? WHERE category = ?', [n, cat.name]);
    await db.runAsync('UPDATE category_budget SET category = ? WHERE category = ?', [n, cat.name]);
  });
}

/**
 * Remove a category from the global catalog. Past transactions keep their name
 * label (they become "uncategorized" → folded into Others until re-adopted).
 * Budget lines for the name are dropped across all groups.
 */
export async function deleteCategory(db: SQLite.SQLiteDatabase, categoryId: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    const cat = await db.getFirstAsync<{ name: string }>(
      'SELECT name FROM category WHERE id = ?', [categoryId],
    );
    await db.runAsync('DELETE FROM category WHERE id = ?', [categoryId]);
    if (cat) {
      await db.runAsync('DELETE FROM category_budget WHERE category = ?', [cat.name]);
    }
  });
}
