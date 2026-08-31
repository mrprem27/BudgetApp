import type * as SQLite from 'expo-sqlite';
import { pendingUploadsByGroup } from '../db/queries/syncOutbox';
import { settings } from './settings';

/**
 * What is waiting to reach the other people in a group, and why it has not.
 *
 * The gate itself already exists and is right: `drain` skips any group this
 * device has no key for, and the server refuses every read and write for a member
 * still `pending`. So publishing a group before somebody accepts is safe, and
 * must stay that way — it is what lets their first pull hand them the whole
 * history in one page-walk instead of requiring the inviter to be online at that
 * exact moment.
 *
 * What was missing is that **nothing told anyone it was holding**. Entries piled
 * up in `sync_outbox` with the app showing no difference between "sent" and
 * "waiting for Aarav to accept", which is the same silence that made every other
 * sync failure in this codebase invisible.
 *
 * The wording matters as much as the mechanism. Never "not synced": the entry IS
 * recorded, it counts in every one of my figures right now, and telling somebody
 * their expense did not happen is the worst lie this app could tell.
 */

export type GroupSyncStatus = {
  groupId: string;
  name: string;
  /** How many entries are queued for this group. */
  waiting: number;
  /**
   * `'sending'`    — approved and readable; these go on the next sync.
   * `'invited'`    — somebody has been invited and has not accepted yet.
   * `'unshared'`   — never published. Nothing is wrong; there is nobody to send to.
   * `'no-key'`     — approved, but this device holds no wrap for it. Stuck until a
   *                  member re-shares, and the ONLY state the user must act on.
   */
  state: 'sending' | 'invited' | 'unshared' | 'no-key';
};

/**
 * `settings.syncGroups()` caches `[id, state]` from the last `listSyncGroups`, so
 * this answers correctly while offline — which is exactly when somebody goes
 * looking for the explanation.
 */
export async function groupSyncStatuses(
  db: SQLite.SQLiteDatabase,
): Promise<GroupSyncStatus[]> {
  const [queued, known] = await Promise.all([
    pendingUploadsByGroup(db),
    settings.syncGroups().catch(() => [] as [string, string][]),
  ]);
  const stateOf = new Map(known);

  return queued.map(q => ({
    groupId: q.groupId,
    name: q.name,
    waiting: q.n,
    state: statusFor(stateOf.get(q.groupId)),
  }));
}

function statusFor(serverState: string | undefined): GroupSyncStatus['state'] {
  if (serverState === undefined) return 'unshared';
  if (serverState === 'pending') return 'invited';
  return 'sending';
}

/**
 * One sentence, for a group screen or a person screen.
 *
 * Written to be true rather than reassuring. "Waiting for them to accept" is a
 * fact about the other person; "not synced" would be a claim about the entry,
 * and the entry is fine.
 */
export function describeSyncStatus(s: GroupSyncStatus, who?: string): string {
  const n = s.waiting;
  const changes = `${n} ${n === 1 ? 'change' : 'changes'}`;
  switch (s.state) {
    case 'invited':
      return `${changes} waiting for ${who ?? 'them'} to accept.`;
    case 'no-key':
      return `${changes} can’t go yet — this phone can’t open this group. `
        + 'Ask someone in it to share it with you again.';
    case 'unshared':
      return `${changes} recorded here. They’ll go if you share this group.`;
    case 'sending':
      return `${changes} to send. They’ll go next time you open the app.`;
  }
}
