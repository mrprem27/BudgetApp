-- Friend requests, addressed by email.
--
-- ## Why this is not a directory
--
-- Three files in this repo say there is no search here and there never should be,
-- because a lookup route turns the user table into a way to check whether an
-- address belongs to somebody using a finance app. That rule is intact, and this
-- table is shaped to keep it.
--
-- A route leaks only if its RESPONSE differs. `POST /friend-requests` answers the
-- same `202` whether the address has an account, has none, is blocked, or is over
-- a limit, and sends one email either way. The only thing that differs is the
-- email BODY, and that is visible solely to whoever holds the inbox — which is
-- the entire point. `POST /auth/request-link` already works exactly this way and
-- says so.
--
-- ## Why not reuse `invites`
--
-- Opposite state machines. An invite is token-addressed and *made to be
-- forwarded*, which is why claiming one only asks and the sender gets the last
-- word. An email request has the reverse property: the address IS the assertion
-- of who it is for, so there is no claim step and the recipient decides. Bolting
-- both onto one table would make every read remember which kind it is looking at
-- and would make that file's comments half-true.
CREATE TABLE friend_request (
  id           TEXT PRIMARY KEY,
  from_user    TEXT NOT NULL REFERENCES users(id),
  -- The address as typed, normalised. Deliberately NOT a foreign key: the whole
  -- point is that it may belong to nobody yet. Resolved to a user at ACCEPT time
  -- and at sign-up, never at send time — resolving on send is precisely what
  -- would make this a directory.
  to_email     TEXT NOT NULL,
  -- Filled when they accept, or when they sign up and `verifyLink` attaches
  -- whatever was already waiting for that address.
  to_user      TEXT REFERENCES users(id),
  state        TEXT NOT NULL CHECK(state IN ('pending','accepted','declined','cancelled')),
  -- One short greeting. The only free text one stranger can put in front of
  -- another, so it is capped hard and never rendered as HTML.
  note         TEXT,
  created_at   INTEGER NOT NULL,
  -- Separate from `created_at` so a resend can be throttled without losing when
  -- the request was actually made.
  last_sent_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  decided_at   INTEGER
);

-- One live request per pair. Partial, so the same two people can try again after
-- a decline or a cancel without tripping over the old row.
CREATE UNIQUE INDEX idx_friend_request_pair
  ON friend_request(from_user, to_email) WHERE state = 'pending';

-- The inbox lookup: "what is waiting for this address", which is how a request
-- sent before somebody signed up finds them afterwards.
CREATE INDEX idx_friend_request_inbox ON friend_request(to_email, state);
CREATE INDEX idx_friend_request_from ON friend_request(from_user, created_at DESC);
-- The per-recipient rate limit counts across ALL senders, so it needs its own
-- window index rather than riding the inbox one.
CREATE INDEX idx_friend_request_recent ON friend_request(to_email, last_sent_at);

-- Blocks are separate from requests, and they are why a re-request cannot become
-- harassment.
--
-- Keyed on the ADDRESS, not the account, deliberately: a block has to work
-- against somebody who has not signed up, and has to keep working if they later
-- do. Keyed on a user id it would simply stop applying the moment it mattered.
CREATE TABLE friend_block (
  owner_user    TEXT NOT NULL REFERENCES users(id),
  blocked_email TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  PRIMARY KEY (owner_user, blocked_email)
);
