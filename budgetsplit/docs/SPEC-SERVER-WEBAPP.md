# SPEC — the server as a web app's backend, and the V1 close-out scan

`Status: PROPOSED · Written 2026-09-30 · Builds on: docs/history/SPEC-SERVER.md (DQ-93) · Tracker: U-66, DQ-104–DQ-107`

Not a live doc. Decisions live in `TRACKER.md` §3, reasoning in `FINDINGS.md`.

---

## 1 · Where the server stands today

`DQ-93` (2026-09-24) already chose the direction you asked for: **the server keeps a readable,
properly modelled copy of everything**, the phone stays offline-first, and the API was shaped so a
browser client could come later. The scan confirms the data side is done:

| | State |
|---|---|
| **Entities** | Every local table has a server home, and every local column's fate is written down and guarded (`rowMap.ts` `COLUMN_FATES`, `rowMap.test.ts`). The server is *more* normalised than the phone: a transaction is `transactions` + `transaction_payers` + `transaction_splits` + `transaction_items` + `transaction_tags` + `recurring_rules` + `recurring_skips`, versioned in `transaction_history`. |
| **Only on the phone, correctly** | `sync_queue`, `sync_version` (the client's outbox and cursor), `settings` keys that are device-local. |
| **Only on the server, correctly** | `users`, `sessions`, `devices`, `magic_links`, `invites`, `links`, `sync_scopes`, `sync_rejections`, `write_guard`, `transaction_history`. |
| **Not on the server** | Receipt photos and profile photos (`SYNC-F4`) — R2 is blocked on a dashboard opt-in (`DQ-85`). A web client would show entries without their receipts. |
| **Writes** | `POST /sync/push`: ordered mutations, each applied atomically with its acknowledgement (retries apply exactly once), validated with the app's own rules (`validateShares`, `requiredSides`, `requiresMyApproval`), refusals recorded for the phone to read. |
| **Reads** | `POST /sync/pull`: per-scope cursors, 500-row pages that never split a write, tombstones, revoked scopes. |
| **REST today** | Auth, `/me`, invites, links, friend requests. |
| **Background work** | None. No Queues, no Cron. Email is sent inline; expiry is done "when somebody looks" (`index.ts`). |

So the server is a sound relational store with a replication protocol — not a blob mirror. What a
web app still needs is everything *around* it.

---

## 2 · What "a proper web app" adds (proposal)

Principle: **one set of rules, two doors.** Every write — from the phone's sync or a browser's
request — goes through the same entity specs, fences and app rules that the server's `POST /sync/push` uses today.
Nothing is validated twice in two ways.

### 2.1 · Read API (`DQ-104`)

A versioned `/v1` resource API over the same tables, for a browser that has no local database:

| Resource | Shape |
|---|---|
| `GET /v1/groups`, `GET /v1/groups/:id` | groups I can read, with members and my net |
| `GET /v1/groups/:id/transactions?from&to&kind&person&tag&cursor` | paged ledger, the same filters as the phone (`lib/txnFilter`) |
| `GET /v1/me/activity` | the Personal ledger across groups (`getMyActivity`'s shape) |
| `GET /v1/me/balances` | owe / owed per person, from the same netting the phone uses |
| `GET /v1/me/budget?month` · `GET /v1/me/reports?month|from&to` | computed on the server with the shared `src/lib` code, never re-implemented |
| `GET /v1/me/money` | places, assets, goals, card — `moneySumLines` |

Derived figures are computed by the **same TypeScript** the phone runs (the Worker already imports
`src/lib` for validation), so a balance can never read differently on the web.

**Writes from the web:** `POST/PATCH/DELETE /v1/...` handlers that build one `Mutation` and run it
through `applyPush` — the web gets request/response semantics, the rules stay single-sourced.

*Alternative considered:* a local-first web app (SQLite-wasm + the same sync protocol). Closer to the
phone, but heavier to build and to keep in a browser. **Recommended: the read API above**, with the
local-first web kept possible because the protocol does not change.

### 2.2 · Queues and scheduled work (`DQ-105`, `DQ-107`)

| Job | Today | Proposed |
|---|---|---|
| **Recurring occurrences** | Posted by the rule's author's phone when it opens the app; a rule "stops" while its author is away | A daily **Cron** trigger enqueues due rules; a **Queue** consumer posts each occurrence server-side with the same code. Phones stop materialising for signed-in accounts. The new unique index (§3) makes it safe to switch over gradually. |
| **Email** (magic links, invites) | Sent inline in the request | Enqueued; retried with backoff; the request returns at once |
| **Notifications** ("waiting for your approval") | None | Enqueued fan-out when an entry needs someone else's approval — push later, email digest first |
| **Expiry and cleanup** (magic links, sessions, rejections) | On read | Nightly Cron |
| **Exports** (CSV / PDF of a range) | On the phone | Optional server job for the web |

Queues and Cron need **Workers Paid ($5/mo)** — the same step `DQ-95` already sets for before the
first sign-in that isn't you.

### 2.3 · Data-model decisions to settle before a public API (`DQ-106`)

An API contract bakes in whatever the model is on the day it ships. Three open tracker items are
cheap now and expensive after a web client exists:

| Today | Before the API |
|---|---|
| Categories referenced by **name** (`OV-06`) | Reference by id; renaming a category is then one row, not a rewrite of history |
| `category_budget.period` **and** `.cadence` (`OV-19`) | One field |
| Dead and near-dead columns (`OV-23`) | Dropped from the server schema (still a free reset: nothing is live) |

### 2.4 · Operations

Request ids and structured logs; an error sink (Workers Logs or Sentry); per-user rate limits on the
new routes (`rateLimit.ts` exists); pagination limits on every list; an OpenAPI description generated
from the route table, so a web client is typed from the server, not guessed.

### 2.5 · Order of work

1. Settle `DQ-104`–`DQ-107` (defaults below).
2. Server schema clean-up (`DQ-106`) — free while nothing is live; reset the dev database.
3. Workers Paid, then Cron + Queue for recurring (`DQ-105`), with the phone path left on until the
   server path has run a month without a duplicate (the index refuses any).
4. `/v1` read endpoints for groups, activity, balances; then budget, reports, money.
5. Email and notifications through the queue.
6. A thin web client (Expo web or a separate React app) on the server's `/v1` API.

---

## 3 · The scan (`U-66`)

### Fixed now

| What | Why it mattered | Fix |
|---|---|---|
| **The same recurring occurrence could be posted twice** by one person's two devices (or, later, the phone and the web) | A ₹30,000 rent posted ₹60,000 | `ux_transactions_occurrence`: one live occurrence per rule per due date. A duplicate is refused and reverted on the device that sent it. Test proven to fail without the index. |
| **A server not reset since `U-49`** could send `upi` / `autopay` back to a phone | A Paid from nothing on the phone can draw or sum | `localPayMethod` on every pull (transactions, imports, approvals): the old How values read as Bank, anything unknown as not recorded |

### Checked and sound

- Balance adjustments sync both ways (one-sided personal settlements are allowed by `requiredSides`;
  the pushed amount is the larger side). Test added.
- "Paid from not set" → setting a place queues every changed entry for sync (`queueEntry`), and
  leaves someone else's entries alone.
- The narrowed Paid from `CHECK` on the server matches the phone's five values.
- Entity coverage: no local table or column without a stated fate.

### Found, not changed — worth knowing

| What | Note |
|---|---|
| Recurring posts only while its author opens the app | By design today; §2.2 fixes it server-side |
| Receipts and profile photos never reach the server | `DQ-85` (R2). A web client shows no receipts until then |
| "Set where it went" for *Paid from not set* also relabels entries you deliberately marked **Other** | They are in the same line; if you want Other kept, the line needs to exclude it too |
| A transfer to a friend marked *Credit card* reads as a card-bill payment | Given up in `U-49`; returns if card repayment gets its own marker |
| Personal's totals row shows on the Budget and Recurring tabs too | Harmless, but it describes the Activity list |

### What the tracker still holds for V1

12 ship blockers (`B-`), mostly outside the code: Apple programme, store assets, privacy policy, key
rotation, the device pass (`B-12`), merging to `main` (`B-19`). 32 decisions have a stated default that
ships if never answered. UI items still open: `W1-28`, `W1-29`, `W1-32`, `U-09` (friend's name missing
when you owe), `U-31` (sorting), `U-20` (spacing), `U-02` (reload cost, measure on the phone).
