# BudgetSplit — Doc Drift

> Companion to [AUDIT.md](./AUDIT.md). Where this folder's pre-existing docs disagree with
> the code on branch `refactor/phase-1-perf-safety` (HEAD `95e88ca`), as of 2026-07-28.
>
> **Method.** AUDIT.md §1–§9 were written from source only; these three docs were read
> *afterwards*, on purpose, so nothing in the audit inherited their assumptions. Every row
> below was re-verified against live code.
>
> Two directions of drift, and both matter:
> - **STALE** — the doc describes something that is no longer true (usually because the
>   work shipped and the doc wasn't updated).
> - **UNDER-REPORTED** — the doc claims something is fixed or fine when the code says
>   otherwise. These are the dangerous ones.

> **Resolution pass — 2026-07-28.** Most of this file has been actioned. `ARCHITECTURE.md`
> §7–§10 were deleted and now point at `AUDIT.md` (closing DRIFT-01 … DRIFT-12);
> `FEATURES_AND_FLOWS.md` §11 was rewritten against the code and §14's duplicate catalog
> replaced with a pointer (DRIFT-20, DRIFT-21); `DEBT_TRACKER.md`'s three wrong rows were
> corrected, including the `nextOccurrence` row, whose underlying duplication was fixed for
> real (DRIFT-13, DRIFT-14, DRIFT-16). DRIFT-11 remains unverified. DRIFT-15, -17, -18 and -19
> were accurate and needed no change. The findings below are kept as the record of what drifted
> and why — not as open work.

> **Resolution pass 2 — 2026-08-04.** The one open *decision* in this file is now made.
> `FEATURES_AND_FLOWS.md` **is** the behaviour doc: `AUDIT.md` §2 (screen inventory) and §3
> (user flows) were absorbed into it — IDs intact, now §3 and §15 there — and reduced to
> pointers, closing the "Decide against AUDIT §2/§3" recommendation below. See DRIFT-22 …
> DRIFT-25 for what the belated line-audit found, and DRIFT-26 for the mechanism added so it
> can't recur.

## Summary

| Doc | Lines | Rows checked | Stale | Under-reported | Verdict |
|---|---|---|---|---|---|
| `ARCHITECTURE.md` | 372 | 14 | 11 | 2 | §9 and §10 need a rewrite; §1–§6 are accurate |
| `DEBT_TRACKER.md` | 176 | 9 | 4 | 3 | Scoreboard is close; two "resolved" rows are wrong |
| `FEATURES_AND_FLOWS.md` | 577 → **line-audited 2026-08-04** | all | 6 | 4 | ✓ Rewritten from source; now the single behaviour doc |

---

## ARCHITECTURE.md

### DRIFT-01 — §9 "27 pure-ish modules" — **STALE**

`src/lib` has **52** modules. The count is roughly half.

### DRIFT-02 — §9 "**`budget.ts` has no tests** (canonical engine)" — **STALE**

`src/__tests__/budget.test.ts` exists. This is called out in bold as a coverage gap and it
is closed.

### DRIFT-03 — §9 lists `subscriptions.ts` as an orphan module — **STALE**

`src/lib/subscriptions.ts` and `src/__tests__/subscriptions.test.ts` **do not exist**. They
were removed in `95e88ca` ("chore: delete superseded docs and dead exports"). §9's "Orphan /
dead modules" paragraph and its "Test coverage" list both still name them.

`ocr.ts`, the other module named there, *is* still present and still parked — that half is
correct (AUDIT §5 INT-09).

### DRIFT-04 — §9 "two competing month-end projections" — **STALE**

The doc says `analytics.projectedMonthEnd` (linear) competes with `forecast.forecastMonthEnd`
(Bühlmann) and should be unified "later". It already was:
`analytics.ts:177` calls `forecastMonthEnd(...)` and assigns `.projected`. There is one model.

### DRIFT-05 — §9 "**threshold logic duplicated**" between `budget` and `analytics` — **STALE**

`analytics.ts:9` imports `budgetHealth` and `utilLabel` from `./budget`, and `analytics.ts:125`
carries the comment *"Shares the 80/100 thresholds with lib/budget.budgetHealth (one source)."*
Deduplicated.

### DRIFT-06 — §7 "Feature-flag defaults are duplicated" — **STALE**

`FeatureFlagsProvider.tsx:11` is now `const defaultFlags = DEFAULTS;` with the comment
*"Single source of truth for defaults — lib/featureFlags.ts (was duplicated here)."*
One source.

### DRIFT-07 — §7 "`feature_*` (20 flag keys)" — **STALE**

There are **19** `FeatureKey`s (`src/lib/featureFlags.ts:5-28`). The 20th was almost
certainly `subscriptions` — see DRIFT-09.

### DRIFT-08 — §7 AsyncStorage key list — **STALE**

Lists `auto_sweep_enabled` and `savings_last_sweep`. Neither appears in `src/lib/settings.ts`'s
key map, and neither is referenced anywhere in `src/` or `app/`.

Two keys that *do* exist are missing from the list: none — the rest of the list is accurate.

### DRIFT-09 — §10 flag table is substantially wrong — **STALE + UNDER-REPORTED**

This is the most misleading table in the three docs. Row by row:

| Doc says | Code says |
|---|---|
| `subscriptions` flag, default on, gates "Subscriptions chip/screen, insights nudge" | **No such flag.** Not a member of `FeatureKey`. |
| `healthScore` gates "Home health ring + sheet" | **Gates nothing.** No `flags.healthScore` reference exists. The ring renders unconditionally via `HeroCard` (`app/(tabs)/index.tsx:256-258`). |
| `reportsDonut` / `reportsTrend` gate "Reports charts" | **Gate nothing.** `CategoryDonut` and `TrendBars` render unconditionally (`app/reports.tsx:259,281`). |
| `itemizedOcr` — "*No live code path*" | Correct, and still true. |
| `affordCheck` — "also gated by a dead `SHOW_EXTRAS`, so effectively unreachable" | **No longer true.** `SHOW_EXTRAS` does not exist; the Afford screen is reachable from the Plan header when the flag is on (`app/(tabs)/savings.tsx:98`). |
| `streak` — "(Home streak card is commented out)" | **No longer true.** `StreakCard` is live at `app/(tabs)/index.tsx:296-302`. |
| `forecast` gates "Reports forecast line, Plan velocity" | Wrong surfaces. It gates the **Home** `ForecastCard` and part of `loadHomeData`. The forecast graph moved to `/insights`. |
| — | **Six flags are missing from the table entirely**: `dashboardInsights` (which *does* gate), plus `dashboardCash`, `dashboardBudget`, `dashboardDonut`, `dashboardBalances`, `dashboardSavings`, `budgetInsights`, `savingsInsights`, `recurring`. |

The doc also calls the toggle screen **"Settings → Sections"**; it is labelled **"Feature
management"** in `app/(tabs)/settings.tsx:203` and titled "Feature Management" in
`app/features.tsx:85`.

Net effect: a reader of §10 would believe the flag system works. AUDIT §4.3 shows **11 of
19 flags gate nothing**, five of them exposed as live switches.

### DRIFT-10 — §8 "Tokens live in `src/constants/`" — **STALE**

`AGENTS.md` §10 now declares `src/theme/` canonical and `src/constants/{colors,typography,layout}`
back-compat re-export shims. ARCHITECTURE.md §8 still presents `constants/` as the source and
its "Convention reality" note reinforces that. The note was accurate when written; the
canonical location has since moved. (The *de-facto* observation — most screens still import
from `constants/*` — remains true; see AUDIT DEBT-16.)

### DRIFT-11 — §9 "33 default expense categories + 11 income categories" — **UNVERIFIED**

Not re-counted in this audit. `TRANSFER_CATEGORIES` exists as a third kind
(`src/constants/categories.ts`) and is not mentioned in §8's category paragraph.

### DRIFT-12 — §7 heading "Settings live in THREE places (one of them dead)" — **ACCURATE, incomplete**

The three-places framing holds and the "`settings` table is dead" claim is correct (its only
live use is the `category_global_v1` migration flag, `schema.ts:418,440` — worth adding, since
"never read/written" is literally false). But there are now **four** preference stores, not
three: feature flags, `lib/settings.ts`, **reminder prefs JSON** (`lib/reminders.ts`), and the
dead table. `lib/settings.ts:9-15` documents the split itself. See AUDIT DEBT-04.

---

## DEBT_TRACKER.md

The scoreboard at the top is broadly honest and the file's own rule 4 ("verify before you
carry an item forward") is exactly right. Three rows fail that rule.

### DRIFT-13 — "Caught stale: `nextOccurrence` duplicated in `recurring.tsx` → **One source** at `recurrence.ts:44`; every caller imports it" — **UNDER-REPORTED**

**Still duplicated.** `app/group/[id]/recurring.tsx:35-54` defines its own local
`nextOccurrence(rule, skips)` with its own `guard < 2000` loop cap and its own skip walk. It
does not import `nextOccurrenceOnOrAfter`.

The other callers *do* import it (`app/plan/recurring.tsx:19`, `app/txn/[id].tsx`,
`src/lib/groupDetail.ts:2`), which is presumably why this was marked resolved — but the one
file the row names by name is the one that still has the copy. Tracked in AUDIT as DEBT-05.

### DRIFT-14 — "Untested lib modules: **9** (all native I/O adapters)" — **UNDER-REPORTED**

Actual count: **13**. The row's own list (haptics, location, shareCsv, pdfjsCache,
attachment, avatar, notifications, analytics, onboarding) omits four that have no test file:

- `homeData.ts` (218 L)
- `reportsData.ts` (178 L)
- `insightsData.ts` (125 L)
- `txnDetail.ts` (15 L)

The first three are the loaders behind Home, Reports and Insights — they were extracted from
those screens during the C5/C9/C10 complexity paydown (rows C5, C9, C10 in the same file) and
no test came with them. The "all native I/O adapters" characterisation no longer holds.

### DRIFT-15 — "`any` / `@ts-ignore`: **5**" — **ACCURATE**

Confirmed: 5, all at untyped third-party boundaries. (An earlier pass of this audit reported
7; two were regex false-positives on the word "any" inside comments. The tracker is right.)

### DRIFT-16 — "Largest screen: **976**" — **STALE by one line**

`app/review.tsx` is **977** lines. Trivial, noted only because the file asks for `file:line`
precision.

### DRIFT-17 — "Screens discarding load errors: **0**" — **ACCURATE**

Spot-checked across `useScreenData` consumers: every screen audited renders `ErrorState` with
a retry, and `app/afford.tsx:27-34` carries an explicit comment about why it must not swallow.

### DRIFT-18 — "Won't fix: Dead schema columns + unused `settings` table" — **ACCURATE, understated**

Correct as a decision. Worth noting the dead-column set is larger than "a few": `person.remote_uid`,
`budget_group.limit_daily/monthly/yearly`, `budget_group.carry_over` (still read by the legacy
`getBudgetUsage` path — see AUDIT DEBT-08), and the five `is_demo` columns that are written but
never filtered on (AUDIT ISS-10).

### DRIFT-19 — F4 / F5 external blockers — **ACCURATE**

GPay export format and Google CASA both confirmed as still-blocking. No OAuth or GPay-specific
parser path exists in the code beyond `gpayParse.ts`, which operates on pasted/PDF text.

---

## FEATURES_AND_FLOWS.md

**Line-audited on 2026-08-04** — the audit this file had deferred twice. It was the only doc
here never checked row-by-row, and that is exactly where the worst drift had accumulated. The
recorded length (577) was itself stale: the file was 571 lines when the audit finally ran.

### DRIFT-20 — §11 "Optional modules" inherits ARCHITECTURE's flag model

Its module list is organised around the flags in ARCHITECTURE §10, so it carries the same
errors as DRIFT-09 — in particular it presents the Reports charts and health score as
toggleable.

### DRIFT-21 — Section 14 "Feature catalog" overlaps AUDIT §1

Two feature inventories now exist with different granularity and no shared IDs. Whichever is
kept should be the only one; the other should become a pointer.

### DRIFT-22 — **STALE** — the doc said receipt OCR was parked, four days after it shipped

§11 read: *"the engine … is parked because it could read a bill's total but not its line items,
and its entry point was removed. It is dormant, not broken."* Receipt scanning shipped in
`be5f795` on **2026-08-01** with a live iOS **Scan receipt** button, `ReceiptScanSheet`,
`ScanningOverlay` and two providers. The test matrix row also still said "OCR auto-fill is
parked". `AUDIT.md` §1 (F-31) and §5 (INT-09) carried the same claim and were corrected in the
same pass. ✓ Fixed — now §7.4.

### DRIFT-23 — **UNDER-REPORTED** — the privacy claims outlived the network call

The doc quoted the Settings subtitle *"Offline-first · no accounts"* without noticing that the
default receipt-OCR provider sends the receipt photo to Gemini via a Cloudflare Worker. No doc
in the folder mentioned that `server/receipt-ocr-proxy/` exists or that the repo now has a
server component. The **in-app** copy was worse than the docs: `app/help.tsx` told users
*"BudgetSplit makes zero network calls"*, and `app/storage.tsx` said receipt photos *"never
leave your device"*. ✓ Fixed — behaviour doc §19, `ARCHITECTURE.md` §2/§3, and the three
user-facing strings. The audit also surfaced that the offline provider was unreachable from the
UI at all; a **Cloud Receipt Scanning** switch was added on 2026-08-04 so the privacy claim and
the app agree (DEBT_TRACKER F6).

### DRIFT-24 — **STALE** — four shipped screens had no section

`/review` (the largest screen in the repo), `/import`, `/settings/backup` and
`/report-transactions` appeared nowhere in the screen catalogue, despite the doc's own header
claiming it was "current with the Import → Review ingestion feature". Review's only trace was
one row in the manual-test table. Also missing: Paytm xlsx/csv import, `TrendBars`, the
"All settled up" card, and 32 of 59 `src/lib` modules. ✓ Fixed — §10, §13.3, §12.

### DRIFT-25 — **UNDER-REPORTED** — the doc contradicted itself in six places

§1 and §16 said onboarding was 8 stages while §14 said outright *"it is 9"* (it is 9 — the
**money** stage was the missing one). §13 listed Plan's modules as pills; §7 correctly called
them header icons. §7 said goal funding "tops the **pool** up" **and** "no pool" — and named
`depositAndAllocate`, a function that does not exist (it is `fundGoal`). Pay methods were 3 in
§6/§13 and 7 in §16 (`PAY_METHOD` has 7). §11 promised "All 12 keys" over a 13-row table and
said "Eight further keys" while naming seven (`DEFAULTS` has **14** flags). §16 called
`HealthBand` "imported on Home but not currently rendered" — it is imported by nothing at all,
i.e. dead code. ✓ All resolved from source.

### DRIFT-26 — the mechanism, not another careful pass

The root cause of DRIFT-22 … DRIFT-25 is that **nothing failed** when a screen shipped
undocumented. `src/__tests__/docCoverage.test.ts` now walks every route file under `app/` and
fails if one isn't mentioned in the behaviour doc — the same source-scanning trick
`featureFlags.test.ts` uses to keep the flag table honest. It checks mention, not quality;
the point is to make an omission impossible to miss. Verified to fail before it was trusted.

---

## Recommended disposition

Not actions to take now — just the shape of the cleanup, for whoever grooms this.

| Doc | Suggested fate |
|---|---|
| `ARCHITECTURE.md` §1–§6 | **Keep.** Boot sequence, provider stack, data model and query/state layers all verified accurate. |
| `ARCHITECTURE.md` §7–§10 | **Rewrite or delete.** §9's engine map and §10's flag table are the two most drifted artefacts in the folder. AUDIT §4.3, §6 and §7 supersede them. |
| `DEBT_TRACKER.md` | **Keep as the open-debt tracker.** Reopen DRIFT-13, correct DRIFT-14 and DRIFT-16. Its process rules are good and should not change. |
| `FEATURES_AND_FLOWS.md` | ✓ **Decided (2026-08-04): it wins.** AUDIT §2/§3 were absorbed into it and are now pointers. It is the single behaviour doc, guarded by `docCoverage.test.ts`. |
| `PERSONAL_REDESIGN.md` (96 L) | Not reviewed. Check whether it is still live work or a shipped spec. |

The pattern behind almost every row above is the same one `DEBT_TRACKER.md` rule 4 already
names: **work shipped, the doc describing the old state didn't move.** The fix that would
actually hold is fewer overlapping docs, not more careful ones.
