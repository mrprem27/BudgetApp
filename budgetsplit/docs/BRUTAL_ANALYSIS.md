# BudgetSplit — Brutal Analysis of the Current Codebase

> An honest, evidence-backed critique of the code **as it actually exists** on branch
> `redesign/phase-2`. No charity — strengths get one line, the rest is what's broken,
> half-finished, duplicated, or confusing. Every claim cites a real `file:line`. The fix
> plan lives in [REFACTORING_PLAN.md](./REFACTORING_PLAN.md).

---

## 0. One-paragraph verdict

The **engines are good and the design tokens are coherent** — the math (`settle`,
`afford`, `savingsEngine`, `financialHealth`, `forecast`, `money`) is clean, pure, and
mostly tested. Everything *above* the engines is where the debt lives: a handful of
1000-line screen monoliths, a Zustand store that is 90% dead, settings smeared across
three stores (one of them a dead SQLite table), feature flags whose defaults are
hardcoded twice, several fully-built features wired to nothing, and large swaths of dead
code hidden behind `false &&` and `SHOW_EXTRAS=false`. The app *works*, but it is
carrying a second, invisible app's worth of unreachable code, and its biggest screens are
no longer safely editable.

---

## 1. Poor architecture decisions

### 1.1 The Zustand store is vestigial — there is no in-memory source of truth
`src/store/index.ts` defines `persons`, `groups`, `txns`, `currentGroupId`, `isLocked`,
`biometricEnabled` + actions. Reality:
- Only **2 screens** import it (`app/(tabs)/index.tsx`, `app/(tabs)/groups.tsx`), and they
  mostly *write* to it.
- `txns`, `addTxn`, `removeTxn`, `currentGroupId`, `isLocked`, `biometricEnabled`,
  `getMe()` have **zero read consumers**.
- The app is SQLite-direct: `getMe(db)` is called at ~20 sites; the store's `persons`/
  `getMe()` are never read for rendering.
- `index.tsx:122-124` writes `setGroups`/`setPersons`, but `insertGroup`,
  `addMemberToGroup`, `updatePersonName` never update the store → it diverges the instant
  any mutation runs through a query.

**Net:** the store is a cache that can silently lie and that nobody reads. Either make it
authoritative with invalidation, or delete the dead surface. Today it's the worst of both.

### 1.2 Settings live in three places, one of which is a dead table
- SQLite `settings` table (`schema.ts:110-113`) — **created, never read, never written.**
  A trap for the next developer.
- Zustand `isLocked`/`biometricEnabled` — **dead** (biometric truth is AsyncStorage
  `biometric_enabled` in `LockGate`).
- AsyncStorage — the **real** store, ~20 raw string keys, no schema, no typing.

No single place tells you where a setting lives.

### 1.3 Feature-flag defaults are defined twice
`DEFAULTS` in `lib/featureFlags.ts:33-54` **and** `defaultFlags` in
`FeatureFlagsProvider.tsx:10-16`. Two hardcoded copies kept in sync by hand — they
already differ in formatting and will eventually drift in values.

### 1.4 Foreign keys are off; cascades are hand-rolled and have gaps
`PRAGMA foreign_keys` is only set transiently during a one-time table rebuild
(`schema.ts:277`), never on the live connection. All `REFERENCES` are decorative.
Correctness depends entirely on hand-written delete logic — and there are gaps (see 4.3).

### 1.5 `savings.ts` is secretly the reporting module
`src/db/queries/savings.ts` hosts `getCashPosition`, `getAffordSnapshot`,
`buildSavingsInsights`, `getCategorySpend30d` — cross-domain reporting that reaches into
groups/persons/categories/budgets. These don't belong in a savings query file.

---

## 2. Coding issues & technical debt

### 2.1 Monolith screens — no longer safely editable
| File | Lines | Problem |
|---|---|---|
| `app/add/quick.tsx` | **1250** | ~50 `useState` hooks (lines 57–119), three save paths, transfer/split/recurring/location/attachment/smart-category all inline; the split `Modal` alone is ~100 lines |
| `app/group/[id].tsx` | **1125** | six tab bodies inlined in one component + 7 helpers + ~157 styles |
| `src/components/system/Onboarding.tsx` | **959** | 4 illustration animators + 8 stage views + `finalize` DB writes + 145-line stylesheet |
| `app/reports.tsx` | **872** | 200-line `load` callback; 90-line inline PDF HTML template |
| `app/add/itemized.tsx` | **817** | 4 step bodies inlined |
| `app/(tabs)/savings.tsx` | **674** | ~half the styles are dead |

These are scrolls, not screens. Every one reinvents layout inline.

### 2.2 `quick.tsx` `canSave` is an unreadable nested ternary
`quick.tsx:281-287` mixes transfer/income/expense rules in one expression. Should be a
named predicate per kind.

### 2.3 Magic numbers and ad-hoc date math
`30 * 24 * 60 * 60 * 1000` recurs (`quick.tsx:1022`, `index.tsx:249`) with no shared
`DAY_MS`. Income "yearly" is silently mapped to a custom 365-day interval with a fragile
`>= 365` reverse-map (`income.tsx:103-110`).

### 2.4 `as any` casts and untyped state
`group/[id].tsx:799,825` cast widths `as any`; `budgetUsage` is `useState<any>`
(`group/[id].tsx:115`) and now feeds only dead code.

### 2.5 Tests guard dead code
`subscriptions.test.ts` and `ocr.test.ts` are green — for modules **nothing calls**
(`subscriptions.ts`, `ocr.ts`). Meanwhile the canonical `budget.ts` engine has **no tests
at all**.

---

## 3. Dead, orphan & unreachable code (a lot of it)

### 3.1 Orphan modules (built, tested, never called)
- `lib/subscriptions.ts` — `detectSubscriptions` has no callers; the subscriptions screen
  uses recurring *rules* instead.
- `lib/ocr.ts` — `scanReceipt`/`parseReceiptText` never imported; yet `expo-ocr` is a real
  dependency and `itemizedOcr` defaults **on**.
- `lib/settle.ts` `computeNet` — dead; live net is the SQL `getGroupNet`/`getGlobalNet`.
  Worse, it's *inconsistent* with the SQL version (it doesn't exclude income).
- `lib/analytics.ts` `getDashboardInsights` — no callers; `rankInsights` is test-only.

### 3.2 Orphan screen
- `app/group/[id]/insights.tsx` (298 L) — reachable from nowhere; duplicates the inline
  Insights tab in `group/[id].tsx`. Pure dead weight.
- `app/afford.tsx` — only entry is `SHOW_EXTRAS && flags.affordCheck`, and
  `SHOW_EXTRAS=false` (`savings.tsx:65`) + flag defaults off → unreachable in the build.

### 3.3 Dead branches & toggles inside live screens
- `groups.tsx` — `listMode==='budget'` branch (lines 326–369) is never activated; filter
  chips gated by `false &&` (line 304).
- `group/[id].tsx` — `'balances'` tab body (lines 470–525) is never in the `TABS` array;
  `false && budgetUsage` mini bar (lines 390–397).
- `savings.tsx` — `SHOW_EXTRAS=false` kills ~6 sections (cash card, personal budget,
  insights, what-if, afford) but their styles remain.
- `index.tsx` — `HealthBand`/`StreakCard` imported and commented out; `streak` computed
  but unused; `flags` destructured but only used in dead blocks.
- `settle.tsx` — commented-out multi-settlement counter (lines 207–220).

### 3.4 Dead component & schema columns
- `components/ui/Card.tsx` — exported, imported by **zero** files (everyone inlines the
  card style instead).
- Dead columns: `person.remote_uid`, `person.mobile`, `budget_group.is_shared`,
  `budget_group.default_currency`, `txn.tz`, `txn.currency`, `category_budget.period`
  (always `'monthly'`).
- Reams of unused styles across `savings.tsx`, `groups.tsx`, `settle.tsx`, `group/[id].tsx`.

---

## 4. Duplicate & redundant implementations

### 4.1 The same helpers, copy-pasted with drift
- **`utilLabel` / "N.NX" multiplier formatting** — reimplemented in `group/[id].tsx:73`,
  `reports.tsx:741`, and inline in `analytics.ts:235` — despite `money.formatChangeMagnitude`
  being billed as "the single source of truth for the %/× choice".
- **`healthColor` / 80-100% bucketing** — three independent copies: `group/[id].tsx:45`,
  `group/[id]/insights.tsx:68`, `reports.tsx:746`.
- **Recurring "next occurrence" math** — `recurring.tsx:35-54` has a local copy that
  duplicates `lib/recurrence.nextOccurrenceOnOrAfter` and can drift.
- **Recurring→monthly normalization** — three variants with an actual inconsistency:
  `group/[id].tsx` uses `weekly*4`, while `insights.tsx`/`plan/subscriptions.tsx` use
  `weekly*52/12`. Same concept, different numbers.

### 4.2 Duplicated UI blocks (no shared component)
- The **recurring schedule editor** is built twice — `quick.tsx:1217-1246` and
  `income.tsx:485-498` — with different state names (`recurEnabled`/`recurFreq` vs
  `recurOn`/`freq`).
- The **group-picker sheet** is near-identical in `quick.tsx` and `income.tsx`.
- The **location row + capture effect** is duplicated in `quick.tsx` and `itemized.tsx`.
- The **rename/add-person sheet** is identical in `friends.tsx` and `members.tsx`.
- The **icon-in-colored-dot** primitive is re-implemented inline in ~17 screens (5× in
  `savings.tsx` alone) — the single most-duplicated visual, and there is no `<IconCircle>`.

### 4.3 Two engines for one number
- **Month-end projection** exists twice: `analytics.projectedMonthEnd` (naive linear) and
  `forecast.forecastMonthEnd` (Bühlmann). Different screens can show different numbers.
- **Budget status thresholds** duplicated between `budget.getCategoryBudgetStatus` and
  `analytics.getBudgetAnalytics`.

### 4.4 Redundant DB verbs & orphaned data
- Group archiving has three overlapping functions: `archiveGroupSafe` (txn + guard +
  audit), `archiveGroup` (bare, no guard — a footgun), `unarchiveGroup`.
- `deleteCategory` (`categories.ts:68-70`) deletes only the `category` row — **leaves
  orphan `category_budget` rows and `txn.category` strings** (both keyed by name).

---

## 5. Naming inconsistencies

- **Screen titles don't match routes:** `features.tsx` is titled "Sections"; `friends.tsx`
  is "People"; `/insights` (personal) coexists with a different group-insights file.
- **History back-label lies:** `history.tsx:105` hardcodes "Settings" even when opened from
  the dashboard or a group.
- **Param aliasing:** `members.tsx` uses `const { id: groupId }` while siblings use `id`.
- **Two functions named `insertTxn`:** the public txn inserter (`transactions.ts:126`) and
  a private savings-ledger inserter (`savings.ts:131`).
- **snake_case DB vs camelCase types:** `loadSplits` hand-maps `person_id` ↔ `personId`
  on every row.
- **Two `CHART_COLORS`:** one in `constants/palette.ts`, another in `home/helpers.ts`.
- **Dual ordering concepts:** `savings_goal.priority` (legacy) vs `sort_order` (drag rank).
- **`category_budget.period` vs `cadence`** for the same concept (period is vestigial).

---

## 6. Poor state management

- **useState sprawl:** `quick.tsx` has ~50 `useState` hooks for four cohesive sub-states
  (transfer/recur/split/location) that should be `useReducer` or extracted hooks.
- **No consistent screen-state contract:** Home has loading+error; Groups error-only;
  Plan neither (a thrown query is unhandled, `savings.tsx:118-163`); Settings neither.
- **`search.tsx` retry does nothing:** `onRetry={() => setLoadError(false)}` (line 125)
  flips a flag, but the fetch is in `useEffect([])` and never re-runs.
- **Full reloads after every mutation** — heavy; `reports.tsx` even adds an artificial
  450ms skeleton delay.
- **UI hacks in component state:** `index.tsx` `everHadCats` is a sticky boolean kept only
  to prevent a card from unmounting.

---

## 7. UI / UX inconsistencies

- **Three modal metaphors for "do and return":** full-screen modal (add screens),
  `SheetModal`/`DraggableSheet` (most sheets), and raw RN `<Modal>` (`quick.tsx:921` split
  editor, `txn/[id].tsx:417` receipt viewer, `CategoryPicker` rolls its own). Transitions
  feel arbitrary.
- **Bare-text empty states** that bypass the canonical `EmptyState`: `index.tsx:328`,
  `categories.tsx:227`, `friends.tsx:159`, `txn/[id].tsx:389`, `reports.tsx:764`.
- **Spinner vs skeleton:** `reports.tsx` is the only screen using a bare `ActivityIndicator`.
- **Three settle entry points** with no unifying model (global wizard / direct / Transfer
  pill).
- **Raw hex sprinkled through screens** despite the "never raw hex" rule: e.g.
  `group/[id].tsx:80,345-360,816,1077`, `insights.tsx:307,342`, `savings.tsx:589-617`
  (hardcoded insight backgrounds), `_layout.tsx:60` (`rgba(...)`), `StreakCard` hexes.

---

## 8. Poor folder structure / layering

- **The documented-canonical token barrel is unused by screens.** AGENTS.md says screens
  import via `components/tokens.ts`; in reality **zero** screens do — all 32 import straight
  from `constants/*`, while 42 components import `../tokens`. Two parallel conventions; the
  "canonical" one is used by the wrong layer.
- **A few components bypass `../tokens`** and reach into `constants/` (`FAB.tsx`,
  `BrandedLoader.tsx`, `LockGate.tsx`, `StreakCard.tsx`).
- **Group sub-tabs aren't components** — they live as inline branches in a 1125-line file,
  so the orphan `insights.tsx` can't even be deleted-or-promoted cleanly.

> Layering that *is* clean (credit where due): no `ui/` imports from `finance/system`; no
> `finance/` imports from `system/`.

---

## 9. Maintainability & performance bottlenecks

### Maintainability
- The five monoliths (§2.1) concentrate risk: a change to add-expense means editing a
  1250-line file with 50 state variables and three save paths.
- Dead code (§3) roughly doubles the surface area a reader must reason about.
- Duplicated helpers (§4.1) mean a single bug-fix must be applied in 2–3 places, and some
  copies have already drifted (the `weekly*4` vs `weekly*52/12` bug is live).

### Performance
- **Missing indexes on the hottest path:** no index on `txn(group_id, date)` /
  `is_deleted` / `recur_freq` — every list query scans. Also no `txn(parent_recur_id)` or
  `line_item(txn_id)` index. Only 3 indexes exist total.
- **N+1 split loading:** `loadSplits` runs 2 queries per txn → list loaders do `2N+1`
  (`transactions.ts:87-99,64,84,355,669`).
- **`getAffordSnapshot` fires 6 range queries** (each N+1) on every Quick-Add open.

---

## 10. Transaction-safety gaps

- **`splitRecurringSeries` (`transactions.ts:606-622`)** runs `insertTxn` (its own
  transaction) and *then* a second transaction to cap the old rule. If the second fails →
  **two overlapping active rules** → double-counted occurrences. Documented as intentional,
  but it's a real atomicity hole.
- **`runLeftoverSweep` (`savings.ts:258-275`)** writes the DB and an AsyncStorage marker
  non-atomically — a crash between them re-sweeps next launch.
- **`materializeDueOccurrences`** wraps each occurrence in its own transaction in a loop;
  a mid-loop failure leaves a partial back-fill (idempotent, but worth knowing).

---

## 11. The honest priority list

**If you only fix 5 things (highest leverage):**
1. **Delete the dead code** (§3) — orphan modules, orphan screen, `false &&`/`SHOW_EXTRAS`
   branches, dead store fields, dead columns. Cuts the codebase a developer must reason
   about roughly in half and is almost entirely mechanical.
2. **Add the missing `txn` indexes + batch `loadSplits`** (§9) — the single biggest
   performance win, low risk.
3. **Decide the store's fate** (§1.1) — make it authoritative or delete it; then fix the
   no-error-state / inconsistent-load screens.
4. **Extract shared components/helpers** (§4) — `IconCircle`, `RecurrenceEditor`,
   `GroupPickerSheet`, `budgetHealth`/`utilLabel`, one `recurringMonthlyEquivalent`. This
   also fixes the live `weekly*4` inconsistency bug.
5. **Break the two scariest monoliths** (§2.1) — `quick.tsx` and `group/[id].tsx` — so the
   core add-expense and group-detail flows become editable again.

**Then:** unify settings into one typed store, dedupe the flag defaults, pick one modal
metaphor, unify the settle entry points, and standardize the screen-state contract.

The good news: none of this is a rewrite. The engines and tokens are sound. This is
cleanup, extraction, and deletion — sequenced in [REFACTORING_PLAN.md](./REFACTORING_PLAN.md).
