-- Unlinking is a tombstone, not a DELETE.
--
-- `DELETE FROM links` removed the row for both sides and told neither. The other
-- person's app simply stopped listing you one day, with nothing to say why or
-- when — and "a connection I did not end has silently disappeared" is exactly the
-- shape of thing users read as data loss.
--
-- Keeping the row lets the other device say it ONCE and then stop: `listLinks`
-- returns recently-ended links separately, and drops them after a while.
--
-- `ended_by` is recorded because the two sides are not symmetric. Being told "you
-- unlinked" and being told "they unlinked" are different sentences, and guessing
-- wrong is worse than saying nothing.
--
-- Note what unlinking is NOT: it does not end the groups you are both already in.
-- It is about disclosure — your name, your number, and being addable to something
-- new. Membership is membership, and `approvedMember` never consulted `links` in
-- the first place. The app's dialog says so, because the opposite is what people
-- assume.
ALTER TABLE links ADD COLUMN ended_at INTEGER;
ALTER TABLE links ADD COLUMN ended_by TEXT REFERENCES users(id);

-- Every read is "the links that are live", plus one narrow "what ended recently".
CREATE INDEX idx_links_live ON links(user_a, user_b) WHERE ended_at IS NULL;
