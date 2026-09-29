# SPEC-BUGSCAN — whole-app bug & scenario scan, then fix

Status: **APPROVED 2026-09-29** (full separation move; app + server). Separation and route groups done; server scan and a device pass remain. Branch `claude/branch-selection-gi7lyy`.

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
| U3 | Low | Home | Literal 120pt spacer on top of the tab-bar padding (AGENTS §9) | FIXED — `useContentInset({ tabBar })` |
| U4 | Low | `useAssets` archive alert | Net-worth drop shown as `1234.00`, no ₹ | FIXED |
| L1 | Low | `reopenApproval` | Taking back an approved retraction does not restore the retraction flag | CLOSED, not a live bug — no screen calls it; limit written on the function |
| BS-6 | High | Groups tab | Archived list offered "tap to restore" for a group its owner deleted; the tap did nothing, with a success haptic | FIXED — list holds only restorable groups; a refused restore says so |
| BS-7 | High | Group hub → Archive | Archived a group and went back without `refresh()`, so the Groups tab (reads a store) still listed it | FIXED |
| BS-8 | Medium | Settings tab | Renaming yourself, your photo, your UPI ID never `refresh()`ed — the store's `me` stayed stale on other screens | FIXED |
| BS-9 | Medium | Members screen | Changing a photo never unlinked the file it replaced (Friends and Settings did): one leaked file per change; also an unhandled rejection on failure | FIXED — one `replacePersonPhoto` |
| BS-10 | Medium | History | Income read "Expense added" with a red −; nothing said who made a synced change | FIXED |
| BS-11 | Medium | Recurring | A "this & future" edit returned to the rule it had just ended; a deleted rule still rendered as live with Pause/Skip | FIXED |
| BS-12 | Medium | Search, report drill-down | Entries dated ahead were unfindable; archived groups' entries showed no group name | FIXED |
| BS-13 | Medium | Leave group | "Settle up first" went to the Groups list and settled nothing | FIXED — goes to the group's page |
| BS-14 | Low | Categories | Rename collision said "in this group" — categories are global | FIXED |
| BS-15 | Low | Trust everyone | A failure part-way was an unhandled rejection | FIXED |
| SV-3 | Medium | Sync screen | Group invitations could only be accepted | FIXED — Decline row (`useSyncInvites.decline`); the server already allowed it |
| SV-4 | High | server `/invites/claim` | An *ended* link counted as "already linked": after unlinking someone, a fresh invite from them could never reconnect the pair, while the list showed them as not linked | FIXED — only a live link counts (`findLink`); tested through the real Worker (`src/__tests__/server/`, the linking suite) |
| SV-5 | Medium | server `/invites` list + approve | A claim from an account that was since closed was listed with its scrubbed `deleted+…@account.invalid` address, and could be approved into a link with nobody | FIXED |
| IM-1 | High | statement import (`parseStatement`) | Quoted fields with a comma (`"1,250.00"`, `"UPI-SWIGGY, BLR"`) tore apart, so those rows — the salary credit, every amount over a thousand — were **silently dropped** and only "skipped N" hinted at it | FIXED — quote-aware split |
| IM-2 | High | statement import | A deposit row with an empty withdrawal cell was read as a *debit*: the empty cell vanished, the credit slid into the debit slot, and a salary was recorded as an expense | FIXED — debit/credit columns read from the statement's own header |
| UP-1 | Medium | Scan & Pay | A `upi://pay?…&am=249` code (shop dynamic QR, friend's request) had its amount discarded; the user typed their own, which could differ from what was asked | FIXED — the code's amount is kept, and the sheet already locks a code-fixed figure |
| UP-2 | Medium | merchant (EMV) QR | The code's own checksum (tag 63) was never verified, so a string with intact length headers but an altered payee parsed as valid | FIXED — CRC-16 checked over UTF-8 bytes when present; a code with none behaves as before |
| S | — | app/ ↔ db | 32 UI files imported `src/db` | DONE — 0 (only `_layout.tsx`, the boot root); `uiLayering.test.ts` enforces it |
| R | — | `app/` layout | 20 loose files at the top level | DONE — `(money)` `(people)` `(ledger)` `(system)` route groups; URL set unchanged (46 routes) |
| U5 | Low | `formatRupees` / `formatRupeesShort` | A negative amount printed `₹-50.00`; the compact form prints `-₹50` | FIXED |
| SV-1 | Low | server `/auth/request-link` | Rate limit was per email, not per caller: one client could request links for many addresses | FIXED — also 30 per caller per 15 min (`rateLimit.ts`, `magic_links.ip`). **The deployed D1 needs the column first** (see below) |
| SV-2 | Low | server `PATCH /me` | `avatarUrl` accepted any https URL. Not live: other people's DTO sends `null` for it (`index.ts` link DTO), so it reached only its owner — but the server was storing an address it never vetted | FIXED — `PATCH` can only clear it; pictures come from `PUT /me/avatar` |

## Coverage — what this pass did and did not read

Read line by line: every write path in `src/db/queries` for transactions, recurring, savings, sync queue/apply, approvals, and the group/person delete-leave-remove functions; server auth, sync push/pull/guards/access, transactions entity, erase and delete-account; `money`, `splitMath`; and every screen whose data code moved (32 files).

Read in the follow-up pass: `upiIntent`, `emvQr`, `importParse`, `paytmParse`, `reviewCommit`, `balances`, and all of `server/api/index.ts` (invites, links, friend requests). **Still not read:** `voice*`, `engine/*` internals, `settle`, `importDetect`/`xlsx`/OCR, and most presentational components. UI/UX coverage is what the moved screens showed, not a device walk — no render tests exist, so anything visual needs a phone.

### Deploy note (SV-1)

`magic_links` gained a nullable `ip` column and an index, edited into `0001_schema.sql` (one file, by design). A database already created from the old file needs it before the new Worker runs, or every sign-in fails on the INSERT:

```
wrangler d1 execute budgetsplit-api --remote --command "ALTER TABLE magic_links ADD COLUMN ip TEXT; CREATE INDEX idx_magic_links_ip ON magic_links(ip, expires_at);"
```
