import type * as SQLite from 'expo-sqlite';
import { readAllTables } from '../db/queries/backup';
import { buildBackupPayload, encryptPayload } from './backup';
import { uploadBackup, serverConfigured, getStoredSession } from './serverApi';
import { settings } from './settings';

/**
 * "Everything" mode: an encrypted copy of the whole app, kept current on your
 * account, so a fresh phone can become this one again.
 *
 * ### Why this is a snapshot and not the entry sync
 *
 * Shared groups sync entry by entry because two people edit the same bill and the
 * loser of that race must be told. Your own data has no such race worth solving
 * that way — and the machinery to do it right (a key per table, compare-and-set on
 * every row, a merge story for goals and budgets) is a large amount of new code
 * whose failure mode is losing your money history.
 *
 * The encrypted backup already does exactly this, correctly, and is tested: seal
 * everything with a passphrase-derived key, upload bytes the server cannot read,
 * restore on any device. This makes that automatic. It is the same envelope, the
 * same cipher and the same restore path.
 *
 * ### What it therefore is NOT
 *
 * Last-writer-wins across your own devices. Two phones both adding entries all
 * day will not merge — the newer snapshot wins wholesale. That is acceptable for
 * one person's own devices in a way it is emphatically not for a group, and it is
 * said plainly on the Sync screen rather than left to be discovered.
 *
 * ### The passphrase
 *
 * Held in the device keychain so this can run unattended, and **never sent**. A
 * fresh device has no keychain entry, so it asks the human — which is the whole
 * point: the server holds bytes it cannot open, and only you can.
 */

const PASSPHRASE_KEY = 'budgetsplit.sync.passphrase.v1';

type SecureStoreModule = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

/** Same lazy-require discipline as `serverApi` — a missing native module must
 *  degrade to "this feature is off", never crash the app at launch. */
let secureStore: SecureStoreModule | null | undefined;
function keychain(): SecureStoreModule | null {
  if (secureStore !== undefined) return secureStore;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    secureStore = require('expo-secure-store') as SecureStoreModule;
  } catch {
    secureStore = null;
  }
  return secureStore;
}

/**
 * Remember the passphrase for unattended snapshots on THIS device.
 *
 * The keychain, not AsyncStorage: this opens every financial record the user has.
 * It is the same reasoning that put the session token there, one step more
 * serious.
 */
export async function rememberSyncPassphrase(passphrase: string): Promise<boolean> {
  const ks = keychain();
  if (!ks) return false;
  try {
    await ks.setItemAsync(PASSPHRASE_KEY, passphrase);
    return true;
  } catch {
    return false;
  }
}

export async function storedSyncPassphrase(): Promise<string | null> {
  const ks = keychain();
  if (!ks) return null;
  return ks.getItemAsync(PASSPHRASE_KEY).catch(() => null);
}

export async function forgetSyncPassphrase(): Promise<void> {
  await keychain()?.deleteItemAsync(PASSPHRASE_KEY).catch(() => {});
}

/**
 * Least time between automatic snapshots.
 *
 * Every foreground would be absurd: the whole database is read, sealed through
 * 50,000 PBKDF2 rounds and uploaded, and the account keeps only ten. Six hours
 * means a lost phone costs at most a few hours of entries — against a restore
 * that, without this, costs everything since the last time somebody remembered
 * to press a button.
 */
export const SNAPSHOT_MIN_GAP_MS = 6 * 60 * 60 * 1000;

export type SnapshotResult =
  | { ok: true; bytes: number }
  | { ok: false; reason: 'off' | 'not-configured' | 'signed-out' | 'no-passphrase' | 'too-soon' | 'failed' };

/**
 * Take one if it is due. Never throws — it runs behind a foreground event, and a
 * failed upload must not reach a screen.
 */
export async function maybeSnapshot(db: SQLite.SQLiteDatabase): Promise<SnapshotResult> {
  if (!(await settings.syncEverything().catch(() => false))) return { ok: false, reason: 'off' };
  if (!serverConfigured()) return { ok: false, reason: 'not-configured' };
  if (!(await getStoredSession())) return { ok: false, reason: 'signed-out' };

  const last = await settings.lastSnapshotAt().catch(() => null);
  if (last !== null && Date.now() - last < SNAPSHOT_MIN_GAP_MS) return { ok: false, reason: 'too-soon' };

  // No passphrase means the user turned this on and never finished, or the
  // keychain was cleared. Reported rather than guessed at — inventing one would
  // produce a snapshot nobody can ever open.
  const passphrase = await storedSyncPassphrase();
  if (!passphrase) return { ok: false, reason: 'no-passphrase' };

  try {
    // Rows only. Receipt photos would multiply the size by orders of magnitude
    // and hit the 25 MiB ceiling on a schedule nobody chose; the restore path
    // already nulls a photo it cannot honour.
    const tables = await readAllTables(db);
    const envelope = await encryptPayload(buildBackupPayload(tables), passphrase);
    const body = JSON.stringify(envelope);
    const saved = await uploadBackup(body);
    await settings.setLastSnapshotAt(Date.now()).catch(() => {});
    return { ok: true, bytes: saved.sizeBytes };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
