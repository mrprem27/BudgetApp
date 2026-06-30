import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { DEFAULT_CATEGORIES, INCOME_CATEGORIES } from '../../constants/categories';
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
    for (const cat of DEFAULT_CATEGORIES) {
      await db.runAsync(
        "INSERT INTO category (id, group_id, name, icon, color, kind) VALUES (?, ?, ?, ?, ?, 'expense')",
        [uuid(), id, cat.name, cat.icon, cat.color],
      );
    }
    for (const cat of INCOME_CATEGORIES) {
      await db.runAsync(
        "INSERT INTO category (id, group_id, name, icon, color, kind) VALUES (?, ?, ?, ?, ?, 'income')",
        [uuid(), id, cat.name, cat.icon, cat.color],
      );
    }
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

/** A non-archived group both people belong to (for attributing a global settlement). */
export async function getCommonGroupId(
  db: SQLite.SQLiteDatabase,
  a: string,
  b: string,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ group_id: string }>(
    `SELECT gm1.group_id FROM group_member gm1
       JOIN group_member gm2 ON gm1.group_id = gm2.group_id
       JOIN budget_group g ON g.id = gm1.group_id
     WHERE gm1.person_id = ? AND gm2.person_id = ? AND g.is_archived = 0
     ORDER BY g.created_at ASC LIMIT 1`,
    [a, b],
  );
  return row?.group_id ?? null;
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

/**
 * Hard-delete a group and everything tied to it (transactions, splits, line
 * items, members, budgets). Never deletes the Personal group. Irreversible —
 * the caller must confirm first.
 */
export async function deleteGroup(db: SQLite.SQLiteDatabase, groupId: string): Promise<boolean> {
  const g = await db.getFirstAsync<BudgetGroup>('SELECT * FROM budget_group WHERE id=?', [groupId]);
  if (!g || g.is_personal === 1) return false;
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
    await db.runAsync('DELETE FROM category WHERE group_id=?', [groupId]);
    await db.runAsync('DELETE FROM category_budget WHERE group_id=?', [groupId]);
    await db.runAsync('DELETE FROM budget_group WHERE id=?', [groupId]);
    await logAudit(db, {
      entityType: 'group', entityId: groupId, groupId: null,
      action: 'deleted', summary: `Deleted group · ${g.name}`,
    });
  });
  return true;
}

/** Soft-delete (archive). Personal group can never be archived. */
export async function archiveGroupSafe(db: SQLite.SQLiteDatabase, groupId: string): Promise<boolean> {
  const g = await db.getFirstAsync<BudgetGroup>('SELECT * FROM budget_group WHERE id=?', [groupId]);
  if (!g || g.is_personal === 1) return false;
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE budget_group SET is_archived=1 WHERE id=?', [groupId]);
    await logAudit(db, {
      entityType: 'group', entityId: groupId, groupId,
      action: 'deleted', summary: `Archived group · ${g.name}`,
    });
  });
  return true;
}

export async function updateGroupLimits(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  limitDaily: number | null,
  limitMonthly: number | null,
  limitYearly: number | null,
  carryOver: boolean,
): Promise<void> {
  await db.runAsync(
    'UPDATE budget_group SET limit_daily=?, limit_monthly=?, limit_yearly=?, carry_over=? WHERE id=?',
    [limitDaily, limitMonthly, limitYearly, carryOver ? 1 : 0, groupId],
  );
}

export async function archiveGroup(db: SQLite.SQLiteDatabase, groupId: string): Promise<void> {
  await db.runAsync('UPDATE budget_group SET is_archived=1 WHERE id=?', [groupId]);
}
