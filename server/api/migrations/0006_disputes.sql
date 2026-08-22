-- F10: a rejection has to reach the person who wrote the entry.
--
-- Rejecting an entry soft-deletes it on MY device and does nothing to theirs, so
-- their group balance stops matching mine and neither of us is told. Silent
-- divergence about money is the worst failure this app can have: both people are
-- looking at a confident number and one of them is wrong.
--
-- A dispute is deliberately NOT a new version of the entry. It is my *opinion*
-- of someone else's entry, and writing it as a version would let one person
-- overwrite another's record of what happened — which is exactly the authority
-- the approval model exists to withhold. The author sees the objection and
-- decides what to do; nobody edits anyone else's entry.
CREATE TABLE sync_dispute (
  group_id    TEXT NOT NULL REFERENCES sync_group(id),
  entry_id    TEXT NOT NULL,
  -- Who objected. One row per person per entry, so re-rejecting after an edit
  -- updates rather than piling up.
  by_user     TEXT NOT NULL REFERENCES users(id),
  -- Which version they were looking at. An author who edits in response should
  -- not keep seeing an objection to the figure they already changed.
  version     INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  -- Set when the objector withdraws it (they reopened the entry and accepted).
  cleared_at  INTEGER,
  PRIMARY KEY (group_id, entry_id, by_user)
);

-- Pulled by cursor exactly like entries, and by the same code path on the client.
CREATE INDEX idx_sync_dispute_cursor ON sync_dispute(group_id, created_at);
