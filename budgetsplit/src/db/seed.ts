import * as SQLite from 'expo-sqlite';
import * as Device from 'expo-device';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';

export async function seedIfNeeded(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ cnt: number }>('SELECT count(*) as cnt FROM person');
  if (row && row.cnt > 0) return;

  await db.withTransactionAsync(() => insertFirstRunRows(db, Device.deviceName ?? 'Me'));
}

/**
 * What a brand-new install holds: one "me" and its Personal group. Runs inside the
 * caller's transaction — the first-run seed, and the sign-out wipe
 * (`wipeToFreshInstall`), which must leave the phone exactly as a new install.
 * Categories are a global catalog seeded in openDB — not per group.
 */
export async function insertFirstRunRows(db: SQLite.SQLiteDatabase, name: string): Promise<void> {
  const meId = uuid();
  const groupId = uuid();
  const now = Date.now();
  // email stays NULL: a seeded row is this device's own user, and their address
  // is not knowable until they sign in. It used to be seeded with a hardcoded
  // placeholder address, which read like real data.
  await db.runAsync(
    'INSERT INTO person (id, name, avatar_color, is_me) VALUES (?, ?, ?, ?)',
    [meId, name, '#4F46E5', 1],
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
}
