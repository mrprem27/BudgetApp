import type * as SQLite from 'expo-sqlite';
import { remapPersonRows, withForeignKeysOff } from './personRemap';
import { backfillQueue } from './identity';
import { buildOutbound } from './syncApply';
import { dropQueueRow, queuedRows, rowKey, serverVersions } from './syncQueue';
import { findDuplicateTxnId } from './transactions';
import type { MapContext } from '../../lib/sync/rowMap';

/**
 * Merging a phone's ledger into an account that already has one of its own
 * (`FirstSignInStep` kind `'ask'`, choice "Merge"). The rule the user set:
 * everything the phone holds is added as new, even if it looks identical to
 * something the account already has — no name matching, no dedupe — with
 * exactly two exceptions, because the account has exactly one of each:
 *
 *   - the phone's "me" person, already folded into `user:<accountId>` by
 *     `linkLedger` before any of this runs;
 *   - the phone's Personal group, folded here into the account's;
 *
 * and one opt-in exception the user asked for: two people who share an email
 * are the same person. Anything else — a friend who looks like an account
 * friend but has no email in common, two groups that happen to share a name —
 * stays two rows, combinable later by hand.
 */

/**
 * Group-id columns safe to blanket-remap: no unique index is built over the
 * column alone, so two rows can never collide on it. `category_budget.group_id`
 * is NOT here — its partial unique indexes (schema.ts `INDEXES`) can collide
 * with a budget line the account already pulled down, so it gets its own pass
 * in `foldPersonalGroup`, below. `group_member.group_id` and
 * `person_group_trust.group_id` aren't here either: a Personal group's only
 * member is its owner, already remapped, so those rows are dropped rather than
 * merged — remapping risks exactly the collision this list exists to avoid.
 */
export const GROUP_REMAP_COLUMNS: ReadonlyArray<readonly [table: string, column: string]> = [
  ['txn', 'group_id'],
  ['pending_txn', 'dest_group_id'],
  ['audit_log', 'group_id'],
];

/**
 * Fold the phone's Personal group into the account's — the one the pull just
 * brought down. Runs inside the caller's transaction.
 */
export async function foldPersonalGroup(db: SQLite.SQLiteDatabase, oldId: string, newId: string): Promise<void> {
  if (oldId === newId) return;
  // The phone's only member is its owner, already "me" under the account's id
  // by the time this runs — and "me" is already a member of the account's
  // Personal group, since the server made it that way. Nothing to keep.
  await db.runAsync('DELETE FROM group_member WHERE group_id = ?', [oldId]);
  await db.runAsync('DELETE FROM person_group_trust WHERE group_id = ?', [oldId]);

  // A budget line for the same (category, period, person) can't coexist with
  // one the account already has — the partial unique indexes forbid it — so
  // the account's line wins (it was pulled first) and the phone's is dropped.
  const clashing = await db.getAllAsync<{ id: string }>(
    `SELECT b.id FROM category_budget b
      WHERE b.group_id = ?1
        AND EXISTS (SELECT 1 FROM category_budget o
                     WHERE o.group_id = ?2 AND o.category = b.category AND o.period = b.period
                       AND o.person_id IS b.person_id)`,
    [oldId, newId],
  );
  for (const row of clashing) await db.runAsync('DELETE FROM category_budget WHERE id = ?', [row.id]);
  await db.runAsync('UPDATE category_budget SET group_id = ? WHERE group_id = ?', [newId, oldId]);

  for (const [table, column] of GROUP_REMAP_COLUMNS) {
    await db.runAsync(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`, [newId, oldId]);
  }
  await db.runAsync('DELETE FROM budget_group WHERE id = ?', [oldId]);
}

/**
 * The one automatic person fold: a phone-typed friend whose email matches
 * exactly one person the account pulled down. `candidateIds` is captured
 * BEFORE the pull (by the caller) — friends and members the pull itself adds
 * must never be mistaken for a phone-side row to fold away.
 *
 * Ambiguous (more than one account-side match, or none) is left as two rows —
 * a guess here would silently attach someone's entries to the wrong person,
 * which "Same person as…" (combining people by hand) exists to do safely.
 */
export async function foldSameEmailPeople(db: SQLite.SQLiteDatabase, candidateIds: readonly string[]): Promise<void> {
  if (candidateIds.length === 0) return;
  // Everyone the pull just brought down: every person NOT already here before it
  // ran, "me" aside. (`sync_version.entity_id` is composite — `userId:personId`
  // for a friend, `groupId:personId` for a member — so it can't be joined
  // against `person.id` directly; this is simpler and exactly as correct.)
  const placeholders = candidateIds.map(() => '?').join(',');
  const accountPeople = await db.getAllAsync<{ id: string; email: string | null }>(
    `SELECT id, email FROM person
      WHERE is_me = 0 AND id NOT IN (${placeholders})
        AND email IS NOT NULL AND trim(email) <> ''`,
    candidateIds as SQLite.SQLiteBindValue[],
  );
  const byEmail = new Map<string, string[]>();
  for (const p of accountPeople) {
    const key = p.email!.trim().toLowerCase();
    byEmail.set(key, [...(byEmail.get(key) ?? []), p.id]);
  }

  for (const id of candidateIds) {
    const row = await db.getFirstAsync<{ email: string | null }>('SELECT email FROM person WHERE id = ?', [id]);
    if (!row?.email?.trim()) continue;
    const matches = byEmail.get(row.email.trim().toLowerCase());
    if (!matches || matches.length !== 1 || matches[0] === id) continue;
    // Same merge, same field list, as `movePersonId`'s clash branch
    // (`personRemap.ts`): the row the user actually edited — this phone's own
    // friend entry — wins on every field the account's fresh pull could not
    // have set from here.
    await remapPersonRows(db, id, matches[0]);
    await db.runAsync(
      `UPDATE person SET (name, avatar_color, email, mobile, image_uri, upi_vpa,
                          receivable_state, receivable_state_at, trust_state, trust_state_at)
           = (SELECT name, avatar_color, email, mobile, image_uri, upi_vpa,
                     receivable_state, receivable_state_at, trust_state, trust_state_at
                FROM person WHERE id = ?)
       WHERE id = ?`,
      [id, matches[0]],
    );
    await db.runAsync('DELETE FROM person WHERE id = ?', [id]);
  }
}

/**
 * What's left to send after the folds above: everything the phone holds that
 * the account doesn't already have a confirmed version of. Runs
 * `backfillQueue` (identity.ts) — the same "queue every existing row" the
 * plain Upload case uses — then drops any row whose outbound rows are ALL
 * already-known server entities. A row only partly known (rare: a `person`
 * queue row builds both a `friends` and a `trust_settings` entity) is kept
 * whole rather than split — sending an entity the server already has again is
 * a harmless no-op, and guessing which half to drop is not worth the risk.
 */
export async function queueWhatsNew(db: SQLite.SQLiteDatabase, userId: string): Promise<void> {
  await backfillQueue(db);
  const versions = await serverVersions(db);
  const ctx: MapContext = { userId };
  for (const row of await queuedRows(db, 100_000)) {
    const built = await buildOutbound(db, row, ctx);
    if (built === null) continue;                      // not sendable yet — leave it queued
    if (built.length === 0) { await dropQueueRow(db, row.queue_id); continue; }
    if (built.every(o => versions.has(rowKey(o.entity, o.entityId)))) await dropQueueRow(db, row.queue_id);
  }
}

export type MergeDuplicate = {
  /** This phone's own row (kept, unless the user removes it). */
  mine: string;
  /** The account's matching row. */
  theirs: string;
  category: string;
  amount: number;
  date: number;
};

/**
 * Merge adds everything as new — no name matching, no dedupe (`DQ-94`). The one
 * exception the user asked for isn't automatic: a phone-origin expense that
 * matches an account-origin one by the app's existing duplicate rule
 * (`findDuplicateTxnId` — same group, category, amount, within
 * `DUPLICATE_WINDOW_MS`) is listed for a person to decide, never dropped
 * silently. Two identical expenses on the SAME side are never flagged:
 * `phoneTxnIds` is excluded as a whole set, so one phone row can only ever
 * match an account row, not another phone row.
 *
 * Runs after the fold, so `groupId` already means the same thing on both sides
 * (the phone's Personal group has been folded into the account's by then).
 */
export async function findPossibleDuplicates(
  db: SQLite.SQLiteDatabase,
  phoneTxnIds: readonly string[],
): Promise<MergeDuplicate[]> {
  if (phoneTxnIds.length === 0) return [];
  const placeholders = phoneTxnIds.map(() => '?').join(',');
  const mine = await db.getAllAsync<{ id: string; group_id: string; category: string; date: number; kind: string; total: number }>(
    `SELECT t.id, t.group_id, t.category, t.date, t.kind, COALESCE(SUM(p.amount), 0) AS total
       FROM txn t LEFT JOIN txn_payment p ON p.txn_id = t.id
      WHERE t.id IN (${placeholders}) AND t.is_deleted = 0 AND t.recur_freq IS NULL
      GROUP BY t.id`,
    phoneTxnIds as SQLite.SQLiteBindValue[],
  );
  const out: MergeDuplicate[] = [];
  for (const row of mine) {
    // Matches Quick Add / Review's own rule: expenses only (`transactions.ts`
    // `findDuplicatesAmong`) — an income or settlement repeating at the same
    // amount is ordinary.
    if (row.kind !== 'expense') continue;
    const theirs = await findDuplicateTxnId(db, row.group_id, row.category, row.total, row.date, phoneTxnIds);
    if (theirs) out.push({ mine: row.id, theirs, category: row.category, amount: row.total, date: row.date });
  }
  return out;
}

/** The three folds, each its own transaction (mirrors `linkLedger`'s pattern). */
export async function mergeLedger(
  db: SQLite.SQLiteDatabase,
  userId: string,
  personalGroup: { oldId: string; newId: string } | null,
  emailCandidates: readonly string[],
): Promise<void> {
  if (personalGroup) {
    await withForeignKeysOff(db, () => db.withTransactionAsync(() => foldPersonalGroup(db, personalGroup.oldId, personalGroup.newId)));
  }
  await withForeignKeysOff(db, () => db.withTransactionAsync(() => foldSameEmailPeople(db, emailCandidates)));
  await withForeignKeysOff(db, () => db.withTransactionAsync(() => queueWhatsNew(db, userId)));
}
