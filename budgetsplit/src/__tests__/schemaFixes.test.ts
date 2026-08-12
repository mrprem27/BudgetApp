import { DatabaseSync } from 'node:sqlite';
import { ONE_TIME_FIXES, applyOneTimeFixes } from '../db/schema';

// The one-time DATA fixes in openDB() reclassify and DELETE user rows. They used
// to run on EVERY launch, so anything the user did afterwards that looked like
// the old state was silently undone — most visibly, recreating a "Subscriptions"
// category deleted it again on the next start.
//
// These tests run the REAL SQL from ONE_TIME_FIXES against an in-process SQLite
// (node:sqlite), twice, exactly as two app launches would — so "runs at most
// once" is proven against the engine rather than asserted. Same reasoning as
// cashSql.test.ts.

/** The subset of the app schema the fixes touch. */
function makeDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE person (
      id TEXT PRIMARY KEY, name TEXT, avatar_color TEXT,
      is_me INTEGER NOT NULL DEFAULT 0, email TEXT
    );
    CREATE TABLE budget_group (
      id TEXT PRIMARY KEY, name TEXT, icon TEXT, color TEXT,
      is_personal INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
      -- Added by COLUMN_MIGRATIONS in the real schema; included here because the
      -- creator/role fix writes it. This harness declares the subset the fixes
      -- touch, so a fix reaching a new column must extend it.
      created_by TEXT
    );
    CREATE TABLE group_member (
      group_id TEXT NOT NULL, person_id TEXT NOT NULL, joined_at INTEGER,
      role TEXT NOT NULL DEFAULT 'member',
      PRIMARY KEY (group_id, person_id)
    );
    CREATE TABLE txn (id TEXT PRIMARY KEY, group_id TEXT, category TEXT NOT NULL);
    CREATE TABLE category (
      id TEXT PRIMARY KEY, group_id TEXT, name TEXT NOT NULL,
      icon TEXT, color TEXT, kind TEXT NOT NULL DEFAULT 'expense', section TEXT,
      UNIQUE(name, kind)
    );
    CREATE TABLE category_budget (
      id TEXT PRIMARY KEY, group_id TEXT, category TEXT NOT NULL,
      period TEXT NOT NULL DEFAULT 'monthly', amount INTEGER NOT NULL,
      UNIQUE(group_id, category, period)
    );
    CREATE TABLE savings_txn (
      id TEXT PRIMARY KEY, goal_id TEXT, amount INTEGER NOT NULL, kind TEXT NOT NULL
    );
  `);
  return db;
}

/** One app launch: drive applyOneTimeFixes against this database. */
function launch(db: DatabaseSync): Promise<string[]> {
  return applyOneTimeFixes(
    async () => {
      const keys = ONE_TIME_FIXES.map(f => f.key);
      const rows = db
        .prepare(`SELECT key FROM settings WHERE key IN (${keys.map(() => '?').join(',')})`)
        .all(...keys) as { key: string }[];
      return new Set(rows.map(r => r.key));
    },
    async (sql) => { db.exec(sql); },
    async (key) => { db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, '1')").run(key); },
  );
}

const catNames = (db: DatabaseSync) =>
  (db.prepare('SELECT name, kind FROM category ORDER BY name, kind').all() as { name: string; kind: string }[]);

describe('one-time data fixes', () => {
  it('applies every fix on a fresh database, then never again', async () => {
    const db = makeDb();

    const first = await launch(db);
    expect(first).toEqual(ONE_TIME_FIXES.map(f => f.key));

    const second = await launch(db);
    expect(second).toEqual([]);

    const third = await launch(db);
    expect(third).toEqual([]);
  });

  it('performs the legacy repairs it is supposed to, on first run', async () => {
    const db = makeDb();
    db.exec(`
      INSERT INTO budget_group (id, name, icon, color, is_personal, created_at)
        VALUES ('g1','Personal','wallet','#000',0,100), ('g2','Trip','map','#111',0,200);
      INSERT INTO person (id, name, is_me, email) VALUES ('p1','Me',1,NULL);
      INSERT INTO txn (id, group_id, category) VALUES ('t1','g1','Subscriptions');
      INSERT INTO category (id, name, kind) VALUES ('c1','Subscriptions','expense'), ('c2','Salary','expense');
      INSERT INTO category_budget (id, group_id, category, amount) VALUES ('b1','g1','Subscriptions',5000);
      INSERT INTO savings_txn (id, goal_id, amount, kind) VALUES ('s1',NULL,100,'deposit'), ('s2','goal-1',200,'allocate');
    `);

    await launch(db);

    // wallet → credit-card
    expect((db.prepare("SELECT icon FROM budget_group WHERE id='g1'").get() as any).icon).toBe('credit-card');
    // pool-level ledger rows dropped, per-goal balances untouched
    expect((db.prepare('SELECT id FROM savings_txn').all() as any[]).map(r => r.id)).toEqual(['s2']);
    // Subscriptions reclassified and removed
    expect((db.prepare("SELECT category FROM txn WHERE id='t1'").get() as any).category).toBe('Entertainment');
    expect(db.prepare('SELECT id FROM category_budget').all()).toEqual([]);
    expect(catNames(db)).toEqual([{ name: 'Salary', kind: 'income' }]);
    // oldest group becomes the personal one; the newer one is left alone
    expect((db.prepare("SELECT is_personal FROM budget_group WHERE id='g1'").get() as any).is_personal).toBe(1);
    expect((db.prepare("SELECT is_personal FROM budget_group WHERE id='g2'").get() as any).is_personal).toBe(0);
    // No placeholder identifier is written: nothing reads person.email, so the
    // fix that stamped a hardcoded address was removed rather than kept guarded.
    expect((db.prepare("SELECT email FROM person WHERE id='p1'").get() as any).email).toBeNull();
  });

  // The regression this guard exists for.
  it('leaves a user-created "Subscriptions" category alone on later launches', async () => {
    const db = makeDb();
    db.exec(`INSERT INTO category (id, name, kind) VALUES ('c1','Subscriptions','expense');`);

    await launch(db);
    expect(catNames(db)).toEqual([]); // the seeded one is removed, as intended

    // The user recreates it, with a budget and a transaction against it.
    db.exec(`
      INSERT INTO category (id, name, kind) VALUES ('mine','Subscriptions','expense');
      INSERT INTO category_budget (id, group_id, category, amount) VALUES ('b1','g1','Subscriptions',9900);
      INSERT INTO txn (id, group_id, category) VALUES ('t1','g1','Subscriptions');
    `);

    await launch(db); // next app start

    expect(catNames(db)).toEqual([{ name: 'Subscriptions', kind: 'expense' }]);
    expect((db.prepare('SELECT amount FROM category_budget').get() as any).amount).toBe(9900);
    expect((db.prepare("SELECT category FROM txn WHERE id='t1'").get() as any).category).toBe('Subscriptions');
  });

  it('leaves a user-created expense category named "Salary" alone on later launches', async () => {
    const db = makeDb();
    await launch(db);

    // With the fix ungated this UPDATE would flip kind to 'income' — and if an
    // income 'Salary' already existed it would trip UNIQUE(name, kind) and throw.
    db.exec(`INSERT INTO category (id, name, kind) VALUES ('i1','Salary','income'), ('e1','Salary','expense');`);

    await expect(launch(db)).resolves.toEqual([]);
    expect(catNames(db)).toEqual([
      { name: 'Salary', kind: 'expense' },
      { name: 'Salary', kind: 'income' },
    ]);
  });

  it('leaves a re-pointed personal group alone on later launches', async () => {
    const db = makeDb();
    db.exec(`
      INSERT INTO budget_group (id, name, icon, color, is_personal, created_at)
        VALUES ('old','Personal','credit-card','#000',0,100), ('new','Personal','credit-card','#000',0,200);
    `);

    await launch(db);
    expect((db.prepare("SELECT is_personal FROM budget_group WHERE id='old'").get() as any).is_personal).toBe(1);

    // Something later moves the personal flag (e.g. the old group is deleted and
    // recreated). The repair must not drag it back to the oldest row.
    db.exec("UPDATE budget_group SET is_personal=0 WHERE id='old'; UPDATE budget_group SET is_personal=1 WHERE id='new';");

    await launch(db);

    expect((db.prepare("SELECT is_personal FROM budget_group WHERE id='old'").get() as any).is_personal).toBe(0);
    expect((db.prepare("SELECT is_personal FROM budget_group WHERE id='new'").get() as any).is_personal).toBe(1);
  });

  it('retries a failed fix on the next launch instead of marking it done', async () => {
    const db = makeDb();
    const keys = ONE_TIME_FIXES.map(f => f.key);
    let failOnce = true;

    const attempt = () => applyOneTimeFixes(
      async () => {
        const rows = db
          .prepare(`SELECT key FROM settings WHERE key IN (${keys.map(() => '?').join(',')})`)
          .all(...keys) as { key: string }[];
        return new Set(rows.map(r => r.key));
      },
      async (sql) => {
        if (failOnce && sql.includes('wallet')) { failOnce = false; throw new Error('disk error'); }
        db.exec(sql);
      },
      async (key) => { db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, '1')").run(key); },
    );

    await expect(attempt()).rejects.toThrow('disk error');
    // Nothing was marked applied, so the whole set is still pending.
    expect(db.prepare('SELECT key FROM settings').all()).toEqual([]);

    const recovered = await attempt();
    expect(recovered).toEqual(keys);
  });

  it('never reuses a fix key', () => {
    const keys = ONE_TIME_FIXES.map(f => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

/**
 * The creator/role backfill. Groups predate the concept entirely, so every existing
 * group has to acquire an owner without one ever having been recorded — and the
 * only possible answer is the `is_me` person, because there is no other user yet.
 *
 * Worth pinning rather than assuming: this is the migration that decides who can
 * administer a group, and getting it wrong on an existing install leaves someone
 * locked out of their own data with no UI to fix it.
 */
describe('creator + role backfill', () => {
  function seeded(): DatabaseSync {
    const db = makeDb();
    db.exec(`
      INSERT INTO person (id, name, is_me, email)
        VALUES ('me','Me',1,NULL), ('rohan','Rohan',0,NULL);
      INSERT INTO budget_group (id, name, icon, color, is_personal, created_at)
        VALUES ('gp','Personal','credit-card','#000',1,100),
               ('gt','Trip','map','#111',0,200);
      INSERT INTO group_member (group_id, person_id, joined_at)
        VALUES ('gp','me',1), ('gt','me',2), ('gt','rohan',3);
    `);
    return db;
  }
  const groups = (db: DatabaseSync) =>
    db.prepare('SELECT id, created_by FROM budget_group ORDER BY id').all() as { id: string; created_by: string | null }[];
  const roles = (db: DatabaseSync) =>
    db.prepare('SELECT group_id, person_id, role FROM group_member ORDER BY group_id, person_id').all() as
      { group_id: string; person_id: string; role: string }[];

  it('gives every existing group a creator', async () => {
    const db = seeded();
    await launch(db);
    expect(groups(db)).toEqual([
      { id: 'gp', created_by: 'me' },
      { id: 'gt', created_by: 'me' },
    ]);
  });

  it('promotes the creator to admin and leaves everyone else a member', async () => {
    const db = seeded();
    await launch(db);
    expect(roles(db)).toEqual([
      { group_id: 'gp', person_id: 'me', role: 'admin' },
      { group_id: 'gt', person_id: 'me', role: 'admin' },
      { group_id: 'gt', person_id: 'rohan', role: 'member' },
    ]);
  });

  it('never overwrites a creator that is already recorded', async () => {
    const db = seeded();
    db.exec("UPDATE budget_group SET created_by = 'rohan' WHERE id = 'gt'");
    await launch(db);
    expect(groups(db).find(g => g.id === 'gt')!.created_by).toBe('rohan');
  });

  it('is idempotent — a second launch changes nothing', async () => {
    const db = seeded();
    await launch(db);
    const before = roles(db);
    await launch(db);
    expect(roles(db)).toEqual(before);
  });
});
