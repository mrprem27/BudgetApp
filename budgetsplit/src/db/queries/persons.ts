import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { logAudit } from './audit';
import { getGroupContext } from './groups';
import { canAddMember, canRemoveMember, PermissionError } from '../../lib/permissions';

export type Person = {
  id: string;
  name: string;
  avatar_color: string;
  is_me: number;
  email: string | null;
  mobile: string | null;
  upi_vpa: string | null;
  remote_uid: string | null;
  image_uri: string | null;
  /** Only populated by getGroupMembers (from group_member.joined_at). */
  joined_at?: number | null;
};

export async function setPersonImage(db: SQLite.SQLiteDatabase, id: string, uri: string | null): Promise<void> {
  await db.runAsync('UPDATE person SET image_uri = ? WHERE id = ?', [uri, id]);
}

export async function getAllPersons(db: SQLite.SQLiteDatabase): Promise<Person[]> {
  return db.getAllAsync<Person>('SELECT * FROM person ORDER BY is_me DESC, name ASC');
}

export async function getMe(db: SQLite.SQLiteDatabase): Promise<Person | null> {
  return db.getFirstAsync<Person>('SELECT * FROM person WHERE is_me = 1');
}

export async function getGroupMembers(db: SQLite.SQLiteDatabase, groupId: string): Promise<Person[]> {
  return db.getAllAsync<Person>(
    `SELECT p.*, gm.joined_at FROM person p
     JOIN group_member gm ON gm.person_id = p.id
     WHERE gm.group_id = ?
     ORDER BY p.is_me DESC, p.name ASC`,
    [groupId],
  );
}

export async function insertPerson(
  db: SQLite.SQLiteDatabase,
  name: string,
  avatarColor: string,
): Promise<Person> {
  const id = uuid();
  await db.runAsync(
    'INSERT INTO person (id, name, avatar_color, is_me) VALUES (?, ?, ?, 0)',
    [id, name, avatarColor],
  );
  return { id, name, avatar_color: avatarColor, is_me: 0, email: null, mobile: null, remote_uid: null, image_uri: null, upi_vpa: null };
}

export async function setPersonUpiVpa(
  db: SQLite.SQLiteDatabase,
  personId: string,
  vpa: string | null,
): Promise<void> {
  await db.runAsync('UPDATE person SET upi_vpa = ? WHERE id = ?', [vpa, personId]);
}

/**
 * Contact details for a person — the long-dead `person.email` / `person.mobile`
 * columns (`schema.ts:19-20`), finally written to.
 *
 * `mobile` is **yours to set, always**. When a linked account offers a number it
 * is a suggestion the user accepts into this field; it never overwrites what is
 * already here and it is never re-synced over the top. You may legitimately know
 * a different number for someone than the one they signed up with, and the app
 * has no business correcting you.
 *
 * Only the keys present are written, so a caller updating one doesn't null the other.
 */
export async function setPersonContact(
  db: SQLite.SQLiteDatabase,
  personId: string,
  patch: { email?: string | null; mobile?: string | null },
): Promise<void> {
  const sets: string[] = [];
  const binds: (string | null)[] = [];
  if ('email' in patch) { sets.push('email = ?'); binds.push(patch.email ?? null); }
  if ('mobile' in patch) { sets.push('mobile = ?'); binds.push(patch.mobile ?? null); }
  if (sets.length === 0) return;
  await db.runAsync(`UPDATE person SET ${sets.join(', ')} WHERE id = ?`, [...binds, personId]);
}

export async function updatePersonName(
  db: SQLite.SQLiteDatabase,
  personId: string,
  name: string,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    const prev = await db.getFirstAsync<Person>('SELECT * FROM person WHERE id = ?', [personId]);
    await db.runAsync('UPDATE person SET name = ? WHERE id = ?', [name, personId]);
    await logAudit(db, {
      entityType: 'member', entityId: personId, action: 'updated',
      summary: `Renamed ${prev?.name ?? 'person'} to ${name}`,
    });
  });
}

export async function addMemberToGroup(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  personId: string,
  /** Who is acting. Admins only — omit only from setup paths that predate any group. */
  actorId?: string,
): Promise<void> {
  if (actorId && !canAddMember(await getGroupContext(db, groupId, actorId))) {
    throw new PermissionError('add members to this group');
  }
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT OR IGNORE INTO group_member (group_id, person_id, joined_at) VALUES (?, ?, ?)',
      [groupId, personId, Date.now()],
    );
    const p = await db.getFirstAsync<Person>('SELECT * FROM person WHERE id = ?', [personId]);
    await logAudit(db, {
      entityType: 'member', entityId: personId, groupId, action: 'created',
      summary: `Added ${p?.name ?? 'member'} to the group`,
    });
  });
}

export async function removeMemberFromGroup(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  personId: string,
  actorId?: string,
): Promise<void> {
  // Refuses the creator for everyone, including the creator themselves.
  if (actorId && !canRemoveMember(await getGroupContext(db, groupId, actorId), personId)) {
    throw new PermissionError('remove this member');
  }
  await db.withTransactionAsync(async () => {
    const p = await db.getFirstAsync<Person>('SELECT * FROM person WHERE id = ?', [personId]);
    await db.runAsync(
      'DELETE FROM group_member WHERE group_id = ? AND person_id = ?',
      [groupId, personId],
    );
    await logAudit(db, {
      entityType: 'member', entityId: personId, groupId, action: 'deleted',
      summary: `Removed ${p?.name ?? 'member'} from the group`,
    });
  });
}
