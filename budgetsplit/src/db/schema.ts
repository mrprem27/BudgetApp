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
  remote_uid    TEXT
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
  created_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS group_member (
  group_id   TEXT NOT NULL REFERENCES budget_group(id),
  person_id  TEXT NOT NULL REFERENCES person(id),
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
  recur_freq     TEXT CHECK(recur_freq IN ('daily','weekly','monthly','custom')),
  recur_interval INTEGER,
  recur_end      INTEGER,
  recur_override_date INTEGER,
  recur_state    TEXT NOT NULL DEFAULT 'active' CHECK(recur_state IN ('active','paused','ended')),
  tz             TEXT,
  lat            REAL,
  lng            REAL,
  place_label    TEXT,
  is_deleted     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
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
