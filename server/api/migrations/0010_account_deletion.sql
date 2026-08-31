-- Deleting your account.
--
-- App Store Review 5.1.1(v) requires an app that creates an account to let the
-- user delete it, in the app, without an email to support. There was no route at
-- all, which is a rejection at submission and, separately, the wrong answer to a
-- reasonable request.
--
-- ## Why the row survives
--
-- A hard `DELETE FROM users` is not available here, and the reason is not
-- squeamishness about data. Six tables reference `users(id)` — `sync_entry`,
-- `sync_dispute`, `sync_member`, `links`, `invites`, `friend_request` — and those
-- rows are OTHER PEOPLE'S records. An entry I authored in a shared group is the
-- group's record of what was spent; a dispute is somebody's standing objection.
-- Cascading the delete would silently rewrite four other people's ledgers because
-- a fifth closed their account, which is the same rule "considerate removal" is
-- built on: removal ends a relationship, never a record.
--
-- So this is a scrub, and it is not a euphemism for keeping the data. Everything
-- that identifies the person is destroyed, not hidden: `email`, `name`, `phone`
-- and `avatar_url` are overwritten in place, every session and magic link is
-- deleted, every device key and wrap is deleted (so no future device can decrypt
-- anything), and every backup blob is deleted from R2. What is left is an opaque
-- id and a `deleted_at`, which is what the foreign keys point at.
--
-- The email is REPLACED rather than nulled, with a value that cannot be typed
-- into a sign-in box, because the column is `NOT NULL UNIQUE`. That also frees
-- the real address immediately: signing up again with it creates a genuinely new
-- account with no connection to the old one, which is what a user who deletes
-- and returns expects.
-- No index on it, deliberately. Every read of this column is already a primary-key
-- lookup that then checks one row -- `authenticate` joins on `s.user_id = u.id`
-- -- so an index would be pure write cost.
ALTER TABLE users ADD COLUMN deleted_at INTEGER;

-- D22, found alongside: `magic_links` is swept by `expires_at` on every sign-in
-- request and the only index leads on `email`, so the sweep scanned the table.
CREATE INDEX idx_magic_links_expiry ON magic_links(expires_at);

-- D22: `friend_block` is consulted on every send and its PK leads on
-- `owner_user`, so "is this address blocked by anyone" -- which is the direction
-- the check actually runs -- had no index.
CREATE INDEX idx_friend_block_email ON friend_block(blocked_email);
