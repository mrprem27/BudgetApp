# Checkpoint — resume here

`Written 2026-09-26 · Branch: claude/branch-selection-gi7lyy · HEAD: ae2efcd`

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
- **EN3** done (`8fe73ed`), **reverted 2026-09-26**: the P10/P50/P90 bootstrap band
  (`rng.ts`, `projection.ts`'s `projectBand`) was pulled after `EN8`'s back-test found it
  miscalibrated on every seed tried — see `docs/SPEC-ENGINE.md` §12b L7 and `todo.md`'s `EN3` row.
  **Engine is deterministic-only now**: `afford()`/`safeToSpendV2` read `projectKnown`'s own low
  point directly, with the essential-spend floor (`behaviour.ts`'s `essentialFloor`, still on the
  hardcoded `NEED_CATEGORY_SEED`) as the cushion instead of a percentile. `assess.ts`, `explain.ts`
  and the four dependent test files were updated to match; full suite green, `tsc` clean app+server.
  Don't rebuild the band until real pilot data exists to validate one against.
- **EN4** done (`04b9412`): `afford()` (`assess.ts`) — now on the deterministic path (see EN3's
  revert above), verdict, ranked reasons, an
  explicit-monthly-budget check, `largestComfortableAmount` (binary search), and
  `earliestComfortableDate` for `when: 'can-wait'`. Not the dev screen itself (`EN4`'s scope is
  `afford()`, tested directly) — wiring a real screen to it is `EN10`/`EN11`.
  **Two real limits worth knowing before touching this next:** (1) no goal-delay or 12-month
  "unfundable" Tight/Not-affordable triggers yet (needs `goalForecast`/`EN6`); (2) a one-time
  purchase's `earliestComfortableDate` can never differ from today's answer with no income modelled
  yet — only a *recurring* purchase's earliest-date search does anything useful right now (see
  `assess.ts`'s `findEarliestComfortableDate` doc comment for why). Both are documented in
  `todo.md`'s EN4 entry, not silently missing.
- **EN5** done (`3be617b`, refined `73d265e`): income + receivables (`behaviour.ts`/`projection.ts`),
  all opt-in behind `withIncome` (default `false` everywhere — EN2/EN4's tests are locked to the
  income-less numbers). `afford()`'s `tippingReceivables` names a receivable that would close the gap.
- **EN6** done: `trueExpenses`/`monthlyAffordability` (`behaviour.ts`) — yearly commitments + dated
  goals as a sinking fund, feeding a new "unfundable within 12 months" → Not-affordable trigger in
  `afford()`, also gated on `withIncome`.
- **Every scoping call/limitation from EN1–EN6, in one place: `docs/SPEC-ENGINE.md` §12b** — a v1
  release gate. Read it before EN7+, and add to it rather than re-explaining a limitation in this file.
- **EN7** done: `explain.ts` (E6) — `afford().verdict` is now `AffordVerdict | null`, `null` when
  history is too thin for any verdict (not just low-confidence). Confidence caps on `irregular`
  income or thin-but-usable history (rewritten during the EN3 revert — no more band width to read).
- **EN8** ran 2026-09-26: found the band miscalibrated (see EN3 above). Row stays open in `todo.md`
  — the back-test did its job, but there's no band left to gate. **EN9–EN12** not started; worth a
  re-read once picked up, since some scope may have assumed the band.
- **A second, parallel session is doing Phase 4 (UPI) in this same working tree right now** —
  `useUpiHandoff.ts`/`upiIntent.ts`/`ScanPaySheet.tsx`/`TransferBody.tsx` mid-refactor, currently
  failing `tsc` and two doc guards (`deadComponents`, `coverage`). Not engine-related; don't touch
  those files or "fix" those failures — they'll resolve when that session finishes/commits.

**Phase 4 (UPI redesign) and Phase 5 (your decisions)** — not started.

**Phase 6 (AI context & narration)** — not started, not even task-broken-down. Recorded as a
decision in `plan.md` (`c67efec`): an optional Gemini layer, deliberately deferred until the
deterministic engine is finished and proven (after EN12/CP3). See `plan.md`'s "Phase 6" section for
the three-stage design (guardrailed structured extraction → unchanged deterministic math → optional
grounded narration) before building anything here — it crosses two of `SPEC-ENGINE.md` §10's own
"ask first" lines (adding ML, adding a stored input).

## How to pick up

1. `git log --oneline -10` to see you're where this file says you are; `git status` should be clean.
2. Open `tasks/todo.md`, find the next unchecked box (`EN8` right now) — it has its own accept/verify
   criteria already written.
3. Read `docs/SPEC-ENGINE.md` §8 (evaluation/back-test, the ship gates table) and §12b (limitations)
   first. `EN8` is the last engine task before `CP3 DEVICE` — a **human, on-phone** checkpoint (§11
   step 4: "No switch before this"), and `O-100`/`O-103` (screen-layout picks) also gate `EN10`/`EN11`.
   Those three are not something a coding session can do — flag them to the user rather than
   attempting to route around them.
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
  or a changed **query-module** count until the docs are updated to match. `EN3` added a new file
  under `src/lib/engine/` (`rng.ts`) with no doc-guard failure — these guards count `src/db/queries/`
  modules and routes specifically, not `src/lib/` — but stay alert for it the moment a task adds a
  new query module or route.
- `docs/SYSTEM.md`, `docs/SCREENS.md`, `docs/TRACKER.md`, `docs/FINDINGS.md`, `docs/SYNC-MODEL.md`,
  `docs/RELEASE_CHECKLIST.md` and `AGENTS.md` are the seven **live** documents (AGENTS.md says so
  explicitly) — anything else under `docs/` (including `docs/history/`) is frozen and must not be
  edited to make a test pass.

## Environment note

This session ran against `node:sqlite` via `src/__tests__/helpers/testDb.ts`, not a real device or
simulator — nothing here has been run on an actual phone. The device checkpoints in `todo.md`
(`CP1 DEVICE`, `CP3 DEVICE`, `CP4 DEVICE`) are still outstanding and are yours to do by hand.
