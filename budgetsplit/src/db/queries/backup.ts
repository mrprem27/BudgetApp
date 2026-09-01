import * as SQLite from 'expo-sqlite';
import { File, Directory, Paths } from 'expo-file-system';
import { seedGlobalCategories } from '../seedCategories';
import { BACKUP_TABLES, assertSafeColumnNames, type BackupTables, type BackupPhotos } from '../../lib/backup';
import { collectPhotoUris, photoKey, rewritePhotoUris } from '../../lib/backupPhotos';
import { applyLaunchInvariants } from '../schema';

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
/**
 * `settings` keys that are DEVICE state, not user data, and must never travel in
 * a backup.
 *
 * The table mixes two unrelated things. `money.*` is real user data — opening
 * cash, investments, the credit-card baseline — and losing it on restore would
 * silently reset someone's net worth. The one-time-fix markers are the opposite:
 * they record what has already been done to *this* database.
 *
 * Restoring them either way is a bug, and the dangerous direction is the one the
 * checklist does not mention. Restore is DELETE-then-INSERT, so a marker present
 * on the device but absent from an older snapshot gets **removed** — and the fix
 * re-runs on the next launch. `fix_income_category_kind_v1` re-running trips
 * `UNIQUE(name, kind)`, and `applyOneTimeFixes` throwing takes the whole app to
 * the "Couldn't start BudgetSplit" screen, permanently.
 *
 * `sync.` is the second family, for a different reason: those keys describe THIS
 * device's conversation with the server — the pull cursor per group, and the
 * roster version the server last accepted. They are not user data and they do not
 * belong to a backup.
 *
 * The cursor is the one that loses data, and it loses it silently. Restore device
 * A's backup onto device B and B inherits A's pull position — so every entry
 * between B's real position and A's is fetched by nobody: it is behind the cursor
 * from the first sync onwards and never comes back. Pulling from too FAR BACK is
 * harmless by comparison, because every ingest is idempotent and answers `stale`.
 * Asymmetric, so take the cheap side and start from nothing.
 *
 * A restored roster version is milder: it collides at a number the server has
 * already used, and `drainRosters` records the version the 409 reports and leaves
 * the group dirty, so the next sync lands. One wasted round trip, not a permanent
 * state — but still not something a backup should be carrying.
 *
 * Prefix-matched rather than an exact list so a new `fix_*` or `sync.*` cannot be
 * forgotten.
 */
function isDeviceOnlySetting(key: string): boolean {
  return key.startsWith('fix_') || key.startsWith('sync.') || key === 'category_global_v1';
}

export async function restoreAllTables(db: SQLite.SQLiteDatabase, tables: BackupTables): Promise<void> {
  assertSafeColumnNames(tables);

  // PRAGMA foreign_keys is a no-op inside a transaction, so it's toggled
  // outside one — matches the existing precedent in seedDemo.ts's wipeAllData.
  await db.execAsync('PRAGMA foreign_keys=OFF;');
  try {
    /*
     * EXCLUSIVE, not the default deferred transaction.
     *
     * `withTransactionAsync` lets other async queries on the same connection
     * interleave — which for a wipe-and-replace means a screen's loader can read
     * a half-empty database and render it as fact, or a write can land between the
     * DELETE and the INSERT and be destroyed by neither.
     *
     * This is the one operation in the app where that matters enough to take the
     * whole connection: everything else is additive.
     */
    await db.withExclusiveTransactionAsync(async () => {
      /*
       * The outbox is not in BACKUP_TABLES — it is this device's delivery queue,
       * not user data — but it still has to be CLEARED here, and that half was
       * missing.
       *
       * `sync_outbox.entry_id REFERENCES txn(id)`, and every txn is about to be
       * deleted. Leaving the queue behind points every row at an id that no longer
       * exists: the Sync screen counts changes "waiting to go up" that cannot be
       * read, and the first drain walks rows whose entries are gone.
       *
       * Dropped rather than re-queued deliberately. A restore is refused while
       * sync is on (F9), so nothing is in flight; re-queueing would instead mean
       * pushing a restored snapshot at the group. Reconciliation is the sync
       * engine's job when sync is next turned on, from what is actually here.
       */
      await db.runAsync('DELETE FROM sync_outbox');

      for (const name of [...BACKUP_TABLES].reverse()) {
        if (name === 'settings') {
          // Everything EXCEPT this device's own migration markers. Wiping those
          // makes a completed fix look undone and re-runs it. See above.
          await db.runAsync(
            `DELETE FROM settings WHERE key NOT LIKE 'fix\\_%' ESCAPE '\\' AND key <> 'category_global_v1'`,
          );
          continue;
        }
        await db.runAsync(`DELETE FROM ${name}`);
      }
      for (const name of BACKUP_TABLES) {
        for (const row of tables[name]) {
          // ...and never take a marker FROM a backup either: it would mark a fix
          // done on a device that never ran it.
          if (name === 'settings' && isDeviceOnlySetting(String(row.key))) continue;
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
    /*
     * Back to OFF, which is what `applyConnectionPragmas` sets on EVERY connection.
     *
     * This said `ON`, and it runs on the shared provider connection every screen
     * writes through — so from the first restore onward that connection enforced
     * constraints the delete paths cannot satisfy, and `deleteGroup` started
     * throwing `FOREIGN KEY constraint failed` on a device where it had always
     * worked. That is precisely the same-code-two-behaviours bug the pragma work
     * on this branch exists to kill, reintroduced from inside it.
     */
    await db.execAsync('PRAGMA foreign_keys=OFF;');
  }

  await seedGlobalCategories(db);

  /*
   * The restored data may be from BEFORE a schema invariant existed, and this is
   * the one path that installs new data without a cold start.
   *
   * A backup written before the asset register carries `money.investments` in
   * `settings` and no `asset` rows. Without this, net worth reads ₹0 invested on
   * exactly the screen somebody opens right after recovering their phone — and if
   * they re-create the asset by hand, the next launch converts the key too and
   * counts the same money twice.
   */
  await applyLaunchInvariants((sql) => db.execAsync(sql));
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

/**
 * Delete photo files that nothing in the database points at any more.
 *
 * The existing reaper is **row-driven**: it looks for soft-deleted transactions
 * and unlinks their receipts. That cannot see the case a restore creates, because
 * a restore HARD-deletes every old row — so the previous install's receipts and
 * avatars are left on disk with nothing referencing them, invisible to the reaper
 * forever and still counted on the storage screen.
 *
 * This one is file-driven: list what is on disk, subtract what the database
 * names, delete the rest. That is the only direction that can find a file whose
 * row is already gone.
 *
 * Deliberately run AFTER the restore transaction commits. Running it before would
 * mean deciding what is unreferenced from a database that is about to be
 * replaced — which would delete exactly the files the restore is about to need.
 */
export async function reapUnreferencedPhotos(db: SQLite.SQLiteDatabase): Promise<number> {
  const rows = await db.getAllAsync<{ uri: string }>(
    `SELECT attachment_uri AS uri FROM txn WHERE attachment_uri IS NOT NULL
     UNION SELECT image_uri FROM person WHERE image_uri IS NOT NULL`,
  );
  // Matched on basename, the same key the backup uses, because the directory
  // prefix changes on every install and the filename is what is actually stable.
  const referenced = new Set(rows.map(r => photoKey(r.uri)));

  let removed = 0;
  for (const dir of [RECEIPT_DIR, AVATAR_DIR]) {
    if (!dir.exists) continue;
    for (const entry of dir.list()) {
      if (!(entry instanceof File)) continue;
      if (referenced.has(photoKey(entry.uri))) continue;
      try {
        entry.delete();
        removed++;
      } catch {
        // A file we cannot remove is a leak, not a failure. Never let tidying up
        // disk space turn a completed restore into a reported error.
      }
    }
  }
  return removed;
}
