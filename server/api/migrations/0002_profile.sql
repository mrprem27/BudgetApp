-- Phone on the account (S1.5 / Stage A).
--
-- Deliberately NOT verified: verification would mean an SMS provider, India's DLT
-- registration and per-message cost, plus a second auth path to maintain. The magic
-- link stays the only proof of identity, and this column is self-declared.
--
-- It is also NOT searchable, by design — there is no lookup-by-phone route and there
-- never should be, because that turns the user table into a way to check whether a
-- number you hold belongs to someone using a finance app.
ALTER TABLE users ADD COLUMN phone TEXT;
