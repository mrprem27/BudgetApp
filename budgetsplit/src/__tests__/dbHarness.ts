import * as SQLite from 'expo-sqlite';
import { SCHEMA, COLUMN_MIGRATIONS, INDEXES } from '../db/schema';

/**
 * An in-memory database with the **real** schema, for testing `src/db/queries/*` for real.
 *
 * Not `.test.ts`, so jest collects it as a helper rather than an empty suite.
 *
 * ⚠️ `SCHEMA` alone is **not** the current schema. Columns added after the first release
 * live in `COLUMN_MIGRATIONS` and are applied by `openDB` at launch, so a harness that runs
 * only `SCHEMA` builds a table the app has not used for months — the first attempt here died
 * on `table txn has no column named currency`. Both must run, in that order, for the same
 * reason `openDB` runs both.
 */
export async function openTestDb(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(':memory:');
  await db.execAsync(SCHEMA);
  for (const sql of COLUMN_MIGRATIONS) {
    // Same swallow as `openDB`: these are `ALTER TABLE … ADD COLUMN`, which throws when the
    // column is already present in `SCHEMA`.
    try { await db.execAsync(sql); } catch { /* already there */ }
  }
  // Indexes too — and not only for speed. The two partial UNIQUE indexes on
  // `category_budget` are the only thing enforcing one budget per level, because
  // a plain UNIQUE cannot (SQL treats NULL person_ids as distinct). A harness
  // without them silently permits data the app can never produce.
  await db.execAsync(INDEXES);
  return db;
}

/** The most common fixture: one shared group, and me. */
export async function seedGroupAndMe(
  db: SQLite.SQLiteDatabase,
  { groupId = 'g', meId = 'me', isPersonal = 0 } = {},
): Promise<void> {
  await db.runAsync(
    `INSERT INTO budget_group (id,name,icon,color,is_personal,is_archived,created_at)
     VALUES (?,?,?,?,?,0,0)`,
    [groupId, 'Flat', 'home', '#ffffff', isPersonal],
  );
  await db.runAsync(
    `INSERT INTO person (id,name,avatar_color,is_me) VALUES (?,?,?,1)`,
    [meId, 'Me', '#111111'],
  );
  await db.runAsync(
    `INSERT INTO group_member (group_id,person_id) VALUES (?,?)`,
    [groupId, meId],
  );
}
