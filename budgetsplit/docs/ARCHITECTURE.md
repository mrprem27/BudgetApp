# BudgetSplit — Architecture

> **Single source of truth for how the app is built.** Companion docs:
> [FEATURES_AND_FLOWS.md](./FEATURES_AND_FLOWS.md) (what every screen does, every state, and the
> cross-cutting validation / permission / notification / network rules) and
> [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) (open debt + everything pre-release). Build/design rules live in
> [../AGENTS.md](../AGENTS.md).

> ⚠️ **Status (reconciled 2026-07-28).** Written as a pre-refactor baseline and updated
> twice since. What has changed from the original text:
> Zustand trimmed to `groups`/`setGroups`; one forecast model (`lib/forecast`) and one
> `budgetHealth`/`utilLabel`; settlements go through `recordSettlement`; the standalone
> `/settle` screen, `Card.tsx`, `computeNet` and `getDashboardInsights`/`rankInsights` are
> **deleted**. Screen logic now lives in `src/hooks/use*Screen|Form|Tab` and `src/lib/*Data`
> rather than inline (see §Layering). The dead `settings` table + columns in §5 remain on
> purpose. Anything still inaccurate belongs in [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md).
>
> **2026-08-04 — the repo is no longer client-only.** `server/receipt-ocr-proxy/` (a Cloudflare
> Worker) was added with receipt scanning, and the app now makes an outbound request that carries
> user content. §2 and §3 record it; the full egress picture is
> [FEATURES_AND_FLOWS.md](./FEATURES_AND_FLOWS.md) §19.

---

## 1. What the app is

A **local-first** personal-finance + bill-splitting app for urban Indian users.

> Not "100% offline", which this line used to claim three rows above the table that
> contradicts it. Receipt scanning defaults to a **cloud** OCR provider and sends the
> photo; signing in sends an email address. Both are listed in §2 and in
> `FEATURES_AND_FLOWS.md` §19, and both are avoidable — but the app is not offline
> by default, and a doc that says otherwise is how a false claim reached the
> onboarding screen.
Three always-on pillars: **Personal Finance** (budget + spending), **Group Splitting**
(shared expenses, itemized splits, settle-up), and **Insights** (turning the first two
into understanding). Everything else (forecast, health score, subscriptions, reminders,
afford check, savings goals) ships as optional feature-flagged modules.

**Hard invariants:**
- **Local-first, and no tracking.** All data lives in a local SQLite file
  (`budgetsplit.db`); every screen reads it directly and works with no network.
  Notifications are local-only (no push server). *Accounts now exist* — optional
  sign-in and client-encrypted backup, only in a build with `EXPO_PUBLIC_API_URL`,
  and the server never sees a transaction. **Sync does not exist**: there is no
  peer write path anywhere. See FEATURES_AND_FLOWS §19 for every egress path, and
  AGENTS §13 for what will gate a peer entry when there is one.
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
| Data loading | **`useScreenData`** (`src/hooks/`) over SQLite + `DataRefreshProvider` — the standard per-screen pattern (see AGENTS.md → State & Data Access) |
| Global state | **Zustand** (`src/store/index.ts`) — small app-wide client state only (`me`, `groups`), hydrated at root by `StoreHydrator`; not a data mirror |
| Local prefs | **AsyncStorage** (the real settings store; see §7) |
| Charts | **react-native-svg** (donut, health ring) + **gifted-charts** (reports trend) |
| Gestures/animation | **react-native-gesture-handler**, **react-native-reanimated**, RN `Animated` |
| Fonts | **SpaceMono** (money), **Inter** (everything else) |
| Crypto | **crypto-js** — passphrase-encrypted backups only (`src/lib/backup.ts`) |
| Server | **Two Cloudflare Workers.** `server/receipt-ocr-proxy/` is stateless, ~113 L, and exists only to hold `GEMINI_API_KEY` for receipt OCR. `server/api/` is accounts + encrypted backup (D1 + KV, magic-link auth) and is **deployed** — it never sees a transaction. Both via **wrangler** |
| Network | Three paths, all opt-in but one: the receipt-OCR proxy (**sends the receipt photo**, on by default), and — only in a build with `EXPO_PUBLIC_API_URL` — sign-in and encrypted backup via `server/api`, which never sees a transaction. pdf.js is bundled, not fetched. **Accounts exist; sync does not.** No analytics. See FEATURES_AND_FLOWS §19 |

---

## 3. Folder structure

```
BudgetApp/
├── budgetsplit/                 # the app
│   ├── app/                     # Expo Router routes (34 screens)
│   │   ├── _layout.tsx          # Boot: DB init, providers, gates, Stack
│   │   ├── (tabs)/              # Tab bar + 4 tabs
│   │   │   ├── _layout.tsx      # Custom tab bar w/ docked center FAB
│   │   │   ├── index.tsx        # Home / Dashboard
│   │   │   ├── groups.tsx       # Groups + People balances (→ Personal when `splitting` off)
│   │   │   ├── savings.tsx      # Plan tab (route name stays "savings")
│   │   │   └── settings.tsx     # Settings
│   │   ├── add/                 # quick.tsx · itemized.tsx (both fullScreenModal)
│   │   ├── group/[id].tsx       # Group hub (tabbed) + [id]/{budget,edit,members,recurring}
│   │   ├── personal.tsx         # The unified Personal screen
│   │   ├── savings/[id].tsx     # Goal detail
│   │   ├── txn/[id].tsx         # Transaction detail
│   │   ├── category/[name].tsx  # Category detail
│   │   ├── plan/recurring.tsx   # Global recurring rules
│   │   ├── import.tsx           # Ingestion: file/paste → pending_txn
│   │   ├── review.tsx           # The staging inbox (largest screen)
│   │   ├── reports.tsx          # Analytics home (Settings → Export & reports)
│   │   ├── report-transactions.tsx  # Month drill-down from Reports
│   │   ├── settings/            # notifications.tsx · backup.tsx
│   │   ├── search.tsx · friends.tsx · categories.tsx · features.tsx
│   │   └── help.tsx · history.tsx · storage.tsx · afford.tsx · insights.tsx · reminders.tsx
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/              # Generic primitives (domain-free)
│   │   │   ├── finance/         # Domain widgets
│   │   │   │   └── add/ · backup/ · group/ · home/ · plan/ · review/
│   │   │   ├── system/          # Onboarding, gates, providers, loader, PdfTextExtractor
│   │   │   └── tokens.ts        # Re-export barrel (used by components, not screens — see §8)
│   │   ├── theme/               # Canonical design tokens (constants/* are back-compat shims)
│   │   ├── constants/           # colors · typography · layout · palette · categories · enums
│   │   ├── db/
│   │   │   ├── schema.ts        # DDL + migrations + openDB + ONE_TIME_FIXES
│   │   │   ├── seed.ts          # First-run seed · seedCategories.ts · seedDemo.ts
│   │   │   └── queries/         # 13 modules: transactions · groups · persons · savings
│   │   │                        # · categories · categoryBudgets · balances · audit
│   │   │                        # · pending · recurring · moneyProfile · cashQuery · backup
│   │   ├── hooks/               # useScreenData + 8 feature hooks (use*Form / use*Tab / use*Screen)
│   │   ├── lib/                 # Pure business logic / engines (57 modules + ocrProviders/)
│   │   ├── store/index.ts       # Zustand store (me, groups)
│   │   └── __tests__/           # Jest tests for pure lib logic + doc/flag invariants
│   ├── modules/expo-ocr/        # First-party native module (Apple Vision, iOS only)
│   └── docs/                    # This documentation set
└── server/
    └── receipt-ocr-proxy/       # Cloudflare Worker: the whole "backend" (see §2)
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

**Modal depth metaphors in use:**
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
`section`. **Global** — one catalog per kind, `group_id` nullable and `UNIQUE(name, kind)`. It was per-group, duplicated into every group at creation; the `category_global_v1` migration collapsed that, and `category_tombstone` is how a deleted default stays deleted against the re-seed.

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

### `settings` — **live, and load-bearing**
Was documented here as a dead table with zero reads/writes. It is neither, and the
error is not cosmetic: believing it dead is exactly what would make someone dismiss
the restore defect that lives in it.

It holds two unrelated things. **`money.*`** — opening cash and the credit
baseline (`db/queries/moneyProfile.ts`) — is real user data. **One-time-fix markers**
(`ONE_TIME_FIXES`, `category_global_v1`, `schema.ts`) are *device* state recording
what has already been done to this database.

`restoreAllTables` therefore treats them differently: `money.*` restores, the markers
never do — in **either** direction. Carrying one in marks a fix done on a device that
never ran it; wiping one out re-runs a fix that has already happened, and
`fix_income_category_kind_v1` re-running trips `UNIQUE(name, kind)`.

Most other key/value prefs do live in AsyncStorage (§7). Both stores are real.

### Indexing reality
Indexed: audit ×2, `savings_txn`, `pending_txn`, and the hot transaction paths —
`txn(group_id, date)`, `txn(parent_recur_id)`, `txn(group_id, category)`, plus partial
indexes for recurring rules and non-deleted rows. See `db/schema.ts`.

---

## 6. Query & state layers

### Query layer (`src/db/queries/`)
Twelve files. Multi-table writes use `withTransactionAsync`. `splitRecurringSeries` is
now atomic (the new rule and the cap of the old one commit together, so a mid-way failure
can't leave two overlapping active rules). One known gap remains: `runLeftoverSweep` mixes
an AsyncStorage marker with DB writes — it's idempotent, and tracked in
[RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md).

| File | Responsibility |
|---|---|
| `transactions.ts` (762 L) | All txn CRUD, itemized, recurring rules, materialization, skips, duplicates, streak |
| `groups.ts` | Group CRUD, members, archive/restore/delete (cascades) |
| `persons.ts` | People CRUD, `getMe`, group membership, avatars |
| `categories.ts` | Global category catalog CRUD (with usage counts) |
| `categoryBudgets.ts` | Per-category budget limits (delete-all-then-reinsert) |
| `balances.ts` | **Canonical net-balance SQL** (`getGroupNet`, `getGlobalNet`), spending/income, `getFriendBalances`, **`getMyExposure`** (single source for global owe/owed; pure `summarizeExposure`) |
| `audit.ts` | `logAudit` (call inside caller's txn), `getAuditLog` |
| `savings.ts` (471 L) | Goals + pool ledger + auto-funding; **also de-facto reporting module** (`getCashPosition`, `getAffordSnapshot`, `buildSavingsInsights`) |

### State & data-loading layer
The app is **SQLite-direct / local-first**: SQLite is the single source of truth. Two pieces
standardize how screens read it (see AGENTS.md → "State & Data Access"):

- **`src/hooks/useScreenData.ts`** — the standard per-screen loader. Owns
  `loading`/`error`/`refreshing`, focus refetch, cross-screen refetch (via
  `DataRefreshProvider`), and pull-to-refresh. Screens pass a `(db) => Promise<T>` loader and
  destructure `data`. Replaces the old hand-rolled `useState`+`load()`+try/catch pattern.
  After a write, callers `refresh()` (from `useDataRefresh`) to re-run all mounted loaders.
- **`src/store/index.ts`** (Zustand) — small global *client* state only: `me` and `groups`,
  the values read on nearly every screen. Hydrated once at the root by
  `components/system/StoreHydrator.tsx` and re-hydrated on the data-change signal. It is **not**
  a data mirror — everything else loads through `useScreenData`. (Historically this store held
  dead `txns`/`currentGroupId`/`isLocked`/`biometricEnabled` fields; those were removed.)

---

## 7–10. Superseded by AUDIT.md

Sections 7–10 used to cover preferences, the design system, the `src/lib` engine map and the
feature-flag table. They were **removed rather than corrected**: an audit written from source
(`AUDIT.md`, 2026-07-28) found them substantially drifted, and the drift was catalogued in
[AUDIT_DOC_DRIFT.md](./AUDIT_DOC_DRIFT.md) as DRIFT-01 … DRIFT-12.

The §10 flag table was the worst of it — it named a flag that does not exist, credited three
flags with gating surfaces they did not gate, and omitted nine others. Anyone reading it would
have concluded the flag system worked as described. It did not.

Read these instead — each is generated from the code, not from another doc:

| Was | Now |
|---|---|
| §7 Settings live in THREE places | [AUDIT.md](./AUDIT.md) §4.1 — there are **four** preference stores |
| §8 Design system | [AGENTS.md](../AGENTS.md) §10, which is the enforced source. `src/theme/` is canonical; `src/constants/*` are back-compat shims |
| §9 Business-logic engines | [AUDIT.md](./AUDIT.md) §7 (BL-01 … BL-33) |
| §10 Feature flags | [AUDIT.md](./AUDIT.md) §4.3, and `src/lib/featureFlags.ts` itself |

**Verify against the tree before acting on anything here.** This file used to close
by asserting §1–6 were "re-verified and accurate"; an audit then found the settings
table, the category model, the server count and the offline claim all wrong, plus
four stale counts. A sign-off that outlives its own accuracy is worse than none,
because it stops the next reader checking.

The counts in §3 in particular drift with every change and are indicative, not
current.

> Note on §10 specifically: the dead flags it documented are gone. `FeatureKey` now holds 16
> keys, every one of which gates a real surface and appears in the Feature Management screen —
> an invariant asserted by `src/__tests__/featureFlags.test.ts`, so this section cannot silently
> drift again. The *number* had still drifted three times on its own (12 → 14 → 15) because no
> test read it; `src/__tests__/sourceCounts.test.ts` now does.
