import * as SQLite from 'expo-sqlite';
import { File, Directory, Paths } from 'expo-file-system';
import { seedGlobalCategories } from '../seedCategories';
import { BACKUP_TABLES, assertSafeColumnNames, type BackupTables, type BackupPhotos } from '../../lib/backup';
import { collectPhotoUris, photoKey, rewritePhotoUris } from '../../lib/backupPhotos';

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

// --- Photo files ---------------------------------------------------------
//
// Receipts and avatars are files on disk; the database only holds their paths.
// Both directories are recreated here on restore because an install that has
// never attached anything does not have them yet.

const RECEIPT_DIR = new Directory(Paths.document, 'attachments');
const AVATAR_DIR = new Directory(Paths.document, 'avatars');

/** Which directory a restored photo belongs in, inferred from its source path. */
function dirFor(uri: string): Directory {
  return uri.includes('/avatars/') ? AVATAR_DIR : RECEIPT_DIR;
}

/**
 * Read every photo the tables reference, as base64 keyed by `photoKey`.
 *
 * A file that has already gone missing is skipped rather than failing the whole
 * backup — the row is stale either way, and refusing to back up 400 transactions
 * because one receipt was deleted outside the app would be the worse trade.
 */
export async function readPhotoFiles(tables: BackupTables): Promise<BackupPhotos> {
  const photos: BackupPhotos = {};
  for (const uri of collectPhotoUris(tables)) {
    try {
      const file = new File(uri);
      if (!file.exists) continue;
      photos[photoKey(uri)] = await file.base64();
    } catch {
      // Unreadable for any reason — treated exactly like missing.
    }
  }
  return photos;
}

/**
 * Write the backed-up photos into *this* install's directories and return the
 * tables with every photo URI repointed at them.
 *
 * Paths cannot be reused verbatim: they are absolute paths into the app
 * container, and iOS issues a new container on every install — which is the only
 * situation a restore happens in. A photo the backup did not carry has its column
 * nulled, so nothing claims a receipt that is not on disk.
 */
export async function restorePhotoFiles(
  tables: BackupTables,
  photos: BackupPhotos | undefined,
): Promise<BackupTables> {
  if (!photos || Object.keys(photos).length === 0) {
    // Rows-only backup: every photo path in it is dead on this device.
    return rewritePhotoUris(tables, () => null);
  }

  const written = new Map<string, string>();
  for (const uri of collectPhotoUris(tables)) {
    const key = photoKey(uri);
    const b64 = photos[key];
    if (!b64) continue;
    try {
      const dir = dirFor(uri);
      if (!dir.exists) dir.create({ intermediates: true });
      const file = new File(dir, key);
      if (file.exists) file.delete();
      file.create();
      await file.write(b64, { encoding: 'base64' });
      written.set(uri, file.uri);
    } catch {
      // Leave it unwritten; the rewrite below nulls it rather than pointing at
      // a file that failed to land.
    }
  }
  return rewritePhotoUris(tables, uri => written.get(uri) ?? null);
}
