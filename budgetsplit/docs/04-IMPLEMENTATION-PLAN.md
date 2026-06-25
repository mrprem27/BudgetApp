# BudgetSplit — UI/UX & Flow Implementation Plan

*Source of truth: the approved design (`design/BudgetSplit Redesign - Prompt 1.dc.html`,
`design/BudgetSplit Screens.dc.html`, `design/BudgetSplit Screens 2.dc.html`) +
`docs/02-ANALYSIS-brutal-teardown.md` + the build rules in `AGENTS.md`.*

This plan is grounded in the **real** current code — every step names the actual file,
function, and signature it touches. Implement phase-by-phase; stop for review at each
phase boundary.

---

## 0. Identity (locked)

> **BudgetSplit tells you exactly where your money went and whether you're on pace** —
> across your own spending, your shared tabs, your goals, and your bills.

Two always-on pillars + insights: **Personal Finance** (budget + spending) ·
**Group Splitting** (the moat) · **Insights**. Home answers one question:
**"Am I on pace this month?"**

### Reconciling the two prior decisions with the approved design

The owner earlier asked for (a) *nothing deleted* and (b) *experiment features as
optional toggles, default OFF*. The approved design resolves this slightly differently
and the owner approved it: instead of hiding features behind OFF toggles, the design
**relocates and wires each feature into a coherent home** (afford → inline nudge, health
→ Home band, forecast/subs → Plan). **Zero features are cut.**

**Our reconciliation (considerate of both):**
- Keep the feature-flag system (`FeatureFlagsProvider`, `app/features.tsx`) intact — it
  *is* the optional-toggle mechanism the owner wanted, and remains the user-facing
  "Sections" control surface.
- Where the design says "remove flag gate" (e.g. health on Home), we **default the flag
  ON** rather than ripping the gate out. Same visual result, but the toggle still exists
  for anyone who wants to hide it. Best of both.
- `app/features.tsx` becomes reachable as a real **Settings → Sections** screen (not just
  dev-gated) so the toggles are user-facing as originally requested. `app/storage.tsx`
  stays dev-gated (it's debug).

---

## 1. Design deviations & logical-UI fixes (owner: "be considerate of design errors")

The mockups are excellent but a few details conflict with the real data model, Expo
constraints, or `AGENTS.md`. We implement the **intent**, with these corrections:

| # | Design shows | Problem | What we do instead |
|---|---|---|---|
| D1 | FAB embedded as a raised button inside the tab bar (5th center-right slot) | Expo Router `<Tabs>` doesn't give a center action slot without a fully custom `tabBar`. High risk for Phase 1. | **Phase 1:** keep the existing floating `FAB` (bottom-right), but make it **one-tap** → add expense. **Phase 3 polish:** custom tab bar with embedded FAB if still wanted. |
| D2 | Add Expense as a bottom sheet with Home peeking behind (dimmed) | Current `add/quick.tsx` is a full-screen `presentation:'modal'` route, not a `SheetModal`. Rebuilding as an in-Home sheet risks the validated split/payer/recurrence logic + its tests. | Keep `add/quick` as the modal route (it already `slide_from_bottom`). Restyle to the sheet look; switch to `presentation:'formSheet'` on iOS for the peek-behind. Reuse 100% of existing logic. |
| D3 | Settings tab icon is a hamburger (Screens 2) but a gear (Screens 1) | Design is internally inconsistent. | Keep Feather **`settings`** (gear) — conventional, and `AGENTS.md` mandates valid Feather icons. |
| D4 | "Plan" tab | Route file is `app/(tabs)/savings.tsx`; deep links `/savings/[id]` exist. | Rename the **title only** (`'Money'` → `'Plan'`). Keep the `savings` route name to avoid breaking `/savings/[id]` and `router.push('/savings')`. |
| D5 | Home "Coming up" = next 3 recurring + detected subs | No ready "next N upcoming occurrences" projection exists; `materializeDueOccurrences` only handles *due* ones. | Build a small `lib/upcoming.ts` helper (project next occurrence date from `recur_freq`/`recur_interval` on active series) — shared by Home ComingUp and Plan UpcomingList. If a series can't be projected, omit it (never show a wrong date). |
| D6 | Health "Spending / Trend / Budget" 3 dimensions + 5 factors | Mockup conflates dimensions and factors. | Real `HealthResult` already has `dimensions[3]` + `factors[5]`. Render dimensions as the 3 bars, factors as the "what's driving this" list. Fully compatible. |
| D7 | Hero "On pace · 72% · ₹7.2k left" | Pace/left require a budget to exist. | Hero number (`spent`) always renders. Pace bar + "left" render **only when** a budget is set (`bAlloc > 0`); otherwise the hero shows just the number + period delta. Graceful, per `AGENTS.md` §1. |
| D8 | Amounts like "₹4.2k", "₹1.8L" | Must use the real formatter. | Use `formatCompact()` from `lib/money.ts` everywhere (the existing "X-format"); never hand-format. Full amounts use `formatRupees()`. |

Anything else ambiguous in the design → implement the simplest correct version and note
it in the phase report for review.

---

## 2. Token & component rules (apply to every step)

- **Colors:** only `colors.*` tokens. The design hex map 1:1 onto existing tokens
  (`bg #0A0F11`, `bgCard #13201F`, `bgElevated #1E3633` (design's border), `accent
  #20C4B8`, `income #2BD49B`, `expense/coral #FF6F61`, `settle #8B7CF8`, `healthAmber
  #F5B301`, `textMuted #5A6B69`). The few one-off deep-tint backgrounds in the mockup
  (nudge bg, amber band bg) → derive with token + opacity suffix (e.g. `colors.income +
  '14'`), never new raw hex.
- **Type:** `type.amountXL` for the one hero number; `type.heading`/`subheading` for
  titles; `type.caption` UPPERCASE + `letterSpacing` for section labels. Max 3 sizes/screen.
- **Spacing:** `space.*` and `layout.screenPaddingH`. Cards `radius.lg`, `shadow.sm`,
  `1px colors.border`.
- **Buttons:** `PrimaryButton` for CTAs (never raw `TouchableOpacity` + accent bg).
- **Empty states:** `EmptyState` component (icon circle + title + body + CTA) — never bare text.
- **Components live in:** `components/finance/` (domain) or `components/ui/` (generic);
  import tokens from `../tokens`. `ui` must not import `finance`.
- **Money = integer paise.** `parseToPaise` in, `formatRupees`/`formatCompact` out.
- **Multi-table writes** in `db.withTransactionAsync()`.
- Before any Expo API work, check https://docs.expo.dev/versions/v56.0.0/ .

---

## 3. Screen inventory (designed → target state)

| Designed screen | Real file | Phase |
|---|---|---|
| Home (full + empty + health sheet) | `app/(tabs)/index.tsx` → + new section components | 1 |
| Add Expense sheet (nudge + split + more) | `app/add/quick.tsx` + new sub-components | 1 |
| Plan (pool + goals + upcoming + forecast) | `app/(tabs)/savings.tsx` → + new section components | 2 |
| Settle Up (unified) | new `components/finance/SettleFlow` ← merges `settle.tsx`+`SettleSheet.tsx`+`add/transfer.tsx` | 2 |
| Groups | `app/(tabs)/groups.tsx` (polish only) | 2 |
| Group detail (breadcrumb + sub-tabs) | `app/group/[id].tsx` + sub-routes | 2/3 |

---

## PHASE 1 — Identity + Home + Add  *(smallest shippable; stop for review)*

### 1.1 Rename Money → Plan  *(safe, isolated)*
- File: `app/(tabs)/_layout.tsx` line 58 — `title: 'Money'` → `title: 'Plan'`.
- Keep `name="savings"`, keep the `dollar-sign`→ consider `bar-chart-2`/`trending-up`
  icon to match the design's bar-chart glyph (design uses a bars icon for Plan).
- Acceptance: tab reads "Plan"; `/savings/[id]` still resolves.

### 1.2 Extract Home section components  *(pure refactor, additive)*
Create in `components/finance/home/` (new folder), each a presentational component fed by
props (no data fetching inside):
- `HeroCard` — props: `{ spent, budgetAllocated, budgetSpent, periodLabel, delta, prevLabel }`. Renders the one `type.amountXL` number, pace bar + "X% · ₹Y left" **only if** `budgetAllocated>0` (D7), else number + delta. Uses `formatCompact`/`formatRupees` (D8).
- `BalanceStrip` — props: `{ oweTotal, owedTotal, onSettle }`. Hidden by caller when both are 0. "Settle →" chip → opens SettleFlow (Phase 2; Phase 1 routes to existing `/settle`).
- `CategoryRankList` — props: `{ rows: {name,icon,color,paise,pct}[], onPress }`. Top 3 + "+N more →".
- `ComingUpList` — props: `{ items: {name,amount,daysUntil,source}[] }`. Uses `lib/upcoming.ts` (D5). Hidden when empty.
- `HealthBand` — props: `{ score, band, worstFactorText, onPress }`. Compact chip → opens Health sheet.
- `HealthSheet` (`components/finance/HealthSheet.tsx`) — props: `{ result: HealthResult }`. Ring + 3 dimension bars + factors list (D6). Uses `SheetModal`.
- Source rows to lift from `index.tsx`: hero 322–356, balances 358–388, health 390–443, donut/where-it-went 489–499, plus helpers `utilLabel` (80), `greeting` (70). Move `utilLabel`/`healthColor`/`sevColor` into `components/finance/home/helpers.ts` (kills the dup noted in teardown).
- Acceptance: components render in isolation; no logic changes; `npm test` still green.

### 1.3 Rebuild Home screen
- File: `app/(tabs)/index.tsx`. Keep the existing `load()` data pipeline (it already
  computes `sp`, `inc`, `oweTotal`, `owedTotal`, budget rollup `bAlloc/bSpent/over/near`,
  `computeHealthScore`, `catMap`/`donutData`). Re-compose the JSX as the new ranked
  hierarchy: header → HeroCard → period TabPills → BalanceStrip → CategoryRankList →
  ComingUpList → HealthBand. Root screen should shrink well below 805 lines.
- **NOT on Home** (move/remove per design): savings pool card, goals list, full donut,
  insights carousel, budget hero card, group-health list → these live on Plan/Groups.
  (Keep their `load()` calls only if still needed; otherwise drop to speed up Home.)
- Header: greeting + name (left); search 🔍 → `/search` and history 🕐 → `/history`
  icons (right) per relocation map. Keep `MemberAvatar`.
- **Empty state** (Screens 2): hero shows ₹0 dashed, EmptyState "Start tracking / Add
  your first expense" + the two secondary hint rows (create group / set budget). Use the
  real `EmptyState` component styling.
- Acceptance: matches `design/BudgetSplit Screens.dc.html` Home (full) and Screens 2
  (empty) within token tolerances; one hero number; no card-soup.

### 1.4 FAB → one-tap add  *(D1)*
- `app/(tabs)/index.tsx` 618–624 and `app/(tabs)/groups.tsx` 379–383: replace the
  4-action `FAB actions={[...]}` with a single-tap FAB that routes
  `/add/quick?kind=expense`.
- Simplest path: give `FAB` an optional `onPress` (single action) prop; when present it
  skips the fan-out menu. Keep the `actions[]` API for any other caller. (Income/itemized/
  transfer now live *inside* the add sheet — step 1.5 — and on Groups.)
- Acceptance: tapping + opens Add Expense directly; no menu.

### 1.5 Add flow: BudgetNudge + income toggle + More options
- File: `app/add/quick.tsx`. Extract (per design §7) into `components/finance/add/`:
  `AmountInput`, `CategoryDateRow`, `BudgetNudge`, `SplitRow`, `RecurRow`, `MoreOptions`.
  Root screen target < 250 lines.
- **BudgetNudge** (the inline afford context, the headline new feature): when a category
  is selected, call `getAffordSnapshot(db)` once on open, then for the chosen category use
  its `byCategory[cat]` (budget − spent) to show **"₹X left in {cat} this month"** in
  income/amber/expense color; if no category budget, show `getCashPosition().available`
  as "₹X safe to spend"; if neither, hide the row. Optionally pass amount through
  `evaluateAfford()` for the verdict color. Never blocks save.
- **Income toggle**: surface the existing `kind` state as an Expense/Income segmented
  control at the top of the sheet (the screen already supports `kind`; today it's set via
  route param). Flipping to Income hides split UI (income = payments only), matching
  current validation (`canSave`).
- **More options** row: "Income · By items · Recurring" — Income flips kind; By items →
  `router.replace('/add/itemized')` carrying amount/category; Recurring expands the
  existing `RecurRow` inline (already in the screen).
- Visual: restyle to the sheet look (D2); `presentation:'formSheet'` on iOS for peek.
- Acceptance: add an expense in one tap from Home; nudge shows correct remaining; income
  toggle works; existing split/payer/recurrence still function; tests green.

### 1.6 Health default-on + detail sheet
- Default `flags.healthScore` **ON** (change default in `FeatureFlagsProvider`), don't
  remove the gate (reconciliation §0).
- Home renders `HealthBand` (compact) instead of the 3 rings; tap → `HealthSheet`
  (ring + dimensions + factors) built from the same `computeHealthScore` result already
  computed in `load()`.
- Acceptance: band visible by default; sheet shows score/band/dimensions/factors and
  matches Screens 2 health sheet.

### 1.7 Dev-gate debug + expose Sections
- `app/storage.tsx`: dev-gate (reachable only via a hidden gesture — long-press the
  Settings header 5×; store a transient flag). Remove any user-facing entry point.
- `app/features.tsx`: keep reachable as **Settings → Sections** (user-facing toggles,
  per owner's original ask) with one-line descriptions per flag.
- Acceptance: storage not reachable normally; Sections reachable from Settings.

### Phase 1 review gate
- `npm test` green (component extractions are pure refactors → no test changes expected).
- Manual: Home (full + empty), Add (one-tap + nudge + income), Health sheet, tab labels.
- Report: files changed, components extracted, line-count deltas, anything deferred.

---

## PHASE 2 — Money-between-people + Plan + States  *(stop for review)*

### 2.1 SettleFlow (unify settle + group-settle + transfer)
- New `components/finance/SettleFlow.tsx` (`SheetModal`-based). Merges `app/settle.tsx`,
  `components/finance/SettleSheet.tsx`, `app/add/transfer.tsx`.
- Step 1 WHO+AMOUNT: prefill from `simplify(getGlobalNet())` (`lib/settle.ts` +
  `db/queries/balances.ts`); plain direction text ("Rahul owes you ₹2,100"); editable
  person + partial amount. Step 2 HOW: chips UPI/Cash/Bank + optional note (replaces the
  transfer screen). Step 3 WRITE: `insertTxn({kind:'settlement', entryMode:'quick', ...})`
  into the common group (`getCommonGroupId` if present; else inline "no shared group"
  message — never a buried async error).
- Entry points: Home `BalanceStrip` "Settle →", Groups person row, Group detail member.
- Deprecate routes `settle`, `add/transfer` (keep files until callers migrated; then remove).
- Tests: update `settle.test.ts` to drive the new flow's net→settlement path (algorithm
  unchanged: `simplify`/`computeNet`).

### 2.2 Plan tab (dismantle the 544-line kitchen sink)
- File: `app/(tabs)/savings.tsx`. Extract into `components/finance/plan/`: `PoolCard`
  (252–278), `GoalList` (333–366), `UpcomingList` (new — cross-group recurring via
  `getRecurringForGroup`/`lib/upcoming.ts` + `detectSubscriptions` from `getTransactionsInRange`
  last ~150d), `WhatIfRow` (299–330), and a `MonthEndForecastRow` using
  `forecastMonthEnd(...)` from `lib/forecast.ts`.
- Order per design: Pool → Goals → Upcoming → Forecast → (insights if ≥2 periods).
- Afford full view: keep `app/afford.tsx` reachable as a Plan link (the inline nudge is
  the primary surface; the screen is the deep view).

### 2.3 State matrix (every kept screen)
Implement Empty/Loading/Error/Full for Home, Groups, Plan, Group detail, Add, SettleFlow,
`category/[name]`, `savings/[id]`, `txn/[id]` per design §6 — using `EmptyState`,
`Skeleton`/`SkeletonCard`, `ErrorState`. No bare "No data yet" text anywhere.

### 2.4 Store/DB divergence
Make the Zustand `txns[]` the single read source where screens currently re-query
directly; ensure `addTxn`/`removeTxn` keep it consistent after writes (undo already does).

### Phase 2 review gate
SettleFlow end-to-end from all 3 entry points; all screen states; tests green.

---

## PHASE 3 — Polish + remaining monoliths  *(stop for review)*

- Group detail: breadcrumb (Groups › Name), sub-tab segmented control
  (Expenses/Budget/Members/Insights) per Screens 2; fold `CategoryPieChart` from
  `reports.tsx` here.
- Fold `TrendSparkline` from `reports.tsx` into `HeroCard`; leave `reports.tsx` `href:null`.
- Extract `add/itemized.tsx` (705) → `LineItemList`/`AdjustmentsRow`/`ItemizedSummary`/
  `PersonAssignmentRow`; give itemized **recurrence parity** with quick add.
- Token-discipline pass: replace any remaining inline hex with tokens; unify
  `utilLabel`/`healthColor`/`fmtY` into one shared lib (started in 1.2).
- Categories: single management flow per group (resolve constants-vs-screen split-brain);
  reachable from Settings → Categories.
- Settings consolidation: one source of truth across `FeatureFlagsProvider` + AsyncStorage
  + SQLite `settings`.
- OCR: wire receipt capture into the Add sheet attach icon.
- D1 (optional): custom tab bar with embedded FAB if still desired.
- Recurrence: one mental model / one `RecurRow` everywhere.

### Phase 3 review gate
Full visual audit, token consistency, entire test suite green.

---

## 4. Testing rule (all phases)
Existing suite (`afford`, `settle`, `savings`, `recurrence`, `financialHealth`, `money`,
`donut`, `forecast`, `subscriptions`, …) must stay green after each phase. Phase 1
extractions are pure refactors → no test changes expected. Phase 2 settle merge keeps the
`insertTxn`/`simplify` contracts → extend `settle.test.ts`. Phase 3 settings consolidation
→ update any test reading AsyncStorage prefs directly. Add tests for new pure logic
(`lib/upcoming.ts`).

## 5. Master checklist
- [ ] 1.1 Tab rename Money→Plan
- [ ] 1.2 Home section components extracted + helpers de-duped
- [ ] 1.3 Home rebuilt (full + empty) hero-first
- [ ] 1.4 FAB one-tap
- [ ] 1.5 Add: BudgetNudge + income toggle + More options + sub-components
- [ ] 1.6 Health default-on + HealthSheet
- [ ] 1.7 Dev-gate storage; Sections in Settings
- [ ] Phase 1 review + tests
- [ ] 2.1 SettleFlow unified
- [ ] 2.2 Plan tab extracted
- [ ] 2.3 State matrix
- [ ] 2.4 Store/DB single source
- [ ] Phase 2 review + tests
- [ ] 3.x Polish (group detail, charts fold, itemized, tokens, categories, settings, OCR, FAB-in-tabbar, recurrence)
- [ ] Phase 3 review + full suite green
