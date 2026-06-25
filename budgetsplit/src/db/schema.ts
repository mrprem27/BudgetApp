import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { INCOME_CATEGORIES, CATEGORY_SECTIONS } from '../constants/categories';

const SCHEMA = `
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS person (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  avatar_color  TEXT NOT NULL,
  is_me         INTEGER NOT NULL DEFAULT 0,
  email         TEXT,
  mobile        TEXT,
  remote_uid    TEXT,
  image_uri     TEXT
);

CREATE TABLE IF NOT EXISTS budget_group (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  icon           TEXT NOT NULL,
  color          TEXT NOT NULL,
  limit_daily    INTEGER,
  limit_monthly  INTEGER,
  limit_yearly   INTEGER,
  carry_over     INTEGER NOT NULL DEFAULT 0,
  is_shared      INTEGER NOT NULL DEFAULT 0,
  is_archived    INTEGER NOT NULL DEFAULT 0,
  is_personal    INTEGER NOT NULL DEFAULT 0,
  simplify_debt  INTEGER NOT NULL DEFAULT 1,
  default_split  TEXT NOT NULL DEFAULT 'equal' CHECK(default_split IN ('equal','exact','percent','shares')),
  created_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS group_member (
  group_id   TEXT NOT NULL REFERENCES budget_group(id),
  person_id  TEXT NOT NULL REFERENCES person(id),
  joined_at  INTEGER,                       -- when this person joined the group (epoch ms)
  PRIMARY KEY (group_id, person_id)
);

CREATE TABLE IF NOT EXISTS txn (
  id             TEXT PRIMARY KEY,
  group_id       TEXT NOT NULL REFERENCES budget_group(id),
  kind           TEXT NOT NULL CHECK(kind IN ('income','expense','settlement')),
  entry_mode     TEXT NOT NULL CHECK(entry_mode IN ('quick','itemized')),
  date           INTEGER NOT NULL,
  category       TEXT NOT NULL,
  note           TEXT,
  attachment_uri TEXT,
  tags           TEXT,
  adjustments    TEXT,
  recur_freq     TEXT CHECK(recur_freq IN ('daily','weekly','monthly','yearly','custom')),
  recur_interval INTEGER,
  recur_end      INTEGER,
  recur_override_date INTEGER,
  parent_recur_id TEXT,
  recur_state    TEXT NOT NULL DEFAULT 'active' CHECK(recur_state IN ('active','paused','ended')),
  tz             TEXT,
  lat            REAL,
  lng            REAL,
  place_label    TEXT,
  pay_method     TEXT,
  is_deleted     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS recur_skip (
  series_id       TEXT NOT NULL REFERENCES txn(id),
  occurrence_date INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  PRIMARY KEY (series_id, occurrence_date)
);

CREATE TABLE IF NOT EXISTS txn_payment (
  txn_id     TEXT NOT NULL REFERENCES txn(id),
  person_id  TEXT NOT NULL REFERENCES person(id),
  amount     INTEGER NOT NULL,
  PRIMARY KEY (txn_id, person_id)
);

CREATE TABLE IF NOT EXISTS txn_share (
  txn_id     TEXT NOT NULL REFERENCES txn(id),
  person_id  TEXT NOT NULL REFERENCES person(id),
  amount     INTEGER NOT NULL,
  PRIMARY KEY (txn_id, person_id)
);

CREATE TABLE IF NOT EXISTS line_item (
  id           TEXT PRIMARY KEY,
  txn_id       TEXT NOT NULL REFERENCES txn(id),
  name         TEXT NOT NULL,
  qty          INTEGER NOT NULL DEFAULT 1,
  unit_price   INTEGER NOT NULL,
  assigned_to  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS category (
  id        TEXT PRIMARY KEY,
  group_id  TEXT NOT NULL REFERENCES budget_group(id),
  name      TEXT NOT NULL,
  icon      TEXT,
  color     TEXT,
  kind      TEXT NOT NULL DEFAULT 'expense' CHECK(kind IN ('expense','income'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS category_budget (
  id        TEXT PRIMARY KEY,
  group_id  TEXT NOT NULL REFERENCES budget_group(id),
  category  TEXT NOT NULL,
  period    TEXT NOT NULL DEFAULT 'monthly' CHECK(period IN ('monthly','yearly')),
  amount    INTEGER NOT NULL,
  UNIQUE(group_id, category, period)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  group_id    TEXT,
  action      TEXT NOT NULL,
  summary     TEXT NOT NULL,
  amount      INTEGER,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_group   ON audit_log(group_id);

-- Savings Goals / Bucket List. Kept entirely separate from budgets: money lives
-- in the Savings Pool and is earmarked to goals; it never inflates a budget.
CREATE TABLE IF NOT EXISTS savings_goal (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  target       INTEGER NOT NULL,        -- paise
  priority     TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
  category     TEXT,
  icon         TEXT,
  color        TEXT,
  allocation   INTEGER NOT NULL DEFAULT 0,  -- fixed savings allocation per frequency (paise)
  frequency    TEXT NOT NULL DEFAULT 'none' CHECK(frequency IN ('daily','weekly','monthly','yearly','none')),
  locked       INTEGER NOT NULL DEFAULT 0,  -- protect from auto-reallocation
  is_archived  INTEGER NOT NULL DEFAULT 0,
  last_auto_at INTEGER,                      -- schedule anchor for auto-funding
  target_date  INTEGER,                      -- optional deadline (epoch ms) → "needed/mo" + countdown
  sort_order   INTEGER NOT NULL DEFAULT 0,   -- manual drag rank → funding order (lower = funded first)
  created_at   INTEGER NOT NULL
);

-- Savings ledger. goal_id NULL = a pool-level deposit/withdrawal.
--   deposit  → money into the pool (manual top-up or auto-sweep)
--   allocate → pool → goal (earmark)
--   withdraw → goal → pool (deallocate) or pool → out (goal_id NULL)
CREATE TABLE IF NOT EXISTS savings_txn (
  id          TEXT PRIMARY KEY,
  goal_id     TEXT,
  amount      INTEGER NOT NULL,         -- paise (positive)
  kind        TEXT NOT NULL CHECK(kind IN ('deposit','allocate','withdraw')),
  source      TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','auto')),
  date        INTEGER NOT NULL,
  note        TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_savings_txn_goal ON savings_txn(goal_id);
`;

/**
 * Columns added after v1 shipped. SQLite has no `ADD COLUMN IF NOT EXISTS`,
 * so each ALTER is wrapped — a duplicate-column error means it already exists.
 */
const COLUMN_MIGRATIONS = [
  "ALTER TABLE budget_group ADD COLUMN is_personal INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE budget_group ADD COLUMN simplify_debt INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE txn ADD COLUMN recur_state TEXT NOT NULL DEFAULT 'active'",
  // Budget v5: each category budget carries its own cadence.
  "ALTER TABLE category_budget ADD COLUMN cadence TEXT NOT NULL DEFAULT 'monthly'",
  // v2: unique user identity + transaction metadata (timezone, optional location).
  "ALTER TABLE person ADD COLUMN email TEXT",
  "ALTER TABLE person ADD COLUMN mobile TEXT",
  "ALTER TABLE txn ADD COLUMN tz TEXT",
  "ALTER TABLE txn ADD COLUMN lat REAL",
  "ALTER TABLE txn ADD COLUMN lng REAL",
  "ALTER TABLE txn ADD COLUMN place_label TEXT",
  // Income gets its own category set (Phase G).
  "ALTER TABLE category ADD COLUMN kind TEXT NOT NULL DEFAULT 'expense'",
  // v2: multi-currency — default null means app-wide default (INR).
  "ALTER TABLE txn ADD COLUMN currency TEXT",
  "ALTER TABLE budget_group ADD COLUMN default_currency TEXT",
  // v3: section persists where a category belongs (custom categories no longer lost).
  "ALTER TABLE category ADD COLUMN section TEXT",
  // Savings auto-funding: per-goal schedule anchor.
  "ALTER TABLE savings_goal ADD COLUMN last_auto_at INTEGER",
  // Avatar photos for the user & friends (local file path; null = use initials).
  "ALTER TABLE person ADD COLUMN image_uri TEXT",
  // Itemized bills persist their tax/tip/discount adjustments so they round-trip on edit.
  "ALTER TABLE txn ADD COLUMN adjustments TEXT",
  // Recurring occurrences materialize into real rows linked back to their rule.
  "ALTER TABLE txn ADD COLUMN parent_recur_id TEXT",
  // Settlements record how they were paid (upi/cash/bank) as a real field, not a note.
  "ALTER TABLE txn ADD COLUMN pay_method TEXT",
  // Savings goals can carry an optional deadline → needed-per-month + countdown.
  "ALTER TABLE savings_goal ADD COLUMN target_date INTEGER",
  // Manual drag rank → funding order (lower = funded first). Replaces priority buckets.
  "ALTER TABLE savings_goal ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
  // When a person joined a group → "Joined {month year}" on the Members sub-tab.
  "ALTER TABLE group_member ADD COLUMN joined_at INTEGER",
  // A group's default split mode, picked at creation → seeds the Add-expense split.
  "ALTER TABLE budget_group ADD COLUMN default_split TEXT NOT NULL DEFAULT 'equal'",
];

export async function openDB(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('budgetsplit.db');
  await db.execAsync(SCHEMA);

  for (const sql of COLUMN_MIGRATIONS) {
    try {
      await db.execAsync(sql);
    } catch {
      // Column already exists — safe to ignore.
    }
  }

  // One-time rebuild: the original txn table had CHECK(recur_freq IN
  // ('daily','weekly','monthly','custom')) which rejects 'yearly'. SQLite can't
  // ALTER a CHECK, so recreate the table without the stale constraint, copying
  // every row by column name. Detected by the absence of 'yearly' in its DDL.
  try {
    const txnDef = await db.getFirstAsync<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='txn'",
    );
    if (txnDef && !txnDef.sql.includes("'yearly'")) {
      const cols = 'id,group_id,kind,entry_mode,date,category,note,attachment_uri,tags,adjustments,'
        + 'recur_freq,recur_interval,recur_end,recur_override_date,parent_recur_id,recur_state,'
        + 'tz,lat,lng,place_label,pay_method,currency,is_deleted,created_at,updated_at';
      await db.execAsync(`
        PRAGMA foreign_keys=OFF;
        BEGIN TRANSACTION;
        CREATE TABLE txn_new (
          id             TEXT PRIMARY KEY,
          group_id       TEXT NOT NULL REFERENCES budget_group(id),
          kind           TEXT NOT NULL CHECK(kind IN ('income','expense','settlement')),
          entry_mode     TEXT NOT NULL CHECK(entry_mode IN ('quick','itemized')),
          date           INTEGER NOT NULL,
          category       TEXT NOT NULL,
          note           TEXT,
          attachment_uri TEXT,
          tags           TEXT,
          adjustments    TEXT,
          recur_freq     TEXT CHECK(recur_freq IN ('daily','weekly','monthly','yearly','custom')),
          recur_interval INTEGER,
          recur_end      INTEGER,
          recur_override_date INTEGER,
          parent_recur_id TEXT,
          recur_state    TEXT NOT NULL DEFAULT 'active' CHECK(recur_state IN ('active','paused','ended')),
          tz             TEXT,
          lat            REAL,
          lng            REAL,
          place_label    TEXT,
          pay_method     TEXT,
          currency       TEXT,
          is_deleted     INTEGER NOT NULL DEFAULT 0,
          created_at     INTEGER NOT NULL,
          updated_at     INTEGER NOT NULL
        );
        INSERT INTO txn_new (${cols}) SELECT ${cols} FROM txn;
        DROP TABLE txn;
        ALTER TABLE txn_new RENAME TO txn;
        COMMIT;
        PRAGMA foreign_keys=ON;
      `);
    }
  } catch {
    // If the rebuild fails, leave the original table intact (yearly stays unavailable).
  }

  // Hot-path indexes. Created here (not inline in SCHEMA) because the one-time
  // txn rebuild above drops & recreates the txn table, which would wipe any
  // index defined alongside it. IF NOT EXISTS keeps this idempotent on every open.
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_txn_group_date ON txn(group_id, date);
    CREATE INDEX IF NOT EXISTS idx_txn_parent     ON txn(parent_recur_id);
    CREATE INDEX IF NOT EXISTS idx_txn_recurring  ON txn(group_id, recur_state) WHERE recur_freq IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_line_item_txn  ON line_item(txn_id);
  `);

  // One-time fix: 'wallet' is not a valid Feather icon
  await db.execAsync("UPDATE budget_group SET icon='credit-card' WHERE icon='wallet';");
  // The seeded Personal group (oldest, name 'Personal') is the single-user space.
  await db.execAsync(
    "UPDATE budget_group SET is_personal=1 WHERE id=(SELECT id FROM budget_group ORDER BY created_at ASC LIMIT 1);",
  );
  // Ensure the local user has a unique identifier (MVP default).
  await db.execAsync(
    "UPDATE person SET email='hello123@vortiqal.com' WHERE is_me=1 AND (email IS NULL OR email='');",
  );

  // Phase G: reclassify legacy income-named categories, then backfill the
  // income category set into any group that doesn't have it yet.
  await db.execAsync("UPDATE category SET kind='income' WHERE name IN ('Salary','Freelance','Refunds','Business','Interest','Dividends','Rent Received','Bonus','Cashback','Gifts Received','Other Income');");
  const groups = await db.getAllAsync<{ id: string }>('SELECT id FROM budget_group');
  for (const g of groups) {
    for (const cat of INCOME_CATEGORIES) {
      const exists = await db.getFirstAsync<{ one: number }>(
        'SELECT 1 as one FROM category WHERE group_id=? AND name=?', [g.id, cat.name],
      );
      if (!exists) {
        await db.runAsync(
          "INSERT INTO category (id, group_id, name, icon, color, kind) VALUES (?, ?, ?, ?, ?, 'income')",
          [uuid(), g.id, cat.name, cat.icon, cat.color],
        );
      }
    }
  }

  // Backfill section column for all categories that don't have one yet.
  for (const sec of CATEGORY_SECTIONS) {
    if (sec.names.length > 0) {
      const placeholders = sec.names.map(() => '?').join(',');
      await db.runAsync(
        `UPDATE category SET section=? WHERE section IS NULL AND name IN (${placeholders})`,
        [sec.title, ...sec.names],
      );
    }
  }
  await db.runAsync(
    "UPDATE category SET section='Income' WHERE section IS NULL AND kind='income'",
  );

  return db;
}
