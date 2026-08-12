import * as SQLite from 'expo-sqlite';
import * as Device from 'expo-device';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';

export async function seedIfNeeded(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ cnt: number }>('SELECT count(*) as cnt FROM person');
  if (row && row.cnt > 0) return;

  const meId = uuid();
  const groupId = uuid();
  const now = Date.now();
  const deviceName = Device.deviceName ?? 'Me';

  await db.withTransactionAsync(async () => {
    // email stays NULL: there are no accounts and nothing reads it. It used to be
    // seeded with a hardcoded placeholder address, which read like real data.
    await db.runAsync(
      'INSERT INTO person (id, name, avatar_color, is_me) VALUES (?, ?, ?, ?)',
      [meId, deviceName, '#4F46E5', 1],
    );

    // `created_by` is not optional in practice, whatever the column allows. A group
    // with no creator has no admin, so `canEditGroupBudget` refuses every edit to it
    // and no screen can repair that — and the one-time fixes have already run and
    // been recorded by `openDB` before this seed executes, so nothing comes back for
    // it. That is the exact bug `insertGroup` shipped; this path is the same shape.
    await db.runAsync(
      `INSERT INTO budget_group
         (id, name, icon, color, carry_over, is_shared, is_archived, is_personal, simplify_debt, created_at, created_by)
       VALUES (?, ?, ?, ?, 0, 0, 0, 1, 1, ?, ?)`,
      [groupId, 'Personal', 'credit-card', '#4F46E5', now, meId],
    );

    await db.runAsync(
      'INSERT INTO group_member (group_id, person_id, joined_at, role) VALUES (?, ?, ?, ?)',
      [groupId, meId, now, 'admin'],
    );
    // Categories are a global catalog seeded in openDB — not per group.
  });
}
