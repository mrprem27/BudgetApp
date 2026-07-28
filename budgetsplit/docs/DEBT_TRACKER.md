# BudgetSplit — Debt Tracker

> **Single source of truth for open debt.** Supersedes [BRUTAL_ANALYSIS](./BRUTAL_ANALYSIS.md),
> [REFACTORING_PLAN](./REFACTORING_PLAN.md), [IMPROVEMENT_PLAN](../IMPROVEMENT_PLAN.md) and
> [FUTURE_IMPROVEMENTS](./FUTURE_IMPROVEMENTS.md) — all four are now archived. Add new items **here**.

**Current — 2026-07-28, after the 🔴 paydown pass** (branch `refactor/phase-1-perf-safety`):

| | at audit | now |
|---|---|---|
| `npx tsc --noEmit` | ✅ clean | ✅ clean |
| `npx jest` | 290/290, 31 suites | ✅ **469/469, 40 suites** |
| Source size | 29,867 LOC | 30,148 LOC (logic moved out of screens, +tests) |
| Screens discarding load errors | 6 | **0** |
| Untested lib modules | 17 | **9** (all native I/O adapters) |
| Dead components | none | none |

**All 🔴 items are closed.** See [§ Resolved](#-resolved). The 🟡/🟢 rows below are still open.

---

## How to use this file

1. **Add a row** to the right section with the next free ID. Never renumber.
2. **Every row cites `file:line`.** A claim without evidence gets deleted, not debated.
3. **Never delete a row** — move it to [§ Resolved](#-resolved) with the date, or to
   [§ Won't fix](#-wont-fix--by-design) with the reason.
4. **Verify before you carry an item forward.** The archived docs rotted because ~60
   checkboxes were left unticked after the work shipped. Nine items below were caught that
   way on 2026-07-28 — already done, still listed as open. Re-check against live code first.

**Severity** — 🔴 breaks or blocks a user · 🟡 inconsistency, risk, or drift · 🟢 cosmetic
**Status** — `open` · `⏸️ blocked` (needs a decision) · `⛔ external` (blocked outside the codebase)

---

## 🎨 UI/UX

| ID | Sev | Item | Evidence | Status |
|----|-----|------|----------|--------|
| ~~**U1**~~ | ✅ | ~~6 screens discard `useScreenData` error~~ | **Fixed 2026-07-28** — all 25 `useScreenData` screens now render `ErrorState` with retry. `afford.tsx` also stopped swallowing the error into a zeroed snapshot (it was rendering "₹0 available" — a confident wrong answer). | done |
| **U2** | 🟡 | 6 data screens have no loading guard → empty state flashes before data arrives | [friends.tsx](../app/friends.tsx), [members.tsx](../app/group/[id]/members.tsx), [group/[id]/recurring.tsx](../app/group/[id]/recurring.tsx), [history.tsx](../app/history.tsx), [search.tsx](../app/search.tsx), [(tabs)/settings.tsx](../app/%28tabs%29/settings.tsx) | open |
| **U3** | 🟡 | Pull-to-refresh on 11 of 31 screens with no rule for which qualify | `RefreshControl` present: groups, index, savings, friends, history, insights, personal, plan/recurring, reminders, review, group/[id]/recurring | open |
| **U4** | 🟡 | ~85 pressables with no `accessibilityLabel` (290 pressables / 205 labels) | Worst offender: [group/[id]/recurring.tsx](../app/group/[id]/recurring.tsx) — 5 pressables, 0 labels | open |
| **U5** | 🟢 | 19 raw hex values outside the token system — **direct AGENTS.md §10 violation** ("Never raw hex. Always use tokens.") | [insights.tsx:421](../app/insights.tsx#L421), [savings.tsx:468](../app/%28tabs%29/savings.tsx#L468), [history.tsx:190](../app/history.tsx#L190), [notifications.tsx:201](../app/settings/notifications.tsx#L201), [StreakCard.tsx:82](../src/components/finance/home/StreakCard.tsx#L82) | open |
| **U6** | 🟡 | **Three** colour palettes where there should be one | `CHART_COLORS` at [palette.ts:56](../src/constants/palette.ts#L56) **and** a second at [home/helpers.ts:44](../src/components/finance/home/helpers.ts#L44); `GOAL_COLORS` at [savings.tsx:66](../app/%28tabs%29/savings.tsx#L66) | open |
| **U7** | 🟡 | 5 screens bypass `ScreenHeader`/`ModalHeader` and hand-roll a header | [(tabs)/index.tsx](../app/%28tabs%29/index.tsx), [(tabs)/groups.tsx](../app/%28tabs%29/groups.tsx), [(tabs)/settings.tsx](../app/%28tabs%29/settings.tsx), [add/itemized.tsx](../app/add/itemized.tsx), [category/[name].tsx](../app/category/[name].tsx) | open |
| **U8** | 🟡 | Two modal metaphors coexist, against the one-`SheetModal` decision | Raw RN `<Modal>` in [txn/[id].tsx](../app/txn/[id].tsx) + [add/quick.tsx](../app/add/quick.tsx) vs `SheetModal` in 19 files | open |
| **U9** | ⏸️ | Home first-run empty state: normalise to `EmptyState`/`PrimaryButton`, or keep bespoke? | Carried from `IMPROVEMENT_PLAN.md:17` (Q1) | ⏸️ blocked |
| **U10** | ⏸️ | `add/itemized` header → `ModalHeader`? Same Q1 decision as U9. | Carried from `IMPROVEMENT_PLAN.md:18` | ⏸️ blocked |
| **U11** | 🟢 | `accessibilityState` missing on review/itemized toggles | [review.tsx](../app/review.tsx), [add/itemized.tsx](../app/add/itemized.tsx) | open |

---

## 🧩 Features

| ID | Sev | Item | Evidence | Status |
|----|-----|------|----------|--------|
| ~~**F1**~~ | ✅ | ~~25 files of finished work uncommitted~~ | **Fixed 2026-07-28** — committed. | done |
| **F2** | 🟡 | Subscription vs Recurring remain two half-merged concepts with duplicated definitions | Queued behind Dashboard + Search work | open |
| **F3** | 🟡 | Global-categories migration (categories are per-group today; vision is global + undeletable-once-shared) | Future direction, not scheduled | open |
| **F4** | ⛔ | GPay import blocked — source export format unknown | Phase GP | ⛔ external |
| **F5** | ⛔ | Live email ingestion blocked — Google OAuth needs CASA assessment | Paste path shipped as the workaround | ⛔ external |

---

## 🧹 Cleanness

| ID | Sev | Item | Evidence | Status |
|----|-----|------|----------|--------|
| ~~**K1**~~ | ✅ | ~~17 lib modules with zero tests~~ | **Fixed 2026-07-28** — 8 now covered (`settleScope`, `reminderPlan`, `txnGrouping`, `settings`, `featureFlags`, `reviewViews`, `groupExport`, `reportExport`) via a new in-memory AsyncStorage mock. Found and fixed a real CSV-escaping bug on the way (see K10). The remaining 9 are native I/O adapters (`haptics`, `location`, `shareCsv`, `pdfjsCache`, `attachment`, `avatar`, `notifications`) plus 2 db-heavy (`analytics`, `onboarding`) — see 🟡 K11. | done |
| **K2** | 🟡 | 42 `any` / `@ts-ignore` / `@ts-expect-error` sites — **AGENTS.md violation** ("No `any` types unless wrapping an untyped third-party API"); needs triage into legitimate vs. lazy | across `app/` + `src/`, excl. tests | open |
| **K3** | 🟡 | **Literal copy-paste between two screens** — `velocityCard` (`#1A1014`) and `subsReviewBtn` (`#13203A`) are byte-identical in both | [savings.tsx:468,495](../app/%28tabs%29/savings.tsx#L468) ↔ [insights.tsx:421,497](../app/insights.tsx#L421) | open |
| **K4** | 🟡 | No `IconCircle` primitive — 19 inline circular-icon style blocks across 17 files. *Not a rule violation:* AGENTS.md §8 prescribes this exact inline snippet. The debt is that a documented pattern was never promoted to a component. | `width: N, height: N, borderRadius: N/2` repeated | open |
| **K5** | 🟡 | Mixed data access: 29 screens import `db/queries` directly while `useScreenData` (25 screens) is the documented pattern | see [ARCHITECTURE.md](./ARCHITECTURE.md) | open |
| **K6** | 🟢 | No `alpha(color, n)` helper — the `+ '22'` hex-suffix idiom appears ~47×. *Not a rule violation:* AGENTS.md §8 mandates `color + '22'`. Debt is the missing helper, and that `'22'` is the only opacity the codebase can express. | [help.tsx](../app/help.tsx) alone has 31 | open |
| **K7** | 🟢 | No `SectionCard collapsible` — collapsible-section state hand-rolled twice | [group/[id]/budget.tsx](../app/group/[id]/budget.tsx), [categories.tsx](../app/categories.tsx) | open |
| **K8** | 🟢 | `PersonEditSheet` — add/rename-person UI duplicated | [friends.tsx](../app/friends.tsx), [group/[id]/members.tsx](../app/group/[id]/members.tsx) | open |
| **K11** | 🟡 | 9 lib modules remain untested: 7 are thin native I/O adapters (`haptics`, `location`, `shareCsv`, `pdfjsCache`, `attachment`, `avatar`, `notifications`) where a unit test would only exercise the mock; 2 (`analytics` 240 LOC, `onboarding`) need a SQLite fake that does not exist yet. Lower value than K1 — recorded so "9 untested" is never mistaken for "9 forgotten". | `src/lib/` | open |
| **K9** | 🟢 | Dead styles interleaved with live ones in `savings.tsx` (deferred: risky without a device check, harmless at runtime) | [savings.tsx](../app/%28tabs%29/savings.tsx) | open |

---

## 🌀 Complexity

Ranked by LOC and `useState` count. `quick.tsx` is deliberately absent — it was 1250 LOC and is
now 7 `useState`, outside the top 25. That extraction worked; these are the ones left.

**AGENTS.md sets the bar at ~300 lines** ("when a screen file grows past ~300 lines, extract").
Every row below is over it; C1–C3 are 3–4.5× over.

| ID | Sev | File | LOC | `useState` | Note |
|----|-----|------|-----|-----------|------|
| ~~**C1**~~ | ✅ | [app/review.tsx](../app/review.tsx) | ~~1354~~ → **977** | ~~24~~ → 19 | **Fixed 2026-07-28** — extracted `FilterForm`, `SaveViewForm`, `DestOption` into `components/finance/review/`, and the whole commit path into pure [lib/reviewCommit.ts](../src/lib/reviewCommit.ts) (**42 new tests** covering how money is booked). |
| ~~**C3**~~ | ✅ | [app/add/itemized.tsx](../app/add/itemized.tsx) | ~~847~~ → **614** | ~~23~~ → **0** | **Fixed 2026-07-28** — all state/behaviour moved to [useItemizedForm](../src/hooks/useItemizedForm.ts), mirroring the existing `useAddTxnForm` pattern. The screen is now pure render. |
| ~~**C2**~~ | ✅ | [Onboarding.tsx](../src/components/system/Onboarding.tsx) | ~~961~~ → **793** | 17 | **Fixed 2026-07-28** — the four carousel illustrations moved verbatim to [onboarding/SlideArt.tsx](../src/components/system/onboarding/SlideArt.tsx). ⚠️ The hero ring/fan (`LogoAssembly.tsx` + the `stage === 'hero'` block) was **not touched** — verified byte-identical. |
| **C4** | 🟡 | [db/queries/transactions.ts](../src/db/queries/transactions.ts) | 888 | — | Query module doing too many jobs. Still open. |
| **C5** | 🟡 | [app/reports.tsx](../app/reports.tsx) | 596 | 6 | |
| **C6** | 🟡 | [app/savings/[id].tsx](../app/savings/[id].tsx) | 561 | 12 | |
| **C7** | 🟡 | [app/txn/[id].tsx](../app/txn/[id].tsx) | 551 | — | |
| **C8** | 🟡 | [app/(tabs)/savings.tsx](../app/%28tabs%29/savings.tsx) | 540 | 14 | |
| **C9** | 🟡 | [app/(tabs)/index.tsx](../app/%28tabs%29/index.tsx) | 539 | 7 | |
| **C10** | 🟡 | [app/insights.tsx](../app/insights.tsx) | 499 | — | |
| **C11** | 🟡 | 20 screens render lists via `ScrollView` + `.map` instead of a virtualized list | — | — | Fine for short lists; a correctness risk on `search`, `review`, `history`. |

---

## 🚫 Won't fix / by design

Recorded so they stop being re-raised as bugs.

| Item | Reason |
|---|---|
| `PRAGMA foreign_keys` OFF on the live connection | ON only during migrations ([schema.ts:294-438](../src/db/schema.ts#L294)). Cascades are hand-rolled deliberately; flipping it needs every delete path audited first. |
| Dead schema columns + unused `settings` table | Column drops require a risky table rebuild. Zero runtime cost. |
| [lib/ocr.ts](../src/lib/ocr.ts) unused | Parked `@deprecated`, kept not deleted. On-device OCR reads only a single total, not line items. |
| Subscription auto-detection dormant | Subscriptions are sourced from **recurring rules** — there is no bank feed to detect from. `lib/subscriptions.ts` stays dormant intentionally. |
| Raw `TextInput`s not converted to `Input` | Audited 2026-07-13: the remainder are search bars with a clear (×) button, deliberately border-less inline card rows (AGENTS.md rule 4), and hero amount fields. Converting them would *degrade* the design. |
| Categories stored as strings, not IDs | Safe `renameCategory` shipped instead of a full normalisation migration. |

---

## ✅ Resolved

### Caught stale on 2026-07-28 — listed as open in the archived docs, already done in code

These were carried as open work and are verified fixed. This is why rule 4 exists.

| Was listed as | Actually |
|---|---|
| 4 missing DB indexes (`REFACTORING_PLAN.md:83-86`) | All present — [schema.ts:371-383](../src/db/schema.ts#L371) |
| `nextOccurrence` duplicated in `recurring.tsx` | One source at [recurrence.ts:44](../src/lib/recurrence.ts#L44); every caller imports it |
| `quick.tsx` monolith (1250 LOC) | Extracted — 7 `useState`, out of the top 25 |
| `group/[id].tsx` monolith (1125 LOC) | Now 310 LOC |
| `edit.tsx handleSave` silent failure | Has `try/catch` + `Alert` + `finally` — [edit.tsx:63-82](../app/group/[id]/edit.tsx#L63) |
| No max-amount/overflow guard in `money.ts` | `MAX_INT_DIGITS` / `MAX_PAISE` + clamping — [money.ts:120-148](../src/lib/money.ts#L120) |
| Missing `maxLength` on group + goal names | Both present — [GroupForm.tsx:62](../src/components/finance/GroupForm.tsx#L62), [savings.tsx:374](../app/%28tabs%29/savings.tsx#L374) |
| Missing `AmountInput`, `RecurrenceEditor`, `GroupPickerSheet`, `LocationRow` | All built — `add/AmountField.tsx`, `add/RecurringControls.tsx`, `GroupSelector.tsx`, `add/LocationRow.tsx`. (`income.tsx`, the other half of each cited pair, no longer exists.) |
| `add/quick.tsx` has no error handling | Handled in [useAddTxnForm.ts:256-380](../src/hooks/useAddTxnForm.ts#L256) — `try/catch` + `Alert` on every write path |

### Fixed during the 🔴 paydown (2026-07-28)

| Item | Detail |
|---|---|
| **K10 — CSV export corrupted quoted fields** | `buildReportCsv` escaped `"` in the note but **not** in the group name or category, so a group called `Trip "2026"` exported as broken CSV with shifted columns. Found by a new test. Fixed by routing every quoted field through one `csvQuote` helper — now the single inverse of `splitCsvLine` in [importParse.ts](../src/lib/importParse.ts), replacing a duplicate escaper in `groupExport.ts`. |
| **U1 — `afford.tsx` swallowed load failures** | Its loader caught errors into a zeroed snapshot, rendering "₹0 available" — telling the user they can't afford anything, as fact. Now propagates to `ErrorState`. |
| **Test infrastructure** | New in-memory AsyncStorage mock (`__mocks__/asyncStorage.js`) unlocked testing for the three settings stores. |

### Shipped earlier (see archived docs for detail)

Zustand store trimmed · `lib/settings.ts` single prefs store · feature-flag defaults deduped ·
N+1 split loader batched · atomic `splitRecurringSeries` · `deleteCategory` budget-orphan fix ·
one `recurringMonthlyEquivalent` · one `forecast` model · one `budgetHealth`/`utilLabel` ·
`recordSettlement` single write path · `Card.tsx`/`settle.tsx`/`computeNet` deleted ·
central `src/theme` module · Phase 0–3 screen migrations to `useScreenData`.
