import * as SQLite from 'expo-sqlite';
import type { ReceivableState, TrustState } from '../../constants/enums';
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
  receivable_state: ReceivableState;
  receivable_state_at: number | null;
  trust_state: TrustState;
  trust_state_at: number | null;
  /** Only populated by getGroupMembers (from group_member.joined_at). */
  joined_at?: number | null;
};

export async function setPersonImage(db: SQLite.SQLiteDatabase, id: string, uri: string | null): Promise<void> {
  await db.runAsync('UPDATE person SET image_uri = ? WHERE id = ?', [uri, id]);
}

/**
 * Decide whether this person's debt still counts as cover.
 *
 * Writing off does not settle anything and does not touch a single txn row — the
 * balance is unchanged and still displayed. It only stops the raid and the health
 * score treating it as an asset.
 */
/**
 * Bind a local person to the account they have linked with.
 *
 * **The one thing that makes trust real.** `remote_uid` is how `ingestPeerTxn`
 * answers "who wrote this" — until a person carries one, `appliesImmediately`
 * returns false for everyone and every incoming envelope is refused as
 * `unknown-author`. The whole peer model is inert without this write.
 *
 * Deliberately a separate, explicit act rather than something linking does for
 * you. The app's own rule is that a friend is a LOCAL record and a linked
 * account's details are offered *into* it, never written over it — you may
 * legitimately know someone by a different name than the one they signed up with,
 * and you may link with someone you have not added as a friend at all.
 *
 * Unbinding is `null`, and it must stay possible: linking the wrong local person
 * would otherwise be permanent, and it would silently grant that account the
 * ability to write entries as them.
 */
export async function setRemoteUid(
  db: SQLite.SQLiteDatabase,
  personId: string,
  remoteUid: string | null,
): Promise<void> {
  await db.runAsync('UPDATE person SET remote_uid = ? WHERE id = ?', [remoteUid, personId]);
}

/** The local person bound to this account, if any. */
export async function personByRemoteUid(
  db: SQLite.SQLiteDatabase,
  remoteUid: string,
): Promise<Person | null> {
  return db.getFirstAsync<Person>('SELECT * FROM person WHERE remote_uid = ?', [remoteUid]);
}

export async function setReceivableState(
  db: SQLite.SQLiteDatabase,
  id: string,
  state: ReceivableState,
): Promise<void> {
  await db.runAsync(
    'UPDATE person SET receivable_state = ?, receivable_state_at = ? WHERE id = ?',
    [state, Date.now(), id],
  );
}

/**
 * Decide whether this person's entries reach my ledger without my approval.
 *
 * Like {@link setReceivableState}, this writes only the decision — nothing is
 * derived, nothing else moves. It is also inert until this person has an account
 * (`remote_uid`), because until then nothing can arrive claiming to be them. See
 * `lib/trust.ts`.
 */
export async function setTrustState(
  db: SQLite.SQLiteDatabase,
  id: string,
  state: TrustState,
): Promise<void> {
  await db.runAsync(
    'UPDATE person SET trust_state = ?, trust_state_at = ? WHERE id = ?',
    [state, Date.now(), id],
  );
}

export async function getAllPersons(db: SQLite.SQLiteDatabase): Promise<Person[]> {
  return db.getAllAsync<Person>('SELECT * FROM person ORDER BY is_me DESC, name ASC');
}

export async function getPersonById(db: SQLite.SQLiteDatabase, id: string): Promise<Person | null> {
  return db.getFirstAsync<Person>('SELECT * FROM person WHERE id = ?', [id]);
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
  // Mirrors the column defaults: a new contact is owed-to-you until you say
  // otherwise, and their entries wait for you until you say otherwise. Both are
  // moot for a hand-added contact — `remote_uid` is null, so there is no account
  // and no write path — but the row must match the columns either way.
  return {
    id, name, avatar_color: avatarColor, is_me: 0, email: null, mobile: null,
    remote_uid: null, image_uri: null, upi_vpa: null,
    receivable_state: 'expected', receivable_state_at: null,
    trust_state: 'review', trust_state_at: null,
  };
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

// --- Per-group trust overrides ---------------------------------------------

/**
 * How much I trust this person IN THIS GROUP, when I have said.
 *
 * `null` means I have not, and the global answer stands — which is the common
 * case and deliberately so: an override is an exception, and a row per person per
 * group would make "I never thought about it" indistinguishable from a decision.
 */
export async function getGroupTrust(
  db: SQLite.SQLiteDatabase,
  personId: string,
  groupId: string,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ trust_state: string }>(
    'SELECT trust_state FROM person_group_trust WHERE person_id = ? AND group_id = ?',
    [personId, groupId],
  );
  return row?.trust_state ?? null;
}

/** Every override I have set for one person, so the person screen can show them. */
export async function getGroupTrustFor(
  db: SQLite.SQLiteDatabase,
  personId: string,
): Promise<Array<{ group_id: string; trust_state: string }>> {
  return db.getAllAsync<{ group_id: string; trust_state: string }>(
    'SELECT group_id, trust_state FROM person_group_trust WHERE person_id = ?',
    [personId],
  );
}

/**
 * Set or clear one override. `null` clears it, returning that group to the global
 * answer — which has to be reachable, or "trust everywhere except here" becomes a
 * one-way door.
 */
export async function setGroupTrust(
  db: SQLite.SQLiteDatabase,
  personId: string,
  groupId: string,
  state: string | null,
): Promise<void> {
  if (state === null) {
    await db.runAsync(
      'DELETE FROM person_group_trust WHERE person_id = ? AND group_id = ?', [personId, groupId],
    );
    return;
  }
  await db.runAsync(
    `INSERT OR REPLACE INTO person_group_trust (person_id, group_id, trust_state, updated_at)
     VALUES (?, ?, ?, ?)`,
    [personId, groupId, state, Date.now()],
  );
}

/**
 * Two rows are one person: fold the newcomer into the one already here.
 *
 * Every reference moves — payments, shares, group memberships, authorship,
 * per-group trust, disputes — and only then does the duplicate go. Doing it in
 * that order means a failure leaves two rows that both work, rather than
 * references pointing at a person who no longer exists.
 *
 * `INSERT OR IGNORE` before `DELETE` on the two composite-key tables: both people
 * may already be in the same group, or on the same transaction, and a bare UPDATE
 * would collide with the row that is already there.
 */
export async function mergePerson(
  db: SQLite.SQLiteDatabase,
  fromId: string,
  intoId: string,
): Promise<void> {
  if (fromId === intoId) return;
  await db.withTransactionAsync(async () => {
    for (const t of ['txn_payment', 'txn_share'] as const) {
      await db.runAsync(
        `INSERT OR IGNORE INTO ${t} (txn_id, person_id, amount)
         SELECT txn_id, ?, amount FROM ${t} WHERE person_id = ?`, [intoId, fromId],
      );
      await db.runAsync(`DELETE FROM ${t} WHERE person_id = ?`, [fromId]);
    }
    await db.runAsync(
      `INSERT OR IGNORE INTO group_member (group_id, person_id, joined_at, role)
       SELECT group_id, ?, joined_at, role FROM group_member WHERE person_id = ?`, [intoId, fromId],
    );
    await db.runAsync('DELETE FROM group_member WHERE person_id = ?', [fromId]);
    await db.runAsync(
      `INSERT OR IGNORE INTO person_group_trust (person_id, group_id, trust_state, updated_at)
       SELECT ?, group_id, trust_state, updated_at FROM person_group_trust WHERE person_id = ?`,
      [intoId, fromId],
    );
    await db.runAsync('DELETE FROM person_group_trust WHERE person_id = ?', [fromId]);
    await db.runAsync('UPDATE txn SET author_person_id = ? WHERE author_person_id = ?', [intoId, fromId]);

    // The survivor keeps its own name, but inherits anything it was missing —
    // the incoming row is the one that carries the account id.
    await db.runAsync(
      `UPDATE person SET
         remote_uid = COALESCE(remote_uid, (SELECT remote_uid FROM person WHERE id = ?)),
         email      = COALESCE(email,      (SELECT email      FROM person WHERE id = ?)),
         mobile     = COALESCE(mobile,     (SELECT mobile     FROM person WHERE id = ?)),
         upi_vpa    = COALESCE(upi_vpa,    (SELECT upi_vpa    FROM person WHERE id = ?))
       WHERE id = ?`,
      [fromId, fromId, fromId, fromId, intoId],
    );
    await db.runAsync('DELETE FROM person WHERE id = ?', [fromId]);
  });
}
