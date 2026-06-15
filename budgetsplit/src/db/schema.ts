import * as SQLite from 'expo-sqlite';

const SCHEMA = `
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS person (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  avatar_color  TEXT NOT NULL,
  is_me         INTEGER NOT NULL DEFAULT 0,
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
  color     TEXT
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
  return db;
}
