import type * as SQLite from 'expo-sqlite';
import { selfPersonId } from '../../lib/sync/ids';
import { setLinkedUser } from './syncApply';
import { MONEY_PROFILE_ID, queueUpsert, queueUpsertWhere, type QueueTable } from './syncQueue';
import { remapPersonRows, withForeignKeysOff } from './personRemap';

/**
 * Bind this phone's ledger to an account (SPEC-SERVER.md §4, task S13).
 *
 * The phone's `is_me` person is minted locally, with a random uuid, the first
 * time the app is opened — long before anyone signs in. The server's people
 * table names an account holder deterministically, `user:<accountId>`
 * (`selfPersonId`), so that any phone signed into the same account computes the
 * same id with no round trip. The two only agree once this has run.
 *
 * This is the riskiest step in the whole sync rebuild: every row that names "me"
 * has to be re-pointed from the old id to the new one, in the SAME local
 * transaction, or a crash midway leaves some rows saying one thing and some
 * another — a split ledger with no error anywhere. `REMAP_COLUMNS` below is the
 * same kind of fixed list `deletePerson`'s reference check already uses for
 * exactly this reason: a column that names a person is a decision, not
 * something to rediscover by grepping the schema each time one is added.
 *
 * Idempotent: called again for the same account, it is a no-op. Refused outright
 * — never guessed — if the target id is already someone else's row (`id-taken`)
 * or if this device's own identity is ambiguous.
 */

export type RemapResult =
  | { ok: true; oldId: string; newId: string; changed: boolean }
  | { ok: false; reason: 'no-me' | 'ambiguous-me' | 'id-taken' };

type Account = { userId: string; email?: string | null };

/** Work out the remap without writing anything: who "me" is now, and who it becomes. */
async function planRemap(db: SQLite.SQLiteDatabase, account: Account): Promise<RemapResult> {
  const meRows = await db.getAllAsync<{ id: string }>('SELECT id FROM person WHERE is_me = 1');
  if (meRows.length === 0) return { ok: false, reason: 'no-me' };
  if (meRows.length > 1) return { ok: false, reason: 'ambiguous-me' };
  const oldId = meRows[0].id;
  const newId = selfPersonId(account.userId);
  if (oldId === newId) return { ok: true, oldId, newId, changed: false };
  // A wrong answer here re-authors every row it touches to a stranger. Refuse
  // rather than guess: this id must not already belong to somebody else's row.
  const clash = await db.getFirstAsync('SELECT 1 AS n FROM person WHERE id = ?', [newId]);
  if (clash) return { ok: false, reason: 'id-taken' };
  return { ok: true, oldId, newId, changed: true };
}

/** The remap's writes. Runs inside the caller's transaction. */
async function applyRemap(db: SQLite.SQLiteDatabase, plan: RemapResult & { ok: true }, account: Account): Promise<void> {
  const { oldId, newId } = plan;
  if (plan.changed) await remapPersonRows(db, oldId, newId);
  // The identity row itself, last: every reference above already points at
  // `newId`, so nothing is left pointing at a row that is about to vanish. Never
  // overwrites an email the user has set.
  await db.runAsync(
    'UPDATE person SET id = ?, remote_uid = ?, email = COALESCE(email, ?) WHERE id = ?',
    [newId, account.userId, account.email ?? null, oldId],
  );
  await adoptLinkedFriends(db);
}

/**
 * Everyone already matched to an account takes that account's id too, as "me"
 * just did. The server names an account holder `user:<account>` wherever it
 * appears; a friend still under a local id here would go up as a member under
 * one id and in every split under another, and the server refuses a split
 * naming someone who isn't in the group. On a restore the pull would then bring
 * the account id back as a second person beside the local one.
 *
 * Skipped only when two local rows claim the same account — that is for Linked
 * people to settle, not something to merge silently here.
 */
async function adoptLinkedFriends(db: SQLite.SQLiteDatabase): Promise<void> {
  const friends = await db.getAllAsync<{ id: string; remote_uid: string }>(
    `SELECT id, remote_uid FROM person p
      WHERE is_me = 0 AND remote_uid IS NOT NULL AND remote_uid <> ''
        AND (SELECT COUNT(*) FROM person q WHERE q.remote_uid = p.remote_uid) = 1`,
  );
  for (const f of friends) {
    const newId = selfPersonId(f.remote_uid);
    if (f.id === newId || await db.getFirstAsync('SELECT 1 AS n FROM person WHERE id = ?', [newId])) continue;
    await remapPersonRows(db, f.id, newId);
    await db.runAsync('UPDATE person SET id = ? WHERE id = ?', [newId, f.id]);
    await db.runAsync(
      `UPDATE OR REPLACE sync_queue SET local_id = substr(local_id, 1, instr(local_id, '|')) || ?
        WHERE local_table = 'group_member' AND local_id LIKE '%|' || ?`, [newId, f.id]);
    await db.runAsync(
      `UPDATE OR REPLACE sync_queue SET local_id = ? || substr(local_id, instr(local_id, '|'))
        WHERE local_table = 'person_group_trust' AND local_id LIKE ? || '|%'`, [newId, f.id]);
    await db.runAsync("UPDATE OR REPLACE sync_queue SET local_id = ? WHERE local_table = 'person' AND local_id = ?", [newId, f.id]);
  }
}

export async function remapIdentity(db: SQLite.SQLiteDatabase, account: Account): Promise<RemapResult> {
  const plan = await planRemap(db, account);
  if (!plan.ok) return plan;
  await withForeignKeysOff(db, () => db.withTransactionAsync(() => applyRemap(db, plan, account)));
  return plan;
}

/**
 * Join this phone's ledger to an account (SPEC-SERVER.md §4, task S14): the remap,
 * optionally queueing every existing row for upload, and the link that lets sync
 * run — in ONE transaction, so a phone is never remapped-but-unlinked or linked
 * with half its rows queued.
 *
 * The backfill is what makes "Upload" upload anything. Writers only queue what
 * they change from now on; a ledger written before the queue existed has nothing
 * in it, and a push of an empty queue sends nothing, successfully.
 */
export async function linkLedger(
  db: SQLite.SQLiteDatabase,
  account: Account,
  opts: { backfill: boolean },
): Promise<RemapResult> {
  const plan = await planRemap(db, account);
  if (!plan.ok) return plan;
  await withForeignKeysOff(db, () => db.withTransactionAsync(async () => {
    await applyRemap(db, plan, account);
    if (opts.backfill) await backfillQueue(db);
    await setLinkedUser(db, account.userId);
  }));
  return plan;
}

/**
 * Every row this phone holds that the server should have. Someone else's entries
 * are skipped — they are theirs to send. Members go up after their group and
 * before any entry that names them (the engine's RANK), so a split never names
 * someone the server has not seen join.
 *
 * Exported for `mergeLedger.ts`'s `queueWhatsNew`, which runs it and then prunes
 * what turns out to be already on the server — the same "queue everything"
 * starting point Upload uses.
 */
export async function backfillQueue(db: SQLite.SQLiteDatabase): Promise<void> {
  const all: Array<[QueueTable, string]> = [
    ['person', 'SELECT id FROM person'],
    ['person_group_trust', "SELECT person_id || '|' || group_id AS id FROM person_group_trust"],
    ['budget_group', 'SELECT id FROM budget_group'],
    ['group_member', "SELECT group_id || '|' || person_id AS id FROM group_member"],
    ['category', 'SELECT id FROM category'],
    ['category_budget', 'SELECT id FROM category_budget'],
    ['asset', 'SELECT id FROM asset'],
    ['savings_goal', 'SELECT id FROM savings_goal'],
    ['savings_txn', 'SELECT id FROM savings_txn'],
    ['pending_txn', 'SELECT id FROM pending_txn'],
    ['txn', 'SELECT id FROM txn WHERE is_deleted = 0 AND author_person_id IS NULL'],
  ];
  for (const [table, sql] of all) await queueUpsertWhere(db, table, sql);
  if (await db.getFirstAsync("SELECT 1 AS n FROM settings WHERE key LIKE 'money.%'")) {
    await queueUpsert(db, 'settings', MONEY_PROFILE_ID);
  }
}

/**
 * Does this phone hold anything a person would mind losing? The first-run seed
 * (one "me", the Personal group, the category catalog) does not count — every
 * install has it — so a phone fresh out of the box answers no.
 */
export async function phoneHasData(db: SQLite.SQLiteDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ present: number }>(
    `SELECT (EXISTS (SELECT 1 FROM txn WHERE is_deleted = 0)
          OR EXISTS (SELECT 1 FROM asset)
          OR EXISTS (SELECT 1 FROM savings_goal)
          OR EXISTS (SELECT 1 FROM category_budget)
          OR EXISTS (SELECT 1 FROM pending_txn)
          OR EXISTS (SELECT 1 FROM budget_group WHERE is_personal = 0)
          OR EXISTS (SELECT 1 FROM person WHERE is_me = 0)
          OR EXISTS (SELECT 1 FROM settings WHERE key LIKE 'money.%')) AS present`,
  );
  return row?.present === 1;
}

/**
 * The one row an emptied phone needs before a pull can fill it: "me", already
 * under the account's id. The pull brings the name, the Personal group and the
 * rest. Runs right after `restoreAllTables` has emptied every table.
 */
export async function seedAccountMe(
  db: SQLite.SQLiteDatabase,
  account: Account & { name?: string | null },
): Promise<void> {
  await db.runAsync(
    'INSERT INTO person (id, name, avatar_color, is_me, remote_uid, email) VALUES (?, ?, ?, 1, ?, ?)',
    [selfPersonId(account.userId), account.name || 'Me', '#4F46E5', account.userId, account.email ?? null],
  );
}
