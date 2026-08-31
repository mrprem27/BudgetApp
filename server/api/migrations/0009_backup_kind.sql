-- Manual backups and automatic snapshots are not the same thing, and pruning
-- them against one quota destroyed the ones that were deliberate.
--
-- `MAX_BACKUPS_PER_USER` is 10 and every upload prunes by `created_at DESC`, with
-- no idea which is which. "Keep a copy of everything" uploads up to four times a
-- day, so within about 60 hours all ten slots were snapshots and the careful
-- manual backup somebody made before a risky change was gone. Silently: the
-- response says how many were deleted and the client discards it, and the Sync
-- screen tells the user the opposite — "the ones already on your account stay
-- there until you delete them".
--
-- Two quotas from here on, and separate ones, because they answer different
-- questions. Snapshots are a rolling window of "this phone, recently". A manual
-- backup is a point somebody chose, and nothing automatic may push one out.
--
-- Existing rows default to 'manual'. That is the safe direction: it can only
-- preserve a backup that would otherwise have been pruned, and the alternative
-- would silently reclassify — and then delete — files somebody made by hand.
ALTER TABLE backups ADD COLUMN kind TEXT NOT NULL DEFAULT 'manual'
  CHECK(kind IN ('manual','snapshot'));

CREATE INDEX idx_backups_kind ON backups(user_id, kind, created_at DESC);
