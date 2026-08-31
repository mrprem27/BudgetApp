import { DatabaseSync } from 'node:sqlite';
import { ONE_TIME_FIXES, applyOneTimeFixes, applyLaunchInvariants } from '../db/schema';

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
      created_by TEXT,
      deleted_at INTEGER
    );
    CREATE TABLE group_member (
      group_id TEXT NOT NULL, person_id TEXT NOT NULL, joined_at INTEGER,
      role TEXT NOT NULL DEFAULT 'member',
      deleted_at INTEGER,
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
      -- Added by COLUMN_MIGRATIONS in the real schema; included here because the
      -- 'once' cadence fix rewrites it.
      cadence TEXT NOT NULL DEFAULT 'monthly',
      UNIQUE(group_id, category, period)
    );
    CREATE TABLE savings_txn (
      id TEXT PRIMARY KEY, goal_id TEXT, amount INTEGER NOT NULL, kind TEXT NOT NULL
    );
    CREATE TABLE asset (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'other',
      icon TEXT, color TEXT, balance INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
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

/** A full launch: the one-time fixes, then the invariants, in openDB's order. */
async function fullLaunch(db: DatabaseSync): Promise<string[]> {
  const ran = await launch(db);
  await applyLaunchInvariants(async (sql) => { db.exec(sql); });
  return ran;
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

  // The 'once' cadence was removed: it was a pool at every target, so it could
  // never reach a headline, and its window ran from the epoch, so it never reset.
  // Converted rather than deleted — the amount the user typed is real, and
  // 'yearly' is the coarsest cadence that still resets and still rolls up.
  it('converts `once` budget lines to yearly, leaving the amount and the others alone', async () => {
    const db = makeDb();
    db.exec(`
      INSERT INTO category_budget (id, group_id, category, period, cadence, amount)
        VALUES ('b1','g1','Education','monthly','once',600000),
               ('b2','g1','Chai','monthly','daily',5000),
               ('b3','g1','Rent','monthly','monthly',2200000);
    `);

    await launch(db);

    const rows = db.prepare('SELECT id, cadence, amount FROM category_budget ORDER BY id').all() as any[];
    expect(rows).toEqual([
      { id: 'b1', cadence: 'yearly', amount: 600000 },
      { id: 'b2', cadence: 'daily', amount: 5000 },
      { id: 'b3', cadence: 'monthly', amount: 2200000 },
    ]);

    // A line the user later re-saves as something else must survive relaunch —
    // the fix is recorded, not re-applied.
    db.exec("UPDATE category_budget SET cadence='monthly' WHERE id='b1'");
    await launch(db);
    expect((db.prepare("SELECT cadence FROM category_budget WHERE id='b1'").get() as any).cadence).toBe('monthly');
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

/**
 * The v2 repair, for groups created *after* v1 had already run.
 *
 * `insertGroup` took `creatorId` as an optional and every caller omitted it, so a
 * group created in that window got `created_by = NULL` and no admin — and v1 was
 * long since recorded as applied, so nothing came back for it. A one-time fix does
 * not revisit; a broken group made after it lands stays broken forever unless a new
 * key ships.
 *
 * These tests start from a database that has ALREADY had v1 applied, which is the
 * only state where v2 does any work. Seeding the repaired state instead of reaching
 * it is exactly the mistake that let the original bug through, so the broken group
 * here is shaped the way `insertGroup` actually produced it.
 */
describe('creator repair after the backfill has already run (v2)', () => {
  /** A device that ran v1, then created a group through the broken `insertGroup`. */
  function afterV1(): DatabaseSync {
    const db = makeDb();
    db.exec(`
      INSERT INTO settings (key, value) VALUES ('fix_group_creator_roles_v1','1');
      INSERT INTO person (id, name, is_me, email)
        VALUES ('me','Me',1,NULL), ('rohan','Rohan',0,NULL);
      -- Shaped as insertGroup left it: no creator, and every member a plain 'member'.
      INSERT INTO budget_group (id, name, icon, color, is_personal, created_at, created_by)
        VALUES ('gnew','Flatmates','home','#000',0,900,NULL);
      INSERT INTO group_member (group_id, person_id, joined_at, role)
        VALUES ('gnew','me',900,'member'), ('gnew','rohan',900,'member');
    `);
    return db;
  }
  const group = (db: DatabaseSync, id: string) =>
    db.prepare('SELECT created_by FROM budget_group WHERE id = ?').get(id) as { created_by: string | null };
  const roles = (db: DatabaseSync, id: string) =>
    db.prepare('SELECT person_id, joined_at, role FROM group_member WHERE group_id = ? ORDER BY person_id').all(id) as
      { person_id: string; joined_at: number | null; role: string }[];

  it('runs even though v1 is already recorded as applied', async () => {
    const applied = await launch(afterV1());
    expect(applied).toContain('fix_group_creator_roles_v2');
    expect(applied).not.toContain('fix_group_creator_roles_v1');
  });

  it('gives the orphaned group a creator and an admin', async () => {
    const db = afterV1();
    await launch(db);
    expect(group(db, 'gnew').created_by).toBe('me');
    expect(roles(db, 'gnew')).toEqual([
      { person_id: 'me', joined_at: 900, role: 'admin' },
      { person_id: 'rohan', joined_at: 900, role: 'member' },
    ]);
  });

  it('adds the missing membership row when the creator is not in the group', async () => {
    const db = afterV1();
    // v1's UPDATE-only shape could not fix this: an admin who is not a member is the
    // same dead end as a member with no admin.
    db.exec("DELETE FROM group_member WHERE group_id = 'gnew' AND person_id = 'me'");
    await launch(db);
    expect(roles(db, 'gnew')).toEqual([
      { person_id: 'me', joined_at: 900, role: 'admin' },
      { person_id: 'rohan', joined_at: 900, role: 'member' },
    ]);
  });

  it('leaves a group that already has a creator completely alone', async () => {
    const db = afterV1();
    db.exec(`
      INSERT INTO budget_group (id, name, icon, color, is_personal, created_at, created_by)
        VALUES ('gok','Goa','map','#111',0,950,'rohan');
      INSERT INTO group_member (group_id, person_id, joined_at, role)
        VALUES ('gok','rohan',950,'admin'), ('gok','me',950,'member');
    `);
    await launch(db);
    expect(group(db, 'gok').created_by).toBe('rohan');
    expect(roles(db, 'gok')).toEqual([
      { person_id: 'me', joined_at: 950, role: 'member' },
      { person_id: 'rohan', joined_at: 950, role: 'admin' },
    ]);
  });

  it('is idempotent — a second launch changes nothing', async () => {
    const db = afterV1();
    await launch(db);
    const before = roles(db, 'gnew');
    expect(await launch(db)).toEqual([]);
    expect(roles(db, 'gnew')).toEqual(before);
  });
});

/**
 * The same defect arrived twice from two different causes, and the second time a
 * one-time fix could not catch it: `fix_group_creator_roles_v1` was already
 * recorded as applied on those databases, and a keyed migration does not revisit.
 * "The creator can administer the group" is a property that must hold after every
 * write, so it is re-asserted on every launch instead.
 */
describe('launch invariants: the creator can always administer the group', () => {
  const roles = (db: DatabaseSync, id: string) =>
    db.prepare('SELECT person_id, role, deleted_at FROM group_member WHERE group_id = ? ORDER BY person_id').all(id) as
      { person_id: string; role: string; deleted_at: number | null }[];

  /** A device long past both one-time fixes. */
  function settled(): DatabaseSync {
    const db = makeDb();
    db.exec(`
      INSERT INTO settings (key, value) VALUES
        ('fix_group_creator_roles_v1','1'), ('fix_group_creator_roles_v2','1');
      INSERT INTO person (id, name, is_me, email)
        VALUES ('me','Me',1,NULL), ('rohan','Rohan',0,NULL), ('aarav','Aarav',0,NULL);
    `);
    return db;
  }

  it('promotes a creator who was left a plain member, after both fixes have run', async () => {
    const db = settled();
    db.exec(`
      INSERT INTO budget_group (id, name, icon, color, is_personal, created_at, created_by)
        VALUES ('g1','Flat','home','#000',0,1000,'me');
      INSERT INTO group_member (group_id, person_id, joined_at, role)
        VALUES ('g1','me',1000,'member'), ('g1','rohan',1000,'member');
    `);
    // Neither creator fix comes back — this is exactly the state a keyed
    // migration cannot repair, and the reason this is an invariant instead.
    expect(await fullLaunch(db)).not.toEqual(
      expect.arrayContaining(['fix_group_creator_roles_v1', 'fix_group_creator_roles_v2']),
    );
    expect(roles(db, 'g1')).toEqual([
      { person_id: 'me', role: 'admin', deleted_at: null },
      { person_id: 'rohan', role: 'member', deleted_at: null },
    ]);
  });

  it('adds the membership row when the creator has none at all', async () => {
    const db = settled();
    db.exec(`
      INSERT INTO budget_group (id, name, icon, color, is_personal, created_at, created_by)
        VALUES ('g1','Flat','home','#000',0,1000,'me');
      INSERT INTO group_member (group_id, person_id, joined_at, role) VALUES ('g1','rohan',1000,'member');
    `);
    await fullLaunch(db);
    expect(roles(db, 'g1')).toContainEqual({ person_id: 'me', role: 'admin', deleted_at: null });
  });

  /**
   * The line the one-time fixes crossed and this must not: an adopted group whose
   * roster has not landed yet has no creator, and naming ME as its creator would
   * hand me delete rights over somebody else's group — and publish that claim back.
   */
  it('never guesses a creator for a group that has none', async () => {
    const db = settled();
    db.exec(`
      INSERT INTO budget_group (id, name, icon, color, is_personal, created_at, created_by)
        VALUES ('adopted','Goa','map','#111',0,1200,NULL);
      INSERT INTO group_member (group_id, person_id, joined_at, role) VALUES ('adopted','me',1200,'member');
    `);
    await fullLaunch(db);
    const g = db.prepare('SELECT created_by FROM budget_group WHERE id = ?').get('adopted') as { created_by: string | null };
    expect(g.created_by).toBeNull();
    expect(roles(db, 'adopted')).toEqual([{ person_id: 'me', role: 'member', deleted_at: null }]);
  });

  /** Leaving is a decision. A re-assert on every launch must not undo it. */
  it('does not bring a creator who left back into the group', async () => {
    const db = settled();
    db.exec(`
      INSERT INTO budget_group (id, name, icon, color, is_personal, created_at, created_by)
        VALUES ('g1','Flat','home','#000',0,1000,'me');
      INSERT INTO group_member (group_id, person_id, joined_at, role, deleted_at)
        VALUES ('g1','me',1000,'admin',5000), ('g1','rohan',1000,'admin',NULL);
    `);
    await fullLaunch(db);
    expect(roles(db, 'g1')).toContainEqual({ person_id: 'me', role: 'admin', deleted_at: 5000 });
  });

  it('leaves a deleted group alone', async () => {
    const db = settled();
    db.exec(`
      INSERT INTO budget_group (id, name, icon, color, is_personal, created_at, created_by, deleted_at)
        VALUES ('gone','Old','home','#000',0,1000,'me',7000);
    `);
    await fullLaunch(db);
    expect(roles(db, 'gone')).toEqual([]);
  });

  it('is idempotent, and touches nothing on a healthy database', async () => {
    const db = settled();
    db.exec(`
      INSERT INTO budget_group (id, name, icon, color, is_personal, created_at, created_by)
        VALUES ('g1','Flat','home','#000',0,1000,'rohan');
      INSERT INTO group_member (group_id, person_id, joined_at, role)
        VALUES ('g1','rohan',1000,'admin'), ('g1','me',1000,'member'), ('g1','aarav',1000,'member');
    `);
    await fullLaunch(db);
    const before = roles(db, 'g1');
    await fullLaunch(db);
    expect(roles(db, 'g1')).toEqual(before);
    // And in particular a plain member is still a plain member.
    expect(before).toContainEqual({ person_id: 'me', role: 'member', deleted_at: null });
  });
});

/**
 * `money.investments` was one number that could not tell gold from an FD from a
 * flat. Moving it into the asset register has two halves and BOTH are silent if
 * missed: skip the insert and net worth drops by the whole investment; skip the
 * zeroing and there are two numbers claiming to be the same thing.
 */
describe('investments become the first asset', () => {
  const assets = (db: DatabaseSync) =>
    db.prepare('SELECT id, name, kind, balance FROM asset ORDER BY sort_order').all() as
      { id: string; name: string; kind: string; balance: number }[];
  const investmentsKey = (db: DatabaseSync) =>
    (db.prepare("SELECT value FROM settings WHERE key = 'money.investments'").get() as { value: string } | undefined)?.value;

  function withInvestments(paise: string): DatabaseSync {
    const db = makeDb();
    db.exec(`INSERT INTO settings (key, value) VALUES ('money.investments','${paise}');`);
    return db;
  }

  it('mints an asset holding exactly what the number said', async () => {
    const db = withInvestments('150000');
    await launch(db);
    expect(assets(db)).toEqual([
      { id: 'asset_migrated_investments', name: 'Investments', kind: 'investment', balance: 150000 },
    ]);
  });

  it('zeroes the settings key, so nothing else can still claim to be that money', async () => {
    const db = withInvestments('150000');
    await launch(db);
    // '0' rather than deleted: a backup written afterwards still carries the key,
    // so restoring it into an older build reads Rs 0 rather than nothing at all.
    expect(investmentsKey(db)).toBe('0');
  });

  it('creates nothing when there were no investments', async () => {
    const db = withInvestments('0');
    await launch(db);
    expect(assets(db)).toEqual([]);
  });

  it('creates nothing when the key was never written', async () => {
    const db = makeDb();
    await launch(db);
    expect(assets(db)).toEqual([]);
  });

  /**
   * The case that would DOUBLE somebody's net worth: a database that already has
   * assets — a demo seed, or a restore of a backup made after the register
   * shipped — must not also get a migrated row on top of them.
   */
  it('leaves an existing register alone rather than adding to it', async () => {
    const db = withInvestments('150000');
    db.exec(`
      INSERT INTO asset (id, name, kind, balance, is_archived, sort_order, created_at, updated_at)
        VALUES ('a1','Gold','gold',40000,0,0,1,1);
    `);
    await launch(db);
    expect(assets(db)).toEqual([{ id: 'a1', name: 'Gold', kind: 'gold', balance: 40000 }]);
    // The key is still zeroed: the value it held is represented by the assets that
    // are already there, and leaving it would be the second source of truth again.
    expect(investmentsKey(db)).toBe('0');
  });

  it('does not run twice', async () => {
    const db = withInvestments('150000');
    await launch(db);
    // Somebody invests more; the migration must not re-mint from a stale key.
    db.exec("UPDATE settings SET value = '999' WHERE key = 'money.investments'");
    expect(await launch(db)).toEqual([]);
    expect(assets(db)).toHaveLength(1);
    expect(assets(db)[0].balance).toBe(150000);
  });
});
