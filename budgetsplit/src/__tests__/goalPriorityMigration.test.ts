import { DatabaseSync } from 'node:sqlite';
import { applyGoalPriorityRevival } from '../db/schema';

// `savings_goal.priority` shipped as CHECK(priority IN ('high','medium','low')) —
// funding buckets replaced by sort_order, with no UI ever offering a picker.
// Repurposed as a protect-from-raid tag instead of deleted:
// CHECK(priority IN ('emergency','need','want')). SQLite can't ALTER a CHECK, so
// the table is rebuilt with a value-remapping CASE. These tests build the real
// pre-migration shape and run the actual migration SQL via node:sqlite, same
// convention as categoryGlobalMigration.test.ts and schemaFixes.test.ts.

function makeDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE savings_goal (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      target       INTEGER NOT NULL,
      priority     TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
      category     TEXT,
      icon         TEXT,
      color        TEXT,
      allocation   INTEGER NOT NULL DEFAULT 0,
      frequency    TEXT NOT NULL DEFAULT 'none' CHECK(frequency IN ('daily','weekly','monthly','yearly','none')),
      locked       INTEGER NOT NULL DEFAULT 0,
      is_archived  INTEGER NOT NULL DEFAULT 0,
      last_auto_at INTEGER,
      target_date  INTEGER,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL
    );
    -- Not a foreign key in the real schema either — a plain column. Preserved
    -- so the test can prove the rebuild doesn't orphan it.
    CREATE TABLE savings_txn (id TEXT PRIMARY KEY, goal_id TEXT, amount INTEGER NOT NULL, kind TEXT NOT NULL);
  `);
  return db;
}

function migrate(db: DatabaseSync): Promise<boolean> {
  return applyGoalPriorityRevival(
    async () => (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='savings_goal'").get() as any)?.sql ?? null,
    async (sql) => { db.exec(sql); },
  );
}

const goals = (db: DatabaseSync) =>
  db.prepare('SELECT id, name, priority, sort_order, locked FROM savings_goal ORDER BY id').all() as
    { id: string; name: string; priority: string; sort_order: number; locked: number }[];

describe('savings_goal priority revival (high/medium/low → emergency/need/want)', () => {
  it('remaps every existing value on a populated table', async () => {
    const db = makeDb();
    db.exec(`
      INSERT INTO savings_goal (id, name, target, priority, sort_order, locked, created_at)
        VALUES ('g1','Emergency Fund',500000,'high',0,1,100),
               ('g2','New Laptop',150000,'medium',1,0,200),
               ('g3','Europe Trip',300000,'low',2,0,300);
      INSERT INTO savings_txn (id, goal_id, amount, kind) VALUES ('t1','g2',20000,'allocate');
    `);

    expect(await migrate(db)).toBe(true);

    expect(goals(db)).toEqual([
      { id: 'g1', name: 'Emergency Fund', priority: 'emergency', sort_order: 0, locked: 1 },
      { id: 'g2', name: 'New Laptop', priority: 'need', sort_order: 1, locked: 0 },
      { id: 'g3', name: 'Europe Trip', priority: 'want', sort_order: 2, locked: 0 },
    ]);

    // ids are preserved, so the (unenforced-FK) ledger row still resolves.
    expect((db.prepare("SELECT goal_id, amount FROM savings_txn WHERE id='t1'").get() as any))
      .toEqual({ goal_id: 'g2', amount: 20000 });

    // The new CHECK constraint actually rejects the old values afterward.
    expect(() => db.exec("INSERT INTO savings_goal (id,name,target,priority,created_at) VALUES ('bad','X',100,'high',1)"))
      .toThrow();
  });

  it('defaults every real goal (never-touched "medium") to "need"', async () => {
    const db = makeDb();
    db.exec(`INSERT INTO savings_goal (id, name, target, created_at) VALUES ('g1','Default Goal',100000,100);`);
    await migrate(db);
    expect(goals(db)[0].priority).toBe('need');
  });

  it('is idempotent — a second launch changes nothing and reports no run', async () => {
    const db = makeDb();
    db.exec(`INSERT INTO savings_goal (id, name, target, priority, created_at) VALUES ('g1','X',100000,'high',100);`);

    expect(await migrate(db)).toBe(true);
    const before = goals(db);
    expect(await migrate(db)).toBe(false);
    expect(goals(db)).toEqual(before);
  });

  it('is a safe no-op on a database that already has the new shape', async () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE savings_goal (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, target INTEGER NOT NULL,
        priority TEXT NOT NULL DEFAULT 'need' CHECK(priority IN ('emergency','need','want')),
        sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
      );
      INSERT INTO savings_goal (id, name, target, priority, created_at) VALUES ('g1','X',100000,'want',100);
    `);
    expect(await migrate(db)).toBe(false);
    expect((db.prepare("SELECT priority FROM savings_goal WHERE id='g1'").get() as any).priority).toBe('want');
  });
});
