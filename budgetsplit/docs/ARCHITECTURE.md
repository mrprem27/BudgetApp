# BudgetSplit — Architecture

> **Single source of truth for how the app is built.** Grounded in the actual code on
> branch `redesign/phase-2`. Companion docs: [FEATURES_AND_FLOWS.md](./FEATURES_AND_FLOWS.md)
> (what every screen does), [FUTURE_IMPROVEMENTS.md](./FUTURE_IMPROVEMENTS.md),
> [BRUTAL_ANALYSIS.md](./BRUTAL_ANALYSIS.md), [REFACTORING_PLAN.md](./REFACTORING_PLAN.md).
> Build/design rules live in [../AGENTS.md](../AGENTS.md).

> ⚠️ **Status (reconciled 2026-06-26):** this was written as the *pre-refactor baseline*.
> The codebase has since completed all of [REFACTORING_PLAN.md](./REFACTORING_PLAN.md)
> (see its "Completion status"). Changed since: the Zustand store is trimmed to
> `groups`/`setGroups`; new lib modules `settings.ts`, `onboarding.ts`, `itemized.ts`,
> `reportExport.ts` + `recordSettlement`; **one** forecast model (`lib/forecast`) and one
> `budgetHealth`/`utilLabel`; the standalone `/settle` screen, `Card.tsx`,
> `computeNet`, `getDashboardInsights`/`rankInsights` are **deleted**; settlements record via
> `recordSettlement`. The dead `settings` table + columns in §5 are still present (left on
> purpose). Treat data-model/§ details as accurate; treat store/§6, settle, and the
> "competing forecasts" notes as superseded.

---

## 1. What the app is

A **100% offline, private** personal-finance + bill-splitting app for urban Indian users.
Three always-on pillars: **Personal Finance** (budget + spending), **Group Splitting**
(shared expenses, itemized splits, settle-up), and **Insights** (turning the first two
into understanding). Everything else (forecast, health score, subscriptions, reminders,
afford check, savings goals) ships as optional feature-flagged modules.

**Hard invariants:**
- **No accounts, no network, no cloud, no tracking.** All data lives in a local SQLite
  file (`budgetsplit.db`). Notifications are local-only (no push server).
- **Money is always integer paise.** Parse with `parseToPaise`, display with
  `formatRupees`/`formatCompact`. Never floats.
- **Timestamps are epoch ms** (`Date.now()`), not `new Date()` in DB paths.
- **Multi-table writes go inside `db.withTransactionAsync()`.**

---

## 2. Tech stack

| Concern | Choice |
|---|---|
| Runtime | React Native + **Expo SDK 56** (check `https://docs.expo.dev/versions/v56.0.0/` before any Expo API work) |
| Navigation | **Expo Router** (file-based, `app/`) |
| Database | **expo-sqlite** (`budgetsplit.db`, WAL mode) |
| Global state | **Zustand** (`src/store/index.ts`) — *largely vestigial; see §6* |
| Local prefs | **AsyncStorage** (the real settings store; see §7) |
| Charts | **react-native-svg** (donut, health ring) + **gifted-charts** (reports trend) |
| Gestures/animation | **react-native-gesture-handler**, **react-native-reanimated**, RN `Animated` |
| Fonts | **SpaceMono** (money), **Inter** (everything else) |

---

## 3. Folder structure

```
budgetsplit/
├── app/                         # Expo Router routes (screens)
│   ├── _layout.tsx              # Boot: DB init, providers, gates, Stack
│   ├── (tabs)/                  # Tab bar + 4 tabs
│   │   ├── _layout.tsx          # Custom tab bar w/ docked center FAB
│   │   ├── index.tsx            # Home / Dashboard
│   │   ├── groups.tsx           # Groups + People balances
│   │   ├── savings.tsx          # Plan tab (route name stays "savings")
│   │   └── settings.tsx         # Settings
│   ├── add/                     # quick.tsx · income.tsx · itemized.tsx (fullScreenModal)
│   ├── group/[id].tsx           # Group detail (tabbed) + [id]/{budget,edit,insights,members,recurring}
│   ├── savings/[id].tsx         # Goal detail
│   ├── txn/[id].tsx             # Transaction detail
│   ├── category/[name].tsx      # Category detail
│   ├── plan/subscriptions.tsx   # Subscriptions list
│   ├── settings/notifications.tsx
│   ├── settle.tsx · search.tsx · friends.tsx · categories.tsx · features.tsx
│   ├── help.tsx · history.tsx · storage.tsx · afford.tsx · insights.tsx · reminders.tsx
│   └── reports.tsx              # Reachable only via Plan chip
├── src/
│   ├── components/
│   │   ├── ui/                  # Generic primitives (domain-free)
│   │   ├── finance/             # Domain widgets
│   │   │   └── home/            # Home-dashboard widgets + helpers.ts
│   │   ├── system/              # Onboarding, gates, providers, loader
│   │   └── tokens.ts            # Re-export barrel (used by components, not screens — see §8)
│   ├── constants/              # colors · typography · layout · palette · categories
│   ├── db/
│   │   ├── schema.ts           # DDL + migrations + openDB
│   │   ├── seed.ts             # First-run seed
│   │   └── queries/            # transactions · groups · persons · savings · categories
│   │                           # · categoryBudgets · balances · audit
│   ├── lib/                    # Pure business logic / engines (27 modules)
│   ├── store/index.ts          # Zustand store
│   └── __tests__/              # Jest tests for pure lib logic
└── docs/                       # This documentation set
```

**Component layering rule (enforced, AGENTS.md §):** `ui/` must not import from
`finance/` or `system/`; `finance/`/`system/` may import from `ui/`. This is currently
clean — the only cross-folder finance import is `HealthSheet` pulling from
`finance/home/helpers.ts` (same domain, acceptable).

---

## 4. App boot & navigation shell

### Boot sequence (`app/_layout.tsx`)
1. `openDB()` → `seedIfNeeded(db)` (first-run categories/Personal group/me).
2. `materializeDueOccurrences(db)` — back-fills due recurring occurrences as real txns.
3. `runSavingsMaintenance(db)` — auto-sweep → scheduled allocations → reconcile.
4. `rescheduleReminders(db)` — fire-and-forget local-notification scheduling.
5. On success → render the provider/gate tree; on any throw → full-screen `ErrorState`
   with Retry (bumps `attempt`, re-runs boot). While booting → `BrandedLoader`.

An **AppState listener** re-runs steps 2–4 every time the app returns to foreground.

### Provider / gate stack (outer → inner)
```
SafeAreaProvider
└ GestureHandlerRootView
  └ SQLiteProvider (budgetsplit.db)
    └ FeatureFlagsProvider
      └ UndoProvider
        ├ LockGate (biometric)
        │  └ OnboardingGate
        │     └ Stack (tabs + 3 add modals)
        └ PrivacyScreen (overlay, app-switcher blur)
```

### Navigation shell
Custom bottom tab bar (`app/(tabs)/_layout.tsx`): **Home · Groups · [FAB] · Plan ·
Settings**. The center FAB is a coral→teal gradient `+`; tapping it goes straight to
`/add/quick?kind=expense` (one tap, no fan-out menu). `BlurView` backdrop.

**Modal depth metaphors in use (inconsistent — see BRUTAL_ANALYSIS):**
- Add screens (`add/quick`, `add/income`, `add/itemized`) are `presentation:'fullScreenModal'`, slide from bottom.
- Most detail/management screens are stack-push (slide from right).
- In-screen sheets use `SheetModal`/`DraggableSheet`; a couple of screens still use raw RN `<Modal>`.

---

## 5. Data model (canonical schema)

Source: `src/db/schema.ts`. SQLite, WAL. **`PRAGMA foreign_keys` is NOT enabled at
runtime** — all `REFERENCES` are declarative only; cascade-correctness depends on
hand-written delete logic.

### Domain map

| Domain | Tables |
|---|---|
| System / identity | `person`, `audit_log`, ~~`settings`~~ (dead) |
| Group (shared + personal) | `budget_group`, `group_member`, `category`, `category_budget` |
| Transactions | `txn`, `txn_payment`, `txn_share`, `line_item`, `recur_skip` |
| Savings | `savings_goal`, `savings_txn` |

> "Personal" is **not** a separate table — it's a `budget_group` row with
> `is_personal=1`. The oldest group is force-marked personal in `openDB`.

### `person`
`id` PK · `name` · `avatar_color` · `is_me` (exactly one row =1) · `email` (backfilled) ·
`image_uri` (local avatar). **Dead:** `mobile` (never written), `remote_uid` (never read/written).

### `budget_group`
`id` PK · `name`/`icon`/`color` · `limit_daily`/`limit_monthly`/`limit_yearly` ·
`carry_over` · `is_archived` (used) · `is_personal` (used) · `simplify_debt` ·
`default_split` CHECK(equal/exact/percent/shares) · `created_at`.
**Dead/vestigial:** `is_shared` (always 0, never filtered), `default_currency` (never read/written).

### `group_member`
PK `(group_id, person_id)` · `joined_at`.

### `txn` — central table; **also holds recurring rules**
`id` PK · `group_id` · `kind` CHECK(income/expense/settlement) · `entry_mode`
CHECK(quick/itemized) · `date` · `category` (**name string, not an FK**) · `note` ·
`attachment_uri` · `tags`(JSON) · `adjustments`(JSON) · recurring fields
(`recur_freq` CHECK incl. daily/weekly/monthly/yearly/custom, `recur_interval`,
`recur_end`, `recur_override_date`, `parent_recur_id`, `recur_state`
CHECK active/paused/ended) · `lat`/`lng`/`place_label` (wired → Maps link on txn detail) ·
`pay_method` (upi/cash/bank, on settlements) · `is_deleted` (soft delete) ·
`created_at`/`updated_at`.
**Captured but never displayed:** `tz`, `currency`.
A non-null `recur_freq` means the row is a recurring **rule/template**; materialized
occurrences carry `parent_recur_id` pointing back to it.

### `txn_payment` / `txn_share`
Both PK `(txn_id, person_id)` · `amount` (paise). Payment = who paid; share = who owes.

### `line_item`
`id` PK · `txn_id` · `name` · `qty` · `unit_price` · `assigned_to` (JSON person-id array).

### `category`
`id` PK · `group_id` · `name` · `icon` · `color` · `kind` CHECK(expense/income) ·
`section`. **Per-group** — duplicated into every group at creation.

### `category_budget`
`id` PK · `group_id` · `category` (name string) · `period` (**vestigial — always
`'monthly'`**) · `amount` · `cadence` (the real one: once/daily/monthly/yearly) ·
`UNIQUE(group_id, category, period)`.

### `recur_skip`
Records skipped occurrences of a recurring rule (skip-one support).

### `audit_log`
`id` · `entity_type` · `entity_id` · `group_id` · `action` · `summary` · `amount` ·
`created_at`. Indexed on `created_at DESC` and `group_id`.

### `savings_goal`
`id` · `name` · `target` · `priority` CHECK(high/medium/low) (**legacy fallback** —
funding order now driven by `sort_order` drag rank) · `category` · `icon` · `color` ·
`allocation` · `frequency` CHECK(daily/weekly/monthly/yearly/none) · `locked` ·
`is_archived` · `last_auto_at` · `target_date` · `sort_order` · `created_at`.

### `savings_txn`
`id` · `goal_id` (NULL = pool-level) · `amount` · `kind` CHECK(deposit/allocate/withdraw) ·
`source` CHECK(manual/auto) · `date` · `note` · `created_at`. Indexed on `goal_id`.

### `settings` — **DEAD TABLE**
Created in DDL, **zero reads/writes**. All key/value settings live in AsyncStorage (§7).

### Indexing reality
Only 3 indexes exist (audit ×2, savings_txn ×1). **The hottest path — `txn(group_id,
date)` filtered by `is_deleted`/`recur_freq` — is unindexed**, as is
`txn(parent_recur_id)` and `line_item(txn_id)`. See REFACTORING_PLAN.

---

## 6. Query & state layers

### Query layer (`src/db/queries/`)
Eight files. Multi-table writes correctly use `withTransactionAsync` with two known
gaps (`splitRecurringSeries` runs two separate transactions; `runLeftoverSweep` mixes
an AsyncStorage marker with DB writes — both documented in BRUTAL_ANALYSIS).

| File | Responsibility |
|---|---|
| `transactions.ts` (762 L) | All txn CRUD, itemized, recurring rules, materialization, skips, duplicates, streak |
| `groups.ts` | Group CRUD, members, archive/restore/delete (cascades), `getCommonGroupId` |
| `persons.ts` | People CRUD, `getMe`, group membership, avatars |
| `categories.ts` | Per-group categories CRUD (with usage counts) |
| `categoryBudgets.ts` | Per-category budget limits (delete-all-then-reinsert) |
| `balances.ts` | **Canonical net-balance SQL** (`getGroupNet`, `getGlobalNet`), spending/income, `getFriendBalances` |
| `audit.ts` | `logAudit` (call inside caller's txn), `getAuditLog` |
| `savings.ts` (471 L) | Goals + pool ledger + auto-funding; **also de-facto reporting module** (`getCashPosition`, `getAffordSnapshot`, `buildSavingsInsights`) |

### State layer (`src/store/index.ts`)
One Zustand store: `persons`, `groups`, `currentGroupId`, `txns`, `isLocked`,
`biometricEnabled` + actions. **It is overwhelmingly vestigial:**
- Only **2 screens** import it (`index.tsx`, `groups.tsx`) and they mostly **write** to it.
- The app is **SQLite-direct**: every screen loads via `useSQLiteContext()` + query
  functions into local `useState`. `getMe(db)` is called directly at ~20 sites; the
  store's `getMe()`/`persons` are never read for rendering.
- `txns`/`addTxn`/`removeTxn`/`currentGroupId`/`isLocked`/`biometricEnabled` have **zero
  read consumers** — dead store surface.

**Implication:** there is no single in-memory source of truth; the store can silently
diverge from the DB. The pragmatic model today is "SQLite is the source; reload after
every mutation." See REFACTORING_PLAN for the decision (make the store authoritative, or
delete the dead surface).

---

## 7. Settings live in THREE places (one of them dead)

| Mechanism | Status | Holds |
|---|---|---|
| SQLite `settings` table | **DEAD** (never read/written) | — |
| Zustand `isLocked`/`biometricEnabled` | **DEAD** (0 reads) | — (biometric truth is AsyncStorage `biometric_enabled` in `LockGate`) |
| **AsyncStorage** | **The real store** | everything below |

AsyncStorage keys (raw strings, no schema): `feature_*` (20 flag keys), `biometric_enabled`,
`hide_amounts`, `privacy_screen`, `save_location`, `default_cadence`, `default_currency`,
`payday`, `monthly_income`, `auto_sweep_enabled`, `savings_last_sweep`, `onboarding_done`,
`onboarding_intent`, `pending_first_add`, `app_last_open`, plus legacy/migration keys.

**Feature-flag defaults are duplicated**: `DEFAULTS` in `lib/featureFlags.ts` and a second
hardcoded `defaultFlags` in `FeatureFlagsProvider.tsx` — kept in sync by hand.

---

## 8. Design system

Tokens live in `src/constants/` (colors · typography · layout · palette · categories).
`src/components/tokens.ts` re-exports them for components.

> **Convention reality:** screens import directly from `constants/*`; components import
> from `../tokens`. AGENTS.md's "screens import via tokens.ts" is aspirational — treat
> `constants/*` as the de-facto source for screens.

### Colors (`constants/colors.ts`)
```
Surfaces  bg #0A0F11 · bgCard #13201F · bgInput #162825 · bgMuted #1B302D · bgElevated #1E3633
Text      textPrimary #ECF3F1 · textSecondary #8FA3A0 · textMuted #5A6B69
Brand     accent #20C4B8 · accentDeep #15A89D · accentMuted #0E2C29 · coral #FF6F61 · coralMuted #3A1714
Semantic  income #2BD49B · expense #FF6F61 · settle #8B7CF8
Health    healthGreen #2BD49B · healthAmber #F5B301 · healthRed #FF5C5C
Lines     border #21302E · borderFocus #20C4B8
Gradients accent[#22D3C4,#15A89D] · brand[#20C4B8,#FF6F61]
```
Color = meaning: green = income/owed, coral = expense/owe, purple = settlement, muted = settled.

### Typography (`constants/typography.ts`)
SpaceMono for money (`amountXL 36`/`amountLG 24`/`amountMD 18`/`amountSM 14`); Inter for
text (`title 28`/`heading 20`/`subheading 16`/`body 15`/`label 13`/`caption 11`/`button 15`).
Max 3 sizes per screen.

### Spacing / radius / shadow (`constants/layout.ts`)
`space` xs4 sm8 md16 lg24 xl32 xxl48 · `radius` sm8 md12 lg16 pill999 ·
`layout` screenPaddingH16 tabBarHeight64 headerHeight56 · shadows sm/md/lg + a coral-glow `fab`.

### Icons & categories (`constants/palette.ts`, `constants/categories.ts`)
- **Feather icons only.** `asFeather(name, fallback)` is the single coercion point
  (unknown → fallback, never "?").
- `categoryVisual(name) → {icon, color}` resolves any category name (default → extra →
  fallback). No emoji property.
- 33 default expense categories + 11 income categories, India-tuned (Rent, Household Help,
  Chai & Snacks, Cab & Auto, SIP, EMI).
- Icon-in-dot convention: `color + '22'` background, icon in `color`.

---

## 9. Business-logic engines (`src/lib/`) & single-source map

27 pure-ish modules. Canonical owners of each computation:

| Computation | Canonical owner | Notes |
|---|---|---|
| Money format & splits | `money.ts` | `formatRupees`/`formatCompact`/`parseToPaise`; `splitEqual`/`splitByPercent`/`splitByShares` (remainder-exact). `formatChangeMagnitude` is the single %/× rule. |
| Net balances | **SQL** `balances.ts` (`getGroupNet`/`getGlobalNet`) | `settle.computeNet` is dead duplicate |
| Settlement plan | `settle.simplify` | `rawDebts` = un-simplified alternative when group "Simplify debts" is off |
| Cross-group settle | `settleScope.ts` | builds on `simplify` + balances SQL |
| Spend-in-range / category spend | `budget.ts` (`getSpentInRange`, `getCategorySpending`) | `analytics.ts` reuses these |
| Budget status / utilization | `budget.getCategoryBudgetStatus` + `analytics.getBudgetAnalytics` | **threshold logic duplicated** across the two |
| Month-end projection | **two competing**: `analytics.projectedMonthEnd` (linear) + `forecast.forecastMonthEnd` (Bühlmann, preferred) | unify later |
| Health score | `financialHealth.computeHealthScore` (+ `suggestImprovement`) | single engine |
| Recurrence dates | `recurrence.ts` | reused by reminders/upcoming/subscriptions screen |
| Cash position | `cash.computeCash` | real out-of-pocket money (≠ budget "spending") |
| Savings funding | `savingsEngine.planAutoAllocations` (+ sweep/reduce) | drag-rank order; `priority` fallback |
| Per-goal math | `savings.ts` | progress/projection/pacing |
| Upcoming bills | `upcoming.buildUpcoming` | Home/Plan/Reminders |
| Afford decision | `afford.evaluateAfford` | only screen consumer is `afford.tsx` |
| Smart category | `smartCategory.matchCategory` + `smartCategoryLearn` | rules + learned overrides (complementary, not duplicate) |

**Orphan / dead modules:** `subscriptions.ts` (`detectSubscriptions` — never called; the
subscriptions screen uses recurring *rules* instead), `ocr.ts` (`scanReceipt` — never
called, yet `expo-ocr` is a dependency and `itemizedOcr` flag defaults on),
`settle.computeNet`, `analytics.getDashboardInsights`. See BRUTAL_ANALYSIS.

**Test coverage:** strong for pure engines (afford, cash, donut, financialHealth, forecast,
money, recurrence, savings*, settle, smartCategory*, upcoming, subscriptions, ocr). Gaps:
**`budget.ts` has no tests** (canonical engine); `subscriptions.test.ts`/`ocr.test.ts`
keep *orphan* code green.

---

## 10. Feature flags (the "Sections" system)

Defined in `lib/featureFlags.ts`, surfaced via `FeatureFlagsProvider`/`useFeatureFlags()`,
toggled by the user in **Settings → Sections** (`app/features.tsx`).

| Flag | Default | Gates |
|---|---|---|
| `reportsDonut` / `reportsTrend` | on | Reports charts (toggled together by the Sections UI) |
| `forecast` | on | Reports forecast line, Plan velocity |
| `subscriptions` | on | Subscriptions chip/screen, insights nudge |
| `reminders` | on | Reminders config + Plan chip |
| `healthScore` | on | Home health ring + sheet |
| `savingsGoals` | on | Plan pool + goals + goal detail |
| `affordCheck` | **off** | Afford screen (also gated by a dead `SHOW_EXTRAS`, so effectively unreachable) |
| `smartCategory` | **off** | Quick-add note auto-categorization |
| `streak` | **off** | (Home streak card is commented out) |
| `itemizedOcr` | on | *No live code path — OCR is orphaned* |

"Location tagging" is toggled here too but writes AsyncStorage `save_location`, not a flag.
