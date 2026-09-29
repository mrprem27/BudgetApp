import type * as SQLite from 'expo-sqlite';
import { getAllPersons, matchAccount, type Person } from '../db/queries/persons';
import { applyRequestOutcome } from '../db/queries/friendRequests';
import type { OutgoingRequest } from './serverApi';

/** The people saved on this phone, other than me — the ones an account can be matched to. */
export async function loadMatchablePeople(db: SQLite.SQLiteDatabase): Promise<Person[]> {
  return (await getAllPersons(db)).filter(p => p.is_me !== 1);
}

/**
 * Fold the server's answers to the requests I sent into the local mirror — and
 * bind the account of anyone who accepted.
 *
 * `outgoing` was once fetched and thrown away, so nothing ever moved a sent
 * request off 'pending': "Invited · waiting" showed forever, and the binding that
 * `friendRequests.ts` calls "the point of this whole file" never happened.
 *
 * Best-effort per request: one that fails must not stop the others, and the next
 * load tries again.
 */
export async function foldOutgoingRequests(
  db: SQLite.SQLiteDatabase,
  outgoing: OutgoingRequest[],
): Promise<void> {
  for (const req of outgoing) {
    if (req.state === 'pending') continue;
    await applyRequestOutcome(db, {
      id: req.id, state: req.state, email: req.email, accountId: req.accountId,
    }).catch(() => {});
  }
}

/** One account, one person — `matchAccount` decides whether the previous holder is moved off or folded in. */
export const bindAccountToPerson = matchAccount;
