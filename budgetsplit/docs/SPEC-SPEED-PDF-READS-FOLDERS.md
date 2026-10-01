# SPEC — speed, the report PDF, the rest of the v1 API, and folders

`Status: BUILT 2026-10-01: §1 steps 0 to 4, §2, §4 server step 1. OPEN: §1 step 5, §3, §4 steps 2 to 5 · Written 2026-10-01 · Tracker: U-02, U-82 (speed), U-19 (PDF), DQ-104 (/v1)`

Four things you asked to have analysed before anything is built. Each part: what is true today
(measured or read from the code), what to do, in what order, and what is yours to decide.
Decisions are collected in §5.

---

## 1 · Speed

### What is true

Every screen reads the database again each time it gets focus, and each read is many small
queries. On the phone every query is a round trip from JavaScript to native, so the count matters
more than the SQL. Counted against the demo data (5 groups, 148 entries), one load of each screen:

| Screen | Round trips | Why so many |
|---|---|---|
| Insights | 146 | builds the money engine's snapshot twice (once for Safe to spend, once directly), then a budget read per group |
| Badges, and Settings (it draws the badge board) | 119 | the snapshot twice, plus eleven other reads, to draw a row of discs |
| Home | 90 to 106 → **84 + 6 to 22** | fixed today for pill taps (`U-82`); a full load is unchanged |
| Reports | 96 | a ledger read and a budget read per group, six trend months |
| Groups tab | 73 | about 14 per group, one group at a time |
| Afford | 42 | the snapshot |
| Group page | 33 | |
| Personal | 28 | |
| Money tab | 15 | |
| Recurring | 5 | |

Two shared pieces carry most of it: the **engine snapshot is 41** round trips wherever it is read
(Home, Insights, Afford, Badges), and a **budget summary is 16**.

Not known: what one round trip costs on your phone, and whether you are on a development build
(several times slower than a release build). In Node the whole Home load is 25 ms, so the cost is
the hops, not the queries.

### What to do, in order

0. **Done:** Home's pills reload only the period's figures (`U-82`).
1. **Measure on the phone.** `useScreenData` records how long each screen's load took; the dev
   screen lists the last twenty. Ten minutes of tapping then says which screens are slow in
   milliseconds, instead of guessing from counts. Small, and it decides the order of everything below.
2. **Reload on focus only when something changed** (`U-02`). Every write already announces itself
   (`refresh()`), and a backgrounded screen already marks itself as needing a reload. So a screen
   that regains focus with nothing written since, on the same day, shows what it has and reads
   nothing. This is the largest change for the whole app: moving between tabs stops touching the
   database at all. Risk: a write that forgets to announce itself leaves a screen stale. Only
   a few such checks exist today (`bugscan`), so a guard over every write path comes first.
3. **Build the snapshot once per load.** Safe to spend accepts a snapshot instead of building its
   own. Insights 146 → about 105, Badges 119 → about 78, no behaviour change.
4. **Settings does not compute badges to draw a board.** Show the count from a cheap read, or load
   the board after the screen is up.
5. **Read per group in one query, not one group at a time.** Groups tab 73 → about 10; then
   Reports, the budget summary and the snapshot's per-person reads the same way. This is the
   riskiest step (it changes SQL behind money figures), so each one lands with the existing
   cross-surface tests and a count assertion.

Target: no screen above about 30 round trips, and zero on a tab switch with no writes.

---

## 2 · The report PDF (`U-19`)

### What is true

The export on Reports (`lib/reportExport.ts`) prints, per group: three boxes (Income, Expense,
Net) and one table (date, category, note, amount).

- **The rows do not add up to the boxes.** The boxes are your share; each row prints the whole
  bill. In a shared group a ₹1,200 dinner split three ways prints ₹1,200 in the table and adds
  ₹400 to Expense. This one is a wrong number, not a style problem.
- No total for the period across groups, and no category breakdown, which is the thing Reports
  itself leads with.
- Transfers and investments sit in the same table as spending, with nothing saying they are not
  counted in the boxes.
- A custom date range with no entries still says "No transactions this month".
- Heavy 2px borders on every cell, a font (`SF Mono`) that does not exist on Android, no page
  breaks kept clear of rows.
- `U-19` never recorded which PDF you meant: this export, or reading a PDF bank statement on Import.

### What to do

1. Fix the wrong number first: each row shows your share, with the full bill beside it when they differ.
2. A first page that matches the Reports screen: the period, spent / received / moved (never one
   total across them), then categories with amount and share.
3. Per group after that, with transfers in their own short table.
4. Lighter table (hairlines, no cell boxes), rows that never split across a page, the heading
   repeated on each page, the range named correctly.

About a day, all in one file plus its tests. No new dependency.

---

## 3 · The rest of the v1 API: budget, reports, money (`DQ-104`)

### What is true

`/v1` has groups, a group's ledger and balances. Those three were possible because their rules are
already pure functions the server imports from the app (`settle`, `splitMath`, `trust`,
`permissions`). Budget, reports and money are not in that state:

- Their arithmetic lives in functions that also run the phone's SQL (`lib/budget.ts`,
  `lib/reportsData.ts`, `db/queries/cashQuery.ts`), and the phone's tables are named differently
  from the server's (`txn` / `txn_share` against `transactions` / `transaction_splits`). Nothing
  can be imported as it stands; rewriting the maths on the server is what the plan forbids.
- Nothing reads these endpoints. There is no web client yet.

### What to do

1. For each of the three, split "read the rows" from "work out the figures", so the figures come
   from a pure function over rows (`budgetSummaryOf(lines, entries, me, window)` and the like).
   The phone keeps its SQL and calls the pure half.
2. The server reads the same rows from its own tables, maps them to the phone's row shape (one
   mapper, tested against the sync entities), and calls the same pure half.
3. Add `GET /v1/me/budget`, `/v1/me/reports`, `/v1/me/money`, each with a test that the phone and
   the server give the same figures for the same ledger.

Step 1 is also what §1 step 5 needs (read once, compute in code), so it is not wasted if the web
client never comes. Steps 2 and 3 are only worth doing when a web client is actually starting.

---

## 4 · Folders

### What is true

**App**

- `src/lib` is 145 files in one folder: pure rules, screen loaders, writes, parsers, device
  wrappers and on-screen copy side by side. Three subfolders exist (`engine`, `sync`,
  `ocrProviders`); the rest is flat.
- `src/components/finance` has 15 subfolders and still 29 loose files beside them.
- `src/__tests__` is 234 files in one folder. Many of them open source files by path as text, so
  every moved file breaks a guard until its path is updated.

**Server**

- `server/api/index.ts` was 1,231 lines: sign-in, accounts, linking and the router in one file,
  with its helper files loose beside it. **Done 2026-10-01:** it is the router (about 200 lines);
  the handlers are `auth/`, `account/` and `links/`, the helpers `utils/`.
- The server reaches into the app by relative path (`../../../budgetsplit/src/lib/…`, seven
  modules), and its tests live inside the app's test folder.

### What to do

1. **Server first, it is small.** `index.ts` becomes a router; its handlers move to `auth/`,
   `account/`, `backup/`, `links/`, each with an index; the loose helpers move to `utils/`.
   No behaviour change, one commit, the existing server tests are the check.
2. **A named home for what both sides share:** `src/shared/` for the pure modules the server
   imports, with a guard that nothing in it imports React, the database or a device module. The
   pure halves from §3 step 1 land there.
3. **`src/lib` by area**, one area per commit: `money/`, `budget/`, `people/`, `recurring/`,
   `import/`, `review/`, `device/` (haptics, keychain, storage, notifications), `format/`
   (dates, money, bytes), and `screens/` for the `*Data` loaders. Each commit is moves plus path
   updates only, with typecheck and the full suite green before the next.
4. The 29 loose files in `components/finance` move into the subfolder that already uses them.
5. Tests stay flat. Mirroring 234 files buys nothing and costs a day.

Step 3 touches most imports in the app. It is safe (the compiler finds every one) but noisy, so it
should not overlap with feature work.

---

## 5 · Yours to decide

| | Question | My recommendation |
|---|---|---|
| 1 | Speed: start with measuring on the phone (step 1), or go straight to reload-only-when-changed (step 2)? | Measure first; it is small and stops us fixing the wrong screen |
| 2 | Are you testing on a development build or a release build? | A release build before judging speed |
| 3 | PDF: is it the Reports export you called poor, or PDF statement import? | Assumed the export |
| 4 | `/v1` budget, reports, money: now, or when a web client starts? | Do only the pure split now (§3 step 1), the endpoints later |
| 5 | Folders: server only, or the full `src/lib` move as well? | Server and `src/shared` now; `src/lib` after the phone pass, in a quiet week |

Suggested order if you agree with all five: speed 1 → 2 → 3 → 4, PDF, server folders, the pure
split with speed step 5, then `src/lib`.
