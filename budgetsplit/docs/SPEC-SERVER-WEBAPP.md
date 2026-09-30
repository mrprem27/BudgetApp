# SPEC — the server as a web app's backend, and the V1 close-out scan

`Status: PLAN — §7 is the step-by-step · Written 2026-09-30 · Builds on: docs/history/SPEC-SERVER.md (DQ-93) · Tracker: U-66, DQ-104–DQ-107`

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

---

## 4 · Connected in real time (`DQ-108`)

**Today.** A write is saved on the phone and uploaded about 2 seconds later (`scheduleSync`). Other
people's phones fetch it the next time they sync — when they open or return to the app. Nobody is
told; a friend's expense can sit unseen for hours, and the web could not show it live at all.

**Proposed — the server is the truth, and it tells everyone.**

| | How |
|---|---|
| **Write** | Online: the entry goes to the server first and is confirmed back (an optimistic row shows at once, marked "saving…"). Offline: queued exactly as today, and it says so. |
| **Fan-out** | After a write commits, the server knows every scope it touched (a group → its members; a person → their devices). It publishes "scope X moved to seq N" to a **Durable Object** per user, which holds that user's open connections. |
| **Receive** | Every open phone or browser keeps one WebSocket to its Durable Object and pulls just that scope the moment it hears. A closed app gets a **push notification** for things that need them ("Riya added ₹1,200 · waiting for you"). |
| **Rules** | Unchanged: approvals, trust, author-only edits and every validation still run on the one write path. |

So "whenever someone adds a transaction it goes where it makes sense": to the group's ledger, to
each member's Personal, to whoever must approve it, to every device of theirs — within a second
while they are online, and as a notification when they are not.

## 5 · Entities, not flags (`DQ-109`)

You are right: several things the app talks about as different are stored as one table plus a flag.
They work — `settlementView` decides each case in one place — but a web API would expose the flags,
and every new client would have to re-learn the rules.

| One row today | Really is | Told apart by |
|---|---|---|
| `txn` kind `settlement` | paying a friend back | no `asset_id`, not card, not adjustment |
| | moving money into an asset / out of it | `asset_id` + which side has rows |
| | paying a card bill | `pay_method = 'card'` |
| | a balance adjustment | `category = 'Balance adjustment'` |
| `txn` with `recur_freq` | a **repeat rule** (not an entry) | `recur_freq IS NOT NULL` — the server already splits it into `recurring_rules` |
| `budget_group` with `is_personal` | your personal ledger | `is_personal = 1` |
| `person` with `is_me` | you | `is_me = 1` |
| Bank / Cash / Wallet, the card | **accounts** | not entities at all: opening balances and card limit are settings keys; "Paid from" is a text value |

**Proposed model** (server first, then the phone follows):

- **`accounts`** — Bank (can be several, named), Cash, Wallet, Credit card (limit, due day). Every
  transaction references the account it came from (`account_id`), replacing `pay_method` and the money
  settings. This is `DQ-14`, and it ends the card-bill heuristic.
- **`transfers`** — money between two of *your* places: account → account (paying the card bill),
  account → asset, asset → account. Two ends, one amount, never spending.
- **`settlements`** — money between two *people*: payer, payee, amount, group.
- **`adjustments`** — one account's correction, with the reason.
- **`expenses`** and **`incomes`** stay the transaction core, with their payers and splits.
- **`recurring_rules`** as their own entity on the phone too, not flagged transactions.

A shared ledger view is then a query over these (a union), not one table read five ways. Cost:
real — every screen that reads `txn` and every sync mapping moves. Best done in the same reset as
`DQ-106`, before a web client exists.

## 6 · Split and split by items (`U-67`)

### Split on the Add screen — fixed now

| Was | Now |
|---|---|
| Only the small avatar toggled a person in or out of the split | The whole row toggles, and people who are out read muted |
| Percent took whole numbers only, so three people could not take a third each | Decimals, and the parts still add to the paisa |
| "Who paid" meant typing the full amount into someone's box; only "I paid" had a shortcut | Tap anyone to make them the payer of the whole bill; amounts only when several paid |
| "Split with" was a bordered field and "Paid by" a centred link beneath it | Two matching rows in one box |
| The split block appeared only after an amount was typed | It appears as soon as the group has other members |

### Split by items — what is wrong, and the proposal (`DQ-110`)

Today it is a separate 4-step screen (items → assign → payers → review) with its own header, dots and
buttons. It asks again for things the Add screen already has (payer, category, date, group), its
inputs are hand-built rather than the app's own fields, each item opens a full split editor with its
own Equal / Exact / % / Shares tabs, and it cannot be reached while editing an entry.

**Decided 2026-09-30 (`DQ-110`): keep the separate screen and fix it** (`U-69`). The rest of this
section was the proposal, kept for the record. The fix: one input pattern for name, quantity and
price built from the app's own fields; clearer copy; spacing, alignment and a grid that lines every
item's columns up with each other and with the per-person totals.

**Proposed (not taken):** "By items" becomes a fifth split mode on the Add screen — Equal · Exact · % · Shares ·
**Items**. Choosing it opens one items sheet:

- a list of items (name, price, qty) with **Scan receipt** at the top;
- under each item, a row of people chips — tap to include; equal within the item by default, with
  "Custom" for the rare uneven item;
- tax / tip / discount lines shared in proportion, as today (`lib/itemized.ts` is kept);
- a live footer: each person's total, and anything unassigned.

Payer, category, date, group, Paid from and Repeat stay on the Add screen where they already are, so
there is one flow, one save, and an itemised entry can be edited like any other.

## 7 · Implementation plan — step by step, for continuing locally

Written 2026-09-30, after `U-68` step one landed (`b459517`). Order is the one you chose: entities,
then real time, then items. Each step below is one commit: it names the files, the work, the tests
that prove it, and the traps already found. Tracker rows are in `TRACKER.md` §0.

### Before every commit

- `npx tsc --noEmit -p .` in `budgetsplit/` **and** in `server/api/` (two separate projects).
- `npx jest` in `budgetsplit/` — the server tests run from here too (`src/__tests__/server/`).
  Last green: 2897 tests.
- The doc guards fail on drift, not bugs. The ones that trip most often:

| Guard | Fails when | Fix |
|---|---|---|
| `countClaims` | a new file in `src/db/queries` or `src/lib` | the count in `SYSTEM.md` (§1, "The shape of the data") |
| `trackerIntegrity` | a tracker id with no `FINDINGS.md` entry, or the reverse; a header count off | both files, and the section's header counts |
| `entityCoverage` | a new local table with no `### E-nn` section in `SYSTEM.md` §2 | add the section |
| `coverage` | a new `E-`/`SC-`/`DQ-` id not in a booklet | `scripts/build-system-map.js` |
| `backupCoverage` | a new local table in neither backup list | `src/lib/backup.ts`; new tables also go in `OPTIONAL_BACKUP_TABLES` |
| `rowMap` | a local column with no fate | `COLUMN_FATES` in `src/lib/sync/rowMap.ts` |
| the server schema guard | a new server table not classified | its lists in the server schemaGuards test |
| `syncQueueCoverage` | a writer of a synced table that does not queue | queue it, or add to `EXEMPT` with the reason |
| `settlementSurfaces` | reading `asset_id` outside the allowed files | ask `settlementView` |
| `noEmDash` | an em dash in a user-visible string | reword |

- Data fixes that must survive a restore go in `LAUNCH_INVARIANTS`, not `ONE_TIME_FIXES`: a
  restore keeps the `fix_%` markers, so a keyed fix never runs again on restored data.
- The server can be reset (nothing is live), so server schema changes edit
  `server/api/migrations/0001_schema.sql` in place.

### Phase 1 · Data model

**1a · Accounts carry the money (`U-68`, task E2).** Step one is done: the `account` table, the
four defaults (`default:bank|cash|wallet|card`), `account_id` on `txn` / `pending_txn` held to
`pay_method` by `alignAccount` (`src/db/queries/accountSql.ts`), backup, sync as `accounts`.

1. *Openings move onto accounts.* Add a `LAUNCH_INVARIANTS` statement: when `money.opening_bank` /
   `_cash` / `_wallet` is non-zero, add it to that default account's `opening_balance` and zero the
   key, in one `BEGIN…COMMIT` (copy the asset conversion's shape and its comment). Keep the legacy
   rule from `getMoneyProfile`: only `money.opening_cash` present, no bucket keys, means **bank**.
   Card: `money.credit_limit` and `money.card_due_day` go to `default:card`. Leave `credit_used` and
   `card_baseline_at` in settings for now; the card baseline logic stays as it is.
2. `getMoneyProfile` (`src/db/queries/moneyProfile.ts`) reads the openings as
   `SUM(opening_balance)` per kind over live accounts, and `creditLimit` as the sum over cards. Every
   consumer (`lib/cash.ts`, Safe to Spend, the health score, Plan) keeps working unchanged.
   `setMoneyProfileRows` with an opening writes the **default** account of that kind and queues
   `account`. Onboarding, the demo seeds and `enginePersonas` then need no change.
3. *Per-account balances.* Add `ACCOUNT_FLOWS_SQL` beside `BUCKET_FLOWS_SQL`
   (`src/db/queries/cashQuery.ts`): the same sums grouped by `t.account_id`. A card-bill payment
   (`kind = 'settlement' AND pay_method = 'card'`) has the card as `account_id`, but the money left
   the bank: count its bank side against `default:bank` until 1b gives transfers a from-account.
   The per-kind totals must still equal `BUCKET_FLOWS_SQL`; add a parity test next to
   `bucketFlows.test.ts`.
4. *Accounts screen.* New route `app/(money)/accounts.tsx` (list per kind, balance each, archive)
   and an `AccountSheet` in `components/finance/money/` for one account (name, kind, opening,
   and for a card its limit and due day) — a sheet, per the one-field/one-form rule. Queries go in
   a new `src/db/queries/accounts.ts`: `getAccounts`, `upsertAccount`, `archiveAccount`, each
   queueing `account` (the guard will say so). Screen data through a `lib/accountsData.ts`.
   Reach it from the Money tab's money card and from `MoneyEditorSheet`, whose bank / cash / wallet
   fields become the list. Give it an `SC-` id (next free after `SC-47`), `SCREENS.md` entry, the
   booklet, and the route count in `AGENTS.md` and `SYSTEM.md`.
5. *Paid from picks an account.* The picker (`finance/pay/`) shows accounts grouped by kind; one
   account per kind reads exactly as today. Choosing one sets both `pay_method` (its kind) and
   `account_id`; `alignAccount` keeps them honest. Carry `account_id` through `insertTxnRows`,
   `updateTxn`, the Review inbox (`pending_txn` → `txn` in `approval.ts` / review commit) and
   `restorePending`.
6. *Show it.* Transaction detail shows the account name. The row showing Paid from is `DQ-18`
   (phase 3).

**1b · Done 2026-09-30, reshaped (`DQ-109`).** You chose explicit links on entries over new tables.
A card-bill payment is From a bank account INTO a card (`txn.to_account_id`), converted at launch
for old rows; the server checks the card is yours. Asset moves (`asset_id`), bank / cash / wallet
moves (two legs, each naming its place) and balance adjustments (their account) already said both
ends. Repeat rules stay flagged entries on the phone (the server already splits them). The sweep
(`DQ-15`, `D-08`) stays parked on its trigger.

**1c · Categories by id and cleanup (`DQ-106`).** `txn.category`, budgets and rules name a category
by text (`OV-06`); switch to `category_id`, with the server's deterministic id
(`syncIds.category`). Pick one of `category_budget.period` / `.cadence` (`OV-19`). Drop the dead
columns in `OV-23` and `budget_group.limit_*` (`D-07`) through the `txn` rebuild pattern in
`schema.ts`.

### Phase 2 · Server as a web app (deploy needs Workers Paid, `DQ-95`)

- **2a · Done 2026-09-30** (see `FINDINGS.md` `DQ-108` for what was built and left). **Plan was: Real time (`DQ-108`, task R).** A Durable Object per user
  (`server/api/realtime/UserHub.ts`) holds that user's WebSockets. After `applyPush` commits, publish
  "scope X is at seq N" to every member's hub (group scope: all active members; user scope: that
  user). The phone opens one socket while in the foreground (`src/lib/sync/live.ts`) and on a
  message pulls just that scope. Online-first writes: when the socket is up, drain the queue at once
  and show the row as "saving…" until acknowledged; offline stays exactly as today. Push
  notifications need Apple (`DQ-80`); build the server side (a `push_tokens` table, send on
  approvals and new entries) behind a flag. Test the hub with the in-process D1 helpers.
- **2b · Cron and Queues (`DQ-105`, `DQ-107`).** A Cron trigger posts due repeat occurrences on the
  server (the unique occurrence index stops a double post with the phone), and a Queue sends email
  (magic links, invites) and notifications, and cleans up expired sessions and magic links.
- **2c · `/v1` read API (`DQ-104`).** Read-only JSON over the same tables (a group's ledger, my
  balances, a month's report), computed with the shared `src/lib` code as the sync rules already
  are. Writes stay on the server's sync push.

### Phase 3 · Screens

- **Split by items (`U-69`, task I).** Keep the wizard (`app/add/itemized.tsx`). One input pattern
  for name / qty / price from the app's own field components, not hand-built inputs; a real grid
  (fixed columns for qty, price and total, so rows line up with each other and with the
  per-person footer); spacing on tokens (`space.*`, never arithmetic); shorter copy (§14 of
  `AGENTS.md`). Chips through `ui/Chip`, rows through `ListRow`, cards through `Card`.
- `U-20`, `W1-28`, `W1-29`, `W1-32`: spacing and alignment passes, screen by screen.
- `U-16`: compose screens from cards and sections instead of stacked button rows.
- `U-31`: agree which lists sort how, then fix. `U-09`: Friends shows the name when you owe.
- `DQ-18` / `D-05`: the transaction row shows Paid from (the account name after 1a).
- `DQ-13` / `D-06`: the transfer form gets `DetailChips`. `DQ-17` / `D-04`: Help uses the one
  collapsible. `DQ-12` / `A-01`: one red surface at a time on Home. `OV-10`, `OV-15`.

Known small bugs found in the last pass, not yet fixed:

- Repeat entries post only when the author opens the app (fixed by 2b).
- "Set where it went" also relabels entries marked Other (`setSourceForUnsetEntries`).
- The Personal totals row shows on the Budget and Recurring tabs.
- ~~A friend transfer marked Credit card reads as a card bill~~ fixed in 1b.

### Phase 4 · Code debt

`DQ-23` / `A-11` the new `expo-file-system` API; `OV-14` a memo boundary for the engine snapshot;
`DQ-19` foreign keys on (after 1b, when the references are real); `OV-05`, `OV-22` one vocabulary.

### Phase 5 · Yours

Phone pass (`U-10`, `B-12`, measure `U-02`), UPI checks on devices (`D-01`–`D-03`), Apple
(`B-02`, `DQ-80`), Workers Paid (`DQ-95`), the Brevo key (`B-07`), a Mixpanel token (`U-24`), the
release list (`B-19`, `B-14`, `B-04`, `B-05`, `B-08`, `B-09`, `B-10`, `B-13`), and the business
questions (`DQ-01`, `DQ-03`, `DQ-04`).
