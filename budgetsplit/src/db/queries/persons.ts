import * as SQLite from 'expo-sqlite';
import type { ReceivableState, TrustState } from '../../constants/enums';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { logAudit } from './audit';
import { markRosterDirty } from './syncDoc';
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

/** What `claimMyAccount` did, so a caller can say why the groups went quiet. */
export type ClaimResult =
  | { ok: true; changed: boolean }
  | { ok: false; reason: 'no-me' | 'ambiguous-me' | 'other-account' };

/**
 * Bind THIS device's `is_me` row to the account that just signed in.
 *
 * ## Why nothing synced before this existed
 *
 * `setRemoteUid` was reachable from exactly one screen, Linked people, and that
 * screen filters `is_me !== 1` — correctly, because you must never bind someone
 * *else's* account to your own row. But there was no other path, so your own
 * `remote_uid` stayed NULL forever, and every consequence followed from that:
 *
 * - `authorRef` sent `uid: null`, so the receiver's `toPeerEnvelope` refused
 *   every entry this device authored.
 * - `adoptGroup` resolves a roster member by `uid` first. With mine NULL the
 *   lookup missed, so it created a **second person row carrying my own account
 *   id** with `is_me = 0`, and put THAT row in `group_member`.
 * - `ingestPeerTxn` then failed `ids.has(me.id)` and answered `not-a-member`,
 *   which the pull classifies as *recoverable* — so the cursor held and that
 *   group stopped syncing, silently, on every launch, forever.
 *
 * And because `idx_person_remote_uid` is unique over non-null values, the phantom
 * now OWNED my uid: no later fix could simply set it on the right row. It has to
 * be merged, which is why that runs first here.
 *
 * ## The order is the function
 *
 * 1. Refuse if there is not exactly one `is_me`. A wrong answer re-authors history.
 * 2. Merge any other row already holding this uid into `is_me` — before the bind,
 *    or the unique index rejects it.
 * 3. Write `remote_uid`, and `email` from the verified session. This is the only
 *    thing that has ever written `person.email`.
 * 4. Mark every shared roster dirty: my uid just became knowable, and the roster
 *    is what tells the other phones.
 *
 * Idempotent, so it can run on every sync and heal a device that signed in on an
 * older build with no migration.
 */
export async function claimMyAccount(
  db: SQLite.SQLiteDatabase,
  account: { uid: string; email?: string | null },
): Promise<ClaimResult> {
  const meRows = await db.getAllAsync<Person>('SELECT * FROM person WHERE is_me = 1');
  if (meRows.length === 0) return { ok: false, reason: 'no-me' };
  if (meRows.length > 1) return { ok: false, reason: 'ambiguous-me' };
  const me = meRows[0];

  if (me.remote_uid && me.remote_uid !== account.uid) {
    // Signing in as somebody else on a phone that already holds a ledger. Silently
    // rebinding would re-author every historical entry to a stranger's account —
    // the same reasoning `bindDeviceToAccount` uses for the device key.
    return { ok: false, reason: 'other-account' };
  }

  const holder = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM person WHERE remote_uid = ? AND is_me = 0', [account.uid],
  );
  if (holder) await mergePerson(db, holder.id, me.id);

  const already = me.remote_uid === account.uid && (!account.email || me.email === account.email);
  if (!already) {
    await db.runAsync(
      'UPDATE person SET remote_uid = ?, email = COALESCE(email, ?) WHERE id = ?',
      [account.uid, account.email ?? null, me.id],
    );
  }

  const changed = !!holder || !already;
  if (changed) {
    for (const groupId of await sharedGroupsOfPerson(db, me.id)) {
      await markRosterDirty(db, groupId);
    }
  }
  return { ok: true, changed };
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

/**
 * Every shared group this person is in — so a rename reaches the phones that
 * display it. A name nobody recognises is the same problem as no name at all.
 */
async function sharedGroupsOfPerson(
  db: SQLite.SQLiteDatabase,
  personId: string,
): Promise<string[]> {
  const rows = await db.getAllAsync<{ group_id: string }>(
    `SELECT m.group_id FROM group_member m
       JOIN budget_group g ON g.id = m.group_id AND g.is_personal = 0
      WHERE m.person_id = ?`,
    [personId],
  );
  return rows.map(r => r.group_id);
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
  // A name only this phone knows is a person nobody else recognises.
  for (const g of await sharedGroupsOfPerson(db, personId)) await markRosterDirty(db, g);
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
  // The other phones have to learn who this is, or every entry naming them is
  // refused as `not-a-member` — silently, and for good.
  await markRosterDirty(db, groupId);
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
  await markRosterDirty(db, groupId);
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
 * Refused merges. A merge cannot be undone, so anything ambiguous stops here
 * rather than being resolved by whichever row happened to survive.
 */
export class MergePersonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MergePersonError';
  }
}

/** Every column outside `person` that names a person, and how a merge moves it. */
const MERGE_SIMPLE_COLUMNS: ReadonlyArray<readonly [table: string, column: string]> = [
  ['txn', 'author_person_id'],
  ['budget_group', 'created_by'],
  ['pending_txn', 'counterparty_id'],
  ['pending_txn', 'author_person_id'],
  ['pending_txn', 'payer_person_id'],
];

/**
 * Two rows are one person: fold the newcomer into the one already here.
 *
 * ## The money bug this used to have
 *
 * The composite-key tables were moved with `INSERT OR IGNORE` then `DELETE`.
 * When both rows were on the SAME transaction — which is precisely what a sync
 * name-collision produces — the `OR IGNORE` was ignored because the survivor
 * already had a row, and the `DELETE` then removed the other person's amount.
 * A ₹3,600 bill split two ways came out as payments ₹3,600 / shares ₹2,400:
 * permanently unbalanced, invisible, and past every guard, because
 * `validateShares` runs on write and never again.
 *
 * Two rows for one human on one expense means that human paid twice, or owes two
 * shares. The answer is to **add them**, which is what the upsert does. (The
 * `WHERE` in the SELECT is not optional: SQLite cannot parse `ON CONFLICT` after
 * an unfiltered `INSERT ... SELECT` without it.)
 *
 * ## Everything moves, or nothing does
 *
 * The old docstring claimed "every reference moves" and listed six things while
 * moving five, missing `budget_group.created_by` — so merging a group's creator
 * left `created_by` pointing at a deleted row, `isCreator` false for everybody,
 * and that group's budget and membership permanently uneditable with no screen
 * able to repair it. `MERGE_SIMPLE_COLUMNS` is the real list, in one place, so
 * the next column that names a person is one line rather than an omission.
 *
 * `txn_dispute` is deliberately absent: it is keyed on `by_uid`, a server account
 * id, not a local person id. The survivor inherits `remote_uid` below, so those
 * rows resolve to the right person with nothing moved.
 *
 * ## Trust fails closed
 *
 * Where the two rows disagree, the more cautious answer wins — globally and per
 * group. A merge must never *widen* what someone is allowed to write on your
 * ledger; stale-and-more-permissive is the one failure that matters here.
 */
export async function mergePerson(
  db: SQLite.SQLiteDatabase,
  fromId: string,
  intoId: string,
): Promise<void> {
  if (fromId === intoId) return;

  // Two accounts is not a duplicate — it is two people, or a mis-tap on a
  // one-way door. Discarding one silently (which COALESCE below would do) makes
  // every entry that account later authors arrive as `unknown-author`, with
  // nothing to point at. Refuse before anything is written.
  const pair = await db.getAllAsync<Person>(
    'SELECT * FROM person WHERE id IN (?, ?)', [fromId, intoId],
  );
  const from = pair.find(p => p.id === fromId);
  const into = pair.find(p => p.id === intoId);
  if (!from || !into) throw new MergePersonError('One of those people no longer exists.');
  if (from.remote_uid && into.remote_uid && from.remote_uid !== into.remote_uid) {
    throw new MergePersonError(
      'Those two are linked to different accounts, so they cannot be the same person.',
    );
  }
  // `is_me` is not a label, it is the row every balance is measured against.
  // Folding it into someone else re-authors your own history to them.
  if (from.is_me === 1) throw new MergePersonError('You cannot merge yourself into someone else.');

  await db.withTransactionAsync(async () => {
    for (const t of ['txn_payment', 'txn_share'] as const) {
      await db.runAsync(
        `INSERT INTO ${t} (txn_id, person_id, amount)
         SELECT txn_id, ?, amount FROM ${t} WHERE person_id = ?
         ON CONFLICT(txn_id, person_id) DO UPDATE SET amount = amount + excluded.amount`,
        [intoId, fromId],
      );
      await db.runAsync(`DELETE FROM ${t} WHERE person_id = ?`, [fromId]);
    }

    // Membership: keep the STRONGER role and the EARLIER join date. `OR IGNORE`
    // kept whatever the survivor already had, which silently demoted an admin to
    // member whenever the admin was the row being folded in.
    await db.runAsync(
      `INSERT INTO group_member (group_id, person_id, joined_at, role)
       SELECT group_id, ?, joined_at, role FROM group_member WHERE person_id = ?
       ON CONFLICT(group_id, person_id) DO UPDATE SET
         role      = CASE WHEN role = 'admin' OR excluded.role = 'admin' THEN 'admin' ELSE role END,
         joined_at = MIN(COALESCE(joined_at, excluded.joined_at), COALESCE(excluded.joined_at, joined_at))`,
      [intoId, fromId],
    );
    await db.runAsync('DELETE FROM group_member WHERE person_id = ?', [fromId]);

    // Per-group trust: 'review' wins over 'trusted' on disagreement.
    await db.runAsync(
      `INSERT INTO person_group_trust (person_id, group_id, trust_state, updated_at)
       SELECT ?, group_id, trust_state, updated_at FROM person_group_trust WHERE person_id = ?
       ON CONFLICT(person_id, group_id) DO UPDATE SET
         trust_state = CASE WHEN trust_state = 'review' OR excluded.trust_state = 'review'
                            THEN 'review' ELSE 'trusted' END,
         updated_at  = MAX(updated_at, excluded.updated_at)`,
      [intoId, fromId],
    );
    await db.runAsync('DELETE FROM person_group_trust WHERE person_id = ?', [fromId]);

    // Budget overrides are private to the person. Where both rows have one for
    // the same category, the survivor's is the one they have been living with;
    // the collision is dropped rather than added, because two allowances for one
    // category is not a bigger allowance, it is a duplicate.
    await db.runAsync(
      `DELETE FROM category_budget WHERE person_id = ? AND EXISTS (
         SELECT 1 FROM category_budget k
          WHERE k.person_id = ? AND k.group_id = category_budget.group_id
            AND k.category = category_budget.category AND k.period = category_budget.period)`,
      [fromId, intoId],
    );
    await db.runAsync('UPDATE category_budget SET person_id = ? WHERE person_id = ?', [intoId, fromId]);

    for (const [table, column] of MERGE_SIMPLE_COLUMNS) {
      await db.runAsync(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`, [intoId, fromId]);
    }
    // History about a member is history about the survivor now.
    await db.runAsync(
      "UPDATE audit_log SET entity_id = ? WHERE entity_type = 'member' AND entity_id = ?",
      [intoId, fromId],
    );

    // Delete BEFORE inheriting, and take the values from the row read up front
    // rather than a subselect.
    //
    // `idx_person_remote_uid` is unique over non-null `remote_uid`. Writing the
    // duplicate's account id onto the survivor while the duplicate still holds it
    // is two rows with one uid, so SQLite refuses the UPDATE and the whole merge
    // rolls back — in exactly the case that matters most, folding in a person row
    // that arrived from a peer's roster carrying their account id.
    await db.runAsync('DELETE FROM person WHERE id = ?', [fromId]);

    // The survivor keeps its own name and inherits anything it was missing.
    // Trust takes the more cautious of the two.
    await db.runAsync(
      `UPDATE person SET
         remote_uid  = COALESCE(remote_uid, ?),
         email       = COALESCE(email, ?),
         mobile      = COALESCE(mobile, ?),
         upi_vpa     = COALESCE(upi_vpa, ?),
         image_uri   = COALESCE(image_uri, ?),
         trust_state = CASE WHEN trust_state = 'review' OR ? = 'review' THEN 'review' ELSE trust_state END
       WHERE id = ?`,
      [from.remote_uid, from.email, from.mobile, from.upi_vpa, from.image_uri, from.trust_state, intoId],
    );
  });

  // Membership and names just changed, so every phone sharing a group with the
  // survivor is now holding a roster that names a person id this device deleted.
  // Without this, their entries resolve to nobody and the pull cursor holds.
  for (const groupId of await sharedGroupsOfPerson(db, intoId)) {
    await markRosterDirty(db, groupId);
  }
}
