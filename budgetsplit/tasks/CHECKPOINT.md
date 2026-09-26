# Checkpoint — resume here

`Written 2026-09-26 · Branch: claude/branch-selection-gi7lyy · HEAD: c67efec`

A handoff for picking this work back up in a fresh session (local Claude Code or otherwise). The
real task lists are `tasks/todo.md` (what's left, per-task accept/verify notes) and `tasks/plan.md`
(why, architecture decisions, dependency graph) — this file just orients you fast and says where to
click in.

## What's done

**Phase 1 · Merge into my account (`DQ-94`)** — code complete (M1–M4). Only the device checkpoint
(`CP1 DEVICE`) is left, and that's a human-on-a-phone task, not code.

**Phase 2 · "Same person as…" (`DQ-94` part 2)** — fully done: P1 (server), P2 (`combinePeople`),
P3 (person-screen picker sheet), CP2. Commits `cc92562`, `f3910a2`, `61028da`.

**Phase 3 · The money engine (`docs/SPEC-ENGINE.md`)** — in progress:
- **EN1** done (`31c7a41`): `FinanceSnapshot` (`src/lib/engine/types.ts`), `getFinanceSnapshot`
  (`src/db/queries/engineSnapshot.ts`), 5 fixture personas (`src/db/enginePersonas.ts`).
- **EN2** done (`115d13c`): the deterministic day-by-day projection (`src/lib/engine/projection.ts`),
  the everyday rate (`behaviour.ts`), `safeToSpendV2` (`assess.ts`), and a dev comparison screen
  (`app/dev/engine.tsx`, reached from `/storage`'s TESTING section, behind `DEV_TOOLS_ENABLED`).
  **Read `projection.ts`'s file header before touching known events** — it explains a real design
  decision made mid-build: income is deliberately excluded from this slice (deferred whole to EN5),
  because every fixture persona gets paid inside 30 days, which made "equals today's figure when no
  bill is in the horizon" (EN2's own accept criterion) unsatisfiable otherwise.
- **EN3–EN12** not started. EN3 (uncertainty band: seeded PRNG, bootstrap, P10/P50/P90) is next.

**Phase 4 (UPI redesign) and Phase 5 (your decisions)** — not started.

**Phase 6 (AI context & narration)** — not started, not even task-broken-down. Recorded as a
decision in `plan.md` (`c67efec`): an optional Gemini layer, deliberately deferred until the
deterministic engine is finished and proven (after EN12/CP3). See `plan.md`'s "Phase 6" section for
the three-stage design (guardrailed structured extraction → unchanged deterministic math → optional
grounded narration) before building anything here — it crosses two of `SPEC-ENGINE.md` §10's own
"ask first" lines (adding ML, adding a stored input).

## How to pick up

1. `git log --oneline -10` to see you're where this file says you are; `git status` should be clean.
2. Open `tasks/todo.md`, find the next unchecked box (`EN3` right now) — it has its own accept/verify
   criteria already written.
3. Read `docs/SPEC-ENGINE.md` §4 (module E3, "Uncertainty band") and §7/§8 (testing strategy, ship
   gates) before writing code — the personas and back-test machinery this needs already partly exist
   (`src/db/enginePersonas.ts`).
4. Standing gates (run for every task, per `todo.md`'s own header):
   ```
   cd budgetsplit && npx jest
   cd budgetsplit && npx tsc --noEmit
   cd server/api && npx tsc --noEmit -p .
   ```
5. House rule: a regression test is proven by reverting its fix and watching it fail
   (`AGENTS.md`, "Standing rules for changing code"). Every task done so far in this session did this
   for its riskiest pieces — keep doing it.
6. Update `tasks/todo.md` (mark the task `[x]`, note what was verified) as part of the same commit
   that finishes it, same pattern as the last three commits.

## Things a fresh session would otherwise have to rediscover

- `enginePersonas.ts`'s `base()` hand-writes the Personal group with `is_personal = 1` — a plain
  `insertGroup` call does NOT set that flag, and several queries (`getCashPosition`,
  `getMyGlobalBudgetRows`, `getGoalFundingStatus`) silently return nothing without it. Bit us once
  during EN1; the comment in that function explains it.
- `app/dev/engine.tsx`'s personas each need their own throwaway database — `src/db/engineDevDb.ts`'s
  `openScratchDb()` opens `:memory:` with `useNewConnection: true` specifically so five personas
  don't end up sharing one in-memory ledger.
- The full jest suite includes doc-integrity guards (`countClaims.test.ts`, `docCoverage.test.ts`,
  `screenIdMap.test.ts`, `coverage.test.ts` / `scripts/build-system-map.js`) that fail on a new route
  or a changed module count until the docs are updated to match — expect this the moment EN3 or later
  adds a new file under `src/db/queries/` or `src/lib/`, or any new route.
- `docs/SYSTEM.md`, `docs/SCREENS.md`, `docs/TRACKER.md`, `docs/FINDINGS.md`, `docs/SYNC-MODEL.md`,
  `docs/RELEASE_CHECKLIST.md` and `AGENTS.md` are the seven **live** documents (AGENTS.md says so
  explicitly) — anything else under `docs/` (including `docs/history/`) is frozen and must not be
  edited to make a test pass.

## Environment note

This session ran against `node:sqlite` via `src/__tests__/helpers/testDb.ts`, not a real device or
simulator — nothing here has been run on an actual phone. The device checkpoints in `todo.md`
(`CP1 DEVICE`, `CP3 DEVICE`, `CP4 DEVICE`) are still outstanding and are yours to do by hand.
