/**
 * The sync status line (SPEC-SERVER.md §6.1): one sentence for where this phone's
 * data stands. Pure, so every wording and every precedence rule is tested
 * without a screen.
 *
 * - Offline is a neutral state, not an error — the data is safe on the phone.
 * - Syncing shows a percentage, never a spinner that doesn't say how long.
 * - Every failure names its fix, and the fix is part of the line.
 */

export type SyncStatusInput = {
  /** This phone's ledger is joined to the signed-in account (first sign-in done). */
  linked: boolean;
  syncing: boolean;
  /** 0–1 while syncing, when known. */
  progress: number | null;
  failure: 'offline' | 'signed-out' | 'failed' | null;
  /** Changes waiting to upload. */
  waiting: number;
  lastSyncedAt: number | null;
  now: number;
};

export type SyncStatusView = {
  state: 'syncing' | 'offline' | 'up-to-date' | 'waiting' | 'failed' | 'not-connected';
  text: string;
  /** `quiet` when all is well, `neutral` for a state that fixes itself, `error` when someone must act. */
  tone: 'quiet' | 'neutral' | 'error';
  action?: { label: string; kind: 'sign-in' | 'retry' | 'connect' };
  /** 0–1 while syncing, when known — for the bar under the line. */
  progress?: number;
};

/** "just now" · "2 min ago" · "3 h ago" · "4 days ago". */
export function syncedAgo(at: number, now: number): string {
  const min = Math.max(0, Math.floor((now - at) / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? 'day' : 'days'} ago`;
}

export function syncStatus(i: SyncStatusInput): SyncStatusView {
  if (i.syncing) {
    if (i.progress == null) return { state: 'syncing', text: 'Syncing…', tone: 'neutral' };
    const p = Math.max(0, Math.min(1, i.progress));
    return { state: 'syncing', text: `Syncing · ${Math.round(p * 100)}%`, tone: 'neutral', progress: p };
  }
  if (i.failure === 'signed-out') {
    return { state: 'failed', text: 'Couldn’t sync — you’re signed out.', tone: 'error', action: { label: 'Sign in', kind: 'sign-in' } };
  }
  if (!i.linked) {
    return {
      state: 'not-connected', text: 'This phone isn’t connected to your account yet.', tone: 'error',
      action: { label: 'Connect', kind: 'connect' },
    };
  }
  if (i.failure === 'offline') {
    return { state: 'offline', text: 'Offline — saved on this phone. It’ll upload when you’re back online.', tone: 'neutral' };
  }
  if (i.failure === 'failed') {
    return { state: 'failed', text: 'Couldn’t sync.', tone: 'error', action: { label: 'Try again', kind: 'retry' } };
  }
  if (i.waiting > 0) {
    return { state: 'waiting', text: `${i.waiting} ${i.waiting === 1 ? 'change' : 'changes'} waiting to upload`, tone: 'neutral' };
  }
  return {
    state: 'up-to-date',
    text: i.lastSyncedAt == null ? 'Up to date' : `Up to date · ${syncedAgo(i.lastSyncedAt, i.now)}`,
    tone: 'quiet',
  };
}
