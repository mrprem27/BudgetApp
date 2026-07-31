import 'react-native-get-random-values';
import CryptoJS from 'crypto-js';
import { format } from 'date-fns';

/**
 * Pure shaping/validation/crypto for the encrypted backup/restore feature —
 * no `db`, no RN beyond the crypto polyfill import, genuinely unit-testable.
 * The SQL reads/writes live in `db/queries/backup.ts`.
 *
 * There is no cloud sync here — this builds a passphrase-encrypted snapshot the
 * user hands to the OS share sheet (Files/iCloud Drive/Google Drive/etc.). The
 * passphrase is never stored on-device: a Keychain-derived key would be lost
 * along with a lost phone, defeating the entire point of this feature. This
 * means a forgotten passphrase makes its backup permanently unrecoverable —
 * by design, not an oversight.
 */

export const BACKUP_VERSION = 1;

/** Forward (insert) order — parents before children, traced from every
 *  `REFERENCES` in `db/schema.ts`. Reverse this order for deletes. */
export const BACKUP_TABLES = [
  'person', 'budget_group', 'group_member', 'category', 'category_budget',
  'txn', 'recur_skip', 'line_item', 'txn_share', 'txn_payment',
  'savings_goal', 'savings_txn', 'pending_txn', 'audit_log', 'settings',
] as const;

export type BackupTableName = typeof BACKUP_TABLES[number];
export type BackupTables = Record<BackupTableName, Record<string, unknown>[]>;
export type BackupPayload = { v: number; createdAt: number; tables: BackupTables };
export type BackupEnvelope = { v: number; createdAt: number; ciphertext: string };

/** Wrong passphrase (or a corrupted/foreign file) — decryption produced
 *  garbage, not valid JSON. Indistinguishable from each other by design (an
 *  attacker shouldn't be able to tell "wrong password" from "not a backup"). */
export class BackupWrongPassphraseError extends Error {}

/** Decrypted fine, but the shape is wrong — a tampered file, or a backup from
 *  an incompatible (future or ancient) app version. */
export class BackupCorruptError extends Error {}

export function buildBackupPayload(tables: BackupTables): BackupPayload {
  return { v: BACKUP_VERSION, createdAt: Date.now(), tables };
}

/** "budgetsplit-backup-2026-07-28.bsbackup" */
export function backupFileName(date: Date = new Date()): string {
  return `budgetsplit-backup-${format(date, 'yyyy-MM-dd')}.bsbackup`;
}

export function encryptPayload(payload: BackupPayload, passphrase: string): BackupEnvelope {
  const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(payload), passphrase).toString();
  return { v: BACKUP_VERSION, createdAt: payload.createdAt, ciphertext };
}

/**
 * Throws `BackupWrongPassphraseError` when decryption/parsing fails (covers a
 * wrong passphrase, a non-backup file, or corruption severe enough to break
 * JSON parsing), or `BackupCorruptError` when it parses fine but the shape is
 * wrong (a tampered file, or an incompatible version) — that distinction is
 * deliberate: a wrong-passphrase retry should look different from "this isn't
 * a valid backup at all."
 */
export function decryptEnvelope(envelope: BackupEnvelope, passphrase: string): BackupPayload {
  let text = '';
  try {
    text = CryptoJS.AES.decrypt(envelope.ciphertext, passphrase).toString(CryptoJS.enc.Utf8);
  } catch {
    text = '';
  }
  if (!text) {
    throw new BackupWrongPassphraseError('Could not decrypt this backup — check the passphrase and try again.');
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BackupWrongPassphraseError('Could not decrypt this backup — check the passphrase and try again.');
  }
  return validateBackupPayload(json);
}

export function validateBackupPayload(json: unknown): BackupPayload {
  if (!json || typeof json !== 'object') throw new BackupCorruptError('Not a valid BudgetSplit backup file.');
  const obj = json as Record<string, unknown>;
  if (obj.v !== BACKUP_VERSION) throw new BackupCorruptError('This backup was made by an incompatible app version.');
  if (typeof obj.createdAt !== 'number') throw new BackupCorruptError('Not a valid BudgetSplit backup file.');
  if (!obj.tables || typeof obj.tables !== 'object') throw new BackupCorruptError('Not a valid BudgetSplit backup file.');
  const tables = obj.tables as Record<string, unknown>;
  for (const name of BACKUP_TABLES) {
    if (!Array.isArray(tables[name])) throw new BackupCorruptError(`Backup is missing the "${name}" table.`);
  }
  return { v: obj.v as number, createdAt: obj.createdAt, tables: tables as BackupTables };
}

const SAFE_COLUMN_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Defensive: every column key must look like a real SQLite identifier before
 *  `restoreAllTables` ever interpolates it into an INSERT column list. A
 *  malformed/tampered backup should fail loudly here, not run arbitrary SQL. */
export function assertSafeColumnNames(tables: BackupTables): void {
  for (const [tableName, rows] of Object.entries(tables)) {
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (!SAFE_COLUMN_RE.test(key)) {
          throw new BackupCorruptError(`Backup contains an unsafe column name "${key}" in "${tableName}".`);
        }
      }
    }
  }
}
