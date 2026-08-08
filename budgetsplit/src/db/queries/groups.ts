import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { logAudit } from './audit';

export type BudgetGroup = {
  id: string;
  name: string;
  icon: string;
  color: string;
  limit_daily: number | null;
  limit_monthly: number | null;
  limit_yearly: number | null;
  carry_over: number;
  is_shared: number;
  is_archived: number;
  is_personal: number;
  simplify_debt: number;
  default_split: SplitMode;
  created_at: number;
};

import type { SplitMode } from '../../constants/enums';
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
): Promise<BudgetGroup> {
  const id = uuid();
  const now = Date.now();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO budget_group (id, name, icon, color, carry_over, is_shared, is_archived, default_split, created_at)
       VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?)`,
      [id, name, icon, color, defaultSplit, now],
    );
    for (const pid of memberIds) {
      await db.runAsync(
        'INSERT OR IGNORE INTO group_member (group_id, person_id, joined_at) VALUES (?, ?, ?)',
        [id, pid, now],
      );
    }
    // Categories are a single global catalog now (seeded once in openDB) — groups
    // no longer seed their own copies.
  });

  return { id, name, icon, color, limit_daily: null, limit_monthly: null, limit_yearly: null, carry_over: 0, is_shared: 0, is_archived: 0, is_personal: 0, simplify_debt: 1, default_split: defaultSplit, created_at: now };
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
export async function deleteGroup(db: SQLite.SQLiteDatabase, groupId: string): Promise<DeleteGroupResult> {
  const g = await db.getFirstAsync<BudgetGroup>('SELECT * FROM budget_group WHERE id=?', [groupId]);
  if (!g || g.is_personal === 1) return { ok: false, orphanedAttachments: [] };

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
    await db.runAsync('DELETE FROM txn WHERE group_id=?', [groupId]);
    await db.runAsync('DELETE FROM group_member WHERE group_id=?', [groupId]);
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

