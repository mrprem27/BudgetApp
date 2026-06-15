import * as SQLite from 'expo-sqlite';
import * as Device from 'expo-device';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { DEFAULT_CATEGORIES, INCOME_CATEGORIES } from '../constants/categories';

export async function seedIfNeeded(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ cnt: number }>('SELECT count(*) as cnt FROM person');
  if (row && row.cnt > 0) return;

  const meId = uuid();
  const groupId = uuid();
  const now = Date.now();
  const deviceName = Device.deviceName ?? 'Me';

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO person (id, name, avatar_color, is_me, email) VALUES (?, ?, ?, ?, ?)',
      [meId, deviceName, '#4F46E5', 1, 'hello123@vortiqal.com'],
    );

    await db.runAsync(
      `INSERT INTO budget_group
         (id, name, icon, color, carry_over, is_shared, is_archived, is_personal, simplify_debt, created_at)
       VALUES (?, ?, ?, ?, 0, 0, 0, 1, 1, ?)`,
      [groupId, 'Personal', 'credit-card', '#4F46E5', now],
    );

    await db.runAsync(
      'INSERT INTO group_member (group_id, person_id) VALUES (?, ?)',
      [groupId, meId],
    );

    for (const cat of DEFAULT_CATEGORIES) {
      await db.runAsync(
        "INSERT INTO category (id, group_id, name, icon, color, kind) VALUES (?, ?, ?, ?, ?, 'expense')",
        [uuid(), groupId, cat.name, cat.icon, cat.color],
      );
    }
    for (const cat of INCOME_CATEGORIES) {
      await db.runAsync(
        "INSERT INTO category (id, group_id, name, icon, color, kind) VALUES (?, ?, ?, ?, ?, 'income')",
        [uuid(), groupId, cat.name, cat.icon, cat.color],
      );
    }
  });
}
