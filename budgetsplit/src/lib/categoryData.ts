import type * as SQLite from 'expo-sqlite';
import { getCategories, getUncategorizedNames } from '../db/queries/categories';
import { seedGlobalCategories } from '../db/seedCategories';
import type { CategoryKind } from '../constants/enums';

/** One kind's catalog, and the names in use that no category claims yet. */
export async function loadCategoryCatalog(db: SQLite.SQLiteDatabase, kind: CategoryKind) {
  let categories = await getCategories(db, kind);
  // Self-heal: the base catalog is app structure and should never be empty.
  // If it is (e.g. an older DB that once wiped categories), reseed defaults.
  if (categories.length === 0) {
    await seedGlobalCategories(db);
    categories = await getCategories(db, kind);
  }
  return { categories, uncategorized: await getUncategorizedNames(db, kind) };
}
