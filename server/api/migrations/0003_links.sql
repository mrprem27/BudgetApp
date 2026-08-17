-- Stage B: linking two accounts by invite link / QR.
--
-- There is no directory and no username: nothing here is searchable, by design.
-- The only way to reach another account is a link its owner generated, and the
-- owner then approves the specific person who claimed it.

CREATE TABLE invites (
  token       TEXT PRIMARY KEY,     -- random, single-use
  from_user   TEXT NOT NULL REFERENCES users(id),
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  -- Set when someone opens the link. A claim binds NOTHING on its own: an invite
  -- is made to be forwarded (WhatsApp), so first-tap-wins would hand a stranger
  -- a link to your account. The sender approves or declines the named claimant.
  claimed_by  TEXT REFERENCES users(id),
  claimed_at  INTEGER,
  -- 'pending' once claimed, then 'approved' | 'declined'. NULL while unclaimed.
  state       TEXT CHECK(state IN ('pending','approved','declined'))
);
CREATE INDEX idx_invites_from ON invites(from_user, created_at DESC);
CREATE INDEX idx_invites_claimed ON invites(claimed_by);

-- One row per pair. `user_a` is always the lexicographically smaller id so the
-- pair is unique in one direction only — otherwise A→B and B→A become two links
-- that can disagree about who shared what.
CREATE TABLE links (
  id            TEXT PRIMARY KEY,
  user_a        TEXT NOT NULL REFERENCES users(id),
  user_b        TEXT NOT NULL REFERENCES users(id),
  created_at    INTEGER NOT NULL,
  -- Each side controls its own disclosure. This is "share my number with *some*
  -- friends" made concrete: a flag per link, not a global profile switch.
  -- Turning it off stops future reads; it cannot recall a number already seen,
  -- and the UI says so rather than implying otherwise.
  share_phone_a INTEGER NOT NULL DEFAULT 0,
  share_phone_b INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_a, user_b)
);
CREATE INDEX idx_links_a ON links(user_a);
CREATE INDEX idx_links_b ON links(user_b);
