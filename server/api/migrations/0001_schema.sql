-- BudgetSplit API — the whole schema, as one file.
--
-- Development phase: no real user has ever signed in, so there is nothing to
-- preserve across a schema change. One consolidated file, applied fresh, beats
-- eleven incremental ones that exist only to protect data that doesn't exist —
-- see SPEC-SERVER.md. When this needs to change, edit it directly and reapply
-- (`wrangler d1 execute --local --file=schema-reset.sql` to wipe first, or drop
-- the dev database and recreate it); do not add a second migration file back.
--
-- Two parts, clearly marked:
--   §1 — accounts and linking: users, sign-in, invites, links, friend requests.
--   §2 — v2 (SPEC-SERVER.md, DQ-93): everything a user's ledger holds, readable
--        by the server. The v1 zero-knowledge sync and the passphrase backups it
--        leaned on were deleted in S22.

-- =============================================================================
-- §1 · accounts and linking
-- =============================================================================

CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT,
  avatar_url  TEXT,
  phone       TEXT,       -- self-declared, never verified, never searchable
  deleted_at  INTEGER,     -- account deletion is a scrub, not a row delete — see §1's DELETE /me
  created_at  INTEGER NOT NULL
);

CREATE TABLE magic_links (
  token       TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER
);
CREATE INDEX idx_magic_links_email  ON magic_links(email, expires_at);
CREATE INDEX idx_magic_links_expiry ON magic_links(expires_at);

CREATE TABLE sessions (
  token        TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  device_label TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE invites (
  token       TEXT PRIMARY KEY,
  from_user   TEXT NOT NULL REFERENCES users(id),
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  claimed_by  TEXT REFERENCES users(id),
  claimed_at  INTEGER,
  state       TEXT CHECK(state IN ('pending','approved','declined'))
);
CREATE INDEX idx_invites_from    ON invites(from_user, created_at DESC);
CREATE INDEX idx_invites_claimed ON invites(claimed_by);

-- One row per pair. `user_a` is always the lexicographically smaller id so the
-- pair is unique in one direction only (see `orderPair` on the Worker side).
CREATE TABLE links (
  id            TEXT PRIMARY KEY,
  user_a        TEXT NOT NULL REFERENCES users(id),
  user_b        TEXT NOT NULL REFERENCES users(id),
  created_at    INTEGER NOT NULL,
  share_phone_a INTEGER NOT NULL DEFAULT 0,
  share_phone_b INTEGER NOT NULL DEFAULT 0,
  ended_at      INTEGER,                    -- a tombstone, not a DELETE — see 0007's argument
  ended_by      TEXT REFERENCES users(id),
  UNIQUE(user_a, user_b)
);
CREATE INDEX idx_links_a    ON links(user_a);
CREATE INDEX idx_links_b    ON links(user_b);
CREATE INDEX idx_links_live ON links(user_a, user_b) WHERE ended_at IS NULL;

CREATE TABLE friend_request (
  id           TEXT PRIMARY KEY,
  from_user    TEXT NOT NULL REFERENCES users(id),
  to_email     TEXT NOT NULL,               -- not a foreign key; may belong to nobody yet
  to_user      TEXT REFERENCES users(id),
  state        TEXT NOT NULL CHECK(state IN ('pending','accepted','declined','cancelled')),
  note         TEXT,
  created_at   INTEGER NOT NULL,
  last_sent_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  decided_at   INTEGER
);
CREATE UNIQUE INDEX idx_friend_request_pair ON friend_request(from_user, to_email) WHERE state = 'pending';
CREATE INDEX idx_friend_request_inbox  ON friend_request(to_email, state);
CREATE INDEX idx_friend_request_from   ON friend_request(from_user, created_at DESC);
CREATE INDEX idx_friend_request_recent ON friend_request(to_email, last_sent_at);

CREATE TABLE friend_block (
  owner_user    TEXT NOT NULL REFERENCES users(id),
  blocked_email TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  PRIMARY KEY (owner_user, blocked_email)
);
CREATE INDEX idx_friend_block_email ON friend_block(blocked_email);

-- =============================================================================
-- §2 · v2 — the server becomes the authority for ALL of a user's data
--       (SPEC-SERVER.md, DQ-93)
-- =============================================================================
--
-- Conventions for every SYNCED table (pulled to the phone):
--   id          TEXT PRIMARY KEY — a uuid minted on the phone
--   scope_id    who may read the row (a user id or a group id), CHECKed against
--               the owning column so a row can never sit in someone else's scope
--   version     compare-and-set basis; money writes must name the version they saw
--   seq         the scope's change counter at the last write — the pull cursor
--   created_* / updated_*   stamped by the Worker from the session, never the body
--   deleted_at  tombstone; the pull delivers it (a hard delete cannot propagate)
--
-- D1 enforces foreign keys by default. The app's local SQLite does not (DQ-19),
-- so this schema is the stricter of the two — but it must never REFUSE a state
-- the phone can legitimately produce, which is why uniqueness below mirrors the
-- phone's exactly (case-sensitive names) rather than improving on it.
--
-- Tables that pair two things (`friends`, `group_members`, `group_preferences`,
-- `approvals`, `disputes`, `money_profiles`, `user_preferences`) still get their
-- own `id`, with a `UNIQUE` on the pair. Every synced row then has one key the
-- pull and `rowMap` can use.
--
-- Stricter, never incompatible. Wherever the phone does not actually guarantee a
-- rule — a goal's target, the sign of an opening balance, the case of a category
-- name — the server does not invent one. A constraint the phone can violate turns
-- into an upload that is refused for good.

-- ---------------------------------------------------------------------------
-- Sync bookkeeping
-- ---------------------------------------------------------------------------

-- One change counter per scope. Every write bumps it and stamps the rows it
-- touched, so ordering comes from a counter, not a clock: two writes in the same
-- millisecond cannot swap places the way v1's `updated_at` cursor allowed.
CREATE TABLE sync_scopes (
  id          TEXT PRIMARY KEY,                 -- users.id or groups.id
  kind        TEXT NOT NULL CHECK (kind IN ('user','group')),
  seq         INTEGER NOT NULL DEFAULT 0 CHECK (seq >= 0),
  created_at  INTEGER NOT NULL
);

-- One row per app install. `last_mutation_id` is updated in the SAME batch as the
-- mutation's effects, which is what makes a retried push apply exactly once.
CREATE TABLE devices (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id),
  label             TEXT,
  last_mutation_id  INTEGER NOT NULL DEFAULT 0 CHECK (last_mutation_id >= 0),
  created_at        INTEGER NOT NULL,
  last_seen_at      INTEGER NOT NULL
);
CREATE INDEX idx_devices_user ON devices(user_id);

-- A mutation the server refused or found in conflict, handed back on the next
-- pull so the phone can revert it and say why. Never retried by the server.
CREATE TABLE sync_rejections (
  device_id    TEXT NOT NULL REFERENCES devices(id),
  mutation_id  INTEGER NOT NULL CHECK (mutation_id >= 1),
  code         TEXT NOT NULL CHECK (code IN ('conflict','forbidden','invalid','not_found')),
  message      TEXT NOT NULL,
  current      TEXT CHECK (current IS NULL OR json_valid(current)),  -- the server's copy, on a conflict
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (device_id, mutation_id)
);

-- D1 has no interactive transactions, only atomic batches. A precondition is put
-- INSIDE the batch as `INSERT INTO write_guard SELECT 1 WHERE NOT (<condition>)`:
-- when the condition fails, the insert trips this CHECK and the whole batch rolls
-- back. Nothing is ever stored here. The Worker diagnoses which guard fired by
-- re-reading after the abort (portable: no RAISE-with-expression needed).
CREATE TABLE write_guard (
  tripped INTEGER CONSTRAINT precondition_failed CHECK (0)
);

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

-- One id per human, everywhere. An account holder is exactly one person; a friend
-- with no account is a person with user_id NULL (a placeholder), and is merged
-- into the real person — every reference re-pointed — when they sign up and link.
-- Not pulled as a table: its two useful facts (the id, whether it has an account)
-- travel on the group_members and friends rows that point at it.
CREATE TABLE people (
  id           TEXT PRIMARY KEY,
  user_id      TEXT UNIQUE REFERENCES users(id),
  merged_into  TEXT REFERENCES people(id) CHECK (merged_into IS NULL OR merged_into <> id),
  created_by   TEXT NOT NULL REFERENCES users(id),
  created_at   INTEGER NOT NULL
);

-- How a user presents themselves in the app: the name, colour and UPI handle on
-- their own "me" row. `users` is the account (email identity, sign-in); this is
-- the profile the ledger shows. One per user, id = the user id.
CREATE TABLE profiles (
  id            TEXT PRIMARY KEY,
  scope_id      TEXT NOT NULL REFERENCES sync_scopes(id),
  version       INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  seq           INTEGER NOT NULL CHECK (seq >= 1),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  created_by    TEXT NOT NULL REFERENCES users(id),
  updated_by    TEXT NOT NULL REFERENCES users(id),
  deleted_at    INTEGER,
  user_id       TEXT NOT NULL UNIQUE REFERENCES users(id),
  display_name  TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  avatar_color  TEXT,
  mobile        TEXT,
  upi_vpa       TEXT,
  CHECK (scope_id = user_id),
  CHECK (id = user_id)
);
CREATE INDEX idx_profiles_pull ON profiles(scope_id, seq);

-- The people *I* have saved, as I see them. What I call someone and their UPI
-- handle are mine to decide; nobody else's group can rename my friends.
CREATE TABLE friends (
  id                    TEXT PRIMARY KEY,
  scope_id              TEXT NOT NULL REFERENCES sync_scopes(id),
  version               INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  seq                   INTEGER NOT NULL CHECK (seq >= 1),
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  created_by            TEXT NOT NULL REFERENCES users(id),
  updated_by            TEXT NOT NULL REFERENCES users(id),
  deleted_at            INTEGER,
  user_id               TEXT NOT NULL REFERENCES users(id),
  person_id             TEXT NOT NULL REFERENCES people(id),
  name                  TEXT NOT NULL CHECK (length(trim(name)) > 0),
  avatar_color          TEXT NOT NULL,
  mobile                TEXT,
  email                 TEXT,
  upi_vpa               TEXT,
  receivable_status     TEXT NOT NULL DEFAULT 'expected' CHECK (receivable_status IN ('expected','written_off')),
  receivable_status_at  INTEGER,
  is_archived           INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0,1)),
  CHECK (scope_id = user_id),
  UNIQUE (user_id, person_id)
);
CREATE INDEX idx_friends_pull ON friends(scope_id, seq);

-- ---------------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------------

-- A group is its own scope. kind:
--   personal — exactly one per user, one member (the owner); holds the personal ledger
--   shared   — an ordinary group
--   pair     — exactly two members, made implicitly by splitting with one friend.
--              "The friend this group is" depends on who is looking, so it is not
--              stored: each phone derives it as the OTHER member.
-- owner_id is the creator, permanent (trigger below), and always an admin — so a
-- group can never be left with nobody able to administer it (SYNC-F20).
CREATE TABLE groups (
  id              TEXT PRIMARY KEY,
  scope_id        TEXT NOT NULL REFERENCES sync_scopes(id),
  version         INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  seq             INTEGER NOT NULL CHECK (seq >= 1),
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  created_by      TEXT NOT NULL REFERENCES users(id),
  updated_by      TEXT NOT NULL REFERENCES users(id),
  deleted_at      INTEGER,
  kind            TEXT NOT NULL CHECK (kind IN ('personal','shared','pair')),
  name            TEXT NOT NULL CHECK (length(trim(name)) > 0),
  icon            TEXT NOT NULL,
  color           TEXT NOT NULL,
  owner_id        TEXT NOT NULL REFERENCES users(id),
  simplify_debts  INTEGER NOT NULL DEFAULT 1 CHECK (simplify_debts IN (0,1)),
  default_split   TEXT NOT NULL DEFAULT 'equal' CHECK (default_split IN ('equal','exact','percent','shares')),
  carry_over      INTEGER NOT NULL DEFAULT 0 CHECK (carry_over IN (0,1)),
  currency        TEXT NOT NULL DEFAULT 'INR' CHECK (length(currency) = 3),
  CHECK (scope_id = id)
);
CREATE INDEX idx_groups_owner ON groups(owner_id);
CREATE INDEX idx_groups_pull ON groups(scope_id, seq);
-- One live personal group per user.
CREATE UNIQUE INDEX ux_groups_one_personal ON groups(owner_id)
  WHERE kind = 'personal' AND deleted_at IS NULL;

-- Permanent while the owner's account exists. The one exception is account
-- deletion handing the group to the next member (sync/erase.ts, SYNC-F20), which
-- marks the account deleted first; no push can reach this column at all.
CREATE TRIGGER groups_owner_is_permanent
BEFORE UPDATE OF owner_id ON groups
WHEN NEW.owner_id IS NOT OLD.owner_id
 AND NOT EXISTS (SELECT 1 FROM users WHERE id = OLD.owner_id AND deleted_at IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'groups.owner_id is permanent');
END;

-- Membership IS access: a user reads a group scope while their person's row here
-- is 'active'. An account holder is 'invited' until they accept; a placeholder is
-- 'active' from the moment it is added. Leaving and removal end the relationship,
-- never a record — the row stays, with left_at.
CREATE TABLE group_members (
  id            TEXT PRIMARY KEY,
  scope_id      TEXT NOT NULL REFERENCES sync_scopes(id),
  version       INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  seq           INTEGER NOT NULL CHECK (seq >= 1),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  created_by    TEXT NOT NULL REFERENCES users(id),
  updated_by    TEXT NOT NULL REFERENCES users(id),
  deleted_at    INTEGER,
  group_id      TEXT NOT NULL REFERENCES groups(id),
  person_id     TEXT NOT NULL REFERENCES people(id),
  display_name  TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  avatar_color  TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  status        TEXT NOT NULL CHECK (status IN ('invited','active','left','removed')),
  joined_at     INTEGER,
  left_at       INTEGER,
  invited_by    TEXT REFERENCES users(id),
  CHECK (scope_id = group_id),
  -- left_at is set exactly when the relationship has ended
  CHECK ((status IN ('left','removed')) = (left_at IS NOT NULL)),
  UNIQUE (group_id, person_id)
);
CREATE INDEX idx_group_members_pull ON group_members(scope_id, seq);
-- "Which groups can this person read?" — the access check's own index.
CREATE INDEX idx_group_members_person ON group_members(person_id, status);

-- Archiving is MY decision about MY list, never a fact about the group.
CREATE TABLE group_preferences (
  id           TEXT PRIMARY KEY,
  scope_id     TEXT NOT NULL REFERENCES sync_scopes(id),
  version      INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  seq          INTEGER NOT NULL CHECK (seq >= 1),
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  created_by   TEXT NOT NULL REFERENCES users(id),
  updated_by   TEXT NOT NULL REFERENCES users(id),
  deleted_at   INTEGER,
  user_id      TEXT NOT NULL REFERENCES users(id),
  group_id     TEXT NOT NULL REFERENCES groups(id),
  is_archived  INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0,1)),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  CHECK (scope_id = user_id),
  UNIQUE (user_id, group_id)
);
CREATE INDEX idx_group_preferences_pull ON group_preferences(scope_id, seq);

-- ---------------------------------------------------------------------------
-- Categories and budgets
-- ---------------------------------------------------------------------------

-- Each user's own catalog. A deleted row STAYS as the tombstone, so reseeding the
-- defaults never resurrects it (this replaces the phone's category_tombstone).
CREATE TABLE categories (
  id          TEXT PRIMARY KEY,
  scope_id    TEXT NOT NULL REFERENCES sync_scopes(id),
  version     INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  seq         INTEGER NOT NULL CHECK (seq >= 1),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  created_by  TEXT NOT NULL REFERENCES users(id),
  updated_by  TEXT NOT NULL REFERENCES users(id),
  deleted_at  INTEGER,
  user_id     TEXT NOT NULL REFERENCES users(id),
  kind        TEXT NOT NULL CHECK (kind IN ('expense','income','transfer')),
  name        TEXT NOT NULL CHECK (length(trim(name)) > 0),
  section     TEXT,
  icon        TEXT,
  color       TEXT,
  CHECK (scope_id = user_id)
);
CREATE INDEX idx_categories_pull ON categories(scope_id, seq);
-- One live category per name per kind — case-sensitive, exactly like the phone's
-- UNIQUE(name, kind). Stricter here would refuse states the phone can produce.
CREATE UNIQUE INDEX ux_categories_live ON categories(user_id, kind, name)
  WHERE deleted_at IS NULL;

-- A budget line. person_id NULL = the group's default line; set = that person's
-- own override. Transactions and budgets name a category by NAME, because each
-- member has their own catalog and a shared line needs the one shared vocabulary.
CREATE TABLE budgets (
  id          TEXT PRIMARY KEY,
  scope_id    TEXT NOT NULL REFERENCES sync_scopes(id),
  version     INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  seq         INTEGER NOT NULL CHECK (seq >= 1),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  created_by  TEXT NOT NULL REFERENCES users(id),
  updated_by  TEXT NOT NULL REFERENCES users(id),
  deleted_at  INTEGER,
  group_id    TEXT NOT NULL REFERENCES groups(id),
  category    TEXT NOT NULL CHECK (length(trim(category)) > 0),
  cadence     TEXT NOT NULL DEFAULT 'monthly' CHECK (cadence IN ('daily','monthly','yearly')),
  amount      INTEGER NOT NULL CHECK (amount > 0),        -- paise
  person_id   TEXT REFERENCES people(id),
  CHECK (scope_id = group_id)
);
CREATE INDEX idx_budgets_pull ON budgets(scope_id, seq);
-- Two partial indexes, as on the phone: a single UNIQUE cannot do it, because SQL
-- treats the default lines' NULL person_ids as distinct.
CREATE UNIQUE INDEX ux_budgets_default ON budgets(group_id, category)
  WHERE person_id IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX ux_budgets_override ON budgets(group_id, category, person_id)
  WHERE person_id IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Personal money (user scope) — declared before transactions, which reference assets
-- ---------------------------------------------------------------------------

-- Named assets: gold, a flat, an FD, a folio. Personal by definition. The balance
-- is money, so writes are compare-and-set; it can never be negative.
CREATE TABLE assets (
  id           TEXT PRIMARY KEY,
  scope_id     TEXT NOT NULL REFERENCES sync_scopes(id),
  version      INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  seq          INTEGER NOT NULL CHECK (seq >= 1),
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  created_by   TEXT NOT NULL REFERENCES users(id),
  updated_by   TEXT NOT NULL REFERENCES users(id),
  deleted_at   INTEGER,
  user_id      TEXT NOT NULL REFERENCES users(id),
  name         TEXT NOT NULL CHECK (length(trim(name)) > 0),
  kind         TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('investment','gold','property','deposit','vehicle','other')),
  icon         TEXT,
  color        TEXT,
  balance      INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),   -- paise
  is_archived  INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0,1)),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  CHECK (scope_id = user_id)
);
CREATE INDEX idx_assets_pull ON assets(scope_id, seq);

CREATE TABLE savings_goals (
  id            TEXT PRIMARY KEY,
  scope_id      TEXT NOT NULL REFERENCES sync_scopes(id),
  version       INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  seq           INTEGER NOT NULL CHECK (seq >= 1),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  created_by    TEXT NOT NULL REFERENCES users(id),
  updated_by    TEXT NOT NULL REFERENCES users(id),
  deleted_at    INTEGER,
  user_id       TEXT NOT NULL REFERENCES users(id),
  name          TEXT NOT NULL CHECK (length(trim(name)) > 0),
  target        INTEGER NOT NULL CHECK (target >= 0),           -- paise; the phone does not forbid 0
  priority      TEXT NOT NULL DEFAULT 'need' CHECK (priority IN ('emergency','need','want')),
  category      TEXT,
  icon          TEXT,
  color         TEXT,
  allocation    INTEGER NOT NULL DEFAULT 0 CHECK (allocation >= 0),
  frequency     TEXT NOT NULL DEFAULT 'none' CHECK (frequency IN ('daily','weekly','monthly','yearly','none')),
  is_locked     INTEGER NOT NULL DEFAULT 0 CHECK (is_locked IN (0,1)),
  is_archived   INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0,1)),
  last_auto_at  INTEGER,
  target_date   INTEGER,
  sort_order    INTEGER NOT NULL DEFAULT 0,                     -- drag rank = funding order
  CHECK (scope_id = user_id)
);
CREATE INDEX idx_savings_goals_pull ON savings_goals(scope_id, seq);

-- The goal ledger. Every row belongs to a goal: the old pool (goal_id NULL) is gone.
CREATE TABLE savings_transactions (
  id             TEXT PRIMARY KEY,
  scope_id       TEXT NOT NULL REFERENCES sync_scopes(id),
  version        INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  seq            INTEGER NOT NULL CHECK (seq >= 1),
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  created_by     TEXT NOT NULL REFERENCES users(id),
  updated_by     TEXT NOT NULL REFERENCES users(id),
  deleted_at     INTEGER,
  user_id        TEXT NOT NULL REFERENCES users(id),
  goal_id        TEXT NOT NULL REFERENCES savings_goals(id),
  amount         INTEGER NOT NULL CHECK (amount > 0),           -- paise
  kind           TEXT NOT NULL CHECK (kind IN ('deposit','allocate','withdraw')),
  source         TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','auto')),
  source_bucket  TEXT CHECK (source_bucket IS NULL OR source_bucket IN ('bank','cash','wallet')),  -- NULL = unknown, never guessed
  date           INTEGER NOT NULL,
  note           TEXT,
  CHECK (scope_id = user_id)
);
CREATE INDEX idx_savings_transactions_pull ON savings_transactions(scope_id, seq);
CREATE INDEX idx_savings_transactions_goal ON savings_transactions(goal_id, date);

-- The opening money position: one typed row instead of `money.*` settings keys.
-- There is deliberately NO investments column — that figure is derived from
-- assets and must stay derived (AGENTS.md §12). Openings are unconstrained in
-- sign: an overdrawn account is a real starting position.
CREATE TABLE money_profiles (
  id                TEXT PRIMARY KEY,
  scope_id          TEXT NOT NULL REFERENCES sync_scopes(id),
  version           INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  seq               INTEGER NOT NULL CHECK (seq >= 1),
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  created_by        TEXT NOT NULL REFERENCES users(id),
  updated_by        TEXT NOT NULL REFERENCES users(id),
  deleted_at        INTEGER,
  user_id           TEXT NOT NULL UNIQUE REFERENCES users(id),
  opening_bank      INTEGER NOT NULL DEFAULT 0,
  opening_cash      INTEGER NOT NULL DEFAULT 0,
  opening_wallet    INTEGER NOT NULL DEFAULT 0,
  credit_limit      INTEGER NOT NULL DEFAULT 0,
  credit_used       INTEGER NOT NULL DEFAULT 0,
  card_baseline_at  INTEGER,
  -- When the user last stated these figures ("updated 3 days ago" on the card).
  -- The phone's own time, not the upload's: an offline edit is not newer for
  -- having reached the server later.
  stated_at         INTEGER,
  CHECK (scope_id = user_id)
);
CREATE INDEX idx_money_profiles_pull ON money_profiles(scope_id, seq);

-- An allowlist of preference keys (the Worker enforces the list). Device state —
-- migration flags, cursors, the outbox — never travels (SYNC-F7).
CREATE TABLE user_preferences (
  id          TEXT PRIMARY KEY,
  scope_id    TEXT NOT NULL REFERENCES sync_scopes(id),
  version     INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  seq         INTEGER NOT NULL CHECK (seq >= 1),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  created_by  TEXT NOT NULL REFERENCES users(id),
  updated_by  TEXT NOT NULL REFERENCES users(id),
  deleted_at  INTEGER,
  user_id     TEXT NOT NULL REFERENCES users(id),
  key         TEXT NOT NULL CHECK (length(key) > 0),
  value       TEXT NOT NULL,
  CHECK (scope_id = user_id),
  UNIQUE (user_id, key)
);
CREATE INDEX idx_user_preferences_pull ON user_preferences(scope_id, seq);

-- The Review inbox: imported rows not yet turned into transactions. dest_group_id
-- and counterparty_id are draft HINTS and carry no foreign key — a draft must not
-- be refused because of what it might become.
CREATE TABLE imported_transactions (
  id               TEXT PRIMARY KEY,
  scope_id         TEXT NOT NULL REFERENCES sync_scopes(id),
  version          INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  seq              INTEGER NOT NULL CHECK (seq >= 1),
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  created_by       TEXT NOT NULL REFERENCES users(id),
  updated_by       TEXT NOT NULL REFERENCES users(id),
  deleted_at       INTEGER,
  user_id          TEXT NOT NULL REFERENCES users(id),
  date             INTEGER NOT NULL,
  amount           INTEGER NOT NULL CHECK (amount > 0),          -- paise
  description      TEXT NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('expense','income','settlement')),
  category         TEXT,
  direction        TEXT NOT NULL DEFAULT 'unknown' CHECK (direction IN ('debit','credit','unknown')),
  raw              TEXT,
  source           TEXT NOT NULL DEFAULT 'manual',
  pay_method       TEXT CHECK (pay_method IS NULL OR pay_method IN ('upi','card','cash','bank','wallet','autopay','other')),
  dest_group_id    TEXT,
  split_draft      TEXT CHECK (split_draft IS NULL OR json_valid(split_draft)),
  counterparty_id  TEXT,
  latitude         REAL CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude        REAL CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  place_label      TEXT,
  CHECK (scope_id = user_id)
);
CREATE INDEX idx_imported_transactions_pull ON imported_transactions(scope_id, seq);

-- ---------------------------------------------------------------------------
-- Transactions (group scope). One transaction is written and read as ONE bundle
-- with its payers, splits, items, tags and repeat rule, in one D1 batch — the
-- children never change apart from their parent, so they carry no sync columns.
-- ---------------------------------------------------------------------------

CREATE TABLE transactions (
  id                 TEXT PRIMARY KEY,
  scope_id           TEXT NOT NULL REFERENCES sync_scopes(id),
  version            INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  seq                INTEGER NOT NULL CHECK (seq >= 1),
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  created_by         TEXT NOT NULL REFERENCES users(id),
  updated_by         TEXT NOT NULL REFERENCES users(id),
  deleted_at         INTEGER,
  group_id           TEXT NOT NULL REFERENCES groups(id),
  kind               TEXT NOT NULL CHECK (kind IN ('expense','income','settlement')),
  entry_mode         TEXT NOT NULL DEFAULT 'quick' CHECK (entry_mode IN ('quick','itemized')),
  -- The total, in paise. The Worker checks it equals Σ payers AND Σ splits on
  -- every write (validateShares, imported from the app — never re-implemented).
  amount             INTEGER NOT NULL CHECK (amount > 0),
  date               INTEGER NOT NULL,                           -- when it happened
  timezone           TEXT,
  category           TEXT NOT NULL CHECK (length(trim(category)) > 0),
  note               TEXT,
  pay_method         TEXT CHECK (pay_method IS NULL OR pay_method IN ('upi','card','cash','bank','wallet','autopay','other')),
  source             TEXT CHECK (source IS NULL OR source IN ('voice','email','gpay','paytm','bank_csv','sms','notification','upi_qr','peer','manual')),
  currency           TEXT NOT NULL DEFAULT 'INR' CHECK (length(currency) = 3),
  asset_id           TEXT REFERENCES assets(id),
  latitude           REAL CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude          REAL CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  place_label        TEXT,
  adjustments        TEXT CHECK (adjustments IS NULL OR json_valid(adjustments)),  -- itemised tax/tip/discount
  recurring_rule_id  TEXT REFERENCES recurring_rules(transaction_id),              -- set on an OCCURRENCE
  occurrence_date    INTEGER,                                                      -- which due date it fills
  -- Who wrote it. Stamped by the Worker from the session — a body cannot claim it.
  author_id          TEXT NOT NULL REFERENCES people(id),
  CHECK (scope_id = group_id),
  CHECK (recurring_rule_id IS NULL OR recurring_rule_id <> id)
);
CREATE INDEX idx_transactions_pull ON transactions(scope_id, seq);
CREATE INDEX idx_transactions_group_date ON transactions(group_id, date);
CREATE INDEX idx_transactions_rule ON transactions(recurring_rule_id) WHERE recurring_rule_id IS NOT NULL;

-- Income is never grouped, and what you own is not the group's business: income
-- and asset movements live only in a personal group. Cross-table, so a trigger.
CREATE TRIGGER transactions_personal_only_insert
BEFORE INSERT ON transactions
WHEN (NEW.kind = 'income' OR NEW.asset_id IS NOT NULL)
  AND (SELECT kind FROM groups WHERE id = NEW.group_id) <> 'personal'
BEGIN
  SELECT RAISE(ABORT, 'income and asset movements belong in a personal group');
END;
CREATE TRIGGER transactions_personal_only_update
BEFORE UPDATE OF kind, asset_id, group_id ON transactions
WHEN (NEW.kind = 'income' OR NEW.asset_id IS NOT NULL)
  AND (SELECT kind FROM groups WHERE id = NEW.group_id) <> 'personal'
BEGIN
  SELECT RAISE(ABORT, 'income and asset movements belong in a personal group');
END;

-- A repeating transaction is a transaction PLUS one of these. On the phone the
-- seven repeat columns sit NULL on every ordinary row; here a rule is a row that
-- exists, so its columns can be NOT NULL.
CREATE TABLE recurring_rules (
  transaction_id  TEXT PRIMARY KEY REFERENCES transactions(id),
  frequency       TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly','yearly','custom')),
  interval        INTEGER NOT NULL DEFAULT 1 CHECK (interval > 0),
  ends_at         INTEGER,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended')),
  mode            TEXT NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto','remind')),
  -- No CHECK tying paused_at to status: rules paused before the phone had this
  -- column carry none, and an ended rule may keep the date it was last paused.
  -- A constraint the phone can violate is a sync that fails forever.
  paused_at       INTEGER
);

-- Due dates the user chose to skip.
CREATE TABLE recurring_skips (
  rule_id          TEXT NOT NULL REFERENCES recurring_rules(transaction_id),
  occurrence_date  INTEGER NOT NULL,
  created_at       INTEGER NOT NULL,
  PRIMARY KEY (rule_id, occurrence_date)
);

-- Who paid, and how much.
CREATE TABLE transaction_payers (
  transaction_id  TEXT NOT NULL REFERENCES transactions(id),
  person_id       TEXT NOT NULL REFERENCES people(id),
  amount          INTEGER NOT NULL CHECK (amount > 0),           -- paise
  PRIMARY KEY (transaction_id, person_id)
);
CREATE INDEX idx_transaction_payers_person ON transaction_payers(person_id);

-- Who owes, and how much. Your share is your spending (AGENTS.md §13).
CREATE TABLE transaction_splits (
  transaction_id  TEXT NOT NULL REFERENCES transactions(id),
  person_id       TEXT NOT NULL REFERENCES people(id),
  amount          INTEGER NOT NULL CHECK (amount > 0),           -- paise
  PRIMARY KEY (transaction_id, person_id)
);
CREATE INDEX idx_transaction_splits_person ON transaction_splits(person_id);

-- The lines of an itemised bill.
CREATE TABLE transaction_items (
  id              TEXT PRIMARY KEY,
  transaction_id  TEXT NOT NULL REFERENCES transactions(id),
  name            TEXT NOT NULL,
  quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price      INTEGER NOT NULL CHECK (unit_price >= 0),      -- paise
  assigned_to     TEXT NOT NULL,
  split_mode      TEXT CHECK (split_mode IS NULL OR split_mode IN ('equal','exact','percent','shares')),
  split_values    TEXT CHECK (split_values IS NULL OR json_valid(split_values))
);
CREATE INDEX idx_transaction_items_transaction ON transaction_items(transaction_id);

-- One row per tag, so "everything tagged Goa" is an indexed query. `position`
-- keeps the author's order: the phone shows tags in the order they were typed.
CREATE TABLE transaction_tags (
  transaction_id  TEXT NOT NULL REFERENCES transactions(id),
  tag             TEXT NOT NULL CHECK (length(trim(tag)) > 0),
  position        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (transaction_id, tag)
);
CREATE INDEX idx_transaction_tags_tag ON transaction_tags(tag);

-- Edit history, written by the Worker on every change: a snapshot of the whole
-- bundle at each version. Loaded on demand for a transaction's History; not pulled.
CREATE TABLE transaction_history (
  id              TEXT PRIMARY KEY,
  transaction_id  TEXT NOT NULL REFERENCES transactions(id),
  version         INTEGER NOT NULL CHECK (version >= 1),
  snapshot        TEXT NOT NULL CHECK (json_valid(snapshot)),
  edited_by       TEXT NOT NULL REFERENCES users(id),
  edited_at       INTEGER NOT NULL,
  UNIQUE (transaction_id, version)
);

-- ---------------------------------------------------------------------------
-- Approvals, trust, disputes
-- ---------------------------------------------------------------------------

-- A user's decision about someone else's transaction. Private to that user (user
-- scope). Created by the Worker, which runs the app's own requiresMyApproval
-- against the recipient's trust_settings; after that only the recipient decides.
CREATE TABLE approvals (
  id                 TEXT PRIMARY KEY,
  scope_id           TEXT NOT NULL REFERENCES sync_scopes(id),
  version            INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  seq                INTEGER NOT NULL CHECK (seq >= 1),
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  created_by         TEXT NOT NULL REFERENCES users(id),
  updated_by         TEXT NOT NULL REFERENCES users(id),
  deleted_at         INTEGER,
  transaction_id     TEXT NOT NULL REFERENCES transactions(id),
  user_id            TEXT NOT NULL REFERENCES users(id),
  status             TEXT NOT NULL CHECK (status IN ('pending','approved','rejected')),
  -- The author retracted an entry I had accepted; it keeps counting until I agree.
  is_pending_delete  INTEGER NOT NULL DEFAULT 0 CHECK (is_pending_delete IN (0,1)),
  landed_pay_method  TEXT CHECK (landed_pay_method IS NULL OR landed_pay_method IN ('upi','card','cash','bank','wallet','autopay','other')),
  arrived_at         INTEGER NOT NULL,     -- when it ARRIVED: a back-dated entry cannot bury itself
  decided_at         INTEGER,
  CHECK (scope_id = user_id),
  CHECK (status <> 'rejected' OR decided_at IS NOT NULL),
  UNIQUE (transaction_id, user_id)
);
CREATE INDEX idx_approvals_pull ON approvals(scope_id, seq);

-- Trust is about a PERSON, never a group (IV-10). group_id NULL is my answer
-- everywhere; set, it is my answer about that person in that one group.
CREATE TABLE trust_settings (
  id          TEXT PRIMARY KEY,
  scope_id    TEXT NOT NULL REFERENCES sync_scopes(id),
  version     INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  seq         INTEGER NOT NULL CHECK (seq >= 1),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  created_by  TEXT NOT NULL REFERENCES users(id),
  updated_by  TEXT NOT NULL REFERENCES users(id),
  deleted_at  INTEGER,
  user_id     TEXT NOT NULL REFERENCES users(id),
  person_id   TEXT NOT NULL REFERENCES people(id),
  group_id    TEXT REFERENCES groups(id),
  level       TEXT NOT NULL CHECK (level IN ('review','trusted')),
  CHECK (scope_id = user_id)
);
CREATE INDEX idx_trust_settings_pull ON trust_settings(scope_id, seq);
CREATE UNIQUE INDEX ux_trust_everywhere ON trust_settings(user_id, person_id)
  WHERE group_id IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX ux_trust_in_group ON trust_settings(user_id, person_id, group_id)
  WHERE group_id IS NOT NULL AND deleted_at IS NULL;

-- "I don't agree with this." Written by the Worker when a recipient rejects a
-- transaction (and withdrawn when they take it back), so the author sees it. It
-- is an opinion about someone else's entry, never a new version of it.
CREATE TABLE disputes (
  id                   TEXT PRIMARY KEY,
  scope_id             TEXT NOT NULL REFERENCES sync_scopes(id),
  version              INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  seq                  INTEGER NOT NULL CHECK (seq >= 1),
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL,
  created_by           TEXT NOT NULL REFERENCES users(id),
  updated_by           TEXT NOT NULL REFERENCES users(id),
  deleted_at           INTEGER,
  group_id             TEXT NOT NULL REFERENCES groups(id),
  transaction_id       TEXT NOT NULL REFERENCES transactions(id),
  user_id              TEXT NOT NULL REFERENCES users(id),   -- who disputed
  transaction_version  INTEGER NOT NULL CHECK (transaction_version >= 1),
  raised_at            INTEGER NOT NULL,
  withdrawn_at         INTEGER,
  CHECK (scope_id = group_id),
  UNIQUE (transaction_id, user_id)
);
CREATE INDEX idx_disputes_pull ON disputes(scope_id, seq);

-- ---------------------------------------------------------------------------
-- Activity — the feed, written ONLY by the Worker in the same batch as the change
-- it describes. actor_id is a real column, so "what has Aarav changed?" is a
-- query (SYNC-F22). Append-only: no version, no updates.
-- ---------------------------------------------------------------------------

CREATE TABLE activity_log (
  id          TEXT PRIMARY KEY,               -- shared with the phone's audit_log row
  scope_id    TEXT NOT NULL REFERENCES sync_scopes(id),
  seq         INTEGER NOT NULL CHECK (seq >= 1),
  actor_id    TEXT NOT NULL REFERENCES users(id),
  entity      TEXT NOT NULL CHECK (entity IN ('txn','group','member','budget','recurring','settlement')),
  entity_id   TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('created','updated','deleted','archived','settled','paused','resumed','ended')),
  amount      INTEGER,
  summary     TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_activity_log_pull ON activity_log(scope_id, seq);
CREATE INDEX idx_activity_log_actor ON activity_log(actor_id, created_at);
