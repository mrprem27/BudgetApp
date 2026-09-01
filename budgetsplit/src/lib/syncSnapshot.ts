import type * as SQLite from 'expo-sqlite';
import { readAllTables } from '../db/queries/backup';
import { buildBackupPayload, encryptPayload } from './backup';
import { uploadBackup, serverConfigured, getStoredSession } from './serverApi';
import { settings } from './settings';
import { isRestoring } from './restoreGuard';
import { keychain } from './keychain';

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



/**
 * Remember the passphrase for unattended snapshots on THIS device.
 *
 * The keychain, not AsyncStorage: this opens every financial record the user has.
 * It is the same reasoning that put the session token there, one step more
 * serious.
 */
/**
 * Whose passphrase this is.
 *
 * Stored beside it because the keychain outlives a session, and a phone can
 * change hands. Without it: A signs out, hands the phone to B, B signs in — and
 * within six hours `maybeSnapshot` read A's still-present database, sealed it
 * with **A's** passphrase, and uploaded it to **B's account**. B then owns a
 * backup of somebody else's ledger that they can never open, and A's data lives
 * on an account A cannot delete it from.
 */
const PASSPHRASE_OWNER_KEY = 'budgetsplit.sync.passphrase.owner.v1';

export async function rememberSyncPassphrase(passphrase: string, userId?: string): Promise<boolean> {
  const ks = keychain();
  if (!ks) return false;
  try {
    await ks.setItemAsync(PASSPHRASE_KEY, passphrase);
    if (userId) await ks.setItemAsync(PASSPHRASE_OWNER_KEY, userId);
    return true;
  } catch {
    return false;
  }
}

/**
 * The stored passphrase, but only if it belongs to the account asking.
 *
 * `userId` is optional for the manual backup path, which is the user acting on
 * their own device right now. `maybeSnapshot` always passes it, because that one
 * runs unattended and is the path that could otherwise upload one person's ledger
 * to another person's account.
 *
 * A passphrase stored before this existed has no owner recorded. Treated as
 * belonging to whoever is signed in, and stamped on read — the alternative is
 * breaking snapshots for everyone who already had this switched on.
 */
export async function storedSyncPassphrase(userId?: string): Promise<string | null> {
  const ks = keychain();
  if (!ks) return null;
  const passphrase = await ks.getItemAsync(PASSPHRASE_KEY).catch(() => null);
  if (!passphrase || !userId) return passphrase;

  const owner = await ks.getItemAsync(PASSPHRASE_OWNER_KEY).catch(() => null);
  if (owner === null) {
    await ks.setItemAsync(PASSPHRASE_OWNER_KEY, userId).catch(() => {});
    return passphrase;
  }
  return owner === userId ? passphrase : null;
}

export async function forgetSyncPassphrase(): Promise<void> {
  await keychain()?.deleteItemAsync(PASSPHRASE_KEY).catch(() => {});
  await keychain()?.deleteItemAsync(PASSPHRASE_OWNER_KEY).catch(() => {});
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
  | {
      ok: false;
      reason: 'off' | 'not-configured' | 'signed-out' | 'no-passphrase' | 'too-soon'
        | 'restoring' | 'failed';
    };

/**
 * Take one if it is due. Never throws — it runs behind a foreground event, and a
 * failed upload must not reach a screen.
 */
export async function maybeSnapshot(db: SQLite.SQLiteDatabase): Promise<SnapshotResult> {
  const result = await runSnapshot(db);
  /*
   * Remember what happened, not only that it worked.
   *
   * Both callers used to throw the reason away, so a snapshot that had NEVER
   * succeeded — a database past the 25 MiB ceiling, a cleared keychain — left
   * Settings → Sync reading "On. A fresh phone can become this one again",
   * forever, with no log, no timestamp and no error surface anywhere. The switch
   * described an intention rather than a fact.
   */
  if (result.ok || result.reason !== 'too-soon') {
    await settings.setLastSnapshotNote(result.ok ? null : result.reason).catch(() => {});
  }
  return result;
}

async function runSnapshot(db: SQLite.SQLiteDatabase): Promise<SnapshotResult> {
  if (!(await settings.syncEverything().catch(() => false))) return { ok: false, reason: 'off' };
  if (!serverConfigured()) return { ok: false, reason: 'not-configured' };
  const session = await getStoredSession();
  if (!session) return { ok: false, reason: 'signed-out' };
  // A restore is replacing this database wholesale. Reading it now would upload a
  // snapshot of rows that are about to stop existing, and `restoreGuard` covers
  // only the root layout's writers — this runs from the tabs layout's own
  // AppState listener, on the connection the restore holds exclusively.
  if (isRestoring()) return { ok: false, reason: 'restoring' };

  const last = await settings.lastSnapshotAt().catch(() => null);
  if (last !== null && Date.now() - last < SNAPSHOT_MIN_GAP_MS) return { ok: false, reason: 'too-soon' };

  // No passphrase means the user turned this on and never finished, the keychain
  // was cleared, or — the case that matters — the stored one belongs to a
  // DIFFERENT account, because this phone changed hands. Reported rather than
  // guessed at: inventing one produces a snapshot nobody can ever open, and using
  // somebody else's uploads their ledger to this account.
  const passphrase = await storedSyncPassphrase(session.user.id);
  if (!passphrase) return { ok: false, reason: 'no-passphrase' };

  try {
    // Rows only. Receipt photos would multiply the size by orders of magnitude
    // and hit the 25 MiB ceiling on a schedule nobody chose; the restore path
    // already nulls a photo it cannot honour.
    const tables = await readAllTables(db);
    const envelope = await encryptPayload(buildBackupPayload(tables), passphrase);
    const body = JSON.stringify(envelope);
    // Marked, so it is pruned against the snapshot quota and can never evict a
    // backup somebody made on purpose.
    const saved = await uploadBackup(body, 'snapshot');
    await settings.setLastSnapshotAt(Date.now()).catch(() => {});
    return { ok: true, bytes: saved.sizeBytes };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
