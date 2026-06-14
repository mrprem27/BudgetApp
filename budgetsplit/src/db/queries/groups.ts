import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { DEFAULT_CATEGORIES } from '../../constants/categories';

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
  created_at: number;
};

export async function getAllGroups(db: SQLite.SQLiteDatabase): Promise<BudgetGroup[]> {
  return db.getAllAsync<BudgetGroup>(
    'SELECT * FROM budget_group WHERE is_archived = 0 ORDER BY created_at ASC',
  );
}

export async function getGroupById(db: SQLite.SQLiteDatabase, id: string): Promise<BudgetGroup | null> {
  return db.getFirstAsync<BudgetGroup>('SELECT * FROM budget_group WHERE id = ?', [id]);
}

export async function insertGroup(
  db: SQLite.SQLiteDatabase,
  name: string,
  icon: string,
  color: string,
  memberIds: string[],
): Promise<BudgetGroup> {
  const id = uuid();
  const now = Date.now();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO budget_group (id, name, icon, color, carry_over, is_shared, is_archived, created_at)
       VALUES (?, ?, ?, ?, 0, 0, 0, ?)`,
      [id, name, icon, color, now],
    );
    for (const pid of memberIds) {
      await db.runAsync(
        'INSERT OR IGNORE INTO group_member (group_id, person_id) VALUES (?, ?)',
        [id, pid],
      );
    }
    for (const cat of DEFAULT_CATEGORIES) {
      await db.runAsync(
        'INSERT INTO category (id, group_id, name, icon, color) VALUES (?, ?, ?, ?, ?)',
        [uuid(), id, cat.name, cat.icon, cat.color],
      );
    }
  });

  return { id, name, icon, color, limit_daily: null, limit_monthly: null, limit_yearly: null, carry_over: 0, is_shared: 0, is_archived: 0, created_at: now };
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
