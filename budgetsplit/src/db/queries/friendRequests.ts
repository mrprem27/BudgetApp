import type * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { setRemoteUid } from './persons';

/**
 * The local half of a friend request.
 *
 * The server owns the request's STATE. This table owns the one thing the server
 * cannot be told without becoming a directory, and must not be: **which local
 * person I meant when I typed that address.**
 *
 * That binding is what makes accepting a request finish the job. On the QR path
 * `setRemoteUid` is a deliberate manual step, because an invite link is made to
 * be forwarded and you cannot be sure who claimed it. An email request is the
 * opposite: I typed the address AND picked the row, and the server proved the
 * inbox-holder accepted. There is nothing left to guess, so making the user find
 * a "Match" screen afterwards would be asking them to repeat a decision they
 * already made.
 */

export type LocalFriendRequest = {
  id: string;
  direction: 'outgoing' | 'incoming';
  email: string;
  person_id: string | null;
  state: 'pending' | 'accepted' | 'declined' | 'cancelled';
  created_at: number;
  updated_at: number;
};

/** Remember that I asked this address, on behalf of this person row. */
export async function recordSentRequest(
  db: SQLite.SQLiteDatabase,
  opts: { id: string; email: string; personId: string | null },
): Promise<void> {
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO friend_request (id, direction, email, person_id, state, created_at, updated_at)
     VALUES (?, 'outgoing', ?, ?, 'pending', ?, ?)
     ON CONFLICT(id) DO UPDATE SET person_id = excluded.person_id, updated_at = excluded.updated_at`,
    [opts.id, opts.email, opts.personId, now, now],
  );
}

/** Every address I have asked and not yet heard back about, by person. */
export async function pendingInvitesByPerson(
  db: SQLite.SQLiteDatabase,
): Promise<Map<string, string>> {
  const rows = await db.getAllAsync<{ person_id: string; email: string }>(
    `SELECT person_id, email FROM friend_request
      WHERE direction = 'outgoing' AND state = 'pending' AND person_id IS NOT NULL`,
  );
  return new Map(rows.map(r => [r.person_id, r.email]));
}

export async function requestForPerson(
  db: SQLite.SQLiteDatabase,
  personId: string,
): Promise<LocalFriendRequest | null> {
  return db.getFirstAsync<LocalFriendRequest>(
    `SELECT * FROM friend_request WHERE person_id = ? AND direction = 'outgoing'
      ORDER BY created_at DESC LIMIT 1`,
    [personId],
  );
}

/**
 * Fold the server's answer back in, and bind the account when one was accepted.
 *
 * The binding is the point of this whole file. It is safe here — and NOT safe on
 * the QR path — because I chose the address and the row, and the server proved
 * somebody holding that inbox accepted. `setRemoteUid` is still the only writer.
 *
 * Guarded on the address matching what I actually sent to. If the accepted
 * request's email is not the one recorded against this person, something has
 * drifted and the honest answer is to bind nothing and leave the manual match
 * available, rather than attach a stranger's account to somebody's row — every
 * entry they ever author would land on the wrong ledger line.
 */
export async function applyRequestOutcome(
  db: SQLite.SQLiteDatabase,
  opts: { id: string; state: LocalFriendRequest['state']; email: string; accountId?: string | null },
): Promise<void> {
  const local = await db.getFirstAsync<LocalFriendRequest>(
    'SELECT * FROM friend_request WHERE id = ?', [opts.id],
  );
  await db.runAsync(
    'UPDATE friend_request SET state = ?, updated_at = ? WHERE id = ?',
    [opts.state, Date.now(), opts.id],
  );

  if (opts.state !== 'accepted' || !opts.accountId || !local?.person_id) return;
  if (local.email.trim().toLowerCase() !== opts.email.trim().toLowerCase()) return;
  await setRemoteUid(db, local.person_id, opts.accountId);
}

/** Note an incoming request, so the inbox survives being offline. */
export async function recordIncomingRequest(
  db: SQLite.SQLiteDatabase,
  opts: { id: string; email: string; createdAt: number },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO friend_request (id, direction, email, person_id, state, created_at, updated_at)
     VALUES (?, 'incoming', ?, NULL, 'pending', ?, ?)
     ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
    [opts.id, opts.email, opts.createdAt, Date.now()],
  );
}
