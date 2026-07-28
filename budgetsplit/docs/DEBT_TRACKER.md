# BudgetSplit — Debt Tracker

> **Single source of truth for open debt.** Replaced four overlapping planning docs
> (BRUTAL_ANALYSIS, REFACTORING_PLAN, IMPROVEMENT_PLAN, FUTURE_IMPROVEMENTS), which were
> archived once their items were merged here and deleted once all of them were closed.
> Their reasoning is in git history. Add new items **here**.

**Current — 2026-07-28, after the 🔴 and 🟡 paydown passes** (branch `refactor/phase-1-perf-safety`):

| | at audit | now |
|---|---|---|
| `npx tsc --noEmit` | ✅ clean | ✅ clean |
| `npx jest` | 290/290, 31 suites | ✅ **469/469, 40 suites** |
| Screens discarding load errors | 6 | **0** |
| Untested lib modules | 17 | **9** (all native I/O adapters) |
| `any` / `@ts-ignore` | 42 | **5** (all documented library gaps) |
| Dead style keys | 154 | **0** |
| Raw hex in UI code | 19 | **0** |
| Hex-suffix colour concatenations | 153 | **0** (via `alpha()`) |
| Screen-reader-silent controls | 6 | **0** |
| Colour palettes | 3 sources | **1 file** |
| Largest screen | 1354 LOC | **976** |
| Hand-rolled data loaders | 1 | **0** |

**Every 🔴, 🟡 and 🟢 item is closed.** The only rows still open are the two ⛔
external blockers (GPay export format, Google CASA assessment), which are not
code. See [§ Resolved](#-resolved) and [§ Won't fix](#-wont-fix--by-design).

---

## How to use this file

1. **Add a row** to the right section with the next free ID. Never renumber.
2. **Every row cites `file:line`.** A claim without evidence gets deleted, not debated.
3. **Never delete a row** — move it to [§ Resolved](#-resolved) with the date, or to
   [§ Won't fix](#-wont-fix--by-design) with the reason.
4. **Verify before you carry an item forward.** The four docs this replaced rotted because
   ~60 checkboxes were left unticked after the work shipped, so they read as far more broken
   than the code was. Nine items were caught that way on 2026-07-28 — already done, still
   listed as open. Re-check against live code before believing any row.

**Severity** — 🔴 breaks or blocks a user · 🟡 inconsistency, risk, or drift · 🟢 cosmetic
**Status** — `open` · `⏸️ blocked` (needs a decision) · `⛔ external` (blocked outside the codebase)

---

## 🎨 UI/UX

| ID | Sev | Item | Evidence | Status |
|----|-----|------|----------|--------|
| ~~**U1**~~ | ✅ | ~~6 screens discard `useScreenData` error~~ | **Fixed 2026-07-28** — all 25 `useScreenData` screens now render `ErrorState` with retry. `afford.tsx` also stopped swallowing the error into a zeroed snapshot (it was rendering "₹0 available" — a confident wrong answer). | done |
| ~~**U2**~~ | ✅ | see commit log | ~~6 data screens flash an empty state before load~~ **Fixed** — gated on `loading`. `afford.tsx` also had two DEAD guards testing `snap === null` when `useScreenData` yields `undefined`, so it rendered "₹0 available" and a full verdict from unloaded data | done |
| ~~**U3**~~ | ✅ | see commit log | ~~Pull-to-refresh on 11 of 31 screens, no rule~~ **Fixed** — rule codified in AGENTS.md §12 (data + own scroll container ⇒ yes) with an explicit exempt table; applied to the 6 qualifying screens. Zero violations | done |
| ~~**U4**~~ | ✅ | see commit log | ~~85 pressables missing `accessibilityLabel`~~ **Fixed — and the number was wrong.** 124 of the 130 have a `<Text>` child that RN derives a name from. Only **6** were genuinely silent; all labelled, and the notifications `Toggle` gained a required `label` prop | done |
| ~~**U5**~~ | ✅ | ~~19 raw hex outside tokens~~ **Fixed** — `app/` and `src/components/` now contain **zero** raw hex. Three near-identical dark reds collapsed into one `expenseTintDeep`; added `amberTint` + `streakFlame`. Remaining hex is legitimate: the palette/category catalogues, the light-themed print document, and demo fixtures | — | done |
| ~~**U6**~~ | ✅ | see commit log | ~~Three colour palettes~~ **Fixed** — the second `CHART_COLORS` had zero consumers (deleted, no visual change); `GOAL_COLORS` and `GOAL_ICONS` moved out of the screen. All palettes now in `constants/palette.ts` | done |
| ~~**U7**~~ | ✅ | see commit log | ~~5 screens hand-roll a header~~ **Fixed per owner decision** — `(tabs)/groups` and `category/[name]` → `ScreenHeader`. Home, `(tabs)/settings` and `add/itemized` stay bespoke by design | done |
| ~~**U8**~~ | ✅ | see commit log | ~~Two modal metaphors~~ **Fixed** — `SplitSheet` and `CategoryPicker` were hand-rolling backdrop + handle + title + keyboard avoidance around a raw `<Modal>`; both now use `SheetModal`. The 3 remaining raw `<Modal>`s are correct (SheetModal itself, the photo lightbox, the FAB overlay) | done |
| ~~**U9**~~ | ✅ | see commit log | ~~Home first-run empty state~~ **Resolved as won't-fix** — owner confirmed the bespoke hero is intentional. No longer blocked | done |
| ~~**U10**~~ | ✅ | see commit log | ~~`add/itemized` → ModalHeader~~ **Resolved as won't-fix** — wizard header is intentional. No longer blocked | done |
| ~~**U11**~~ | ✅ | ~~`accessibilityState` on review/itemized toggles~~ **Fixed, wider than scoped** — swept every selection control: **14** toggles across savings, settings, categories, review, FilterForm, Onboarding and TransferSlotSheet now report `{ selected }`, and both of `help.tsx`'s disclosure levels report `{ expanded }` | — | done |

---

## 🧩 Features

| ID | Sev | Item | Evidence | Status |
|----|-----|------|----------|--------|
| ~~**F1**~~ | ✅ | ~~25 files of finished work uncommitted~~ | **Fixed 2026-07-28** — committed. | done |
| ~~**F2**~~ | ✅ | see commit log | ~~Subscription vs Recurring tangle~~ **Re-labelled as product work, not debt** (owner decision) — it changes app behaviour, so it does not belong in a cleanup pass. Tracked in the roadmap | done |
| ~~**F3**~~ | ✅ | see commit log | ~~Global-categories migration~~ **Re-labelled as product work, not debt** (owner decision) — needs a schema migration and a call on existing per-group categories | done |
| **F4** | ⛔ | GPay import blocked — source export format unknown | Phase GP | ⛔ external |
| **F5** | ⛔ | Live email ingestion blocked — Google OAuth needs CASA assessment | Paste path shipped as the workaround | ⛔ external |

---

## 🧹 Cleanness

| ID | Sev | Item | Evidence | Status |
|----|-----|------|----------|--------|
| ~~**K1**~~ | ✅ | ~~17 lib modules with zero tests~~ | **Fixed 2026-07-28** — 8 now covered (`settleScope`, `reminderPlan`, `txnGrouping`, `settings`, `featureFlags`, `reviewViews`, `groupExport`, `reportExport`) via a new in-memory AsyncStorage mock. Found and fixed a real CSV-escaping bug on the way (see K10). The remaining 9 are native I/O adapters (`haptics`, `location`, `shareCsv`, `pdfjsCache`, `attachment`, `avatar`, `notifications`) plus 2 db-heavy (`analytics`, `onboarding`) — see 🟡 K11. | done |
| ~~**K2**~~ | ✅ | see commit log | ~~42 `any` / `@ts-ignore`~~ **Fixed → 5.** Root cause was stale codegen: `typedRoutes` was already on but `.expo/types/router.d.ts` was from 2026-06-24 and missing every newer route. Regenerated ⇒ 28 casts deleted. 4 more genuinely typed; the last 5 are documented library gaps | done |
| ~~**K3**~~ | ✅ | see commit log | ~~Byte-identical copy-paste between savings and insights~~ **Fixed — it wasn't shared UI.** The styles were left behind when the velocity card moved to /insights. See K9 | done |
| ~~**K4**~~ | ✅ | see commit log | ~~No `IconCircle` primitive~~ **Fixed** — created in `components/ui/`, adopted at 9 pixel-identical sites, and **AGENTS.md §8 now prescribes the component instead of the inline snippet** (the doc was teaching the copy-paste). 43 sites with extra positioning left for opportunistic migration | done |
| ~~**K5**~~ | ✅ | see commit log | ~~29 screens import `db/queries` directly~~ **Fixed — and the premise was wrong.** AGENTS.md's rule is no inlined SQL + load via `useScreenData`; its own reference screens import query functions inside the loader. Measured properly: 0 screens inline SQL, and exactly **one** hand-rolled a loader (`(tabs)/settings`), now migrated | done |
| ~~**K6**~~ | ✅ | ~~No `alpha()` helper; `+ '22'` ~47×~~ **Fixed** — it was **153** sites across **15** different opacities, not one. New `theme/alpha.ts`: `alpha(c, 13)` returns the identical string, asserted per-opacity in `alpha.test.ts`, so the migration is provably visual-noop. Zero concatenations remain | — | done |
| ~~**K7**~~ | ✅ | ~~No `SectionCard collapsible`~~ **Fixed** — new `components/ui/SectionCard.tsx` adopted in `group/[id]/budget` and `categories`. It also closes an a11y gap both copies shared: a disclosure needs `accessibilityState={{ expanded }}`, which neither set | — | done |
| ~~**K8**~~ | ✅ | ~~`PersonEditSheet` duplicated~~ **Fixed** — it was **three** copies (two in `friends`, one in `members`), not two. New `PersonNameSheet` owns the field constraints so name rules can't drift between screens | — | done |
| ~~**K11**~~ | ✅ | see commit log | ~~9 lib modules untested~~ **Assessed, not code.** 7 are thin native I/O adapters where a unit test would only exercise the mock; 2 (`analytics`, `onboarding`) need a SQLite fake. Recorded so "9 untested" is never mistaken for "9 forgotten" | done |
| ~~**K9**~~ | ✅ | see commit log | ~~Dead styles in savings.tsx~~ **Fixed** — swept repo-wide: **154 unused style keys** removed across 17 files, 73 in `(tabs)/savings.tsx` alone (71% of its stylesheet). Verified no dynamic `styles[key]` access first | done |

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
| ~~**C4**~~ | ✅ | [db/queries/transactions.ts](../src/db/queries/transactions.ts) | ~~888~~ → **593** | — | Recurring-series lifecycle split into [queries/recurring.ts](../src/db/queries/recurring.ts) (318). Shared `loadSplits`/`insertTxnRows` exported `@internal` rather than duplicated; 2 exports that had no external callers made private. |
| ~~**C5**~~ | ✅ | [app/reports.tsx](../app/reports.tsx) | ~~596~~ → **437** | 6 | Loader → [lib/reportsData.ts](../src/lib/reportsData.ts). The 450ms skeleton floor stayed in the screen — that's presentation. |
| ~~**C6**~~ | ✅ | [app/savings/[id].tsx](../app/savings/[id].tsx) | ~~561~~ → **434** | ~~12~~ → **0** | → [useSavingsGoalScreen](../src/hooks/useSavingsGoalScreen.ts). |
| ~~**C7**~~ | ✅ | [app/txn/[id].tsx](../app/txn/[id].tsx) | ~~551~~ → **435** | — | → [useTxnDetail](../src/hooks/useTxnDetail.ts). Its handler blocks are **not** contiguous (the loading/error guards sit between them), so this one was cut by exact block. |
| ~~**C8**~~ | ✅ | [app/(tabs)/savings.tsx](../app/%28tabs%29/savings.tsx) | ~~540~~ → **327** | ~~14~~ → **1** | → [useSavingsTab](../src/hooks/useSavingsTab.ts). Preserves the deliberate read/mutation split: the overspend-raid stays in its own focus effect so it can't re-raid on every refetch. |
| ~~**C9**~~ | ✅ | [app/(tabs)/index.tsx](../app/%28tabs%29/index.tsx) | ~~539~~ → **351** | 7 | Loader + period-range helpers → [lib/homeData.ts](../src/lib/homeData.ts). |
| ~~**C10**~~ | ✅ | [app/insights.tsx](../app/insights.tsx) | ~~499~~ → **377** | — | Loader → [lib/insightsData.ts](../src/lib/insightsData.ts); `insightTint` stayed in the screen (tone → colour is render, not data). |
| ~~**C11**~~ | ✅ | Unvirtualized lists | — | — | **Triaged — "20 screens" was a naive grep.** `search`, `review` and `history` (the three called risky) already use SectionList/FlatList. One real unbounded list existed: `getGoalHistory` had no LIMIT, so a goal's whole ledger mounted in a ScrollView. Now paged at 50 with a visible "showing N of M" — and the delete-undo path passes `limit: null` deliberately, since capping there would silently drop rows on restore. |

---

## 📌 Found during the 🟢 pass — recorded, not actioned

Two things surfaced that are outside what a cosmetic pass should decide alone.

| # | Item | Why it wasn't done here |
|---|---|---|
| **N1** | `colors.textMuted` is **2.98:1** on `bgCard` — below WCAG AA's 4.5:1 for small text. It's the app-wide caption token, used everywhere. | Fixing it means darkening or lightening a core palette entry, which changes the look of every screen. That's a design decision, not a cleanup. (The specific bug behind U5 — `history.tsx` at **1.44:1** — *was* fixed.) |
| **N2** | `help.tsx` is a third collapsible, structurally unlike the other two (bare header + card body, plus a nested item-level accordion). | Converting it to `SectionCard` would add card chrome to its header — a real visual change I can't device-verify. Its missing `accessibilityState` **was** fixed; only the structural convergence is deferred. |

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
| 4 missing DB indexes | All present — [schema.ts:371-383](../src/db/schema.ts#L371) |
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
