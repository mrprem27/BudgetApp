> **FROZEN 2026-09-26.** Coding done (S0–S23). The 19 unticked device checks were carried into `tasks/todo.md` §0 of the successor plan (Merge, UPI redesign, open decisions).

# Implementation Plan — Server sync (SPEC-SERVER)

`Spec: ../docs/history/SPEC-SERVER.md · Tasks: ./todo.md · Written 2026-09-24 · Predecessor: docs/history/PLAN-2026-09-FEEDBACK.md`

## Overview

Move the app from zero-knowledge group sync to a real server. The server becomes the authority for
**all** of a user's data, stored in a properly modelled relational schema. The phone stays
offline-first against its own SQLite database.

The plan has **24 tasks (S0–S23)** in six phases, following the spec's module order. No task is
larger than M. There are checkpoints after each phase; two of them are device checks for you.

## Architecture decisions (from the spec — the reasons are there)

- **Stack: Cloudflare Worker + D1 stays.** It is already deployed and paid for by nobody. D1 enforces
  foreign keys and gives an atomic `batch()`, which is all the protocol needs. A move to Postgres is
  not planned. It becomes worth revisiting only if D1's limits bind (`DQ-95`).
- **Server names are clean and plural** (`users`, `groups`, `transactions`, `transaction_splits`,
  `assets`…). The phone keeps its own table names. One pure mapper translates between the two, with
  a completeness test.
- **Sync design: one scope per user and one per group.** Each scope has a counter that orders its
  changes. Pushes are idempotent, using a mutation id per device, the Replicache pattern. Money writes
  are compare-and-set on `version`. Results are read on the pull.
- **The Worker imports the app's pure rules** (`splitMath`, `permissions`, `trust`). No copies.
- **The schema is one file, `0001_schema.sql`, hand-written and edited directly.** No
  real account has ever signed in, so there is nothing an incremental migration protects —
  see SPEC-SERVER.md's note at the top of that file. Retiring v1 (S22) means deleting its
  tables from this same file, not writing a second migration.
- **The existing money read paths do not change.** `crossSurfaceConsistency.test.ts` is the bar
  everything must keep passing.

## Dependency graph

```
S0 open questions filed (done)
 │
 S1 D1 test harness ─► S2 schema: accounts/people/groups/budgets/sync ─► S3 schema: transactions/approvals/personal money/activity
                                                                         │
                                                              CHECKPOINT A (schema)
                                                                         │
 S4 Worker skeleton + shared-lib import ◄────────────────────────────────┘   (RISK FIRST: can the Worker import app libs?)
  ├─ S5 push: user-scoped entities
  ├─ S6 push: groups + transaction bundle (personal group)
  └─ S7 pull
        │
 CHECKPOINT B (server green + local wrangler smoke)
        │
 S8 rowMap ─► S9 outbox schema + helper + guard ─► S10 wire money writers ─► S11 wire the other writers
                                                                                    │
 S12 client engine v2 (push/pull/apply) ◄───────────────────────────────────────────┘
  └─ S13 identity + remap (RISK: re-points every local reference) ─► S14 first sign-in: upload / restore / ask
        │
 CHECKPOINT C — DEVICE: reinstall → everything back (yours)
        │
 S15 layout options, no code (you pick) ─► S16 SyncStatus + first-sign-in screens ─► S17 refused/conflict + History
        │
 S18 server: members/roles/leave/remove ─► S19 server: shared transactions + approvals + disputes
  └─ S20 client: group flows on v2 ─► S21 client: approvals/disputes from the server; v1 ingest retired
        │
 CHECKPOINT E — DEVICE: two phones, two accounts, one group (yours)
        │
 S22 delete E2E code + v1 routes + v1 tables from schema.sql ─► S23 copy + docs rewrite; spec to history
```

## Parallelisation

Sequential by nature. Migrations, the protocol and the client engine depend on each other in a line.
Two exceptions: **S15** (layout options) can run any time after S0, and **S8** (rowMap) can run
alongside S4–S7.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **The identity remap corrupts a ledger.** Re-pointing `is_me` means rewriting every local reference to the old id. | High | S13 runs it in one local transaction. Preservation tests assert that every money figure is identical before and after. It runs before any upload. |
| **The Worker cannot import `budgetsplit/src/lib`.** Path, tsconfig or an RN-only import could get in the way. | High | S4 proves it first, before any protocol code. If it can't be done cleanly, fall back to a shared `packages/rules` folder that both sides import. |
| **Some local write path forgets to queue its outbox row.** Silent divergence. | High | S9 adds a source-scanning guard, the same way `outboxAuthorInvariant` does: every `INSERT`/`UPDATE`/`DELETE` on a synced local table must sit beside a `queueMutation`. |
| **D1 has no interactive transactions**, so a check-then-write could race. | Med | The `write_guard` pattern puts every precondition inside the atomic batch (spec §2.10). |
| **The D1 Free write cap**, 100k rows/day, hard-stops. | Med | `DQ-95`. Default: Paid before the first non-you user. Batches are kept lean. |
| **A pull overwrites a change still waiting to upload.** | Med | Rule in S12: a pending local mutation always wins until the server answers it. Tested. |
| **Local schema changes on existing phones.** | Low | Additive `ALTER`s only, the same `COLUMN_MIGRATIONS` mechanism. Dev data may be wiped. |

## Verification standard (every task)

```
cd budgetsplit && npx jest && npx tsc --noEmit
cd server/api && npm run typecheck        # from S4 on
```

Every regression test is proven by reverting its fix and watching it fail. Remote `migrate` and
`deploy` are yours to run.

## Open questions

`DQ-94` (merge at first sign-in), `DQ-95` (Workers Paid), `DQ-96` (editing others' entries). Each has a
default in `docs/TRACKER.md`, and the plan builds the default.
