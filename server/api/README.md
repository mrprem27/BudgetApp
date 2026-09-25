# budgetsplit-api

Cloudflare Worker holding the app's **accounts** and the **account's copy of the
ledger** that every signed-in phone syncs with (`SPEC-SERVER` in
`budgetsplit/docs/history/`, decision `DQ-93`).

Sibling of `../receipt-ocr-proxy` (a separate, stateless Worker) — they share the
repo and the Cloudflare account, nothing else.

## What it holds

The app stays **offline-first**: each phone keeps its own SQLite database
(`budgetsplit/src/db/schema.ts`) and works without a connection. When signed in,
the phone also keeps this server's copy up to date, and a new phone gets it back
by signing in. This server holds:

- **Identity** — email, display name, phone (self-declared), avatar. D1, with the
  avatar image in KV or R2.
- **Everything the account owns, readable** — personal spending and income,
  goals, assets, budgets, categories, preferences, and every group it is in with
  its entries, approvals and disputes. D1, schema in `migrations/0001_schema.sql`.
  It is **not** end-to-end encrypted: the server checks every write against the
  app's own rules (who may change what, trust and approval, split math), which it
  could not do to data it cannot read. That trade was made on purpose (`DQ-93`).

What it does not hold: receipt photos (they never leave the phone) and the
passphrase-encrypted backup file, which is the user's own and goes wherever they
share it — it never comes here.

Deleting an account (`DELETE /me`) erases its copy of everything that was the
account's alone — its own scope and every group nobody else is in
(`sync/erase.ts`). Its entries in groups other people are in stay: they are the
group's record, already on the other members' phones.

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
| `DELETE /me` | bearer | Deletes the account: identity anonymised, its own copy erased (`sync/erase.ts`), every session and device signed out. |
| `GET /friend-requests` · `POST` · `POST /:id/accept` · `/decline` · `DELETE /:id` | bearer | A friend request by email address. `POST` answers an identical `202` whether or not the address has an account — the email body differs, visible only to the inbox owner. |
| `POST /sync/push` | bearer | `{deviceId, mutations: [{id, entity, op, entityId, baseVersion, data?}]}` → `{lastMutationId}`. At most 100 mutations and 2 MB. |
| `POST /sync/pull` | bearer | `{deviceId, cursors, rejectionsAfter}` → `{scopes, revoked, revokedWhy, lastMutationId, rejections, invites}`. Pages of up to 500 rows. |
| `GET /transactions/:id/history` | bearer | A transaction's saved versions, for anyone who can read its group. Loaded on open, never synced. |

### Sync

Code in `sync/`, reached only through its `index.ts` barrel. Each account has a
**user scope** and each group is a **group scope**; every row carries its scope and
a per-scope `seq`, and a phone keeps one cursor per scope.

- **Push** applies mutations in order, each in its own atomic D1 batch that also
  advances `devices.last_mutation_id`, so a retried push applies each mutation
  exactly once. A mutation carries the `baseVersion` it was made against; a stale
  one is refused as a `conflict`, never silently overwritten. A refused mutation
  is written to `sync_rejections` and the phone learns of it on the next pull,
  reverts, and says why.
- **Pull** returns, for every scope the account can read, the rows changed since
  the phone's cursor, tombstones included. One page is one D1 batch, so children
  always match parents, and a page never splits a `seq`.
- **Access** is one module (`sync/utils/access.ts`): an account reads its own
  scope and the groups it is an active member of; an invitation grants nothing
  until accepted. Role rules (owner / admin / member) are the app's own
  `permissions`, imported via `sync/rules.ts`, never re-implemented.
- **Approvals** are decided here with the app's own `requiresMyApproval`: an entry
  counts for its author at once and waits for everyone else it names, unless
  they trust the author. A refusal outranks trust — an edit to an entry someone
  refused asks them again (`sync/entities/approvals.ts`).

D1 has no interactive transactions, so every write guards itself with a
`write_guard` row that fails the batch when a precondition no longer holds
(`sync/utils/guard.ts`).

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
npx wrangler d1 migrations apply budgetsplit-api --remote   # one file: 0001_schema.sql

# 2. Avatar storage — KV needs no card and no dashboard opt-in, so it is the
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
that cannot send, or cannot store an avatar, should be visible from a curl rather
than from a user's failed sign-in.

### Storage: KV by default, R2 when available

`storage.ts` prefers R2 and falls back to KV, so the same code runs either way.
It holds avatars only. The one difference that leaks out is the size cap — KV
stops at 25 MiB per value, R2 does not — which an avatar (≤5 MB) never reaches.

If neither is bound, the avatar routes answer `503 E_STORAGE_UNCONFIGURED` and
everything else — sign-in, profile, linking, sync — works untouched.

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

- The schema is **one file**, `migrations/0001_schema.sql`, edited directly while
  nothing is live. A dev database made from an older schema is deleted and
  recreated, not migrated. Numbered migrations start with the first real
  account.
- `Env` is hand-written in `types.ts` rather than generated by `wrangler types`,
  matching `receipt-ocr-proxy`: the binding list is short and belongs in git next
  to the code that reads it.
- `npm run typecheck` (`tsc --noEmit`) covers this folder. `wrangler deploy`
  compiles TS but does not typecheck, so run it before deploying.
