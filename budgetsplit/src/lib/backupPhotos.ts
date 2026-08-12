import type { BackupTables } from './backup';

/**
 * Photos referenced by the database, and what to do with them on restore.
 *
 * Backups carried **rows only**, so every restore landed with `attachment_uri`
 * and `image_uri` pointing at files that no longer existed — and the UI happily
 * announced "Receipt attached" over a blank square. Two separate faults: the
 * photo was never in the backup, and its absence was never detected.
 *
 * Even with the bytes included, the stored URIs cannot be restored verbatim. They
 * are absolute paths under the app's document directory, and iOS gives an app a
 * **new container path on every install** — which is precisely the case a restore
 * happens in. So a restore has to write the bytes into the current directory and
 * rewrite every URI to match; carrying the old string over would leave the same
 * broken state the photos were added to fix.
 *
 * Pure. All file IO lives in `db/queries/backup.ts`.
 */

/** Columns holding a local photo path, as `[table, column]`. */
export const PHOTO_COLUMNS: ReadonlyArray<readonly [keyof BackupTables, string]> = [
  ['txn', 'attachment_uri'],
  ['person', 'image_uri'],
];

/** A local file we can read. Remote/data URIs are left exactly as they are. */
export function isLocalPhoto(uri: unknown): uri is string {
  return typeof uri === 'string' && uri.startsWith('file://');
}

/**
 * Stable key for a photo inside the backup envelope.
 *
 * The basename only — the directory is meaningless on the restoring device, and
 * both writers already mint unique names (`uuid().ext` for receipts,
 * `personId_timestamp.jpg` for avatars). Stripped of anything that could escape
 * the target directory, because this string is attacker-controlled once a backup
 * file can come from outside.
 */
export function photoKey(uri: string): string {
  const base = uri.split('/').pop() ?? '';
  return base.replace(/[^A-Za-z0-9._-]/g, '_');
}

/** Every distinct local photo URI referenced by the tables. */
export function collectPhotoUris(tables: BackupTables): string[] {
  const seen = new Set<string>();
  for (const [table, column] of PHOTO_COLUMNS) {
    for (const row of tables[table] ?? []) {
      const uri = row[column];
      if (isLocalPhoto(uri)) seen.add(uri);
    }
  }
  return [...seen];
}

/**
 * Point every photo column at wherever the restoring device actually put the
 * file. `resolve` returns the new URI, or null when the backup did not carry that
 * photo — in which case the column is **nulled** rather than left dangling, so
 * the UI stops claiming a receipt that is not there.
 *
 * Returns a new object; the input is not mutated.
 */
export function rewritePhotoUris(
  tables: BackupTables,
  resolve: (uri: string) => string | null,
): BackupTables {
  const out = { ...tables } as BackupTables;
  for (const [table, column] of PHOTO_COLUMNS) {
    const rows = tables[table];
    if (!rows) continue;
    out[table] = rows.map(row => {
      const uri = row[column];
      if (!isLocalPhoto(uri)) return row;
      return { ...row, [column]: resolve(uri) };
    });
  }
  return out;
}

/** Rough byte size of a base64 payload, for the "this will be larger" warning. */
export function base64Bytes(b64: string): number {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, (b64.length * 3) / 4 - padding);
}
