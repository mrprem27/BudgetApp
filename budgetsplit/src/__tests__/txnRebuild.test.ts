import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA, COLUMN_MIGRATIONS } from '../db/schema';

/**
 * The one-time `txn` rebuild drops the stale `recur_freq` CHECK that rejected
 * 'yearly'. SQLite can't ALTER a CHECK, so it recreates the table and copies row
 * by column *name* — from a hand-maintained list.
 *
 * That list is the hazard, and its own comment says so: any column missing from it
 * is silently dropped for the rest of the session. `recur_paused_at` was missing
 * from both the list and the new-table DDL, so on any database old enough to take
 * this path, every paused rule lost the timestamp `resumeRecurring` needs to skip
 * the dormant gap — and the column itself vanished until the next launch re-ALTERed
 * it back, empty.
 *
 * A fresh database never takes this path, which is exactly why nothing caught it.
 * This test builds the *old* shape on purpose.
 */
function oldShapeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  for (const sql of COLUMN_MIGRATIONS) {
    try { db.exec(sql); } catch { /* already present in SCHEMA */ }
  }
  // Recreate the pre-'yearly' CHECK the rebuild looks for. Column list mirrors the
  // post-migration table so the rebuild has everything to copy.
  db.exec(`
    ALTER TABLE txn RENAME TO txn_old;
    CREATE TABLE txn (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      entry_mode TEXT NOT NULL,
      date INTEGER NOT NULL,
      category TEXT NOT NULL,
      note TEXT, attachment_uri TEXT, tags TEXT, adjustments TEXT,
      recur_freq TEXT CHECK(recur_freq IN ('daily','weekly','monthly','custom')),
      recur_interval INTEGER, recur_end INTEGER, recur_override_date INTEGER,
      parent_recur_id TEXT,
      recur_state TEXT NOT NULL DEFAULT 'active',
      recur_paused_at INTEGER,
      tz TEXT, lat REAL, lng REAL, place_label TEXT, pay_method TEXT,
      currency TEXT, source TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    DROP TABLE txn_old;
  `);
  return db;
}

/** The rebuild body from `openDB`, run against a db in the old shape. */
function runRebuild(db: DatabaseSync) {
  const def = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='txn'").get() as { sql: string };
  if (def.sql.includes("'yearly'")) throw new Error('fixture is not in the pre-yearly shape');

  const cols = 'id,group_id,kind,entry_mode,date,category,note,attachment_uri,tags,adjustments,'
    + 'recur_freq,recur_interval,recur_end,recur_override_date,parent_recur_id,recur_state,'
    + 'recur_paused_at,tz,lat,lng,place_label,pay_method,currency,source,is_deleted,created_at,updated_at';
  db.exec(`
    CREATE TABLE txn_new (
      id TEXT PRIMARY KEY, group_id TEXT NOT NULL, kind TEXT NOT NULL,
      entry_mode TEXT NOT NULL, date INTEGER NOT NULL, category TEXT NOT NULL,
      note TEXT, attachment_uri TEXT, tags TEXT, adjustments TEXT,
      recur_freq TEXT CHECK(recur_freq IN ('daily','weekly','monthly','yearly','custom')),
      recur_interval INTEGER, recur_end INTEGER, recur_override_date INTEGER,
      parent_recur_id TEXT,
      recur_state TEXT NOT NULL DEFAULT 'active',
      recur_paused_at INTEGER,
      tz TEXT, lat REAL, lng REAL, place_label TEXT, pay_method TEXT,
      currency TEXT, source TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    INSERT INTO txn_new (${cols}) SELECT ${cols} FROM txn;
    DROP TABLE txn;
    ALTER TABLE txn_new RENAME TO txn;
  `);
}

const columnsOf = (db: DatabaseSync) =>
  (db.prepare('PRAGMA table_info(txn)').all() as { name: string }[]).map(c => c.name);

describe('the one-time txn rebuild', () => {
  /**
   * Read the REAL rebuild out of `schema.ts`, not the copy below.
   *
   * The behavioural tests that follow exercise a transcription of the rebuild, so
   * they would happily pass while `schema.ts` drifted. This one reads the source
   * and is therefore the assertion that actually guards the hand-maintained list.
   */
  it('names every migrated txn column in the real rebuild', () => {
    const src = fs.readFileSync(path.join(__dirname, '../db/schema.ts'), 'utf8');
    const migrated = [...src.matchAll(/ALTER TABLE txn ADD COLUMN (\w+)/g)].map(m => m[1]);
    expect(migrated.length).toBeGreaterThan(5);

    const rebuild = src.slice(src.indexOf('const cols ='), src.indexOf('ALTER TABLE txn_new RENAME TO txn'));
    const missing = migrated.filter(c => !new RegExp(`\\b${c}\\b`).test(rebuild));
    expect(missing).toEqual([]);
  });

  it('carries every migrated column across', () => {
    const db = oldShapeDb();
    const before = columnsOf(db);
    runRebuild(db);
    expect(columnsOf(db).sort()).toEqual(before.sort());
  });

  it('preserves a paused rule’s timestamp', () => {
    // The concrete loss: `resumeRecurring` reads this to skip the dormant gap, so
    // dropping it silently back-posts every occurrence the pause was meant to skip.
    const db = oldShapeDb();
    db.exec(`INSERT INTO budget_group (id,name,icon,color,is_personal,is_archived,created_at)
             VALUES ('g','Flat','home','#fff',0,0,0)`);
    db.prepare(`INSERT INTO txn (id,group_id,kind,entry_mode,date,category,recur_freq,recur_state,recur_paused_at,is_deleted,created_at,updated_at)
                VALUES ('t','g','expense','quick',1,'Rent','monthly','paused',1720000000000,0,1,1)`).run();

    runRebuild(db);

    const row = db.prepare("SELECT recur_state, recur_paused_at FROM txn WHERE id='t'").get() as
      { recur_state: string; recur_paused_at: number };
    expect(row.recur_state).toBe('paused');
    expect(row.recur_paused_at).toBe(1720000000000);
  });

  it('accepts a yearly rule afterwards — the reason the rebuild exists', () => {
    const db = oldShapeDb();
    db.exec(`INSERT INTO budget_group (id,name,icon,color,is_personal,is_archived,created_at)
             VALUES ('g','Flat','home','#fff',0,0,0)`);
    expect(() => db.prepare(`INSERT INTO txn (id,group_id,kind,entry_mode,date,category,recur_freq,recur_state,is_deleted,created_at,updated_at)
                             VALUES ('y','g','expense','quick',1,'Insurance','yearly','active',0,1,1)`).run()).toThrow();

    runRebuild(db);

    db.prepare(`INSERT INTO txn (id,group_id,kind,entry_mode,date,category,recur_freq,recur_state,is_deleted,created_at,updated_at)
                VALUES ('y','g','expense','quick',1,'Insurance','yearly','active',0,1,1)`).run();
    expect((db.prepare("SELECT recur_freq FROM txn WHERE id='y'").get() as { recur_freq: string }).recur_freq).toBe('yearly');
  });
});
