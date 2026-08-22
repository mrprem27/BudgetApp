-- Stage C: syncing shared groups between the people in them.
--
-- The server's job here is to be a blind, ordered mailbox. It stores sealed
-- entries it has no key for, decides who is allowed to read which mailbox, and
-- refuses a write that was based on a version someone else has already replaced.
-- It never learns an amount, a payer, a category or a note.
--
-- Two things make that more than a slogan:
--   * `sync_entry.ciphertext` is sealed with a per-group key the server never
--     receives (`budgetsplit/src/lib/groupCrypto.ts`).
--   * `sync_wrap` holds that key wrapped to each DEVICE. The server stores
--     wraps and hands them out; it cannot open one.
--
-- This is also the first data here that belongs to SEVERAL users. Every earlier
-- table answers "is this row yours" with `WHERE user_id = ?`. From here the
-- question is "are you an approved member of this group", and getting that join
-- wrong exposes one household's ledger to another. It lives in exactly one
-- helper on the Worker side (`approvedMember`), for that reason.

-- One row per device, per user. Keys are per DEVICE and not per person: a group
-- key wrapped to a person cannot be opened by their second phone, and per-device
-- means losing a phone drops one wrap instead of rotating every group.
CREATE TABLE device_key (
  device_id   TEXT PRIMARY KEY,          -- opaque, minted on the device
  user_id     TEXT NOT NULL REFERENCES users(id),
  public_key  TEXT NOT NULL,             -- hex; what a group key is wrapped to
  label       TEXT,                      -- "Prem's iPhone", for a revoke screen
  created_at  INTEGER NOT NULL,
  seen_at     INTEGER NOT NULL
);
CREATE INDEX idx_device_key_user ON device_key(user_id);

-- A shared group, published under the id it ALREADY has on the creator's phone.
--
-- Adoption, not creation: the client keeps its local uuid and the server takes
-- it as given. Minting a server-side id instead would mean every device holding
-- a mapping between two ids for the same group, and every bug in that mapping is
-- a ledger attached to the wrong household.
CREATE TABLE sync_group (
  id          TEXT PRIMARY KEY,          -- the CLIENT's group uuid
  owner_user  TEXT NOT NULL REFERENCES users(id),
  created_at  INTEGER NOT NULL,
  deleted_at  INTEGER                    -- tombstone; rows are never hard-deleted
);
CREATE INDEX idx_sync_group_owner ON sync_group(owner_user);

-- Who may read a group's mailbox. 'pending' can do nothing at all — it is an
-- invitation, and reading is gated on 'approved' everywhere without exception.
--
-- `removed_at` rather than a DELETE so that leaving is auditable and so a
-- re-invite is an ordinary state change instead of a resurrection.
CREATE TABLE sync_member (
  group_id    TEXT NOT NULL REFERENCES sync_group(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  state       TEXT NOT NULL CHECK(state IN ('pending','approved')),
  joined_at   INTEGER NOT NULL,
  removed_at  INTEGER,
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX idx_sync_member_user ON sync_member(user_id, state);

-- The group key, wrapped once per device. One row per device and not per member,
-- because that is the only shape in which a member's SECOND phone can ever read
-- the group.
--
-- The server stores these and cannot open any of them.
CREATE TABLE sync_wrap (
  group_id     TEXT NOT NULL REFERENCES sync_group(id),
  device_id    TEXT NOT NULL REFERENCES device_key(device_id),
  wrapped_key  TEXT NOT NULL,            -- base64, sealed to that device
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (group_id, device_id)
);
CREATE INDEX idx_sync_wrap_device ON sync_wrap(device_id);

-- One sealed entry, at one version.
--
-- `version` is deliberately in the clear: it is what makes compare-and-set
-- possible on a payload the server cannot read, and it is bound into the
-- ciphertext's AAD, so a blob cannot be re-served under a different version or a
-- different entry id. Encryption stops the server READING an entry; the AAD is
-- what stops anyone MOVING one.
--
-- Entries live in D1 rather than the blob store on purpose: KV allows roughly a
-- thousand writes a day on the free plan, and one write per edited transaction
-- would exhaust that in an afternoon. They are small — a sealed transaction is
-- well under a kilobyte — so a row is the right home.
CREATE TABLE sync_entry (
  group_id    TEXT NOT NULL REFERENCES sync_group(id),
  entry_id    TEXT NOT NULL,             -- the CLIENT's txn uuid
  version     INTEGER NOT NULL,
  ciphertext  TEXT NOT NULL,             -- base64 AES-256-GCM, no key here
  author_user TEXT NOT NULL REFERENCES users(id),
  is_deleted  INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (group_id, entry_id)
);

-- The pull cursor. Every fetch is "what changed in this group since T", so this
-- index is the difference between a sync and a table scan per device per launch.
CREATE INDEX idx_sync_entry_cursor ON sync_entry(group_id, updated_at);
