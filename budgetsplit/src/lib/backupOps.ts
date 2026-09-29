import type * as SQLite from 'expo-sqlite';
import {
  readAllTables, restoreAllTables, readPhotoFiles, restorePhotoFiles, reapUnreferencedPhotos,
} from '../db/queries/backup';
import { linkedUser } from '../db/queries/syncApply';
import { settings } from './settings';
import type { BackupPayload } from './backup';

/** Every table, as the backup reads it. */
export const readBackupTables = readAllTables;
/** The receipt photos a backup can carry, for the tables it is about to write. */
export const readBackupPhotos = readPhotoFiles;

/** Whether this phone keeps an account in sync — restore refuses over a synced ledger. */
export async function isLinkedToAccount(db: SQLite.SQLiteDatabase): Promise<boolean> {
  return Boolean(await linkedUser(db));
}

/** Replace everything on this phone with the backup, then re-anchor the reminder to it. */
export async function restoreBackup(db: SQLite.SQLiteDatabase, payload: BackupPayload): Promise<void> {
  // Photos first: the tables come back with every photo URI repointed at this
  // install's directories, or nulled where the backup did not carry the file.
  // Restoring the rows verbatim is what left every restore showing "Receipt
  // attached" over a path that no longer exists.
  const tables = await restorePhotoFiles(payload.tables, payload.photos);
  await restoreAllTables(db, tables);
  /*
   * The previous install's receipts and avatars, now referenced by nothing.
   *
   * A restore hard-deletes every old row, which puts those files beyond the
   * ordinary reaper forever — it looks for soft-deleted transactions, and
   * these have no row at all. They would sit on disk being counted on the
   * storage screen for the life of the install.
   *
   * After the transaction commits, never before: deciding what is
   * unreferenced from a database about to be replaced would delete exactly
   * the files the restore is about to need.
   */
  await reapUnreferencedPhotos(db).catch(() => {});
  /*
   * Stamped with the BACKUP's date, not now. Restoring is not backing up, and
   * dating it now makes Settings read "Backed up just now" when the newest
   * backup that exists may be six months old — the same class of lie the
   * anchor exists to kill, reintroduced on the way back in.
   *
   * It follows that restoring an old backup makes the nudge fire immediately
   * rather than go quiet for a month. That is correct: a phone holding
   * six-month-old data is exactly when a fresh backup matters most.
   */
  await settings.setBackupAnchorAt(payload.createdAt);
  await settings.setLastBackupAt(payload.createdAt);
}
