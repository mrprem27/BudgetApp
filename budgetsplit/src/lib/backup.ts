import 'react-native-get-random-values';
import CryptoJS from 'crypto-js';
import { AESEncryptionKey, AESSealedData, aesEncryptAsync, aesDecryptAsync, getRandomBytesAsync } from 'expo-crypto';
import { format } from 'date-fns';
import { base64ToBytes, bytesToBase64 } from './bytes';
import { pbkdf2Sha256 } from './pbkdf2';

/**
 * Pure shaping/validation/crypto for the encrypted backup/restore feature —
 * no `db`, no RN beyond the crypto polyfill import, genuinely unit-testable.
 * The SQL reads/writes live in `db/queries/backup.ts`.
 *
 * There is no cloud sync here — this builds a passphrase-encrypted snapshot the
 * user hands to the OS share sheet (Files/iCloud Drive/Google Drive/etc.), or, in
 * a build with an account configured, uploads as-is via `lib/serverApi.ts`. That
 * second destination changes nothing in this file on purpose: the server receives
 * the same opaque envelope and cannot open it either. The
 * passphrase is never stored on-device: a Keychain-derived key would be lost
 * along with a lost phone, defeating the entire point of this feature. This
 * means a forgotten passphrase makes its backup permanently unrecoverable —
 * by design, not an oversight.
 */

export const BACKUP_VERSION = 1;

/**
 * Which CIPHER an envelope was sealed with — deliberately separate from
 * `BACKUP_VERSION`, which versions the *payload schema*.
 *
 * They are one number today and that is a trap: adding a table would bump the
 * schema version and, if the two stayed conflated, would also change which
 * decryptor runs. Two unrelated concerns, two constants.
 *
 * `envelope.v` has been written into every backup ever made and **read by
 * nothing** — so every file on disk already carries the version this dispatches
 * on. That is the whole reason a cipher change is survivable here.
 */
export const CIPHER_V1_CRYPTOJS = 1;

/**
 * AES-256-GCM, native, via `expo-crypto`.
 *
 * v1 was `crypto-js` AES-CBC with an MD5-derived key at ONE iteration — the
 * OpenSSL `EVP_BytesToKey` default. That is not a key derivation so much as a
 * formality: it is trivially brute-forced, and CBC is unauthenticated, so a
 * tampered file decrypts to garbage rather than being rejected.
 *
 * The cipher is native and already installed — no new dependency, and nothing for
 * the pending Android port to build. Only the KDF is missing from `expo-crypto`,
 * and `crypto-js`'s PBKDF2 covers it (and has to stay anyway, to read v1 files).
 */
export const CIPHER_V2_AESGCM = 2;

/** The newest cipher — what a NEW backup is written with. */
export const CIPHER_CURRENT = CIPHER_V2_AESGCM;

/**
 * Can this build open an envelope sealed with this cipher?
 *
 * Exported because the answer is needed in three places — the decryptor and both
 * pick-time guards — and the last time it was written out by hand in each, the
 * screens kept a list that said v1-only while `encryptPayload` had already moved to
 * v2. Every backup this build made was refused at the picker with "made by a newer
 * version", and the passphrase sheet never opened: restore was dead, for everyone,
 * and the file was always fine.
 *
 * A copy of a list is not a check. Adding v3 must be one edit here, not three.
 */
export function canReadCipher(v: number | undefined): boolean {
  const cipher = v ?? CIPHER_V1_CRYPTOJS;
  return cipher === CIPHER_V1_CRYPTOJS || cipher === CIPHER_V2_AESGCM;
}

/**
 * PBKDF2-SHA256 rounds.
 *
 * Pure JS on Hermes, on the same thread that draws the screen — so this number is
 * a frozen app, not an abstraction. Measured on Node: 10k ~126ms, 50k ~269ms,
 * 150k ~808ms, and a phone is roughly 3-5x slower again.
 *
 * 50k is the deliberate pilot choice: under a second on a device, and still
 * ~50,000x more work per guess than v1, which used ONE MD5 round. The gap between
 * one round and fifty thousand is the part that matters; 50k to 150k is a
 * refinement.
 *
 * Stored per envelope rather than assumed, so raising it later costs nothing and
 * orphans no existing backup.
 *
 * The derivation now yields to the event loop as it runs (`lib/pbkdf2.ts`), so the
 * cost no longer lands on the user as a screen that looks hung — which is what
 * makes raising this further a real option rather than a trade.
 */
export const KDF_ITERATIONS = 50_000;

/**
 * A backup sealed by a NEWER version of the app than this one.
 *
 * Its own error class on purpose. Without it, an unknown envelope falls into the
 * decryptor, fails, and is reported as `BackupWrongPassphraseError` — telling the
 * user their passphrase is wrong for a file whose passphrase is fine. They retry,
 * fail again, and delete the only copy of their data. A wrong story here is not a
 * cosmetic problem; it is how the backup gets thrown away.
 */
export class BackupVersionError extends Error {}

/** Forward (insert) order — parents before children, traced from every
 *  `REFERENCES` in `db/schema.ts`. Reverse this order for deletes. */
export const BACKUP_TABLES = [
  // `friend_request` sits after `person` because it references it. It IS user
  // data: it holds which local person each invited address was meant for, and
  // losing that on a new phone loses the binding an accepted request depends on.
  'person', 'friend_request', 'budget_group', 'group_member', 'person_group_trust',
  'category', 'category_tombstone', 'category_budget',
  'txn', 'recur_skip', 'line_item', 'txn_share', 'txn_payment', 'txn_approval', 'txn_dispute',
  'savings_goal', 'savings_txn', 'pending_txn', 'audit_log', 'settings',
] as const;

/**
 * Tables that are deliberately NOT backed up, and why.
 *
 * Every table in the schema must appear either here or in `BACKUP_TABLES` —
 * `backupCoverage.test.ts` reads the schema and fails on anything in neither.
 * That guard exists because two tables added in one day ended up in neither list,
 * which meant they were lost on a new phone AND left pointing at deleted parents
 * after a restore. Silently, both ways.
 */
export const NEVER_BACKED_UP: Record<string, string> = {
  sync_outbox:
    'A delivery queue, not user data. Its rows reference txn ids that a restore '
    + 'deletes, so it is emptied by restoreAllTables rather than carried.',
};

/**
 * Tables that did not exist in the first backups, and so may legitimately be
 * absent from a file on disk.
 *
 * Validation below demands every `BACKUP_TABLES` name be present, which means
 * adding a table would otherwise reject **every backup ever written** — and
 * bumping `BACKUP_VERSION` is not an escape, because a version mismatch is
 * rejected first. A missing name here restores as an empty table instead, which
 * is exactly right: the data could not have existed when the file was made.
 *
 * `txn_approval` is safe to default empty for a second reason — a backup written
 * before it existed cannot contain a peer entry, so there is no decision to lose.
 *
 * `category_tombstone` restores empty for older files too, which is the same
 * behaviour those files already had — no worse, and correct from here on.
 */
const OPTIONAL_BACKUP_TABLES = new Set<BackupTableName>([
  'txn_approval', 'category_tombstone', 'person_group_trust', 'txn_dispute',
  'friend_request',
]);

export type BackupTableName = typeof BACKUP_TABLES[number];
export type BackupTables = Record<BackupTableName, Record<string, unknown>[]>;
/**
 * `photos` is optional and opt-in: base64 by `photoKey`. Absent means the user
 * chose rows only, which keeps the file small — a backup with receipts can be
 * many times larger. Old backups simply have no key, and restore treats that the
 * same as "this photo was not included".
 */
export type BackupPhotos = Record<string, string>;
export type BackupPayload = {
  v: number; createdAt: number; tables: BackupTables; photos?: BackupPhotos;
};
export type BackupEnvelope = {
  v: number;
  createdAt: number;
  ciphertext: string;
  /**
   * v2 only. Base64. Random per backup — reusing a salt across two backups would
   * let one derived key open both, which is most of the point of having one.
   */
  salt?: string;
  /** v2 only. Stored, not assumed, so the cost can be raised without orphaning files. */
  iterations?: number;
};

/** Wrong passphrase (or a corrupted/foreign file) — decryption produced
 *  garbage, not valid JSON. Indistinguishable from each other by design (an
 *  attacker shouldn't be able to tell "wrong password" from "not a backup"). */
export class BackupWrongPassphraseError extends Error {}

/** Decrypted fine, but the shape is wrong — a tampered file, or a backup from
 *  an incompatible (future or ancient) app version. */
export class BackupCorruptError extends Error {}

export function buildBackupPayload(tables: BackupTables, photos?: BackupPhotos): BackupPayload {
  // Omitted rather than set to {} when empty, so "no photos" and "photos not
  // requested" look identical on the wire and restore has one case to handle.
  const hasPhotos = photos && Object.keys(photos).length > 0;
  return { v: BACKUP_VERSION, createdAt: Date.now(), tables, ...(hasPhotos ? { photos } : {}) };
}

/** "budgetsplit-backup-2026-07-28.bsbackup" */
export function backupFileName(date: Date = new Date()): string {
  return `budgetsplit-backup-${format(date, 'yyyy-MM-dd')}.bsbackup`;
}

/**
 * Derive a key from a passphrase. PBKDF2-SHA256, because `expo-crypto` has no KDF
 * of any kind and `crypto.subtle` does not exist in React Native.
 *
 * Runs through `pbkdf2Sha256`, which yields to the event loop as it goes. The
 * synchronous `CryptoJS.PBKDF2` held the drawing thread for the whole derivation,
 * so 50,000 iterations was a frozen screen on every backup and every restore —
 * the exact cost `KDF_ITERATIONS` warns about. Output is byte-identical, which is
 * what keeps every backup already written readable.
 */
async function deriveKey(
  passphrase: string,
  saltB64: string,
  iterations: number,
  onProgress?: (fraction: number) => void,
) {
  const key = await pbkdf2Sha256(
    passphrase, CryptoJS.enc.Base64.parse(saltB64), iterations, onProgress,
  );
  return AESEncryptionKey.import(key.toString(CryptoJS.enc.Base64), 'base64');
}

/**
 * Seal a payload. Always writes the CURRENT cipher — v1 is read-only.
 *
 * Async now, where v1 was synchronous, because the native AES API is
 * promise-based. Both call sites were already inside `async` functions.
 */
export async function encryptPayload(
  payload: BackupPayload,
  passphrase: string,
  onProgress?: (fraction: number) => void,
): Promise<BackupEnvelope> {
  // Fresh salt per backup, from the ASYNC randomness. The sync `getRandomBytes`
  // falls back to `Math.random` in development, which is not randomness at all.
  const salt = await getRandomBytesAsync(16);
  const saltB64 = bytesToBase64(salt);
  const key = await deriveKey(passphrase, saltB64, KDF_ITERATIONS, onProgress);

  // A Uint8Array in, so the JSON never passes through `btoa` — that mangles any
  // non-ASCII, and this payload is full of ₹ and real people's names. Silent
  // corruption that only shows up for some users is the worst kind.
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  // The nonce is generated by the cipher (12 bytes) and travels inside `combined`.
  const sealed = await aesEncryptAsync(plaintext, key);

  return {
    v: CIPHER_CURRENT,
    createdAt: payload.createdAt,
    ciphertext: await sealed.combined('base64'),
    salt: saltB64,
    iterations: KDF_ITERATIONS,
  };
}

/**
 * Throws `BackupWrongPassphraseError` when decryption/parsing fails (covers a
 * wrong passphrase, a non-backup file, or corruption severe enough to break
 * JSON parsing), or `BackupCorruptError` when it parses fine but the shape is
 * wrong (a tampered file, or an incompatible version) — that distinction is
 * deliberate: a wrong-passphrase retry should look different from "this isn't
 * a valid backup at all."
 */
export async function decryptEnvelope(
  envelope: BackupEnvelope,
  passphrase: string,
  onProgress?: (fraction: number) => void,
): Promise<BackupPayload> {
  /*
   * Dispatch BEFORE the cipher runs.
   *
   * This used to decrypt first and check the version afterwards, which is
   * backwards in the one way that costs a user their data: hand a file this build
   * cannot read to the decryptor and it fails as "wrong passphrase", so they
   * retry, fail, and delete a file that was never broken.
   *
   * An unknown version is a THIRD outcome — neither wrong-passphrase nor corrupt —
   * because the honest instruction is "update the app", not "try again".
   */
  const cipher = envelope.v ?? CIPHER_V1_CRYPTOJS;
  if (!canReadCipher(cipher)) {
    throw new BackupVersionError(
      'This backup was made by a newer version of BudgetSplit. Update the app, then restore it.',
    );
  }

  const text = cipher === CIPHER_V2_AESGCM
    ? await openV2(envelope, passphrase, onProgress)
    : openV1(envelope, passphrase);

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

/**
 * The v1 reader. **Keep this forever.**
 *
 * Every `.bsbackup` written before the swap is v1, and a backup is the one thing
 * that survives losing the phone. There is no re-encryption pass — a restored v1
 * file only becomes v2 when the user makes a NEW backup — so the tail is as long
 * as the user's habits, not as long as a release cycle. Do not put a removal date
 * on `crypto-js`.
 */
function openV1(envelope: BackupEnvelope, passphrase: string): string {
  try {
    return CryptoJS.AES.decrypt(envelope.ciphertext, passphrase).toString(CryptoJS.enc.Utf8);
  } catch {
    // `enc.Utf8` throws on garbage rather than returning empty — a wrong
    // passphrase and a corrupt file are indistinguishable here, deliberately.
    return '';
  }
}

/** AES-256-GCM. A wrong passphrase fails the tag, so tampering is caught too. */
async function openV2(
  envelope: BackupEnvelope,
  passphrase: string,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  if (!envelope.salt) return '';
  try {
    const key = await deriveKey(
      passphrase, envelope.salt, envelope.iterations ?? KDF_ITERATIONS, onProgress,
    );
    // 12-byte nonce, 16-byte tag — expo-crypto's defaults, and what `combined`
    // was written with.
    const sealed = AESSealedData.fromCombined(base64ToBytes(envelope.ciphertext), {
      ivLength: 12, tagLength: 16,
    });
    const bytes = await aesDecryptAsync(sealed, key);
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

export function validateBackupPayload(json: unknown): BackupPayload {
  if (!json || typeof json !== 'object') throw new BackupCorruptError('Not a valid BudgetSplit backup file.');
  const obj = json as Record<string, unknown>;
  if (obj.v !== BACKUP_VERSION) throw new BackupCorruptError('This backup was made by an incompatible app version.');
  if (typeof obj.createdAt !== 'number') throw new BackupCorruptError('Not a valid BudgetSplit backup file.');
  if (!obj.tables || typeof obj.tables !== 'object') throw new BackupCorruptError('Not a valid BudgetSplit backup file.');
  const tables = obj.tables as Record<string, unknown>;
  for (const name of BACKUP_TABLES) {
    if (Array.isArray(tables[name])) continue;
    // A table added after this file was written restores empty rather than
    // failing the whole file. See OPTIONAL_BACKUP_TABLES.
    if (OPTIONAL_BACKUP_TABLES.has(name) && tables[name] === undefined) {
      tables[name] = [];
      continue;
    }
    throw new BackupCorruptError(`Backup is missing the "${name}" table.`);
  }
  // `photos` is optional by design — a rows-only backup is valid, and so is one
  // written before photos existed at all.
  const photos = obj.photos;
  if (photos !== undefined && (typeof photos !== 'object' || photos === null || Array.isArray(photos))) {
    throw new BackupCorruptError('Backup has a malformed photo section.');
  }
  return {
    v: obj.v as number, createdAt: obj.createdAt, tables: tables as BackupTables,
    ...(photos ? { photos: photos as BackupPhotos } : {}),
  };
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
