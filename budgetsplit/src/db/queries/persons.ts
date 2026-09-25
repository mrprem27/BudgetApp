import * as SQLite from 'expo-sqlite';
import type { ReceivableState, TrustState } from '../../constants/enums';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { logAudit } from './audit';
import { queueDelete, queueUpsert } from './syncQueue';
import { INVITED_ON_ADD, memberActive } from './memberSql';
import { getGroupContext, getSharedGroupsWith } from './groups';
import { canAddMember, canRemoveMember, PermissionError } from '../../lib/permissions';
import { adoptAccountId, releaseAccountId } from './personRemap';
import { selfPersonId } from '../../lib/sync/ids';

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
 * **The one thing that makes trust real.** `remote_uid` is what ties a person to
 * an account — until a person carries one, `appliesImmediately` returns false for
 * them (`lib/trust.ts`, IV-11), so their trust setting is inert.
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
): Promise<string> {
  // Unmatched: clear it, and give the account's id back (`releaseAccountId`).
  if (!remoteUid) {
    await db.runAsync('UPDATE person SET remote_uid = NULL WHERE id = ?', [personId]);
    return releaseAccountId(db, personId);
  }
  // Matched: take the account's person id, so a shared group's rows about them
  // land on this person rather than a second one (S20). The move writes
  // `remote_uid` itself — writing it here first would collide with the row a
  // shared group already pulled for this account, the one case that must merge.
  const r = await adoptAccountId(db, personId, remoteUid);
  if (r === 'moved' || r === 'merged') return selfPersonId(remoteUid);
  await db.runAsync('UPDATE person SET remote_uid = ? WHERE id = ?', [remoteUid, personId]);
  return personId;
}

/**
 * Linked people's one action: this account is this person — or, with `null`, nobody.
 *
 * Every person bound to an account lives under the account's id (`setRemoteUid`),
 * so "the account's previous person" is one row, and what happens to it depends on
 * where it came from:
 *
 * - **It shares a group with me.** Then the server knows it as this account, and
 *   so does every other member's phone. It IS them. Matching someone else folds
 *   that someone into it; unmatching is refused, because releasing it would
 *   re-point memberships the server holds under the account.
 * - **It doesn't.** It was only ever my guess, so a new match moves the account
 *   off it (it keeps its money, under a fresh local id) and onto the new person.
 */
export async function matchAccount(
  db: SQLite.SQLiteDatabase,
  accountUserId: string,
  personId: string | null,
): Promise<void> {
  const prev = await personByRemoteUid(db, accountUserId);
  if (prev && prev.id === personId) return;
  if (prev) {
    const me = await getMe(db);
    const shared = me ? await getSharedGroupsWith(db, me.id, prev.id) : [];
    if (shared.length > 0 && !personId) {
      throw new Error(`${prev.name} is in ${shared[0].name} with you, so this account stays linked to them.`);
    }
    if (shared.length === 0) await setRemoteUid(db, prev.id, null);
  }
  if (personId) await setRemoteUid(db, personId, accountUserId);
}

/**
 * WHY a person cannot be removed. One bucket used to cover all three, and the UI
 * guessed — it told everyone "you've shared expenses with them", which is false for
 * somebody who has only ever been a name in a group, and false again for a linked
 * account with no entries yet. A refusal that misstates its own reason is worse
 * than a bare no, because the advice attached to it sends people somewhere useless.
 */
export type DeletePersonBlock =
  /** A linked account: a live write path, whose entries can arrive at any moment. */
  | 'account'
  /** Money exists — a payment, a share, an entry they authored, an import draft. */
  | 'history'
  /** Group-shaped only: a membership, a trust answer, a budget override, a group they made. */
  | 'group';

/** One member per reason, so `reason` discriminates and `via` narrows with it. */
export type DeletePersonResult =
  | { ok: true }
  | { ok: false; reason: 'is-me' }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'in-use'; via: DeletePersonBlock };

/**
 * Remove a person this device made and never used.
 *
 * There was no way to delete a person at all. Type "Priyaa" instead of "Priya",
 * tap Add, and that row is in the People list forever, in every member picker
 * forever, and in the Linked-people match sheet forever. `mergePerson` was the
 * only way to get rid of one and it is reachable from exactly one place — a sync
 * name-collision alert — so a plain typo had no answer.
 *
 * **Only when nothing references them.** This is a hard delete, so the bar is that
 * removing the row can change no number and orphan nothing: no payment, no share,
 * no membership past or present, no authored entry, no import draft, no budget
 * override, and they cannot be linked to an account. Anyone who fails that test
 * is a real person with real history, and the answer for them is removal from a
 * group (soft, and reversible) or a merge — never this.
 *
 * `is_me` is refused outright: it is the row every balance in the app is measured
 * against.
 */
export async function deletePerson(
  db: SQLite.SQLiteDatabase,
  personId: string,
): Promise<DeletePersonResult> {
  const p = await db.getFirstAsync<Person>('SELECT * FROM person WHERE id = ?', [personId]);
  if (!p) return { ok: false, reason: 'not-found' };
  if (p.is_me === 1) return { ok: false, reason: 'is-me' };
  // A linked account means somebody real, whose entries can arrive at any time.
  if (p.remote_uid) return { ok: false, reason: 'in-use', via: 'account' };

  /*
   * Every column anywhere that names a person, checked in one place — the same
   * list `personRemap.REMAP_COLUMNS` moves. A reference this misses is a dangling id, and
   * foreign keys are off, so nothing else would catch it.
   *
   * Counted in TWO buckets rather than one, because the two mean different things
   * to the person reading the refusal. `history` is money that exists and would be
   * orphaned; `group` is a name in a roster with no money behind it. The totals add
   * up to the same ten columns as before — this changes what we can SAY, not what
   * is allowed.
   */
  const referenced = await db.getFirstAsync<{ history: number; group: number }>(
    `SELECT
       (
         (SELECT COUNT(*) FROM txn_payment WHERE person_id = ?) +
         (SELECT COUNT(*) FROM txn_share   WHERE person_id = ?) +
         (SELECT COUNT(*) FROM txn         WHERE author_person_id = ?) +
         (SELECT COUNT(*) FROM pending_txn
           WHERE counterparty_id = ? OR author_person_id = ? OR payer_person_id = ?)
       ) AS history,
       (
         (SELECT COUNT(*) FROM group_member       WHERE person_id = ?) +
         (SELECT COUNT(*) FROM person_group_trust WHERE person_id = ?) +
         (SELECT COUNT(*) FROM category_budget    WHERE person_id = ?) +
         (SELECT COUNT(*) FROM budget_group       WHERE created_by = ?)
       ) AS "group"`,
    Array(10).fill(personId),
  );
  // History wins when both are true: it is the stronger claim and the one that
  // explains why removal would change a number.
  if ((referenced?.history ?? 0) > 0) return { ok: false, reason: 'in-use', via: 'history' };
  if ((referenced?.group ?? 0) > 0) return { ok: false, reason: 'in-use', via: 'group' };

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM person WHERE id = ?', [personId]);
    await queueDelete(db, 'person', personId, { id: personId });
    await logAudit(db, {
      entityType: 'member', entityId: personId, groupId: null,
      action: 'deleted', summary: `Deleted person · ${p.name}`,
    });
  });
  return { ok: true };
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
  await queueUpsert(db, 'person', id);
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
  await queueUpsert(db, 'person', id);
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
     WHERE gm.group_id = ? AND ${memberActive('gm')}
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
  await queueUpsert(db, 'person', id);
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
  await queueUpsert(db, 'person', personId);
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
  await queueUpsert(db, 'person', personId);
}

export async function updatePersonName(
  db: SQLite.SQLiteDatabase,
  personId: string,
  name: string,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    const prev = await db.getFirstAsync<Person>('SELECT * FROM person WHERE id = ?', [personId]);
    await db.runAsync('UPDATE person SET name = ? WHERE id = ?', [name, personId]);
    await queueUpsert(db, 'person', personId);
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
  /**
   * Who is acting. Admins only, and **required** — it used to be optional with
   * the guard written as `if (actorId && …)`, so omitting it did not fail, it
   * skipped the check. `group/[id]/edit.tsx` omitted it, which meant any member
   * could open Edit group, tick or untick anybody including the CREATOR, and save.
   * The rule held on the screen that asked for it and not on the one that did not.
   */
  actorId: string,
): Promise<void> {
  if (!canAddMember(await getGroupContext(db, groupId, actorId))) {
    throw new PermissionError('add members to this group');
  }
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      // `deleted_at = NULL` on conflict: re-adding somebody who left must bring
      // them back, and the row is still there because removal is soft now.
      // `OR IGNORE` would have left them marked as gone while appearing in the
      // member picker as already added — present and absent at once.
      `INSERT INTO group_member (group_id, person_id, joined_at, invited) VALUES (?, ?, ?, (${INVITED_ON_ADD}))
       ON CONFLICT(group_id, person_id) DO UPDATE SET deleted_at = NULL, joined_at = excluded.joined_at,
         invited = CASE WHEN group_member.deleted_at IS NULL THEN group_member.invited ELSE excluded.invited END`,
      [groupId, personId, Date.now(), personId],
    );
    await queueUpsert(db, 'group_member', `${groupId}|${personId}`);
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
  /** Required, for the reason on `addMemberToGroup`. */
  actorId: string,
): Promise<void> {
  // Refuses the creator for everyone, including the creator themselves.
  if (!canRemoveMember(await getGroupContext(db, groupId, actorId), personId)) {
    throw new PermissionError('remove this member');
  }
  await db.withTransactionAsync(async () => {
    const p = await db.getFirstAsync<Person>('SELECT * FROM person WHERE id = ?', [personId]);
    /*
     * Soft. The row stays, marked with when they left.
     *
     * Two reasons, and the schema stated the first when the column was added and
     * nothing used it: *"a hard delete cannot propagate — the other device keeps
     * the row and pushes it back."* Removing them here and simply omitting them
     * from the next roster told the other phones nothing, because absence from a
     * roster is indistinguishable from a roster that is merely stale. They stayed
     * a member everywhere else forever.
     *
     * The second is the rule this whole area serves: removal ends a relationship,
     * never a record. Their entries, their shares and their balance are all
     * untouched — what they spent is a fact about the past, and my share of it has
     * already counted in months that are closed.
     */
    await db.runAsync(
      'UPDATE group_member SET deleted_at = ?, updated_at = ? WHERE group_id = ? AND person_id = ?',
      [Date.now(), Date.now(), groupId, personId],
    );
    await queueUpsert(db, 'group_member', `${groupId}|${personId}`);
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
    await queueDelete(db, 'person_group_trust', `${personId}|${groupId}`, { person_id: personId, group_id: groupId });
    return;
  }
  await db.runAsync(
    `INSERT OR REPLACE INTO person_group_trust (person_id, group_id, trust_state, updated_at)
     VALUES (?, ?, ?, ?)`,
    [personId, groupId, state, Date.now()],
  );
  await queueUpsert(db, 'person_group_trust', `${personId}|${groupId}`);
}

/**
 * Refused merges. A merge cannot be undone, so anything ambiguous stops here
 * rather than being resolved by whichever row happened to survive.
 */
export class MergePersonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MergePersonError';
  }
}
