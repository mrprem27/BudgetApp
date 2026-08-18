import { DatabaseSync } from 'node:sqlite';
import { applyCategoryGlobalMigration } from '../db/schema';

// `category_global_v1` (CATEGORY_GLOBAL_V1_SQL in schema.ts) had never been run
// against a populated pre-existing database — docs/RELEASE_CHECKLIST.md §1 flagged
// it as a ship blocker because it drops and rebuilds the whole `category` table.
// This file *is* that rehearsal, which is why the blocker is now closed there.
// `openTestDb()` can't stand in here: SCHEMA already declares the *post*-migration
// shape, so a harness built from it never has anything to collapse. These tests
// build the actual pre-migration shape a real device has on disk — per-group rows,
// `group_id NOT NULL`, no UNIQUE(name, kind) — and run the real migration SQL
// against it via node:sqlite, same convention as schemaFixes.test.ts.

/** The pre-`category_global_v1` shape, plus the tables it must not corrupt. */
function makeDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE budget_group (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE category (
      id        TEXT PRIMARY KEY,
      group_id  TEXT NOT NULL REFERENCES budget_group(id),
      name      TEXT NOT NULL,
      icon      TEXT,
      color     TEXT,
      kind      TEXT NOT NULL DEFAULT 'expense' CHECK(kind IN ('expense','income','transfer')),
      section   TEXT
    );
    -- category_budget.category and txn.category are plain name strings, never a
    -- foreign key to category.id — that's what makes the rebuild below safe.
    CREATE TABLE category_budget (id TEXT PRIMARY KEY, group_id TEXT NOT NULL, category TEXT NOT NULL, amount INTEGER NOT NULL);
    CREATE TABLE txn (id TEXT PRIMARY KEY, group_id TEXT NOT NULL, category TEXT NOT NULL);
  `);
  return db;
}

/** One app launch: drive the real migration against this database. */
function migrate(db: DatabaseSync): Promise<boolean> {
  return applyCategoryGlobalMigration(
    async () => !!db.prepare("SELECT value FROM settings WHERE key='category_global_v1'").get(),
    async (sql) => { db.exec(sql); },
    async () => { db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('category_global_v1','1')").run(); },
  );
}

const categories = (db: DatabaseSync) =>
  db.prepare('SELECT group_id, name, icon, color, kind, section FROM category ORDER BY name, kind').all() as
    { group_id: string | null; name: string; icon: string | null; color: string | null; kind: string; section: string | null }[];

describe('category_global_v1 migration', () => {
  it('dedupes a populated multi-group database by (name, kind), keeping kinds separate', async () => {
    const db = makeDb();
    db.exec(`
      INSERT INTO budget_group (id, name, created_at) VALUES ('flat','Flat',100), ('trip','Goa Trip',200);
      -- Same category, two groups — the exact case the migration must collapse.
      INSERT INTO category (id, group_id, name, icon, color, kind, section)
        VALUES ('c1','flat','Groceries','shopping-cart','#111','expense','Essentials'),
               ('c2','trip','Groceries','shopping-cart','#222','expense','Essentials'),
               -- Rent/Other are seeded as BOTH expense and transfer — GROUP BY
               -- name, kind must keep these as two rows, not collapse across kind.
               ('c3','flat','Rent','home','#333','expense','Housing'),
               ('c4','flat','Rent','home','#333','transfer',NULL);
      INSERT INTO txn (id, group_id, category) VALUES ('t1','flat','Groceries'), ('t2','trip','Groceries'), ('t3','flat','Rent');
      INSERT INTO category_budget (id, group_id, category, amount) VALUES ('b1','flat','Groceries',5000), ('b2','trip','Groceries',3000);
    `);

    expect(await migrate(db)).toBe(true);

    const cats = categories(db);
    expect(cats).toHaveLength(3);
    expect(cats.every(c => c.group_id === null)).toBe(true); // every row is now global
    expect(cats.map(c => ({ name: c.name, kind: c.kind, section: c.section }))).toEqual([
      { name: 'Groceries', kind: 'expense', section: 'Essentials' },
      { name: 'Rent', kind: 'expense', section: 'Housing' },
      { name: 'Rent', kind: 'transfer', section: null },
    ]);
    // Which of the two duplicate rows' icon/color "wins" is unspecified by
    // GROUP BY without an aggregate — only that exactly one survives with a
    // value that actually came from one of the source rows, not corrupted data.
    expect(['#111', '#222']).toContain(cats.find(c => c.kind === 'expense' && c.name === 'Groceries')!.color);

    // Nothing that referenced a category BY NAME lost its reference: txn.category
    // and category_budget.category are plain strings, never touched by the rebuild.
    expect(db.prepare('SELECT category FROM txn ORDER BY id').all().map((r: any) => r.category))
      .toEqual(['Groceries', 'Groceries', 'Rent']);
    expect((db.prepare("SELECT amount FROM category_budget WHERE id='b1'").get() as any).amount).toBe(5000);
    expect((db.prepare("SELECT amount FROM category_budget WHERE id='b2'").get() as any).amount).toBe(3000);

    expect((db.prepare("SELECT value FROM settings WHERE key='category_global_v1'").get() as any).value).toBe('1');
  });

  it('is idempotent — a second launch changes nothing and reports no run', async () => {
    const db = makeDb();
    db.exec(`
      INSERT INTO budget_group (id, name, created_at) VALUES ('flat','Flat',100);
      INSERT INTO category (id, group_id, name, icon, color, kind, section)
        VALUES ('c1','flat','Groceries','shopping-cart','#111','expense','Essentials');
    `);

    expect(await migrate(db)).toBe(true);
    const before = categories(db);
    expect(await migrate(db)).toBe(false);
    expect(categories(db)).toEqual(before);
  });

  it('is a safe no-op on a database that never had the old per-group shape', async () => {
    // A fresh install: SCHEMA already creates `category` in the new global shape,
    // so there is nothing to collapse — the migration should still run once,
    // mark itself done, and leave already-correct data untouched.
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE budget_group (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE category (
        id TEXT PRIMARY KEY, group_id TEXT REFERENCES budget_group(id), name TEXT NOT NULL,
        icon TEXT, color TEXT, kind TEXT NOT NULL DEFAULT 'expense', section TEXT, UNIQUE(name, kind)
      );
      INSERT INTO category (id, group_id, name, icon, color, kind, section)
        VALUES ('c1', NULL, 'Groceries', 'shopping-cart', '#111', 'expense', 'Essentials');
    `);

    expect(await migrate(db)).toBe(true);
    expect(categories(db)).toEqual([
      { group_id: null, name: 'Groceries', icon: 'shopping-cart', color: '#111', kind: 'expense', section: 'Essentials' },
    ]);
  });

  it('leaves data alone if the migration throws mid-flight (caller keeps the try/catch)', async () => {
    const db = makeDb();
    db.exec(`
      INSERT INTO budget_group (id, name, created_at) VALUES ('flat','Flat',100);
      INSERT INTO category (id, group_id, name, icon, color, kind, section)
        VALUES ('c1','flat','Groceries','shopping-cart','#111','expense','Essentials');
    `);

    await expect(applyCategoryGlobalMigration(
      async () => !!db.prepare("SELECT value FROM settings WHERE key='category_global_v1'").get(),
      async () => { throw new Error('disk error'); },
      async () => { db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('category_global_v1','1')").run(); },
    )).rejects.toThrow('disk error');

    // Not marked done, and the original per-group row is exactly as it was —
    // this is what lets openDB's surrounding try/catch retry on the next launch.
    expect(db.prepare('SELECT key FROM settings').all()).toEqual([]);
    expect(categories(db)).toEqual([
      { group_id: 'flat', name: 'Groceries', icon: 'shopping-cart', color: '#111', kind: 'expense', section: 'Essentials' },
    ]);
  });
});
