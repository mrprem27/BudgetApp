import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { logAudit } from './audit';

export type BudgetGroup = {
  id: string;
  name: string;
  icon: string;
  color: string;
  /**
   * `limit_daily` / `limit_monthly` / `limit_yearly` are deliberately absent.
   *
   * The columns still exist on `budget_group` (dropping one in SQLite needs a
   * table rebuild, which is not worth a migration for three unused fields), but
   * nothing has ever written them — see the REMOVED note in `lib/budget.ts`, which
   * explains they were a second, contradictory answer to "does unused budget roll
   * over?" alongside category budgets. Carrying them on the type advertised a
   * group-level budget the app does not have.
   */
  carry_over: number;
  is_shared: number;
  is_archived: number;
  is_personal: number;
  simplify_debt: number;
  default_split: SplitMode;
  created_at: number;
  /** Immutable creator. Always an admin; can never be removed or demoted. */
  created_by: string | null;
};

import type { SplitMode, GroupRole } from '../../constants/enums';
import {
  canChangeRole, canDeleteGroup, PermissionError, type GroupContext,
} from '../../lib/permissions';
export type { SplitMode } from '../../constants/enums';

export async function getAllGroups(db: SQLite.SQLiteDatabase): Promise<BudgetGroup[]> {
  return db.getAllAsync<BudgetGroup>(
    'SELECT * FROM budget_group WHERE is_archived = 0 ORDER BY created_at ASC',
  );
}

/**
 * Groups ordered for a "where does this go?" picker: Personal pinned first, then
 * whichever group you used most recently, then creation order as a tiebreak.
 *
 * `getAllGroups` is `created_at ASC`, which is why the Add screen's group pills
 * were ordered by age — while both `FEATURES_AND_FLOWS.md` §7.1 and §22 described
 * them as "frequent-group pills". Nothing computed that. This is the query that
 * makes the docs true; it mirrors `getCategoriesByFrequency`.
 *
 * Personal stays pinned rather than competing on recency: it's the safe default
 * destination, and a picker whose first row moves around is harder to aim at than
 * one that saves a scroll.
 */
export async function getGroupsByRecentUse(db: SQLite.SQLiteDatabase): Promise<BudgetGroup[]> {
  return db.getAllAsync<BudgetGroup>(
    `SELECT g.* FROM budget_group g
     LEFT JOIN (
       SELECT group_id, MAX(date) AS last_used
         FROM txn
        WHERE is_deleted = 0 AND recur_freq IS NULL
        GROUP BY group_id
     ) t ON t.group_id = g.id
     WHERE g.is_archived = 0
     ORDER BY g.is_personal DESC, COALESCE(t.last_used, 0) DESC, g.created_at ASC`,
  );
}

export async function getGroupById(db: SQLite.SQLiteDatabase, id: string): Promise<BudgetGroup | null> {
  return db.getFirstAsync<BudgetGroup>('SELECT * FROM budget_group WHERE id = ?', [id]);
}

/**
 * The Personal group. Its budget lines are **My Budget** (`isGlobalBudgetGroup` in
 * `lib/budget`), so this is the one place that answers "which group is Personal?".
 *
 * No `?? groups[0]` fallback, deliberately: substituting the oldest group promotes
 * a *shared* group's budget into the global cap, and at one call site labelled that
 * group's transactions "Personal". Absence means a corrupt DB — `null` is the
 * honest answer.
 */
export async function getPersonalGroup(db: SQLite.SQLiteDatabase): Promise<BudgetGroup | null> {
  return db.getFirstAsync<BudgetGroup>(
    'SELECT * FROM budget_group WHERE is_personal = 1 ORDER BY created_at ASC LIMIT 1',
  );
}

/** Same answer from a list already in hand. Same rule, same no-fallback. */
export function personalGroupOf(groups: BudgetGroup[]): BudgetGroup | null {
  return groups.find(g => g.is_personal === 1) ?? null;
}

/**
 * Every group whose lines are a **group** budget — all but Personal. Cross-group
 * budget rollups map over this, never `getAllGroups`: the Personal group's lines
 * are the global cap, which already covers spend inside each of these groups.
 */
export function sharedGroupsOf(groups: BudgetGroup[]): BudgetGroup[] {
  return groups.filter(g => g.is_personal !== 1);
}

/** What a breakdown needs to name and colour one slice of spend. */
export type GroupRef = { name: string; color: string; isPersonal: boolean };

/**
 * Group id → its name and colour, for any surface that breaks a figure down by
 * group. The only thing that existed before was a name-only map built inline on
 * category detail, which is why that breakdown had no colours.
 */
export function groupRefs(groups: BudgetGroup[]): Record<string, GroupRef> {
  return Object.fromEntries(
    groups.map(g => [g.id, { name: g.name, color: g.color, isPersonal: g.is_personal === 1 }]),
  );
}

export async function getArchivedGroups(db: SQLite.SQLiteDatabase): Promise<BudgetGroup[]> {
  return db.getAllAsync<BudgetGroup>(
    'SELECT * FROM budget_group WHERE is_archived = 1 ORDER BY created_at ASC',
  );
}

export async function unarchiveGroup(db: SQLite.SQLiteDatabase, groupId: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    const g = await db.getFirstAsync<BudgetGroup>('SELECT * FROM budget_group WHERE id=?', [groupId]);
    await db.runAsync('UPDATE budget_group SET is_archived=0 WHERE id=?', [groupId]);
    await logAudit(db, {
      entityType: 'group', entityId: groupId, groupId,
      action: 'updated', summary: `Restored group · ${g?.name ?? ''}`,
    });
  });
}

export async function insertGroup(
  db: SQLite.SQLiteDatabase,
  name: string,
  icon: string,
  color: string,
  memberIds: string[],
  defaultSplit: SplitMode = 'equal',
  /**
   * Who is creating this. Recorded immutably: they can never be removed or demoted.
   *
   * Optional, and **defaulted to the `is_me` person when omitted** — that default
   * is the entire point. As a plain optional it was a footgun that every caller
   * stepped on: `created_by` came out NULL, every member got `'member'`, and the
   * group had **no admin at all**. Nobody could then edit its budget or manage
   * members, permanently, with the write path correctly refusing and no UI able to
   * repair it. `is_me` is the same answer the creator backfill gives existing
   * groups, and it is true by construction: with no sync, you created every group
   * on this device.
   */
  creatorId?: string,
): Promise<BudgetGroup> {
  const id = uuid();
  const now = Date.now();
  const creator = creatorId
    ?? (await db.getFirstAsync<{ id: string }>('SELECT id FROM person WHERE is_me = 1 LIMIT 1'))?.id
    ?? null;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO budget_group (id, name, icon, color, carry_over, is_shared, is_archived, default_split, created_at, created_by)
       VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?, ?)`,
      [id, name, icon, color, defaultSplit, now, creator],
    );
    // The creator is always a member of their own group, even if the caller forgot
    // to include them — a group whose creator is not in it has no un-removable
    // admin, which is exactly the state `canRemoveMember` exists to prevent.
    const ids = creator && !memberIds.includes(creator) ? [creator, ...memberIds] : memberIds;
    for (const pid of ids) {
      await db.runAsync(
        'INSERT OR IGNORE INTO group_member (group_id, person_id, joined_at, role) VALUES (?, ?, ?, ?)',
        [id, pid, now, pid === creator ? 'admin' : 'member'],
      );
    }
    // Categories are a single global catalog now (seeded once in openDB) — groups
    // no longer seed their own copies.
  });

  return { id, name, icon, color, carry_over: 0, is_shared: 0, is_archived: 0, is_personal: 0, simplify_debt: 1, default_split: defaultSplit, created_at: now, created_by: creator };
}

export async function setSimplifyDebt(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  on: boolean,
): Promise<void> {
  await db.runAsync('UPDATE budget_group SET simplify_debt=? WHERE id=?', [on ? 1 : 0, groupId]);
}

export async function updateGroup(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  name: string,
  icon: string,
  color: string,
  defaultSplit?: SplitMode,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    if (defaultSplit) {
      await db.runAsync(
        'UPDATE budget_group SET name=?, icon=?, color=?, default_split=? WHERE id=?',
        [name, icon, color, defaultSplit, groupId],
      );
    } else {
      await db.runAsync(
        'UPDATE budget_group SET name=?, icon=?, color=? WHERE id=?',
        [name, icon, color, groupId],
      );
    }
    await logAudit(db, {
      entityType: 'group', entityId: groupId, groupId,
      action: 'updated', summary: `Updated group · ${name}`,
    });
  });
}

export type DeleteGroupResult = {
  ok: boolean;
  /**
   * Receipt files belonging to the deleted transactions. The caller must unlink
   * these (`deleteAttachment`) — this layer deliberately doesn't touch the file
   * system, so `db/queries` stays free of native modules and testable.
   */
  orphanedAttachments: string[];
};

/**
 * Hard-delete a group and everything tied to it (transactions, splits, line
 * items, members, budgets, its audit history). Never deletes the Personal group.
 * Irreversible — the caller must confirm first, and must unlink the returned
 * attachment files.
 */
export async function deleteGroup(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  /** Who is deleting. Creator-only — this destroys every member's history. */
  actorId: string,
): Promise<DeleteGroupResult> {
  const g = await db.getFirstAsync<BudgetGroup>('SELECT * FROM budget_group WHERE id=?', [groupId]);
  if (!g || g.is_personal === 1) return { ok: false, orphanedAttachments: [] };
  if (!canDeleteGroup(await getGroupContext(db, groupId, actorId))) {
    throw new PermissionError('delete this group');
  }

  // Read the receipt paths BEFORE the rows go: once the txns are deleted there is
  // no way left to find them, and they'd sit on disk counting toward the storage
  // total forever.
  const attachments = await db.getAllAsync<{ attachment_uri: string }>(
    'SELECT attachment_uri FROM txn WHERE group_id=? AND attachment_uri IS NOT NULL', [groupId],
  );

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM txn_payment WHERE txn_id IN (SELECT id FROM txn WHERE group_id=?)`, [groupId]);
    await db.runAsync(
      `DELETE FROM txn_share WHERE txn_id IN (SELECT id FROM txn WHERE group_id=?)`, [groupId]);
    await db.runAsync(
      `DELETE FROM line_item WHERE txn_id IN (SELECT id FROM txn WHERE group_id=?)`, [groupId]);
    await db.runAsync(
      `DELETE FROM recur_skip WHERE series_id IN (SELECT id FROM txn WHERE group_id=?)`, [groupId]);
    /*
     * The delivery queue and the pull cursor, before the entries they name.
     *
     * `sync_outbox.entry_id REFERENCES txn(id)`, so leaving these behind points
     * every queued row at an id that is about to stop existing — the same defect
     * a restore had, arriving by a second route. The cursor has to go too: keeping
     * it would mean that re-joining this group later starts from a timestamp that
     * skips its entire history.
     */
    await db.runAsync('DELETE FROM sync_outbox WHERE group_id=?', [groupId]);
    await db.runAsync('DELETE FROM settings WHERE key=?', [`sync.cursor.${groupId}`]);
    await db.runAsync('DELETE FROM txn WHERE group_id=?', [groupId]);
    await db.runAsync('DELETE FROM group_member WHERE group_id=?', [groupId]);
    // Unreviewed imports that were drafted into this group. Left pointing at a
    // dead group they became permanently un-committable and sat in Review forever.
    // Reset rather than delete — the row is a real imported transaction the user
    // has not classified yet, and only its *destination* died with the group. The
    // split draft and counterparty go too: both name members that no longer exist,
    // so keeping them would only re-break the commit.
    await db.runAsync(
      `UPDATE pending_txn SET dest_group_id = NULL, split_draft = NULL, counterparty_id = NULL
       WHERE dest_group_id = ?`,
      [groupId],
    );
    // Categories are a global catalog now — not owned by the group. Only this
    // group's budget lines go.
    await db.runAsync('DELETE FROM category_budget WHERE group_id=?', [groupId]);
    await db.runAsync('DELETE FROM budget_group WHERE id=?', [groupId]);
    // The group's own history goes with it. Must precede the logAudit below —
    // that row is written with group_id NULL precisely so it survives as the
    // record that the group was deleted.
    await db.runAsync('DELETE FROM audit_log WHERE group_id=?', [groupId]);
    await logAudit(db, {
      entityType: 'group', entityId: groupId, groupId: null,
      action: 'deleted', summary: `Deleted group · ${g.name}`,
    });
  });

  return { ok: true, orphanedAttachments: attachments.map(a => a.attachment_uri) };
}

/** Soft-delete (archive). Personal group can never be archived. */
export async function archiveGroupSafe(db: SQLite.SQLiteDatabase, groupId: string): Promise<boolean> {
  const g = await db.getFirstAsync<BudgetGroup>('SELECT * FROM budget_group WHERE id=?', [groupId]);
  if (!g || g.is_personal === 1) return false;
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE budget_group SET is_archived=1 WHERE id=?', [groupId]);
    await logAudit(db, {
      entityType: 'group', entityId: groupId, groupId,
      action: 'archived', summary: `Archived group · ${g.name}`,
    });
  });
  return true;
}



// --- Roles & membership ---------------------------------------------------

/**
 * Everything `lib/permissions` needs to decide, read in one round trip.
 *
 * Screens call this and hide what the actor cannot do; the write paths below call
 * it again and refuse. The second check is the real one — a hidden button is a
 * courtesy, not a control.
 */
export async function getGroupContext(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  actorId: string,
): Promise<GroupContext> {
  const [g, m] = await Promise.all([
    db.getFirstAsync<{ created_by: string | null }>(
      'SELECT created_by FROM budget_group WHERE id = ?', [groupId]),
    db.getFirstAsync<{ role: GroupRole }>(
      'SELECT role FROM group_member WHERE group_id = ? AND person_id = ?', [groupId, actorId]),
  ]);
  return { createdBy: g?.created_by ?? null, actorId, actorRole: m?.role ?? null };
}

/** Members with their roles, creator first — the order the members list renders in. */
export async function getGroupMembersWithRoles(
  db: SQLite.SQLiteDatabase,
  groupId: string,
): Promise<Array<{ person_id: string; role: GroupRole; is_creator: boolean }>> {
  const rows = await db.getAllAsync<{ person_id: string; role: GroupRole; created_by: string | null }>(
    `SELECT gm.person_id, gm.role, bg.created_by
       FROM group_member gm JOIN budget_group bg ON bg.id = gm.group_id
      WHERE gm.group_id = ?`,
    [groupId],
  );
  return rows
    .map(r => ({ person_id: r.person_id, role: r.role, is_creator: r.created_by === r.person_id }))
    .sort((a, b) => Number(b.is_creator) - Number(a.is_creator));
}

export async function setMemberRole(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  actorId: string,
  targetPersonId: string,
  role: GroupRole,
): Promise<void> {
  const ctx = await getGroupContext(db, groupId, actorId);
  if (!canChangeRole(ctx, targetPersonId)) throw new PermissionError('change this member\'s role');
  await db.runAsync(
    'UPDATE group_member SET role = ? WHERE group_id = ? AND person_id = ?',
    [role, groupId, targetPersonId],
  );
}


/**
 * Groups the two of us are both in.
 *
 * Only shared ones: a personal group has one member by definition, so it can
 * never contain anyone else, and offering to set trust there would be offering a
 * control over an impossibility.
 */
export async function getSharedGroupsWith(
  db: SQLite.SQLiteDatabase,
  meId: string,
  personId: string,
): Promise<Array<{ id: string; name: string }>> {
  return db.getAllAsync<{ id: string; name: string }>(
    `SELECT g.id, g.name FROM budget_group g
       JOIN group_member a ON a.group_id = g.id AND a.person_id = ?
       JOIN group_member b ON b.group_id = g.id AND b.person_id = ?
      WHERE g.is_personal = 0 AND g.is_archived = 0
      ORDER BY g.created_at ASC`,
    [meId, personId],
  );
}
