import type * as SQLite from 'expo-sqlite';
import { File, Paths } from 'expo-file-system';
import { format } from 'date-fns';
import {
  getStoredSession, pullSync, pushSync, serverConfigured, ServerAuthError, ServerNotConfiguredError,
} from '../serverApi';
import { isRestoring } from '../restoreGuard';
import { hasPendingChanges, syncOnce, type SyncOutcome, type Transport } from './engine';
import {
  decideFirstSignIn, replaceWithAccount, uploadToAccount, type Account, type FirstSignInCase,
} from './firstSignIn';
import { planSignOut, wipeForSignOut, type SignOutPlan } from './signOut';

/**
 * The app's entry into server sync: the signed-in account, over the real network.
 * Never throws — a sync that fails is a sync that happens later.
 */
const network: Transport = { push: pushSync, pull: pullSync };

let running: Promise<unknown> | null = null;

// --- What sync is doing right now, for `SyncStatus` -------------------------------

export type SyncFailure = 'offline' | 'signed-out' | 'failed';
export type SyncActivity = {
  syncing: boolean;
  /** 0–1 while syncing, when known. */
  progress: number | null;
  /** How the last attempt ended, or null if it succeeded. */
  failure: SyncFailure | null;
};

let activity: SyncActivity = { syncing: false, progress: null, failure: null };
const listeners = new Set<() => void>();
function setActivity(patch: Partial<SyncActivity>) {
  activity = { ...activity, ...patch };
  listeners.forEach(l => l());
}
/** For `useSyncExternalStore`: in memory, per process — a fresh launch starts idle. */
export const syncActivity = {
  get: (): SyncActivity => activity,
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
};

/**
 * What kind of failure this was. `fetch` rejects with a `TypeError` when there
 * is no connection at all — there is no network library to ask, and this is the
 * one signal every platform gives.
 */
export function classifySyncError(e: unknown): SyncFailure {
  if (e instanceof ServerAuthError) return 'signed-out';
  if (e instanceof ServerNotConfiguredError) return 'failed';
  if (e instanceof TypeError) return 'offline';
  return 'failed';
}

/**
 * One sync-shaped job at a time. A foreground, a write and a first sign-in
 * landing together must not drain the same queue twice in parallel — two pushes
 * would reserve different mutation ids for the same rows.
 */
async function exclusive<T>(job: () => Promise<T>): Promise<T> {
  while (running) await running.catch(() => {});
  const p = job();
  running = p;
  try {
    return await p;
  } finally {
    if (running === p) running = null;
  }
}

export async function runSync(db: SQLite.SQLiteDatabase): Promise<SyncOutcome | null> {
  if (!serverConfigured()) return null;
  // A restore is replacing this database wholesale; it runs its own sync.
  if (isRestoring()) return null;
  if (running) return null;   // one already in flight covers this request
  return exclusive(async () => {
    try {
      const session = await getStoredSession();
      if (!session) return null;
      setActivity({ syncing: true, progress: 0 });
      const r = await syncOnce(db, network, session.user.id, progress => setActivity({ progress }));
      setActivity({ failure: r.skipped === 'failed' ? classifySyncError(r.error) : null });
      return r;
    } catch (e) {
      setActivity({ failure: classifySyncError(e) });
      return null;
    } finally {
      setActivity({ syncing: false, progress: null });
    }
  });
}

let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Sync shortly after a write, so a friend sees a new expense within seconds while
 * the app is open. Debounced (2 s), and only when something is actually queued —
 * a pull writes rows too, and must not schedule another pull.
 */
export function scheduleSync(db: SQLite.SQLiteDatabase, onChanged: () => void, delayMs = 2000): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    timer = null;
    if (!(await hasPendingChanges(db).catch(() => false))) return;
    const r = await runSync(db);
    if (r?.changed) onChanged();
  }, delayMs);
}

// --- First sign-in (SPEC-SERVER.md §4) ------------------------------------------

export function decideFirstSignInNow(db: SQLite.SQLiteDatabase, userId: string): Promise<FirstSignInCase> {
  return exclusive(() => decideFirstSignIn(db, network, userId));
}

/** Link and queue now; the upload itself is the ordinary sync, left to run behind. */
export async function uploadNow(db: SQLite.SQLiteDatabase, account: Account, onChanged: () => void): Promise<void> {
  await exclusive(() => uploadToAccount(db, account));
  runSync(db).then(r => { if (r?.changed) onChanged(); }).catch(() => {});
}

/**
 * The file written before this phone's data is replaced ("Use my account") or
 * wiped ("Sign out anyway"). In
 * Documents, which the Files app shows (`UIFileSharingEnabled`), so it can be
 * found without the app. Plain JSON in the backup's payload shape — it never
 * leaves the phone, and asking for a passphrase here would stand between someone
 * and their own account for a copy they may never open.
 */
function exportFileWriter(moment: 'sign-in' | 'sign-out') {
  return async (json: string): Promise<void> => {
    const file = new File(Paths.document, `budgetsplit-before-${moment}-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`);
    file.create({ overwrite: true });
    file.write(json);
  };
}

export function restoreNow(
  db: SQLite.SQLiteDatabase,
  account: Account,
  opts: { exportFirst: boolean; onProgress?: (fraction: number) => void },
): Promise<{ pulled: number }> {
  return exclusive(() => replaceWithAccount(db, network, account, {
    writeExport: opts.exportFirst ? exportFileWriter('sign-in') : undefined,
    onProgress: opts.onProgress,
  }));
}

// --- Sign-out (SPEC-SERVER.md §4.1) --------------------------------------------

export function planSignOutNow(db: SQLite.SQLiteDatabase, userId: string): Promise<SignOutPlan> {
  return exclusive(() => planSignOut(db, network, userId));
}

export function wipeForSignOutNow(db: SQLite.SQLiteDatabase, opts: { exportFirst: boolean }): Promise<void> {
  return exclusive(() => wipeForSignOut(db, { writeExport: opts.exportFirst ? exportFileWriter('sign-out') : undefined }));
}
