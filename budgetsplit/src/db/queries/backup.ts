import * as SQLite from 'expo-sqlite';
import { seedGlobalCategories } from '../seedCategories';
import { BACKUP_TABLES, assertSafeColumnNames, type BackupTables } from '../../lib/backup';

/**
 * The SQL half of backup/restore — `lib/backup.ts` owns the pure shaping,
 * validation and crypto; this file only reads/writes SQLite. Both the read and
 * the restore are schema-agnostic (`SELECT *` / dynamic `INSERT`), so adding a
 * column to any table needs no change here.
 */

export async function readAllTables(db: SQLite.SQLiteDatabase): Promise<BackupTables> {
  const tables = {} as BackupTables;
  for (const name of BACKUP_TABLES) {
    tables[name] = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${name}`);
  }
  return tables;
}

/**
 * Wipes every backed-up table and reinserts every row from `tables`, in one
 * transaction. Whole-replace, not a merge — this is meant for "recover after
 * losing the phone," where the target is an empty (or about-to-be-discarded)
 * database, not a partial reconciliation.
 *
 * Re-seeds the global category catalog afterward (purely additive/idempotent —
 * can only add categories a newer app version introduced since the backup was
 * made). Deliberately does NOT re-run `COLUMN_MIGRATIONS`/one-time fixes: those
 * are guarded by completion markers inside the restored `settings` table, and
 * re-running them against just-restored data risks exactly the kind of silent
 * reclassify/delete `db/schema.ts` itself warns about. A backup restored onto a
 * newer app version than it was made on could in theory make a completed
 * migration look undone — a known, accepted edge case, not fixed here.
 */
export async function restoreAllTables(db: SQLite.SQLiteDatabase, tables: BackupTables): Promise<void> {
  assertSafeColumnNames(tables);

  // PRAGMA foreign_keys is a no-op inside a transaction, so it's toggled
  // outside one — matches the existing precedent in seedDemo.ts's wipeAllData.
  await db.execAsync('PRAGMA foreign_keys=OFF;');
  try {
    await db.withTransactionAsync(async () => {
      for (const name of [...BACKUP_TABLES].reverse()) {
        await db.runAsync(`DELETE FROM ${name}`);
      }
      for (const name of BACKUP_TABLES) {
        for (const row of tables[name]) {
          const keys = Object.keys(row);
          if (keys.length === 0) continue;
          const placeholders = keys.map(() => '?').join(',');
          await db.runAsync(
            `INSERT INTO ${name} (${keys.join(',')}) VALUES (${placeholders})`,
            keys.map(k => row[k] as SQLite.SQLiteBindValue),
          );
        }
      }
    });
  } finally {
    await db.execAsync('PRAGMA foreign_keys=ON;');
  }

  await seedGlobalCategories(db);
}
