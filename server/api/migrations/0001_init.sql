-- S1: login + backup/restore. Server-side identity and backup metadata ONLY —
-- the app's actual financial data stays local-first in each device's own
-- SQLite database (src/db/schema.ts). This is a separate database with no
-- relationship to that one.

CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT,
  avatar_url  TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE magic_links (
  token       TEXT PRIMARY KEY,     -- random, single-use
  email       TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,     -- 15 min from creation
  used_at     INTEGER
);
-- Rate-limiting a request-link spam burst reads "how many for this email
-- recently" — without this index that's a full table scan per request.
CREATE INDEX idx_magic_links_email ON magic_links(email, expires_at);

CREATE TABLE sessions (
  token        TEXT PRIMARY KEY,    -- random opaque, sent as a bearer token
  user_id      TEXT NOT NULL REFERENCES users(id),
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,    -- rolling; refreshed on use
  device_label TEXT                 -- optional, "iPhone 15" — lets a user see/revoke sessions later
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE backups (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  r2_key      TEXT NOT NULL,        -- backups/{user_id}/{timestamp}.enc
  size_bytes  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_backups_user ON backups(user_id, created_at DESC);
