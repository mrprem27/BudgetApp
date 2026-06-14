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
`;

export async function openDB(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('budgetsplit.db');
  await db.execAsync(SCHEMA);
  return db;
}
