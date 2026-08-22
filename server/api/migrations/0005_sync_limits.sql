-- The index that makes rate limiting `PUT /sync/entries` affordable.
--
-- The limiter asks "how many entries has this account written in the last hour",
-- which without an index is a full scan of `sync_entry` on every single push —
-- turning a cheap abuse guard into its own denial of service.
--
-- Deliberately (author_user, updated_at) and not the reverse: the equality column
-- goes first so the range on `updated_at` can be satisfied by the same index.
CREATE INDEX idx_sync_entry_author ON sync_entry(author_user, updated_at);
