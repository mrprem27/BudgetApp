import type * as SQLite from 'expo-sqlite';
import {
  getAllPersons, updatePersonName, setPersonImage, setPersonUpiVpa, setPersonContact, insertPerson, deletePerson,
  type Person,
} from '../db/queries/persons';
import { recordSentRequest, pendingInvitesByPerson } from '../db/queries/friendRequests';
import { getFriendBalances, type FriendBalance } from '../db/queries/balances';
import { sendFriendRequest, listFriendRequests, serverConfigured, getStoredSession } from './serverApi';
import { pickAndSaveAvatar } from './avatar';
import { deleteAttachment } from './attachment';

/**
 * Pick a new photo for somebody. Every pick writes a new timestamped file and
 * never replaces one in place, so the one this replaces is unlinked once the new
 * one is safely recorded. Three screens each had their own copy of this; the
 * Members screen's forgot the unlink and leaked a file per change.
 */
export async function replacePersonPhoto(db: SQLite.SQLiteDatabase, person: Pick<Person, 'id' | 'image_uri'>): Promise<boolean> {
  const uri = await pickAndSaveAvatar(person.id);
  if (!uri) return false;
  await setPersonImage(db, person.id, uri);
  if (person.image_uri) await deleteAttachment(person.image_uri);
  return true;
}

/** The Friends list: everyone but me, each with what is owed either way, and who has a request out. */
export async function loadFriends(db: SQLite.SQLiteDatabase, meId: string | undefined) {
  const [all, bals, invited] = await Promise.all([
    getAllPersons(db),
    meId ? getFriendBalances(db, meId) : Promise.resolve([] as FriendBalance[]),
    pendingInvitesByPerson(db),
  ]);
  const balances: Record<string, FriendBalance> = {};
  for (const b of bals) balances[b.personId] = b;
  return { people: all.filter(p => !p.is_me), balances, invited };
}

/** A new friend, with their number when one was typed — captured now, not via a long-press nobody discovers. */
export async function addFriend(db: SQLite.SQLiteDatabase, name: string, color: string, phone: string): Promise<void> {
  const created = await insertPerson(db, name, color);
  const trimmed = phone.trim();
  if (created && trimmed) await setPersonContact(db, created.id, { mobile: trimmed });
}

export type FriendDetails = { name: string; vpa: string | null; phone: string | null; email: string | null };

/**
 * Save the fields that changed. Returns the email when it changed to a real one —
 * that is the caller's cue to send an invite. The number is stored as typed: it is
 * dialled by a human or handed to WhatsApp, never used as a key.
 */
export async function saveFriendDetails(db: SQLite.SQLiteDatabase, person: Person, next: FriendDetails): Promise<string | null> {
  if (next.name !== person.name) await updatePersonName(db, person.id, next.name);
  if (next.vpa !== (person.upi_vpa ?? null)) await setPersonUpiVpa(db, person.id, next.vpa);
  if (next.phone !== (person.mobile ?? null)) await setPersonContact(db, person.id, { mobile: next.phone });
  const emailChanged = next.email !== (person.email ?? null);
  if (emailChanged) await setPersonContact(db, person.id, { email: next.email });
  return emailChanged ? next.email : null;
}

/**
 * Ask an address to connect, and remember which person row it was for — the whole
 * reason a local mirror table exists: when the request is accepted, the account
 * id has to land on the row the user chose, not on a match they will never find.
 * Returns false when there is nowhere to send from yet (the address is still saved).
 */
export async function inviteFriendByEmail(db: SQLite.SQLiteDatabase, person: Person, email: string): Promise<boolean> {
  if (!serverConfigured() || !(await getStoredSession())) return false;
  await sendFriendRequest(email);
  const sent = (await listFriendRequests()).outgoing.find(r => r.email === email && r.state === 'pending');
  if (sent) await recordSentRequest(db, { id: sent.id, email, personId: person.id });
  return true;
}

/** Remove somebody added by mistake. Refused (with a reason) for anyone with history. */
export { deletePerson };
