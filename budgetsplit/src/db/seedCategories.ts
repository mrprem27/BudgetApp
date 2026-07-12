import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { DEFAULT_CATEGORIES, INCOME_CATEGORIES, TRANSFER_CATEGORIES } from '../constants/categories';

/**
 * Seed the single GLOBAL category catalog (group_id NULL). Idempotent via
 * `INSERT OR IGNORE` on the UNIQUE(name, kind) constraint, so it's safe to call
 * on every DB open and after any data wipe. This is the ONE place categories are
 * created — groups and the demo seeder never make their own copies.
 */
export async function seedGlobalCategories(db: SQLite.SQLiteDatabase): Promise<void> {
  const seed = async (defs: { name: string; icon: string; color: string }[], kind: string) => {
    for (const c of defs) {
      await db.runAsync(
        "INSERT OR IGNORE INTO category (id, group_id, name, icon, color, kind) VALUES (?, NULL, ?, ?, ?, ?)",
        [uuid(), c.name, c.icon, c.color, kind],
      );
    }
  };
  await seed(DEFAULT_CATEGORIES, 'expense');
  await seed(INCOME_CATEGORIES, 'income');
  await seed(TRANSFER_CATEGORIES, 'transfer');
}
