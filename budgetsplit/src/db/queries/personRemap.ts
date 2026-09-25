import type * as SQLite from 'expo-sqlite';
import { selfPersonId } from '../../lib/sync/ids';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { queueAnswer, queueDelete, queueUpsert } from './syncQueue';

/**
 * Re-pointing a person's id, everywhere at once.
 *
 * The phone mints a random id for every person the moment they're typed in. The
 * server names an ACCOUNT holder deterministically, `user:<accountId>`
 * (`selfPersonId`), so every phone computes the same id for the same account.
 * Once a phone person turns out to be an account — "me" at first sign-in
 * (`identity.ts`), a friend when they're matched on Linked people or arrive in a
 * shared group — their id has to become that one, or the same human is two
 * people on this phone and a split names the wrong one.
 */

/**
 * Every column, besides `person.id` itself, that can name a person — a fixed list,
 * like `deletePerson`'s reference check, because a column that names a
 * person is a decision, not something to rediscover by grepping the schema.
 */
export const REMAP_COLUMNS: ReadonlyArray<readonly [table: string, column: string]> = [
  ['group_member', 'person_id'],
  ['txn_payment', 'person_id'],
  ['txn_share', 'person_id'],
  ['person_group_trust', 'person_id'],
  ['budget_group', 'created_by'],
  ['budget_group', 'pair_person_id'],
  ['category_budget', 'person_id'],
  ['pending_txn', 'author_person_id'],
  ['pending_txn', 'payer_person_id'],
  ['pending_txn', 'counterparty_id'],
  ['txn', 'author_person_id'],
  ['audit_log', 'actor_person_id'],
  ['friend_request', 'person_id'],
];

/**
 * `line_item.assigned_to` is the one reference that is not a plain column: a
 * JSON array of person ids (`useItemizedForm.ts`). Rewritten in JS because
 * SQLite's `json_each` can rewrite a value but not easily replace one element
 * and re-serialize — and this only ever touches the handful of items an
 * itemised bill actually assigned to this person.
 */
async function remapAssignedTo(db: SQLite.SQLiteDatabase, oldId: string, newId: string): Promise<void> {
  const rows = await db.getAllAsync<{ id: string; assigned_to: string }>(
    'SELECT id, assigned_to FROM line_item WHERE assigned_to LIKE ?', [`%${oldId}%`],
  );
  for (const row of rows) {
    let list: unknown;
    try { list = JSON.parse(row.assigned_to); } catch { continue; }
    if (!Array.isArray(list) || !list.includes(oldId)) continue;
    const next = list.map(x => (x === oldId ? newId : x));
    await db.runAsync('UPDATE line_item SET assigned_to = ? WHERE id = ?', [JSON.stringify(next), row.id]);
  }
}

/** Every reference to `oldId` now names `newId` (not `person.id` itself). Inside the caller's transaction. */
export async function remapPersonRows(db: SQLite.SQLiteDatabase, oldId: string, newId: string): Promise<void> {
  for (const [table, column] of REMAP_COLUMNS) {
    await db.runAsync(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`, [newId, oldId]);
  }
  await remapAssignedTo(db, oldId, newId);
}

/*
 * A primary key that other rows reference cannot be renamed while foreign keys
 * are enforced: re-pointing a child to `newId` first fails because that parent
 * row doesn't exist yet, and flipping `person.id` first orphans every child
 * still holding `oldId`. There is no order that satisfies both mid-transaction.
 *
 * The device itself never hits this: `applyConnectionPragmas` runs with
 * `foreign_keys` OFF always (DQ-19) — every `REFERENCES` in the schema is
 * documentation, not enforcement. This guard is for whoever turns them on
 * later, and for the test harness, which (unlike the device) defaults them ON.
 * Restored to whatever it was, never hard-coded. The pragma is a no-op inside a
 * transaction, so it wraps the transaction rather than sitting in it.
 */
export async function withForeignKeysOff(db: SQLite.SQLiteDatabase, fn: () => Promise<void>): Promise<void> {
  const fk = await db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys');
  const fkWasOn = !!fk?.foreign_keys;
  if (fkWasOn) await db.execAsync('PRAGMA foreign_keys = OFF');
  try {
    await fn();
  } finally {
    if (fkWasOn) await db.execAsync('PRAGMA foreign_keys = ON');
  }
}


export type AdoptResult = 'unchanged' | 'moved' | 'merged' | 'missing';

/**
 * A friend on this phone is this account: give them the account's person id, in
 * ONE transaction.
 *
 * - No row under the account's id yet: the friend's row simply takes it.
 * - A row already exists (a shared group's pull brought them first): the two are
 *   one human, so the phone's row folds into it — my naming of them, my trust in
 *   them, my notes win, as they do for any friend (`applyRows`).
 *
 * The queue names local ids, so its rows follow; and the server keeps my friend
 * entry under the person id, so the old one is retired and the new one sent.
 */
export async function adoptAccountId(
  db: SQLite.SQLiteDatabase,
  localId: string,
  accountUserId: string,
  /**
   * Ask the server to fold its copy of the placeholder in too (S21) — the default,
   * because this phone is the one that found out. Off when the news came FROM the
   * server (a pull naming the merge), which has nothing left to hear.
   */
  opts: { tellServer?: boolean } = {},
): Promise<AdoptResult> {
  return movePersonId(db, localId, selfPersonId(accountUserId), accountUserId, (opts.tellServer ?? true) ? 'adopt' : 'pulled');
}

/**
 * The reverse, for a binding undone on Linked people: a row still named
 * `user:<account>` after its account is cleared would catch that account's rows
 * on the next shared-group pull — the wrong match, silently re-made. It goes back
 * to a fresh local id, like any person typed in.
 */
export async function releaseAccountId(db: SQLite.SQLiteDatabase, personId: string): Promise<string> {
  if (!personId.startsWith(selfPersonId(''))) return personId;
  const newId = uuid();
  const r = await movePersonId(db, personId, newId, null, 'release');
  return r === 'moved' ? newId : personId;
}

/**
 * - `adopt`: this phone found out. My friend row moves, and the server is asked to
 *   fold its copy of the placeholder in.
 * - `release`: a binding undone. My friend row moves; nothing else knew.
 * - `pulled`: the server already folded it, for everyone — the friend rows too — so
 *   there is nothing to send. Queuing my friend row here would make the account a
 *   friend of every member of the group.
 */
type MoveMode = 'adopt' | 'release' | 'pulled';

async function movePersonId(
  db: SQLite.SQLiteDatabase, localId: string, newId: string, remoteUid: string | null, mode: MoveMode,
): Promise<AdoptResult> {
  if (localId === newId) return 'unchanged';
  const p = await db.getFirstAsync<{ is_me: number }>('SELECT is_me FROM person WHERE id = ?', [localId]);
  if (!p) return 'missing';
  if (p.is_me === 1) return 'unchanged';   // "me" moves at first sign-in, in identity.ts
  const clash = !!(await db.getFirstAsync('SELECT 1 AS n FROM person WHERE id = ?', [newId]));

  await withForeignKeysOff(db, () => db.withTransactionAsync(async () => {
    await remapPersonRows(db, localId, newId);
    if (clash) {
      await db.runAsync(
        `UPDATE person SET (name, avatar_color, email, mobile, image_uri, upi_vpa,
                            receivable_state, receivable_state_at, trust_state, trust_state_at)
             = (SELECT name, avatar_color, email, mobile, image_uri, upi_vpa,
                       receivable_state, receivable_state_at, trust_state, trust_state_at
                  FROM person WHERE id = ?),
               remote_uid = ?
         WHERE id = ?`,
        [localId, remoteUid, newId],
      );
      await db.runAsync('DELETE FROM person WHERE id = ?', [localId]);
    } else {
      await db.runAsync('UPDATE person SET id = ?, remote_uid = ? WHERE id = ?', [newId, remoteUid, localId]);
    }
    await db.runAsync("UPDATE OR REPLACE sync_queue SET local_id = ? WHERE local_table = 'person' AND local_id = ?", [newId, localId]);
    await db.runAsync(
      `UPDATE OR REPLACE sync_queue SET local_id = substr(local_id, 1, instr(local_id, '|')) || ?
        WHERE local_table = 'group_member' AND local_id LIKE '%|' || ?`, [newId, localId]);
    await db.runAsync(
      `UPDATE OR REPLACE sync_queue SET local_id = ? || substr(local_id, instr(local_id, '|'))
        WHERE local_table = 'person_group_trust' AND local_id LIKE ? || '|%'`, [newId, localId]);
    if (mode !== 'pulled') {
      await queueDelete(db, 'person', localId, { id: localId });
      await queueUpsert(db, 'person', newId);
    }
    if (mode === 'adopt' && remoteUid) await queueAnswer(db, 'person_merge', localId, { into_user: remoteUid });
  }));
  return clash ? 'merged' : 'moved';
}

/**
 * Before a pull applies a group's members: anyone it names by account whom this
 * phone knows under another id takes the account's id first — or the pull would
 * add them a second time.
 */
export async function adoptPulledAccounts(db: SQLite.SQLiteDatabase, members: Array<Record<string, unknown>>): Promise<void> {
  for (const m of members) {
    // The server folded a placeholder into an account (S21): so does this phone.
    const into = m.person_merged_into;
    if (typeof into === 'string' && into.startsWith(selfPersonId('')) && typeof m.person_id === 'string') {
      await adoptAccountId(db, m.person_id, into.slice(selfPersonId('').length), { tellServer: false });
      continue;
    }
    const uid = m.person_user_id;
    if (typeof uid !== 'string' || !uid) continue;
    const local = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM person WHERE remote_uid = ? AND is_me = 0 AND id <> ?', [uid, selfPersonId(uid)],
    );
    for (const l of local) await adoptAccountId(db, l.id, uid);
  }
}
