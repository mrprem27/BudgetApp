# SPEC-BUGSCAN — whole-app bug & scenario scan, then fix

Status: **APPROVED 2026-09-29** (full separation move; app + server). Branch `claude/branch-selection-gi7lyy`.

## Objective
Find and fix real defects across the app before the pilot, ranked by criticality, in four sections:

1. **Structure / architecture** — layering, data flow, sync + engine boundaries, dead or duplicated logic.
2. **Features & cross-feature scenarios** — per feature (Add/Txn, Groups/Settle, Budgets, Savings/Goals, Recurring/Subscriptions, Review/Import, UPI, Engine/Home/Afford/Insights, Sync/Backup, Onboarding, Settings), plus interdependencies (a write in one feature leaving another stale or wrong: e.g. delete txn → budgets, goals raid, owe/owed, engine snapshot, sync queue).
3. **UI/UX** — wrong numbers/labels/destinations, empty/zero/negative/overflow states, keyboard, inconsistency between surfaces showing the same thing.
4. **Logic vs UI separation** — computation living in `app/` or `src/components/` instead of `src/lib` / `src/db/queries` / `src/hooks`.

Success = every Critical and High finding fixed with a regression test (proven by reverting the fix), Medium fixed where cheap, Low listed only.

## Criticality
| Level | Meaning |
|---|---|
| **Critical** | Data loss/corruption, wrong money figure persisted or synced, crash on a common path, security/privacy leak |
| **High** | Wrong figure/label shown, broken flow or destination, stale data across features, crash on an edge path |
| **Medium** | Edge case (empty/zero/negative/overflow) mishandled, inconsistency between surfaces, logic in the wrong layer that already caused or invites duplication |
| **Low** | Polish, naming, tidy-ups — recorded, not fixed in this pass |

Every finding must cite `file:line`, a concrete failure scenario (input/state → wrong result), and be **verified by reading the code** — no speculative findings.

## Method
- Scan by section (read-only; `server/api` included), then an adversarial verify pass that tries to refute each finding; only CONFIRMED survive.
- Output: the findings table below (`BS-` ids — outside TRACKER's guarded prefixes, so its counts stay honest). Regressions in `src/__tests__/bugscan.test.ts`, each proven by reverting its fix.

## Commands
```
cd budgetsplit && npx jest              # all suites incl. doc/source guards
cd budgetsplit && npx tsc --noEmit      # app code (src/__tests__ not typechecked)
cd server/api && npx tsc --noEmit -p .  # only if server/ changes
```

## Structure (current, the separation target)
```
app/                 routes/screens — composition only, no computation
src/components/      presentational + small interaction state (ui/, system/, finance/<feature>/)
src/hooks/           screen data + behaviour hooks (useScreenData pattern)
src/lib/             pure logic (engine/, sync/, helpers) — all computation lives here
src/db/, db/queries  SQLite access only
src/constants, theme enums/tokens
```
Today: 46 files in `app/`+`src/components/` import `src/db` directly; screens up to ~680 lines. Section 4 is a **full move**: no `src/db` import and no non-trivial computation left in `app/` or `src/components/`, enforced by a source-scanning guard test. Done last, after bug fixes, so the fixes don't conflict with the move.

## Fix policy
- Fix in severity order; one commit per finding group, gates green each commit.
- Numbers/labels/destinations: just fix. Layout, density, IA changes: list them and ask.
- Simplest fix; no new abstractions unless it removes an actual duplicate.

## Boundaries
- **Always:** regression test per Critical/High fix; follow AGENTS.md design rules; `EmptyState`/`SheetModal` reuse.
- **Ask first:** schema changes to `schema.sql`, new dependencies, layout/IA changes.
- **Never:** touch `LogoAssembly.tsx` or the onboarding hero animation; push (gh account switch is yours to approve); reintroduce a Monte Carlo band; delete failing tests.

## Decisions
- Section 4: full move (user, 2026-09-29).
- Server `server/api` in scope.

## Findings

| id | Level | Where | Failure | Status |
|---|---|---|---|---|
| BS-1 | Critical | `updateTxn` / `updateItemizedTxn` | Changing an entry's group edited `group_id` in place; the server never moves an entry between groups and refused it, so the old group kept charging my share on every other phone, for good | FIXED — a move is a new id in the new group + the old one deleted (`moveIfRegrouped`); the detail screen follows the new id |
| BS-2 | High | `restoreTxn` | Undo of "delete rule + all logged" also resurrected occurrences deleted by hand earlier — money back in totals | FIXED — cascade shares one stamp; restore matches it |
| BS-3 | High | reaper, receipt replace/remove, editors | A receipt file shared by a rule and its occurrences was unlinked when any one of them let go of it | FIXED — `attachmentInUse` before every unlink |
| BS-4 | High | `materializeDueOccurrences`, `getActiveRecurringRules` | Rules in a deleted group, or one I left, kept posting my share into a hidden group and counted as bills in Safe-to-Spend | FIXED — `RULE_IN_LIVE_GROUP` |
| BS-5 | High | sync scheduling | Push was scheduled off `refresh()`; swipe-delete, edits, goal funding and profile edits only `reload()`ed, so they sat queued until the next foreground | FIXED — the queue schedules the push (`setQueueListener`); missing `refresh()` calls added |
| U1 | High | Home | "Nothing logged yet" first-run state (with the period pills hidden) shown to anyone with no spend this period and no budget — e.g. every 1st of the month | FIXED — keyed on the whole ledger (`everLogged`) |
| U2 | Medium | Home catch-up banner | Counted ended, remind-only and other people's rules as having "ran while the app was closed" | FIXED — `loadCatchUp`, same filter as materialization |
| U3 | Low | Home | Literal 120pt spacer on top of the tab-bar padding (AGENTS §9) | open — layout |
| U4 | Low | `useAssets` archive alert | Net-worth drop shown as `1234.00`, no ₹ | FIXED |
| L1 | Low | `reopenApproval` | Taking back an approved retraction does not restore the retraction flag | open |
