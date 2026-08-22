# budgetsplit-api

Cloudflare Worker holding the app's **accounts**, its **encrypted backup blobs**,
and the **sealed mailbox** shared groups sync through — phases S1 and S2/S3 of the
server ladder in `budgetsplit/docs/V2_LAUNCH_CHECKLIST.md` §6b.

Sibling of `../receipt-ocr-proxy` (a separate, stateless Worker) — they share the
repo and the Cloudflare account, nothing else.

## What it does and does not hold

The app is local-first: every transaction, group, budget and goal lives in each
device's own SQLite database (`budgetsplit/src/db/schema.ts`), and that stays
true. This server holds:

- **Identity** — email, display name, avatar. D1.
- **Encrypted snapshots** — the exact `{v, createdAt, ciphertext}` envelope
  `budgetsplit/src/lib/backup.ts` already produces, stored byte-for-byte. R2.
- **Sealed shared-group entries** — one row per entry, sealed on the device with a
  per-group key this server never receives. D1. See § Sync below.

The passphrase that decrypts a snapshot is never sent here and never stored
anywhere but the user's head. So a leaked bucket is unreadable, and a leaked D1
gives up email addresses and nothing about anyone's money. There is no
server-side reset for a forgotten passphrase — same tradeoff the local
share-sheet backup already documents, unchanged by this server existing.

What this still does not hold: anyone's **personal** finances. Sync carries shared
groups only — personal spending, income, savings goals, budgets and net worth
never leave the device at all. And what it does carry, it cannot read: the server
stores sealed blobs and the per-device wraps of a key it has no copy of.

Backup/restore remains a manual snapshot and is unrelated to sync — different
data, different key, different lifecycle.

## Auth model

Email magic link, no passwords.

1. `POST /auth/request-link {email}` — writes a single-use token (15 min) and
   emails a link to `GET /auth/open?token=…` on this Worker.
2. `/auth/open` **302-redirects** to `budgetsplit:///auth?token=…`. The
   indirection exists because mail clients won't render a custom URL scheme as a
   tappable link. It deliberately doesn't touch the database, so link scanners
   and mail-provider prefetchers can't burn a token before the human taps it.
   The email also prints the raw token, for signing in when the mail was opened
   on a computer.
3. `POST /auth/verify {token}` — the only thing that consumes the token
   (guarded `UPDATE … WHERE used_at IS NULL`, so a double-tap can't mint two
   sessions), finds-or-creates the user, and returns
   `{sessionToken, user}`.
4. `sessionToken` is an opaque random string, a **row** in `sessions` rather than
   a stateless JWT — so signing out genuinely ends it. 90-day rolling expiry,
   refreshed at most once a day. On the device it belongs in
   `expo-secure-store`, not AsyncStorage: it's the first real credential the app
   has ever held.

Rate limit: 5 link requests per email per 15 minutes. `POST /auth/request-link`
answers `{ok: true}` whether or not that address already has an account —
accounts are created at verify time, so there is no account-existence signal to
leak, and the response must not become one.

No CORS headers are sent anywhere. The only client is a native app, which isn't
subject to the same-origin policy; adding `Access-Control-Allow-*` would only
widen who can call this from a browser.

## Routes

| Route | Auth | Body / notes |
|---|---|---|
| `GET /health` | — | `{ok: true}`. Same "is the Worker up" curl target as the OCR proxy. |
| `POST /auth/request-link` | — | `{email}` → `{ok: true}`. 429 when rate-limited. |
| `GET /auth/open?token=` | — | 302 → `APP_AUTH_URL?token=…`. Does not consume the token. |
| `POST /auth/verify` | — | `{token, deviceLabel?}` → `{sessionToken, user}`. |
| `POST /auth/logout` | bearer | Deletes the session row. `{ok: true}` even for an unknown token, so a stale client can still clear itself. |
| `GET /me` | bearer | `{user}` |
| `PATCH /me` | bearer | `{name?, avatarUrl?}`; either may be `null` to clear. `avatarUrl` must be absolute `https://` — a `file://` path from the phone means nothing to another device. |
| `PUT /me/avatar` | bearer | Raw `image/*` bytes (≤5 MB) → `{user}`. Stored at `avatars/{user_id}`, overwriting. |
| `GET /me/avatar` | bearer | The uploaded image. 404 if the avatar is an external URL or unset. |
| `POST /invites` | bearer | → `{token, url, expiresAt}`. The link you hand to one person (7 days). |
| `GET /invites` | bearer | Claims waiting on **your** decision: `{claims: [{token, claimedAt, from}]}`. |
| `GET /invite/open?token=` | — | 302 → `APP_LINK_URL?token=…`. Does not touch the DB. |
| `POST /invites/claim` | bearer | `{token}` → `{state: "pending"}`. **Binds nothing** — see below. |
| `POST /invites/:token/approve` \| `/decline` | bearer | The sender's decision. Only approve writes a `links` row. |
| `GET /links` | bearer | `{links: [...]}` — each with the other person, and their `phone` **only while their own flag is on**. |
| `PATCH /links/:id` | bearer | `{sharePhone}` — flips only *your* side. You can never change what they disclose. |
| `DELETE /links/:id` | bearer | Unlinks, for both. |
| `POST /backups` | bearer | Raw encrypted blob (≤50 MB) → `201 {backup, pruned}`. Body is never parsed. |
| `GET /backups` | bearer | `{backups: [{id, sizeBytes, createdAt}]}`, newest first. |
| `GET /backups/:id` | bearer | The blob, `application/octet-stream`. |
| `DELETE /backups/:id` | bearer | Removes the R2 object and the row. |
| `POST /sync/devices` | bearer | `{deviceId, publicKey, label?}` → registers this device's public key. Upsert, scoped so another account cannot overwrite your key. |
| `GET /sync/devices?userId=` | bearer | `{devices: [{deviceId, publicKey, label}]}` — yours, or those of someone you are **already linked with**. Not a directory. |
| `POST /sync/groups` | bearer | `{groupId, wraps}` — publishes a group under its **existing client uuid**, with the key wrapped to your own devices. Idempotent; 403 if that id is another account's. |
| `GET /sync/groups?deviceId=` | bearer | `{groups: [{id, owner, state, wrappedKey}]}`. `wrappedKey` is null when this device has no wrap yet. |
| `POST /sync/groups/:id/members` | bearer | `{userId, wraps: [{deviceId, wrappedKey}]}` — invite someone you are **already linked with**, handing over the group key wrapped to each of their devices. They land `pending`. |
| `POST /sync/groups/:id/join` | bearer | Accept your own invitation. `pending` → `approved`. |
| `PUT /sync/entries` | bearer | `{groupId, entryId, version, ciphertext, isDeleted?}` → `{version, updatedAt}`, or **409 with the current row** when the version is stale. |
| `GET /sync/entries?groupId=&since=` | bearer | `{entries, cursor, more}` — up to 200, ordered by `updated_at`. |

### Sync (Stage C)

The server is a **blind, ordered mailbox**. Entries are sealed with a per-group
key it never receives (`budgetsplit/src/lib/groupCrypto.ts`), and that key is
stored only as per-device wraps it cannot open. It knows who may read which
mailbox, and which version of an entry is current — nothing else.

`PUT /sync/entries` is **compare-and-set on `version`**, which is why `version`
is in the clear. Last-write-wins on a ledger is the lost-update problem with
money in it: two people edit the same bill, both writes succeed, and the second
silently erases the first with nobody told. A stale push gets 409 and the current
row attached, for a human to resolve — never an automatic merge.

Isolation changes shape here. Every earlier route answers "is this row yours"
with `WHERE user_id = ?`; a shared group is the first thing that belongs to
several people, so it goes through one `approvedMember` helper — 'pending' grants
nothing, and `removed_at`/`deleted_at` are checked in the same place.

**Rate limited.** `PUT /sync/entries` is capped at **500 entries per account per
hour** (`SYNC_WRITES_PER_WINDOW`), on top of the 64 KiB per-request cap. It counts
entries *touched* in the window rather than requests made, so rewriting one entry
repeatedly costs one — that burns requests, not storage, and Cloudflare's own
request cap already covers it. What this bounds is D1 filling an entry at a time.
Migration `0005` adds the `(author_user, updated_at)` index that makes the check
affordable; without it the guard would scan the table on every push.

Every backup route resolves its row through one `WHERE id = ? AND user_id = ?`
helper — that predicate is the only thing separating one account's backups from
another's, so it isn't re-typed per route.

**On `avatarUrl`:** `users.avatar_url` stores either an R2 key (`avatars/{user_id}`)
or an absolute `https://` URL, and the DTO resolves a key to `{origin}/me/avatar`
per request — so the row survives this Worker moving to a custom domain. That URL
is bearer-authed, so a client rendering it needs to send the header (React
Native's `Image` accepts `source={{ uri, headers }}`); today the app only reads
the field as "is a picture set?" and shows the local copy.

## Linking (Stage B)

There is **no username, no directory and no lookup** — not by email, not by
phone. The only way to reach another account is a link its owner generated.

And claiming a link binds nothing. A sign-in link goes to your own inbox; an
invite link is *made* to be forwarded over WhatsApp, so first-tap-wins would hand
a link to your account — and your phone number, if you had shared it — to
whichever stranger opened it first. `POST /invites/claim` records a **pending**
claim naming who made it, and the sender approves or declines.

Phone disclosure is per link and one-sided: `share_phone_a` / `share_phone_b`,
each owned by that side. It is resolved live on every `GET /links` rather than
copied anywhere, so switching it off genuinely stops future reads — though the
app's wording is careful to call it a disclosure, not a recall, because a number
already seen is already on their phone.

**Retention:** the newest 10 snapshots per user are kept; older ones are pruned
on upload (`pruned` in the `POST /backups` response says how many went). Backup
is a lost-phone safety net, not version history, and a device backing up weekly
would otherwise grow the bucket forever.

## Deploy — free, no card, no domain

Every piece below is on a free tier. Verified against the docs 2026-08-17:
Workers Free is 100k requests/day; D1 Free is 5 GB total, 500 MB per database,
2 MB max row; R2 Free is 10 GB. **The one thing that is not free is Cloudflare's
own Email Sending** — it is Workers Paid ($5/mo) *and* needs a domain you own —
so the default here sends through an HTTP provider's free tier instead.

```sh
npm install                     # wrangler + workers-types, for `npm run typecheck`
npx wrangler login

# 1. D1 — paste the returned database_id into wrangler.toml
npx wrangler d1 create budgetsplit-api
npx wrangler d1 migrations apply budgetsplit-api --remote

# 2. Blob storage — KV needs no card and no dashboard opt-in, so it is the
#    default. (R2 is better and takes over automatically once bound, but it must
#    be enabled from the dashboard first, which can ask for a payment method.)
npx wrangler kv namespace create BLOBS      # paste the id into wrangler.toml
# optional, later: npx wrangler r2 bucket create budgetsplit-files

# 3. Email — sign up at brevo.com (free: 300/day, no card), verify ONE sender
#    address by clicking the link they email you (a Gmail address is fine —
#    this is what removes the need to own a domain), then:
npx wrangler secret put BREVO_API_KEY
#    and set EMAIL_FROM in wrangler.toml to that verified address

npm run deploy
curl https://budgetsplit-api.<your-subdomain>.workers.dev/health
# → {"ok":true,"mail":"brevo"}   ← "none" means email is not configured yet
```

`/health` reports which provider and which store are live on purpose: a deploy
that cannot send, or cannot keep a backup, should be visible from a curl rather
than from a user's failed sign-in.

### Storage: KV by default, R2 when available

`storage.ts` prefers R2 and falls back to KV, so the same code runs either way.
The only difference that leaks out is the size cap — KV stops at 25 MiB per
value, R2 does not — and `POST /backups` reads that from the live backend rather
than a constant, so an oversized backup is refused *before* the upload rather
than discovered after it. KV's other free-plan limits (1 GB total, 1k writes/day)
are far beyond a personal ledger's needs; a rows-only backup is tens of KB.

If neither is bound, backup and avatar routes answer `503
E_STORAGE_UNCONFIGURED` and everything else — sign-in, profile, linking — works
untouched.

### Switching to Cloudflare Email Sending later

Better deliverability, one platform, no third party — at $5/mo plus a domain.
Onboard the domain (`npx wrangler email sending enable yourdomain.com`),
uncomment the `[[send_email]]` block in `wrangler.toml`, delete the Brevo secret
(`npx wrangler secret delete BREVO_API_KEY`), and point `EMAIL_FROM` at an
address on that domain. `mailer.ts` chooses from what is configured, so this is
config and a redeploy — never a code change.

### Why not Nodemailer

It is an SMTP *client library*, not a service, so it still needs a mail server to
talk to. It also cannot run here: Workers provide no `node:net`/`node:tls`, and
outbound port 25 is blocked. Using it would mean a second Node deployment beside
this Worker — on free hosting that sleeps, so the first sign-in of the day waits
on a cold start.

### Failure codes worth knowing

`POST /auth/request-link` passes the provider's failure through as `code`,
because these are the failures whose fix is config rather than code:

| `code` | Means |
|---|---|
| `E_MAIL_NOT_CONFIGURED` | Neither `BREVO_API_KEY` nor the `EMAIL` binding is set |
| `E_MAIL_KEY_INVALID` | The API key was rejected |
| `E_SENDER_NOT_VERIFIED` | `EMAIL_FROM` is not a verified sender (or its domain isn't onboarded) |

Then point the app at it: `EXPO_PUBLIC_API_URL=<worker url>` in
`budgetsplit/.env` (see `budgetsplit/.env.example`). As with the OCR proxy's
URL, that value is **inlined into the JS bundle at build time** — changing it
means rebuilding, not restarting.

## Local development

```sh
npx wrangler d1 migrations apply budgetsplit-api --local
npx wrangler dev
```

`wrangler dev` runs D1 and R2 locally, but email sends have to reach the real
service — add `remote = true` to the `[[send_email]]` block to proxy them, and
expect real emails to real addresses.

## Notes

- Migrations are numbered files under `migrations/`, applied with
  `wrangler d1 migrations apply` — unlike the app's own SQLite, this database
  started clean, so it gets versioned migrations from row one instead of the
  app's guarded-rebuild pattern.
- `Env` is hand-written in `types.ts` rather than generated by `wrangler types`,
  matching `receipt-ocr-proxy`: the binding list is short and belongs in git next
  to the code that reads it.
- `npm run typecheck` (`tsc --noEmit`) covers this folder. `wrangler deploy`
  compiles TS but does not typecheck, so run it before deploying.
