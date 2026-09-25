# Tasks — Server sync (SPEC-SERVER)

`Plan: ./plan.md · Spec: ../docs/history/SPEC-SERVER.md · Predecessor: docs/history/TASKS-2026-09-FEEDBACK.md`

Every task's verification includes the standing gates, which are not repeated below:

```
cd budgetsplit && npx jest            # all suites, including the doc and source guards
cd budgetsplit && npx tsc --noEmit    # app code; src/__tests__ is NOT typechecked
cd server/api && npm run typecheck    # from S4 on
```

Every new regression test is proven by reverting its fix and watching it fail (`AGENTS.md`).
"Device" means your device pass. I report the gates and list the risks; I don't ask you to test
before I continue. Remote `migrate` and `deploy` are yours to run.

**Migration note (2026-09-24, same day as S1–S3):** the server schema was written as `0011_v2_core.sql`
in S2–S3, then consolidated into one file, `0001_schema.sql`, holding both v1 and v2 — development
phase, no real account has ever signed in, so an incremental migration protects nothing (see
`SPEC-SERVER.md`). References to `0011`/`0012` below are what was true at the time each task ran;
the schema itself now lives in `0001_schema.sql`.

---

## Carried over from the previous pass — device checks, yours

- [ ] Fresh install → no flicker → the keyboard behaves → Name is required (T1–T3)
- [ ] "Replay welcome tour" → relaunch behaves the same (T1)
- [ ] The focused field is never covered on the smallest supported phone (T2)
- [ ] The full onboarding; Plan and Recurring show exactly what was entered (T4–T8)
- [ ] The New path and the Existing path (email → code → onboarding) both work (T9–T10)
- [ ] An investment logged from Expense; Plan net worth unchanged (T11)
- [ ] Groups → Friends; create a group adding a new friend inline (T12–T15)
- [ ] Home, Plan, a group and Settings all say Recurring / Upcoming / Reminders the same way (T16–T17)

---

## Phase 0 · Housekeeping

### - [x] S0 · File the spec's decisions and open questions
**Done 2026-09-24.** `DQ-93` (the direction) recorded; `DQ-89` and `DQ-32` answered by it;
`DQ-94`–`DQ-96` filed with defaults; `SYNC-F22` re-worded. `docs/TRACKER.md` §3 and `docs/FINDINGS.md`
§3 updated, and the doc guards pass.

---

## Phase 1 · `server-schema`

### - [x] S1 · A D1 test harness over `node:sqlite`
**Description:** A tiny adapter that presents D1's `prepare().bind().first/all/run()` and `batch()`
over `node:sqlite`. `batch()` runs inside `BEGIN`/`ROLLBACK`, so a failed statement undoes the whole
batch, exactly as D1 does. The adapter loads every `server/api/migrations/*.sql` in order, with
`PRAGMA foreign_keys = ON` (D1's default).
**Acceptance:**
- [x] Today's migrations 0001–0010 load cleanly into it
- [x] A batch with one failing statement leaves no trace of the others (proven by a test)
**Verification:** `npx jest src/__tests__/server`
**Dependencies:** None
**Files:** `src/__tests__/server/helpers/d1.ts` (new), `src/__tests__/server/harness.test.ts` (new)
**Scope:** S
**What actually happened (2026-09-24):** 5 tests. Proven by revert: foreign keys OFF → the FK test fails; `batch` without BEGIN/ROLLBACK → the atomicity test fails. `bind(undefined)` throws, as D1 does, so optional fields must arrive as `null`.

### - [x] S2 · Schema: accounts, people, groups, categories, budgets, sync bookkeeping
**Description:** The first half of `0011_v2_core.sql` (spec §2.3–2.6, §2.10):

- `devices`, `people`, `friends`
- `groups`, `group_members`, `group_preferences`
- `categories`, `budgets`
- `sync_scopes`, `sync_rejections`, `write_guard`

It also adds the trigger that makes `groups.owner_id` immutable, and the partial unique indexes: one
personal group per user; unique category names among rows that aren't deleted; one budget default
and one override per person.
**Acceptance:**
- [x] Every **synced** table has the §2.3 columns and a `(scope_id, seq)` index (the bookkeeping tables listed in §2.3 are exempt, and the guard names them)
- [x] Tests show the schema **refusing**:
  - [x] a foreign key to a missing row
  - [x] a bad enum
  - [x] `amount <= 0`
  - [x] a second personal group
  - [x] a duplicate live category
  - [x] changing `owner_id`
**Verification:** `npx jest src/__tests__/server/schema`
**Dependencies:** S1
**Files:** `server/api/migrations/0011_v2_core.sql` (new), `src/__tests__/server/schema.test.ts` (new)
**Scope:** M
**What actually happened (2026-09-24):** 12 tests, proven by removing the owner trigger, the one-personal-group index and the budget `amount` check (exactly those 3 went red). Four design calls, all written back into the spec's §2:
- **Category names are case-sensitive, like the phone's.** A server stricter than the phone would refuse legitimate uploads forever.
- **`pair_person_id` is not stored.** "The friend this group is" depends on the viewer, so each phone derives it as the other member.
- **Pair tables get their own `id` plus a `UNIQUE` on the pair.**
- **`write_guard` uses a named `CHECK (0)`.** `RAISE` with an expression works on SQLite 3.51 but may not on D1's version.

### - [x] S3 · Schema: transactions, approvals, personal money, activity + guards
**Description:** The second half of `0011` (spec §2.7–2.9, `activity_log`):

- `transactions`, `transaction_payers`, `transaction_splits`, `transaction_items`
- `transaction_tags`, `recurring_rules`, `recurring_skips`, `transaction_history`
- `approvals`, `trust_settings`, `disputes`
- `assets`, `savings_goals`, `savings_transactions`
- `money_profiles`, `user_preferences`, `imported_transactions`
- `activity_log`

It also adds two guard tests:

- every server enum `CHECK` matches `constants/enums.ts`;
- every synced table follows §2.3.
**Acceptance:**
- [x] Refusals are proven for:
  - [x] a zero or negative payer/split amount
  - [x] a negative asset balance
  - [x] a savings transaction with no goal
  - [x] a bad `recurring_rules.mode`
  - [x] invalid JSON in `adjustments`
- [x] The enum guard fails when a value is added to `enums.ts` alone (proven by revert)
**Verification:** `npx jest src/__tests__/server`
**Dependencies:** S2
**Files:** `server/api/migrations/0011_v2_core.sql`, `src/__tests__/server/schema.test.ts`, `src/__tests__/server/schemaGuards.test.ts` (new)
**Scope:** M
**What actually happened (2026-09-24):**
- **Schema tests:** 9 more, including triggers that keep income and asset movements in a personal group (on insert and on update), a paused rule must carry `paused_at`, and a rejection must carry `decided_at`.
- **Guard tests:** 50 in all:
  - 25 enum pairs;
  - every `0011` table classified as synced, bundle child, feed or bookkeeping, and checked against that class's rules;
  - `0011` holds no `DROP` or `ALTER TABLE`.
- **Enum guard proven:** adding `'netbanking'` to `PAY_METHOD` alone turned the 3 `pay_method` pairs red.

### Checkpoint A — schema
- [x] All gates green (190 suites, 2509 tests; `tsc` clean, both sides) · `0011` is additive only (no `DROP`, no `ALTER` of an existing table) · nothing applied remotely

---

## Phase 2 · `sync-protocol` (server)

### - [x] S4 · Worker skeleton, the access function, and the shared-rules import — risk first
**Description:** Create `server/api/v2/`:

- `access.ts`: the one scope-access function (spec §3.1).
- `guard.ts`: `write_guard` statement builders.
- Wire the `/v2/sync/push` and `/v2/sync/pull` routes; they return 501 for now.

**Prove** that the Worker imports `budgetsplit/src/lib/{splitMath,permissions,trust}` and
`src/constants/enums`, in both `tsc` and `wrangler deploy --dry-run`. If it cannot, fall back to a
shared `packages/rules/` folder and record why.
**Acceptance:**
- [x] `npm run typecheck` and `wrangler deploy --dry-run` succeed with the import
- [x] Access tests:
  - [x] a non-member is refused
  - [x] an `invited` member is refused
  - [x] a `left` member is refused
  - [x] an `active` member is allowed
  - [x] a deleted group is refused
**Verification:** `npx jest src/__tests__/server/access` · `cd server/api && npm run typecheck && npx wrangler deploy --dry-run`
**Dependencies:** Checkpoint A
**Files:** `server/api/v2/access.ts`, `server/api/v2/guard.ts`, `server/api/index.ts`, `server/api/tsconfig.json`, `src/__tests__/server/access.test.ts`
**Scope:** M
**What actually happened (2026-09-24):** **The risk is closed: the import works directly, so no `packages/rules` fallback is needed.**
- `server/api/v2/rules.ts` re-exports `validateShares`, the trust rules and the permission rules from the app.
- Server `tsc` is clean with those app files in its graph.
- Every React Native and Expo reach in them is a *type-only* import, so `esbuild` erases it. Bundled on its own, `rules.ts` is 3.2 KB with zero `react-native`/`@expo` references.
- `wrangler deploy --dry-run` builds the whole Worker (71.67 KiB). The rules are tree-shaken out until S5's routes call them.

**Also built:**
- `access.ts`: `canReadScope`, `scopesFor` (readable plus revoked), `personOf`, and `groupContext` + `mayAdminister`, which map server rows onto the app's own `GroupContext`, so the owner is an admin by the same `isAdmin` the phone uses.
- `guard.ts`: `guard` and `versionIs` against an allowlist of tables, plus `isGuardFailure`.
- `/v2/sync/push|pull` now answer 501 behind authentication.

**Tests:** 10 access tests. Proven by revert: dropping the `active` and deleted-group conditions turned the invited, left/removed and deleted-group tests red.

**Config:** one line in `jest.config.js` (`modulePaths`), so server files resolve `@babel/runtime` from this package.

### - [x] S5 · Push: user-scoped entities
**Description:** `POST /v2/sync/push` for:

- `categories`, `friends`, `trust_settings`, `group_preferences`
- `assets`, `savings_goals`, `savings_transactions`
- `money_profiles`, `user_preferences`, `imported_transactions`

It includes idempotency (`devices.last_mutation_id`), compare-and-set on money, scope `seq`,
`activity_log`, and `sync_rejections`.
**Acceptance:**
- [x] The same push twice has the effect of one
- [x] A stale `baseVersion` on an asset produces a conflict rejection, and nothing is written
- [x] Writing into another user's scope produces a refusal
- [x] A preference change is last-write-wins
**Verification:** `npx jest src/__tests__/server/push`
**Dependencies:** S4
**Files:** `server/api/v2/push.ts`, `server/api/v2/entities/personal.ts`, `src/__tests__/server/push.test.ts`
**Scope:** M
**What actually happened (2026-09-24):** 15 tests. Three were proven by revert: removing the retry skip, the compare-and-set, and the scope fence each turned the matching test red. The main decisions:
- **Derived ids for rows with a natural key.** These are `money_profiles` (= user id), `user_preferences` (`user:key`), `friends` (`user:person`), `group_preferences` (`user:group`) and `trust_settings` (`user:person:group|*`). A reinstall or remap addresses the same row instead of hitting a unique index forever.
- **A friend with no account creates a placeholder person.**
- **Preference keys are allowlisted:** `budget_target`, `preferred_upi_app`, `onboarding_intent`, `currency`, `save_location`. Device state never travels.
- **System columns in a request body are ignored.**
- **A value the schema forbids becomes an `invalid` rejection, never a crash,** and the next mutation still lands.

### - [x] S6 · Push: groups and the transaction bundle (personal group)
**Description:** Create and update a `groups` row with its owner member. The transaction bundle
covers:

- the transaction itself;
- payers, splits, items, tags and the recurring rule;
- `transaction_history`.

The server stamps `author_id` and the timestamps, checks `validateShares`, and allows income and
`asset_id` only in a personal group.
**Acceptance:**
- [x] An unbalanced bundle is refused, and nothing is partly written
- [x] An `author_id` in the body is ignored and replaced by the session's person
- [x] Income in a shared group is refused
- [x] Every edit writes a history row
**Verification:** `npx jest src/__tests__/server/push`
**Dependencies:** S5
**Files:** `server/api/v2/entities/groups.ts`, `server/api/v2/entities/transactions.ts`, `src/__tests__/server/pushTransactions.test.ts`
**Scope:** M
**What actually happened (2026-09-24):**
- **Tests:** 15. Proven by revert: removing the payer-sum check, the in-batch membership guard and the author-only rule each turned its test red.
- **A fixture mistake of mine was caught along the way.** The first run named `user:…` persons who weren't members. Three refusal tests had passed for the wrong reason until the fixture was fixed and the reverts were run.
- **`push.ts` gained a `CustomSpec`.** Groups and transactions build their own batch but share the fence, compare-and-set, sequence, acknowledgement and rejection handling.
- **An account's person id is derived as `user:<id>`,** created on first group create, so a phone can compute its own id.
- **Transactions are written to personal groups only, until S19.** A shared one without approvals would count for people who were never asked.
- **A transaction never moves between groups:** delete it and add it again.
- **`activity_log` is written only for its enum's entity types**, the same as the phone's `audit_log`.

### - [x] S7 · Pull
**Description:** `POST /v2/sync/pull` (spec §3.3):

- per-scope cursors, and the list of scopes the user can read;
- a new scope starts at 0; revoked scopes are listed;
- pages of 500 rows, read in one batch;
- returns `lastMutationId` and the rejections for this device.
**Acceptance:**
- [x] Deletions arrive as tombstones
- [x] Ordering follows `seq`, never time
- [x] Two writes in the same millisecond both arrive
- [x] Joining a group returns its full history
**Verification:** `npx jest src/__tests__/server/pull`
**Dependencies:** S6
**Files:** `server/api/v2/pull.ts`, `src/__tests__/server/pull.test.ts`
**Scope:** M
**What actually happened (2026-09-24):** 12 tests.
- **Proven by revert:** a count-based page cut dropped the group's third row (seq-boundary test red), and removing the reset turned the wiped-database test red.
- **Page cut:** first work out how far every table is known complete, then cap the page on a seq boundary.
- **Transactions return as the push bundle:** payers, splits, items, tags, recurrence and skips, read in the same batch.
- **Member and friend rows carry `person_user_id`,** so `people` is never sent as a table.
- **Rejections are returned after `rejectionsAfter`.**
- **A cursor ahead of the server resets that scope** (a wiped dev database).

### Checkpoint B — server
- [x] All gates green (194 suites, 2561 tests; both `tsc` clean; bundle 109 KiB with the app's `validateShares` inside) · [x] a scripted push/pull round-trip with curl against real workerd + D1, in a throwaway `--persist-to` directory (mine):
  - `0011` applied, with `foreign_keys = 1` confirmed;
  - a request with no session got a 401;
  - a group, a transaction and an asset were created, and the author was stamped from the session;
  - a retried push was a no-op;
  - a stale create came back as a `conflict`;
  - the pull returned the bundle.

  **One pre-existing blocker fixed:** `index.ts` exported the string `SIGN_IN_SUBJECT` (since `8de7c8f`, 2026-08-17). Workers treats every named export of the main module as an entrypoint, so `wrangler dev` refused to start, and a fresh deploy would most likely fail the same way. The keyword was dropped; the constant was only used inside the file.

---

## Phase 3 · `personal-sync` (client)

### - [x] S8 · `rowMap`: phone rows ⇄ server rows
**Description:** A pure module, `src/lib/sync/rowMap.ts`, covering every mapping in spec §2.11:

- `txn` + recurrence columns ⇄ `transactions` + `recurring_rules`
- `tags` JSON ⇄ `transaction_tags`
- `person` ⇄ `people` + `friends` + `trust_settings`
- `money.*` ⇄ `money_profiles`

It comes with a completeness guard.
**Acceptance:**
- [x] A round trip of every table is lossless (phone → server → phone)
- [x] The guard fails when a local column is added and left unmapped (proven by revert)
**Verification:** `npx jest src/__tests__/rowMap`
**Dependencies:** S3 (can run alongside S4–S7)
**Files:** `src/lib/sync/rowMap.ts`, `src/lib/sync/ids.ts` (new — derived ids shared with the server), `src/__tests__/rowMap.test.ts`
**Scope:** M
**What actually happened (2026-09-24):** 33 tests: a `COLUMN_FATES` table naming every local
column's destination or reason it stays local, checked against the real schema (guard), plus a real
push→pull round trip through the actual Worker code for every table. Proven by revert: removing one
column's fate, unmapping a savings-goal field, and sorting tags before sending each turned their test
red. `ids.ts` holds the derived-id functions (`syncIds`, `selfPersonId`) as their own file because the
Worker imports them too (via `server/api/v2/rules.ts`), so phone and server can never build an id
differently.

### - [x] S9 · The queue covers every entity
**Description:** A new local table, `sync_queue` (`(local_table, local_id)` unique, replace-on-write),
plus `sync_version` (the last server version confirmed per row). `db/queries/syncQueue.ts` adds
`queueUpsert`/`queueDelete`/`queueUpsertWhere`, called inside the caller's existing transaction. A
**source-scanning guard** requires every writer of a synced local table to queue its change.
**Acceptance:**
- [x] The guard lists today's unqueued writers (48, before S10–S11)
- [x] Existing outbox behaviour is unchanged for `txn`
**Verification:** `npx jest src/__tests__/syncQueueCoverage`
**Dependencies:** S8
**Files:** `src/db/schema.ts`, `src/db/queries/syncQueue.ts` (new), `src/db/queries/syncOutbox.ts`, `src/lib/backup.ts` (never-backed-up), `src/__tests__/syncQueueCoverage.test.ts` (new)
**Scope:** M
**What actually happened (2026-09-24):** a new table rather than extending `sync_outbox` — v1's
outbox is keyed on `txn` alone and stays for the v1 engine until S22 retires it; `sync_queue` is
generic across all 12 synced local tables. Deletes carry a JSON `snapshot`, because a category or
budget line's server id is derived from columns (kind+name; group+category+owner) that no longer
exist once the row is gone. `queueEntry`/`queueSeries` (v1) now also feed `sync_queue`, so `txn`
writers needed no separate change. Both new tables are added to `NEVER_BACKED_UP`.

### - [x] S10 · Queue the money writers
**Description:** Wire the queue into the writers for:

- transactions (all kinds, including personal)
- assets, savings goals and savings transactions
- the money profile
**Acceptance:**
- [x] The guard's list shrinks to the non-money writers
- [x] `crossSurfaceConsistency` passes
- [x] The write paths each leave exactly one outbox row per changed entity
**Verification:** `npx jest`
**Dependencies:** S9
**Files:** `src/db/queries/assets.ts`, `src/db/queries/transactions.ts` (the asset side of a reversal), `src/db/queries/moneyProfile.ts`
**Scope:** M
**What actually happened (2026-09-24):** transactions were already covered by S9 (queueEntry/queueSeries);
this task was the 8 asset writers plus `reverseAssetSide` plus the money profile. Savings moved to S11
alongside the other non-transaction writers, since none of them are money-critical enough on their own
to need a separate checkpoint (`savings_goal`/`savings_txn` are compare-and-set on the server regardless
of which task queued them).

### - [x] S11 · Queue the other writers
**Description:** Categories, budgets, people/friends, trust, group preferences, savings, recurring
skips, the Review inbox.
**Acceptance:**
- [x] The outbox guard is green, with no allowlist entries left unexplained
**Verification:** `npx jest`
**Dependencies:** S10
**Files:** `src/db/queries/{categories,categoryBudgets,groups,persons,savings,recurring,pending}.ts`
**Scope:** M
**What actually happened (2026-09-24):** 40 writers across 7 files. `renameCategory` and
`setCategoryBudgets` needed the most care: a rename retires the old (kind, name) server row and
creates the new one (a category *is* its natural key), and a wholesale budget save now queues a
delete-then-upsert per line rather than assuming ids are stable. Three pre-existing guard tests
(`settlementSurfaces`, `txnInvariant`, `savingsEngine`) needed a one-line allowance each for the new
`sync/rowMap.ts` file and the new queued statements — each with a written reason, not a suppression.

### - [x] S12 · Client engine v2 — push, pull, apply
**Description:** `src/lib/sync/engine.ts` (orchestration) and `src/db/queries/syncApply.ts` (all SQL).

- Push the queue in mutation order, then pull.
- Clear queue rows once `lastMutationId` covers them.
- Apply rows through `rowMap`.
- **A pending local mutation wins** until it is answered.
- A rejection reverts the entity to the server's copy.
- Triggers: at launch, when the app comes to the foreground, and 2 s after a write.
**Acceptance:**
- [x] The pending-wins rule is tested
- [x] A rejection revert is tested
- [x] A pull never duplicates an `audit_log` row (same id)
**Verification:** `npx jest src/__tests__/syncEngineV2`
**Dependencies:** S7, S11
**Files:** `src/lib/sync/engine.ts`, `src/lib/sync/run.ts` (new — the app's entry point), `src/lib/sync/index.ts` (new — barrel), `src/db/queries/syncApply.ts`, `src/lib/serverApi.ts` (the v2 transport), `src/__tests__/syncEngineV2.test.ts`, `app/(tabs)/_layout.tsx`
**Scope:** M
**What actually happened (2026-09-24):** 8 tests, run against the real Worker push/pull code on an
in-process D1 — nothing about the server is mocked. Proven by revert: minting a fresh mutation id on
every retry (rather than reusing a saved one), skipping the pending-wins check, and a naive collapse
key (dropping the `entity+entityId` grouping) each turned a test red. Idempotency needed one refinement
beyond the plan: mutation ids are reserved and saved to the queue **before** the network call, so a
push whose reply is lost is retried under the *same* ids next time — the server then skips what it
already applied, rather than seeing a second write. Wired into the tabs layout alongside v1's `runSync`
(launch, foreground, and 2 s after a write via `useDataRefresh`'s `version`), gated inside on the
ledger being linked to the signed-in account (S13's job).

### - [x] S13 · Identity binding + the `is_me` remap — highest risk
**Description:** On sign-in, the local `is_me` person takes the account's `people.id`, and every
local reference is re-pointed in **one** local transaction. This replaces `claimMyAccount` and
`bindDeviceToAccount` for v2.
**Acceptance:**
- [x] A **preservation test** proves every money figure is identical before and after the remap:
  - [x] cash
  - [x] net worth
  - [x] each group's net balance
  - [x] the budget pace
- [x] A failure midway leaves the phone exactly as it was
**Verification:** `npx jest src/__tests__/identityRemap`
**Dependencies:** S12
**Files:** `src/db/queries/identity.ts` (new), `src/__tests__/identityRemap.test.ts` (new), `src/__tests__/syncQueueCoverage.test.ts` (new exemption), `docs/SYSTEM.md` (module count)
**Scope:** M
**What actually happened (2026-09-24):** 8 tests (cash/net-worth/Safe-to-Spend covered together via
`getSafeToSpend`, which touches all three; "budget pace" folded into the same check rather than a
separate query, since nothing in the codebase computes pace as its own standalone function).
Proven by revert: dropping `audit_log` from the remap-columns list, skipping the id-clash guard, and
overwriting an existing email each turned their test red.

**One real bug found and fixed, not just tested around:** `REMAP_COLUMNS` re-points every *child* row
to the new id before flipping `person.id` itself — but the test harness (`node:sqlite`) defaults
`PRAGMA foreign_keys = ON`, unlike the device (`DQ-19`, always OFF), and neither order of
child-then-parent or parent-then-child satisfies an enforced FK mid-transaction: renaming a
referenced primary key needs the constraint off for that statement, full stop. `remapIdentity` now
reads the pragma's current value, turns it off only if it was on, runs the remap, and restores
exactly what it found — a no-op on the device today, and correct if foreign keys are ever turned on
there. Also caught: `identity.ts`'s two writers (`remapIdentity`, `remapAssignedTo`) needed a new
`syncQueueCoverage` exemption — the remap changes no content the server needs telling about, since
the server independently computes the same new id from the account and sync only starts after this
runs, so every write already carries the corrected id by the time anything is queued.

### - [x] S14 · First sign-in: upload, restore or ask
**Description:** The three cases in spec §4, each atomic:

- **Upload:** the account is empty and the phone has data.
- **Restore:** the phone is fresh. This skips onboarding and answers `DQ-89`.
- **Ask:** both have data. **"Use my account"** exports this phone to a file first, then replaces
  it; **"Not now"** signs out.

The "I have an account" door in onboarding now restores.
**Acceptance:**
- [x] Each case is tested
- [x] Nothing is ever left half-done
- [x] The phone's data is never replaced without an export file written first
**Verification:** `npx jest src/__tests__/firstSignIn` · Device at Checkpoint C
**Dependencies:** S13
**Files:** `src/lib/sync/firstSignIn.ts`, `src/components/system/onboarding/SignInStage.tsx`, `src/hooks/useEmailSignIn.ts`, `src/__tests__/firstSignIn.test.ts`
**Scope:** M
**What actually happened (2026-09-25):** 14 tests against the real Worker push and pull on an
in-process D1. Proven by revert: dropping the queue backfill, the rollback and the export-before-wipe
each turned 2 tests red.
- **The upload needed a backfill the plan didn't name.** Writers only queue what they change from
  now on, so a ledger written before this build has nothing queued, and an upload would have "worked"
  while sending nothing. `linkLedger` (in `identity.ts`) remaps, queues every existing row and links
  the account in **one** transaction.
- **The case is decided by a read-only pull from cursor 0.** `phoneHasData` ignores the first-run
  seed (me, Personal, the category catalog), so a fresh install counts as empty. A phone already
  linked to *another* account is always asked about and never uploaded into this one.
- **Restore and "Use my account" are one function.** Snapshot → export (if asked) →
  `restoreAllTables` to empty → seed "me" as `user:<id>` → pull until nothing is left. Any failure
  puts the snapshot back and unlinks the phone. The seeded Personal group is dropped, so the phone
  ends with the account's group, not two.
- **The export file** is plain JSON in the backup's payload shape, written to Documents (visible in
  Files). No passphrase: that would stand between someone and their own account. **Risk:**
  Backup & restore can't open it yet, because it takes only encrypted files.
- **The emailed link skipped all of this.** `app/auth.tsx` called `claimMyAccount` directly. Both it
  and the typed code now go through `useEmailSignIn.signInWithToken`. A failure while settling signs
  back out, since "signed in but never linked" is a state sync can't leave.
- **Found and fixed:** backups carried `sync2.*` keys (device id, cursors). `isDeviceOnlySetting`
  now excludes them, for the same reason it already excluded v1's `sync.*`.
- `run.ts` puts sync and first sign-in behind one lock, and sync pauses while a restore runs.
  `txnInvariant` and `approvalInvariant` each got two reasoned allowances for the new queries.
- **Interim UI:** Ask is an `Alert`, and restore shows a count, not a percentage (the pull has no
  total). S15/S16 replace both.
- **Open risk:** someone who signed in on an older build has a session but no link, so sync never
  runs for them. S16's "Failed — sign in" state is where that surfaces.

### - [x] S14b · Sign-out: upload first, then empty the phone (`DQ-97`, added 2026-09-25)
**Description:** Spec §4.1. Sign-out runs one sync, then:

- **Nothing waiting:** wipe the phone back to a fresh install and return to Welcome.
- **Changes waiting:** warn with the count. **Cancel** is the default; **Sign out anyway** writes
  an export file first, then wipes.
- **Never linked** to this account: sign out and keep everything.

The wipe is one exclusive transaction under `restoreGuard`, and the session is cleared only after
it commits. The sign-out copy on `settings/account.tsx` changes to match.
**Acceptance:**
- [x] A linked phone with an empty queue ends with no ledger rows, no `sync2.*` keys and one fresh
      `is_me`, and signing in again restores every figure (preservation test through the D1
      harness: cash, net worth, each group's balance, a goal's balance)
- [x] A queued change blocks the silent path; "Sign out anyway" never wipes before the export
      file exists (proven by making the export throw)
- [x] A phone that was never linked keeps every row
- [x] A failure midway leaves the phone as it was, and still signed in
**Verification:** `npx jest src/__tests__/signOut` · Device at Checkpoint C
**Dependencies:** S14 (the Restore case is how the data comes back)
**Files:** `src/lib/sync/signOut.ts` (new), `src/db/queries/wipe.ts` (new, or beside `restoreAllTables`), `app/settings/account.tsx`, `src/__tests__/signOut.test.ts`
**Scope:** M
**What actually happened (2026-09-25):** 8 tests on the D1 harness, including the round trip:
wipe, then sign in again, and every figure matches. Proven by revert: skipping the sync first,
exporting after the wipe, and splitting the wipe into two transactions each turned their tests red.
- **One clear step, shared.** `restoreAllTables`' delete half became `clearLedgerRows`, used by the
  restore and by `wipeToFreshInstall`, so the two can never disagree about what "this phone's data"
  is. The first-run rows came out of `seedIfNeeded` as `insertFirstRunRows`, so a wiped phone is
  exactly a new install. The clear and the new "me" commit in **one** exclusive transaction (the
  `beside restoreAllTables` option — no separate `wipe.ts`).
- **The flow is a hook,** `useSignOut`: confirm → `planSignOut` (one sync, then count what is left)
  → warn if anything is waiting → wipe → **then** clear the session → `settings.resetAll()`
  (AsyncStorage) → reminders rescheduled, orphaned photos reaped → back to Welcome through
  `OnboardingGate`'s new `useRestartOnboarding`. The export file is written to Documents, as S14's is.
- **The Account footnote** said data "lives only on this device". It sat directly under the Sign
  out row and would now be false, so it was rewritten here rather than waiting for S23.
- `syncQueueCoverage`'s restore exemption moved to `clearLedgerRows`, with the same reason.
- **Interim UI:** both confirms are `Alert`s, until S15/S16.

### Checkpoint C — DEVICE, yours
- [ ] Sign in → reinstall → sign in → Home shows the same numbers, including Plan, Reports and a
      goal's balance
- [ ] Airplane mode: add an expense, turn the network back on, and it uploads
- [ ] Sign out → the app is empty, back at Welcome → *I have an account* → everything is back
- [ ] Airplane mode: add an expense, sign out → the warning names 1 change; Cancel keeps it

---

## Phase 4 · `sync-ux`

### - [x] S15 · Layout options, no code — you pick
**Description:** Two or three options each, using the existing components (`Card`, `ListRow`,
`Banner`, `PrimaryButton`, tokens), for:

- the `SyncStatus` line and where it sits;
- the upload, restore and ask screens;
- the conflict view (yours vs theirs);
- the History list.

This follows `feedback_numbers_vs_layout`.
**Acceptance:**
- [x] You picked one of each
**Verification:** your choice
**Dependencies:** None (can start now)
**Files:** none
**Scope:** S
**Picked (2026-09-25):**
- **Status line:** a quiet line at the top of Settings → Sync and Settings → Account, nowhere else
  (on Account, tapping it opens Sync).
- **First sign-in (upload / restore / ask):** a full-screen step in onboarding's look — icon, title,
  one sentence, a progress bar, two buttons for "ask". Replaces S14's interim `Alert` and cards.
- **Money conflict:** two stacked cards, "Yours" above "Theirs", differing fields highlighted, a
  "Keep" button on each.
- **History:** extend the existing timeline at the bottom of the transaction screen; server changes
  appear in it with the person's name.

### - [x] S16 · Build `SyncStatus` and the first-sign-in screens
**Description:** One `SyncStatus` component with five states (spec §6.1). Wording follows the spec:
offline is neutral, not an error; progress is a percentage; every failure names its fix. It goes on
Settings → Account and on the Sync screen. The three first-sign-in screens are built to the chosen
layout.
**Acceptance:**
- [x] One component serves every status surface (a guard counts its call sites)
- [x] No status appears on Home
- [x] Reduce Motion is respected
**Verification:** Device
**Dependencies:** S14, S15
**Files:** `src/components/system/SyncStatus.tsx`, `app/settings/account.tsx`, `app/settings/sync.tsx`, the first-sign-in stage file(s)
**Scope:** M
**What actually happened (2026-09-25):** 12 tests (`syncStatus.test.ts`). The call-site guard allows
exactly Account and Sync for `SyncStatus`, and exactly the three ways in for `FirstSignInStep`.
- **A real percentage needed the server.** Pull now returns each scope's `head` (its latest seq),
  so progress is `Σcursor / Σhead`: the one denominator the server has. The push counts as the first
  10%. A restore runs several sync passes, so its bar only ever moves forward.
- **"Offline" has no network library behind it.** `fetch` rejects with a `TypeError` when there is
  no connection, and `classifySyncError` (in `run.ts`, which owns the network) reads that. The engine
  just hands the error up, so it stays free of the network layer.
- **The line is pure.** `lib/syncStatus.ts` turns (syncing, progress, failure, waiting, linked, last
  synced) into one of the states and the spec's wording, with a fixed precedence:
  syncing → signed out → not connected → offline → failed → waiting → up to date.
  `useSyncStatus` feeds it from an in-memory activity store in `run.ts` plus the database, and
  re-reads after every write.
- **A sixth state the spec didn't name: "not connected".** Someone who signed in on an older build
  has a session and no link, so sync never runs. The line says so and offers **Connect**, which is
  `useEmailSignIn.connect()`: the same first-sign-in decision, for the account already signed in.
  (This closes S14's open risk.)
- **The ask is a screen, not an `Alert`.** `useEmailSignIn` holds the choice as state and resolves
  it from the two buttons. `SignInStage` now owns its `StepScaffold`, so it can swap the whole step
  for `FirstSignInStep`.
- **Caught before it shipped:** `SignInStage`'s two entry views were components declared inside the
  render, which would have remounted the field and dropped the keyboard on every keystroke. They are
  plain functions now.

### - [x] S17 · Refused and conflicting changes; a transaction's History
**Description:**

- **Refused change:** a `Banner` on the transaction, and the change reverts.
- **Money conflict:** "Keep yours or theirs?", shown side by side and also listed in Review. It is
  never merged.
- **History:** a list on transaction detail, loaded on demand from `transaction_history`.
**Acceptance:**
- [x] Both surfaces render from `sync_rejections` (the phone's record of them)
- [x] History shows who changed what, and when
**Verification:** Device
**Dependencies:** S16
**Files:** `app/txn/[id].tsx`, `src/components/finance/txn/ConflictCard.tsx`, `src/components/finance/txn/HistoryList.tsx`, the Review filter
**Scope:** M
**What actually happened (2026-09-25):** 10 tests (`syncConflicts`, `txnHistory`), on the real Worker
code. Proven by revert: the bare-row conflict (below) and dropping the History access check each
turned their test red.
- **A real money bug, found by the first conflict test.** On a transaction conflict the server
  handed back the bare `transactions` row as "its copy", with no payers or splits. The phone applied
  it and deleted the transaction's payments: the amount vanished from that phone. The full version
  from the same pull had been skipped, because the phone's own change was still pending. The server
  now returns the whole bundle (`transactionBundle`, extracted from pull, so both build it the same
  way).
- **"Keep yours" was impossible until yours was kept.** A rejection used to throw this phone's version
  away. `applyRejection` now records both sides for a transaction conflict. **Keep yours** re-applies
  yours and queues it as an edit on top of theirs (their version becomes the base), so the server
  accepts it and every phone ends on yours. **Keep theirs** only stops asking.
- **History needed an endpoint:** `GET /v2/transactions/:id/history`, readable only by whoever can
  read the transaction; a missing id and a forbidden one look the same. `lib/txnHistory` compares
  consecutive snapshots: "Aarav changed ₹400 → ₹450", "You changed Food → Travel, the note". It uses
  whole rupees unless the change is in the paise. The conflict card shows exact amounts, since it's a
  money choice.
- **Files:** `ConflictCard` and `HistoryList` (the timeline, extracted from `txn/[id].tsx`),
  `useTxnSyncState`, `db/queries/syncConflicts.ts`. Review shows a banner for open conflicts; the
  choice is made on the transaction.
- **Scope note:** only transaction conflicts get the two-card choice, which is what the spec names. An
  asset, goal or budget conflict still resolves to the server's copy and is recorded.

### Checkpoint D — DEVICE, yours
- [ ] Offline, syncing, up to date and failed states all read right
- [ ] The restore screen shows real progress

---

## Phase 5 · `shared-groups`

### - [x] S18 · Server: members, invites, roles, leave, remove
**Description:** These arrive as mutations on `group_members`:

- invite: a linked account, admin-only;
- accept;
- leave;
- remove: admin-only, and never the owner;
- role change: admin or owner, and never the owner's own role.

Placeholder members are allowed. `revoked` scopes are delivered on pull.
**Acceptance:**
- [x] A plain member inviting is refused. This closes `SYNC-F24`.
- [x] A removed member's next pull lists the group as revoked. This closes `SYNC-F16`, and with no
      key left to rotate it also closes `SYNC-F17`.
- [x] The owner can't be removed or demoted, and there is always an admin. This closes `SYNC-F20`.
**Verification:** `npx jest src/__tests__/server/members`
**Dependencies:** Checkpoint C
**Files:** `server/api/v2/entities/members.ts`, `server/api/v2/access.ts`, `src/__tests__/server/members.test.ts`
**Scope:** M
**What actually happened (2026-09-25):** `server/api/v2/entities/members.ts`, registered in
`v2/sync.ts`; the pull now also returns `invites` (memberships of mine still `invited`). 12 tests in
`server/members.test.ts`. Proven by revert: the admin check and owner-can't-leave each turned a test red.
- **An admin re-sending `active` for someone still invited is a no-op, not an error.** The phone has
  no "invited" state, so any re-save of the row (a role change) sends `active`; refusing that would
  have made every admin edit on an invited member fail. Only the invitee's own mutation accepts.

### - [x] S19 · Server: shared transactions, approvals, disputes
**Description:**

- Only the author may send a new version of a transaction.
- Every payer and split must be an active member.
- For each other account holder the transaction names, write their `approvals` row using the
  **imported** `requiresMyApproval` against their `trust_settings`.
- An approve, reject or reopen is the recipient's mutation. A rejection writes `disputes`.
**Acceptance:**
- [x] B editing A's transaction is refused, including by a direct API call. This closes `SYNC-F15`.
- [x] "I paid you" always creates a pending approval, whatever the trust setting.
- [x] Rejecting creates a dispute that A pulls.
- [x] `activity_log.actor_id` is set. This closes `SYNC-F22`, with History.
**Verification:** `npx jest src/__tests__/server/sharedTransactions`
**Dependencies:** S18
**Files:** `server/api/v2/entities/transactions.ts`, `server/api/v2/entities/approvals.ts`, `src/__tests__/server/sharedTransactions.test.ts`
**Scope:** M
**What actually happened (2026-09-25):** `server/api/v2/entities/approvals.ts`; `transactions.ts` is no
longer personal-only (`approvalsForWrite/Delete`). 9 tests in `server/sharedTransactions.test.ts`,
revert-proven; `pushTransactions.test.ts`'s interim "shared groups refused" test flipped to positive.
- An approval row lives in the **recipient's** user scope, id `${txnId}:${userId}`. A rejection upserts
  `disputes` (group scope) under the same id. Deleting an approved entry marks it
  `is_pending_delete = 1` rather than removing it (`DQ-31`).
- Approvals go in the batch **after** the transaction insert, because D1 enforces the foreign key.

### - [x] S20 · Client: group flows on v2
**Description:** Move these onto v2 mutations, replacing `shareGroup`, `acceptGroupInvite`,
`announceGroupExit` and `removeMemberFromGroup`'s missing server leg:

- invite, accept, leave, remove;
- role change;
- adding a placeholder member.
**Acceptance:**
- [x] Each flow round-trips in a test through the D1 harness
**Verification:** `npx jest`
**Dependencies:** S19
**Files:** `src/db/queries/{groups,persons}.ts`, `app/group/[id]/members.tsx`, `src/lib/sync/engine.ts`
**Scope:** M
**What actually happened (2026-09-25):** 13 round-trip tests in `groupFlowsV2.test.ts`: two phones,
two accounts, one in-process D1, real app queries on both sides. Invite, accept (and offline accept),
decline, admin re-save, placeholder, role, remove → archived, leave, owner can't be removed, and three
friend-becomes-account cases. Proven by revert, one at a time: the server's no-op accept,
`ensurePerson`'s derivation, the `group_invite` outbound case, the engine's pull-time adoption,
`setInvites` hiding answered cards, release on unbind, `matchAccount`'s fold, and the
`setRemoteUid` ordering.
- **A friend with an account takes the account's person id, `user:<uid>`** (`adoptAccountId`, new
  `db/queries/personRemap.ts`). Otherwise a shared group's pull creates a second local person for the
  same human. Called from `setRemoteUid`, and from the pull (before `applyScope`) for people bound
  before S20. When the pull already brought them, the two rows fold into one, and my name and trust
  for them win.
- **Unbinding gives the id back** (`releaseAccountId`, a fresh local id). A row still called
  `user:<wrong account>` would have caught that account's rows on the next pull.
- **Linked people now goes through `matchAccount`.** If the account's current person shares a group
  with me, matching someone else folds into it and unmatching is refused (the server knows that row
  as the account). Otherwise the account moves, as before.
- **Two real bugs, both found by the round-trip tests:**
  - **Invitations never reached the invitee.** The phone sends the linked friend first, and that
    created the server's `people` row with no account. `INSERT OR IGNORE` kept it that way, and
    invites are found by `people.user_id`. Fixed by `ensurePerson` (`v2/utils/access.ts`): `user:<X>`
    is X's person whichever write names it first. It replaces all three insert sites.
  - **`setRemoteUid` wrote `remote_uid` before moving the row.** So linking someone a shared group had
    already brought hit the unique index, and the merge was unreachable. The move writes it now.
- **Accepting is queued** as `local_table = 'group_invite'`, because there is no local row yet.
  `answerInvite` sends the answer and `setInvites` keeps an answered card hidden until the server has
  it.
- Screens: Sync settings uses `pendingInvites`/`answerInvite`, names the group and inviter, and syncs
  straight away. Edit group no longer calls v1 `announceGroupExit` or `stopSyncingGroup` (leave and
  delete queue themselves). `ShareGroupRow` is deleted: adding an account holder *is* inviting them.
- **Left for later:**
  - **S21:** the server-side placeholder merge. Rows already on the server that name a friend's old
    placeholder id are not re-pointed when that friend is adopted, locally or by
    `releaseAccountId`, in either direction.
  - **S21:** an invited member shows as a full member on the admin's phone (the phone has no invited
    state; `serverToMember` drops the row).
  - **S22:** `stopSyncingGroup` has no callers left (v1 outbox/cursors) and goes with the v1 stack.

### - [x] S21 · Client: approvals and disputes from the server; v1 ingest retired
**Description:** `txn_approval` and `txn_dispute` are now filled by the pull, and the phone's own
approve/reject become mutations. This removes the v1 pieces from the live path:

- `ingestPeerTxn`, `adoptGroup` and `toPeerEnvelope`;
- the roster.
**Acceptance:**
- [x] `crossSurfaceConsistency` and `approvalInvariant` pass unchanged
- [x] Placeholder merge works once a friend signs up and links
**Verification:** `npx jest`
**Dependencies:** S20
**Files:** `src/db/queries/{approval,syncApply}.ts`, `src/lib/sync/engine.ts`, affected tests
**Scope:** M
**What actually happened (2026-09-25):** `approvalsV2.test.ts` (8) and `placeholderMerge.test.ts` (5)
round-trip on the D1 harness. Every change below was revert-proven one at a time. The pull already
filled `txn_approval` and `txn_dispute`; the work was the write side, retiring v1 from the live path,
and three problems the round trips found.
- **Decisions travel as answers** (`queueAnswer`, `local_table = 'txn_approval'`). Approve, reject,
  reopen and both retraction answers each queue one; the drain sends an `approvals` mutation. It's the
  answer, not the row, because after refusing a retraction the row reads "approved" while the server
  must hear "rejected". An answer not yet sent wins over a pull. `group_invite` now uses the same
  writer.
- **A retraction keeps counting until I agree (`DQ-31`), on the phone too.** The server marks it
  `status = 'pending', is_pending_delete = 1`. Mapped literally, the phone dropped the entry from my
  figures before I'd answered. `serverToApproval` now maps it to `approved` + the flag. The author's
  delete arrives with the group first; the approval pass (now run after group scopes) brings an entry
  I accepted back to life, shares intact. A withdrawn approval (an edit that no longer names me)
  deletes the local row, or the entry would stay hidden from me forever.
- **Group scopes apply before my own scope.** My approvals name transactions that live in groups.
- **Found by the round trips:**
  - **Splitting with someone just invited was refused.** "Everyone named must be an active member"
    meant add-a-friend-then-split-the-bill failed until the friend accepted. Invited members can now
    be named. Their consent is intact: they read nothing until they accept, and the entry waits for
    their approval.
  - **An invitee was sent approvals for a group they couldn't read yet.** On the device that's a row
    about a transaction that isn't there; in the harness, a failed sync. The pull now delivers
    approvals only for readable groups, and accepting re-sequences that group's approvals so they
    arrive with it.
  - **The admin's phone passed an invited member off as in.** New local `group_member.invited`:
    predicted at add (`INVITED_ON_ADD`), corrected by the pull (`serverToMember` no longer drops
    invited rows), shown as an "Invited" badge on Members.
- **Placeholder merge (acceptance 2)**, per SPEC §2.2 ("every reference is repointed in one batch"):
  - A new `person_merges` mutation (`server/api/v2/entities/merges.ts`). It moves memberships
    (keeping status), payers, splits, itemised lines, trust, budget lines and friend rows onto the
    account's person. It bumps every entry that changed so every phone re-pulls it, and asks the
    account about each (`askOne`, extracted from `approvalsForWrite`).
  - Allowed only for whoever made the placeholder or shares a group with it, and only into an
    account they have a **live link** with. Linking is the consent. A placeholder the server never
    saw is a no-op.
  - The phone queues the merge when it adopts an account id. Other phones learn it from the pull
    (`person_merged_into` on member and friend rows) and fold their copy without queueing anything.
    Queuing there would have made the account a friend of every member of the group.
- **v1 is off the live path:** the tabs layout no longer calls `runSync` (so no `ingestPeerTxn`,
  `adoptGroup` or roster). Its "two people called X" prompt is gone too, since v2 folds by account
  id. The "group ended / you were removed" message survives on v2: the pull now says *why* a group
  was revoked (`revokedWhy`), a deleted group gets `deleted_at` locally, and each group is announced
  once (the pull cursor is the marker, so unarchiving to look back isn't undone).
- **Left for S22:** `app/settings/sync-log.tsx` (the v1 outbox screen) still has a manual `runSync`
  button, and `stopSyncingGroup` has no callers.

### Checkpoint E — DEVICE, yours: two phones, two accounts, one group
- [ ] An expense on A appears on B
- [ ] "I paid you" waits on B
- [ ] B's rejection shows on A
- [ ] Removing B stops B's syncing
- [ ] B cannot edit A's transaction

---

## Phase 6 · `retire-e2e`

### - [x] S22 · Delete the zero-knowledge stack
**Description:** Delete:

- `lib/groupCrypto.ts`, `lib/deviceKey.ts` and `lib/syncEngine.ts` (v1);
- the roster and `PersonRef` code in `syncDoc.ts`;
- server passphrase backup (client and Worker);
- the v1 `/sync/*` and `/backups` routes.

Delete v1's tables from `0001_schema.sql` directly — no second migration file. Local file export and app lock keep their passphrase.
**Acceptance:**
- [x] `deadComponents` and the import guards pass
- [x] Nothing references a deleted module
**Verification:** full gates
**Dependencies:** Checkpoint E
**Files:** the deleted modules, `server/api/index.ts`, `server/api/migrations/0001_schema.sql`
**Scope:** M
**What actually happened (2026-09-25):** Run before Checkpoint E, at the user's "close all the things".
S21 had already taken v1 off the live path, so this deleted code that no longer ran, and all of it is
recoverable from git. Checkpoint E stays the user's. Code gates were green after it; the six doc
guards went red until S23 fixed the docs.
- **Deleted, client.** 12 modules, 13 v1-only tests, and the `ShareGroupRow`, `ServerBackupSheet` and
  `RecoveryCodeSheet` components:
  - `lib/{syncEngine,groupCrypto,deviceKey,groupSyncStatus,syncSnapshot,backupStatus,recoveryCode}`;
  - `db/queries/{peerIngest,syncOutbox,syncDoc}`;
  - `app/settings/sync-log`.
  - `claimMyAccount` and `mergePerson` also went: v2 folds people by account id.
- **What survived the cut:**
  - `queueEntry`/`queueSeries` fed both queues, so their v2 half moved into `syncQueue.ts`.
  - `disputesFor` moved into `approval.ts`, and now compares against the server's version rather than
    v1's `txn.sync_version`.
- **Deleted, server.**
  - `/sync/*` and `/backups` routes and their handlers.
  - The v1 tables `backups`, `device_key` and `sync_*` from `0001_schema.sql`, plus the constants and
    types only they used.
  - On the phone, `sync_outbox` is dropped (idempotently, on open) and `txn_approval.dispute_state` is
    no longer written.
- **Account deletion now erases the account's copy (`v2/erase.ts`, 3 tests, revert-proven).** v1 could
  promise nothing readable was left because nothing readable was sent; `DQ-93` made that false.
  - It removes the user's own scope, every group that is theirs alone, and their devices, in one batch
    under D1's foreign keys (cutting the rule↔occurrence cycle first).
  - Shared groups keep their record: the membership becomes `left`, and the other phones are told by
    seq. See `B-09`.
- **Screens.**
  - Sync settings has no switches now: signing in joins, signing out leaves. Its four facts are true of
    v2, including "the server can read it". It keeps the existing order, and only dead controls were
    removed.
  - Backup keeps the local file only.
  - Restoring a file while joined to an account now says "sign out first" (F9 on v2).
  - The launch prompt keeps only "Used BudgetSplit before? Sign in brings everything back".
  - Settings' backup row says "On your account" when joined, instead of an amber "Never backed up".
  - The person screen's sync note is now "hasn't accepted <group> yet".
- **Tests moved to v2 fixtures** (a subagent, test files only): `peerApproval` 41→20 (the 21 dropped
  tested `ingestPeerTxn`'s own gate and the v1 dispute outbox; the server owns both now, covered by
  `approvalsV2`), `removeMember` 13→11, `deleteAndLeaveGroup` 12→11, `seedCoversFlows` unchanged.
  New helper `addPeerTxn`.
- **One gap it found, fixed:** an approval answer could be queued for my *own* entry. `answer()` now
  checks the author; revert-proven.

### - [x] S23 · The words catch up; the spec goes to history
**Description:** Rewrite everything that still says "the server can't read it":

- the hero tagline and the backup wording;
- `docs/SYNC-MODEL.md`, in full;
- `SYSTEM.md` §1 egress and its sync sections; `SCREENS.md`;
- the store and privacy answers (`B-08`, `B-13`).

Close the tracker rows. `SPEC-SERVER.md` goes to `docs/history/`.
**Acceptance:**
- [x] No live doc or on-screen string promises the server can't read the data
- [x] `SYNC-F15`/`16`/`17`/`22`/`24` are `DONE` (`F20` reworded and kept open — see below)
**Verification:** full gates · `node scripts/build-system-map.js /tmp/map.html`
**Dependencies:** S22
**Files:** `docs/*`, `src/components/system/Onboarding.tsx` (tagline), backup copy file(s), `SPEC-SERVER.md`
**Scope:** M
**What actually happened (2026-09-25):** Done in two sessions; the second began with two things the
user queued ahead of the docs.
- **The "v2" name is gone**, now there is no v1 to tell it from: `server/api/v2/` → `server/api/sync/`
  (its `sync.ts` → `routes.ts`), routes `/sync/push`, `/sync/pull`, `/transactions/:id/history`,
  `*V2` identifiers and test files (`syncEngine`, `groupFlows`, `approvals`, `helpers/syncWorld`).
  On-device `sync2.*` keys kept — renaming them would unlink every joined phone.
- **MW-22 fixed, revert-proven:** a trusted author editing an entry I had refused overrode my refusal,
  because `askOne` upserted `approved` from trust alone. A prior `rejected` now comes back `pending`.
  One round-trip test in `approvals.test.ts`.
- **Docs.** SYSTEM (`E-82` deleted, `E-88` rewritten as the sync wire, `FE-54`/`58`/`59`, `SC-44`
  retired, the old duplicate `SN-32` ladder removed, route count 46→45, `backOr` 5→6 files), SCREENS
  §13 and §19, AGENTS §13 and the stack table, RELEASE_CHECKLIST §0b/§3.1, the server README.
  An earlier S23 edit had overwritten the settle ladder's closing paragraph; restored from HEAD.
- **Privacy, the part that matters.** Help's *"The server cannot read your groups"*, the UPI-ID hint,
  the sign-in email footer and the store listing all said sync was sealed. The store's **Financial
  info "not collected"** answer was the serious one: it is now declared collected and linked, with
  User content (`B-13`). `B-08`/`B-09` say what the policy and DPDP posture now have to cover.
- **Account deletion copy** says what `erase.ts` does, not v1's "your backups are deleted".
- **Tracker.** `SYNC-F15`/`16`/`17`/`22`/`24` closed with their tests. `SYNC-F20`'s adoption path
  is gone, but an owner deleting their account can still leave a shared group with no admin —
  reworded to that and kept open (`DQ-33` is the same question). `D-11` (roster paging) deleted.
- `@noble/curves` uninstalled (v1's X25519, nothing imports it). `SPEC-SERVER.md` → `docs/history/`.

### Deploy — done 2026-09-25
Dev D1 wiped (it held v1's tables and two test accounts), `0001_schema.sql` applied, Worker deployed to
`budgetsplit-api.budgetsplit.workers.dev`; `/health` ok, `/sync/*` answer 401 unauthenticated, `/v2/*` and
`/backups` 404. Still to do: ship an app build, then Checkpoint E on two phones. The steps, for next time:
1. Reset the dev D1 (it holds v1's tables): delete and recreate it, paste the new id into `wrangler.toml`
2. `cd server/api && npm run migrate` (applies `0001_schema.sql`)
3. `npm run deploy`
4. Ship the app build
