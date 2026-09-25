import type * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { deviceId, linkedUser, setLinkedUser } from '../../db/queries/syncApply';
import { linkLedger, phoneHasData, seedAccountMe } from '../../db/queries/identity';
import { readAllTables, restoreAllTables } from '../../db/queries/backup';
import { BACKUP_TABLES, buildBackupPayload, type BackupTables } from '../backup';
import { beginRestore, endRestore } from '../restoreGuard';
import { syncOnce, type Transport } from './engine';

/**
 * The first sign-in (SPEC-SERVER.md §4, task S14): how this phone's ledger meets
 * the account's.
 *
 * | Phone     | Account   | Case      |
 * |-----------|-----------|-----------|
 * | any       | empty     | `upload`  |
 * | empty     | has data  | `restore` |
 * | has data  | has data  | `ask`     |
 *
 * Every case is atomic from the phone's side. Upload links and queues in one
 * local transaction, and the push that follows is the ordinary queue, so a lost
 * connection only means it finishes later. Restore and "Use my account" replace
 * the phone, so they snapshot it first and put the snapshot back if anything
 * fails: the phone is never left half replaced.
 */

export type Account = { userId: string; email?: string | null; name?: string | null };
export type FirstSignInCase = 'upload' | 'restore' | 'ask' | 'linked';

/** Something went wrong and the phone was put back exactly as it was. */
export class FirstSignInError extends Error {}

const MAX_RESTORE_ROUNDS = 50;

/**
 * Does the account already hold anything? One read-only pull from the start; the
 * rows are looked at and thrown away. Nothing on the phone changes.
 */
async function accountHasData(db: SQLite.SQLiteDatabase, transport: Transport): Promise<boolean> {
  const res = await transport.pull({ deviceId: await deviceId(db, uuid), cursors: {}, rejectionsAfter: 0 });
  return res.scopes.some(s => Object.values(s.rows).some(rows => rows.length > 0));
}

/**
 * Which case this is. Reads only. A phone already joined to ANOTHER account holds
 * that account's ledger, so it is never uploaded into this one: that is an `ask`
 * whatever the account holds.
 */
export async function decideFirstSignIn(
  db: SQLite.SQLiteDatabase,
  transport: Transport,
  userId: string,
): Promise<FirstSignInCase> {
  const linked = await linkedUser(db);
  if (linked === userId) return 'linked';
  const remote = await accountHasData(db, transport);
  if (linked !== null) return 'ask';
  const local = await phoneHasData(db);
  if (local && remote) return 'ask';
  return remote ? 'restore' : 'upload';
}

/**
 * Upload: join the ledger to the account and queue all of it, then push. Returns
 * once the link is made; the push is the ordinary sync, so `sync` may be left to
 * run in the background and a failure there is retried like any other.
 */
export async function uploadToAccount(
  db: SQLite.SQLiteDatabase,
  account: Account,
): Promise<void> {
  const r = await linkLedger(db, account, { backfill: true });
  if (!r.ok) throw new FirstSignInError(`This phone's own profile could not be matched (${r.reason}).`);
}

function emptyTables(): BackupTables {
  const t = {} as BackupTables;
  for (const name of BACKUP_TABLES) t[name] = [];
  return t;
}

/**
 * Replace this phone with the account: Restore, and the Ask case's "Use my
 * account". `writeExport` is given the phone's data before anything is touched;
 * if it throws, nothing happens. Any later failure puts the snapshot back and
 * unlinks, and throws `FirstSignInError`.
 *
 * `onProgress` reports 0–1 through the pull (by seq, against each scope's head).
 */
export async function replaceWithAccount(
  db: SQLite.SQLiteDatabase,
  transport: Transport,
  account: Account,
  opts: { writeExport?: (json: string) => Promise<void>; onProgress?: (fraction: number) => void } = {},
): Promise<{ pulled: number }> {
  const snapshot = await readAllTables(db);
  if (opts.writeExport) await opts.writeExport(JSON.stringify(buildBackupPayload(snapshot)));

  // Several sync passes, each reporting from 0: only ever move the bar forward.
  let best = 0;
  const forward = (f: number) => { if (f > best) { best = f; opts.onProgress?.(f); } };

  beginRestore();
  try {
    await restoreAllTables(db, emptyTables());
    await seedAccountMe(db, account);
    await setLinkedUser(db, account.userId);
    let pulled = 0;
    for (let round = 0; round < MAX_RESTORE_ROUNDS; round++) {
      const r = await syncOnce(db, transport, account.userId, forward);
      if (r.skipped) throw new Error(r.skipped);
      pulled += r.pulled;
      if (r.pulled === 0) break;
    }
    forward(1);
    return { pulled };
  } catch {
    // `restoreAllTables` is one exclusive transaction, and it also clears the
    // queue and every `sync2.*` key, so the phone is back to exactly its
    // unlinked self.
    await restoreAllTables(db, snapshot);
    await setLinkedUser(db, null);
    throw new FirstSignInError('Couldn’t bring your data back. Nothing on this phone changed — try again.');
  } finally {
    endRestore();
  }
}
