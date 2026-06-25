# BudgetSplit — Features & User Flows

> **The complete behavioral reference.** Every feature, every screen, every state, and
> every user action with its exact destination — grounded in the actual code on branch
> `redesign/phase-2`. For how it's built, see [ARCHITECTURE.md](./ARCHITECTURE.md).
>
> **Notation:** `→` = navigates to. Money is paise internally, shown via
> `formatRupees`/`formatCompact`. "Flag" = a `useFeatureFlags()` gate.

---

## Contents
1. [First run & onboarding](#1-first-run--onboarding)
2. [The navigation shell](#2-the-navigation-shell)
3. [Home / Dashboard](#3-home--dashboard)
4. [Groups](#4-groups)
5. [Group detail & sub-screens](#5-group-detail--sub-screens)
6. [Add flows (expense / income / itemized / transfer)](#6-add-flows)
7. [Plan tab & savings](#7-plan-tab--savings)
8. [Settle up](#8-settle-up)
9. [Transaction & category detail](#9-transaction--category-detail)
10. [Settings & sub-screens](#10-settings--sub-screens)
11. [Optional modules](#11-optional-modules)
12. [System components & global behaviors](#12-system-components--global-behaviors)
13. [Feature catalog (quick reference)](#13-feature-catalog)

---

## 1. First run & onboarding

`OnboardingGate` checks AsyncStorage `onboarding_done`. If unset, it renders the
8-stage `Onboarding` flow. A single DB commit (`finalize`) happens at the very end —
nothing is written mid-flow except two AsyncStorage preferences.

| # | Stage | What the user does | Persisted |
|---|---|---|---|
| 0 | **Hero** | `LogoAssembly` brand animation plays (⛔ off-limits), wordmark + tagline fade in. Tap **Get Started**. | nothing |
| 1 | **Intent** | "What brings you here?" — pick *personal* / *split* / *both* (default both). Tap **Get started**. | `onboarding_intent` (AsyncStorage; soft preference, **not yet wired to flags**) |
| 2 | **Feature carousel** | 4 swipeable slides (Spend / Split / Budget / Privacy) with bespoke animations + progress bar. **Skip** jumps to Name. | nothing |
| 3 | **Name** | Type your name (≤30). **Continue** (sets "add first expense" intent) or **Skip — just explore**. | committed in `finalize` |
| 4 | **Income + pay-day** | Take-home `₹` field + preset chips (30k/45k/60k/1L) + pay-day chips. **Skip** allowed. | committed in `finalize` |
| 5 | **Budget** | Monthly cap field + preset chips; shows "X% of take-home" if income set. **Skip**. | committed in `finalize` |
| 6 | **People** | Add split-contacts inline (dedup by name). **Skip**. | committed in `finalize` |
| 7 | **Permissions** | Prime **Notifications** (→ enables renewal reminders on grant) and **Location** (→ writes `save_location='true'`, which *is* read by add flows). | `save_location` on grant |

**`finalize()`** (best-effort, each step isolated so one failure never blocks finishing):
- `updatePersonName(me)` if a name was entered.
- If income>0: inserts a **recurring monthly Salary income** in the Personal group
  anchored to pay-day; persists `monthly_income` + `payday`.
- If budget>0: writes a `Total` monthly `category_budget` on the Personal group.
- Each contact → `insertPerson`.
- If "add first" intent: persists `pending_first_add='true'`.
- Calls `onDone()` → gate writes `onboarding_done='true'`.

**Replay:** Settings → "Replay welcome tour" removes `onboarding_done` and restarts this flow.

---

## 2. The navigation shell

Custom bottom tab bar: **Home · Groups · [FAB] · Plan · Settings**.
- **FAB** (coral→teal gradient `+`): one tap → `/add/quick?kind=expense` (with a light
  haptic — the one sanctioned nav haptic).
- Active tab tint = teal; inactive = muted. `BlurView` backdrop above the home indicator.

---

## 3. Home / Dashboard

**Route:** `app/(tabs)/index.tsx` · **Question:** "How am I doing financially right now?"

### States
- **Loading:** renders nothing (deliberate — avoids flashing an empty home).
- **Error:** `ErrorState` + retry.
- **Empty (first run):** when no spend, no income, and no category history → a `₹0`
  empty hero ("Nothing logged yet", **Log first expense** CTA) + a "GET STARTED" tile list.
- **Full:** hero + period pills + category breakdown + balance strip + coming-up.

### Layout (top → bottom) & actions
1. **Header** — greeting + first name; 🔍 search → `/search`; 🔔 bell (with unread dot)
   → `/history`; avatar → `/settings`.
2. **Catch-up banner** (conditional) — amber banner when the app was closed 30+ days with
   active recurring rules: "N missed occurrences added". **Review entries** → `/history`;
   **Dismiss** clears it.
3. **HeroCard** — XL period spend (SpaceMono); pace bar + "X% · ₹Y left" **only if a
   budget is set** (else number + delta vs previous period); SVG health ring (tap → opens
   `HealthSheet`).
4. **TabPills** — Month / Today / Year (changing re-runs the data load for that period).
5. **CategoryRankList** ("WHERE IT WENT") — top categories as bars; row tap →
   `/category/<name>?period=<tab>`; "+N more" expands.
6. **BalanceStrip** — shown if you owe or are owed > 0: "You owe / Owed to you" + **Settle** → `/settle`.
7. **ComingUpList** — next recurring bills (from `buildUpcoming`); hidden when empty.

**Data loaded:** persons, groups (also pushed to the Zustand store), this+previous period
txns, global net, per-group budget analytics, recurring rules, `computeHealthScore`,
`buildUpcoming`. Reads AsyncStorage `hide_amounts` (obfuscates the hero) and `app_last_open`.

> **Known dead code on Home:** `HealthBand` and `StreakCard` are imported but commented
> out; streak data is computed but unused; `flags` is destructured but only referenced
> in dead blocks. (See BRUTAL_ANALYSIS.)

---

## 4. Groups

**Route:** `app/(tabs)/groups.tsx` · **Question:** "Who/what do I split with, and where do
my balances stand?"

### States
- **Error:** `ErrorState` + retry. **No loading state** (renders stale store data until reload).
- **Empty:** proper `EmptyState` ("No groups yet" + New Group CTA); separate empties for archived.
- **Full:** FlatList of group cards + a People balances footer.

### Layout & actions
1. **Header** — title flips "Groups"/"Archived"; archive-toggle button (only if archived
   groups exist); **+** New group (active view only).
2. **Group card** (`renderGroup`) — swipeable (swipe-left → Archive/Restore, suppressed
   for Personal); shows icon, name, "member count · spend", avatar stack, budget bar +
   utilization label + over-budget badge, balance chip/chevron. **Tap → `/group/<id>`**.
3. **People footer** (`renderBalances`) — friends with non-zero net; each has a **Settle**
   chip → `/settle?focus=<personId>`.
4. **New Group sheet** (`SheetModal` + `GroupForm`): emoji/icon, name, type, members,
   default split. **Create** → `insertGroup` → reload → `/group/<newId>`.

**Data loaded:** all groups (→ store), archived groups, me, per-group
analytics+members+net, global net, all persons, friend balances via `simplify`.

> Two dead branches exist: a never-activated "budget overview" list mode and a
> `false &&`-gated filter-chip row.

---

## 5. Group detail & sub-screens

### Group detail — `app/group/[id].tsx` (the hub, ~1125 L)
**Reached from:** Groups list, Home group cards, Plan (personal group), Insights.
**Tab set:** non-personal groups show **Expenses · Budget · Members · Insights ·
Recurring**; personal groups show only **Expenses · Budget**. (The tab is local state —
no deep-link to a specific tab. A `'balances'` tab body exists in code but is unreachable.)

- **Header** — breadcrumb back; insights icon (non-personal); options `⋯`.
- **Balance card** (non-personal) — "You owe/are owed ₹X" + **Settle up** →
  `/settle?focus=<primaryPerson>`.
- **Expenses tab** — month-grouped transaction rows. Row tap → `/txn/<id>` (or →
  recurring manager if it's a materialized recurring instance). Swipe/delete: non-recurring
  → confirm + soft-delete + undo toast; recurring → 3-way Alert (rule only / rule + logged
  occurrences / cancel).
- **Budget tab** — overall utilization, per-category bars; **Edit** / empty CTA →
  `/group/<id>/budget`.
- **Members tab** — per-member net; **Invite** → `/group/<id>/members`; **Settle group
  balances** → `/settle`. "Simplify debts" switch → `setSimplifyDebt`.
- **Insights tab** — per-member spend bars, top categories, recommendations (this is the
  *real* group insights; the standalone `group/[id]/insights.tsx` file is an orphan).
- **Recurring tab** — active rules; row → `/group/<id>/recurring?focus=<ruleId>`; add →
  `/add/quick?groupId=<id>&kind=expense`.
- **Options sheet** — Recurring · History (`/history?groupId=<id>`) · Edit group · Manage
  members · Archive (confirm → `archiveGroupSafe` → back).
- **FAB** → `/add/quick?groupId=<id>&kind=expense`.

### Sub-screens
| Screen | Route | Purpose & key actions |
|---|---|---|
| **Budget editor** | `group/[id]/budget.tsx` | Per-category limit + cadence; collapsible sections; **Save Budget** → `setCategoryBudgets` (only amounts > 0). Deep-link `?category=` auto-focuses a row. |
| **Edit group** | `group/[id]/edit.tsx` | `GroupForm`; **Save** diffs members (add/remove); Archive → `/groups`; Delete → `deleteGroup` (Personal can't be deleted). |
| **Members** | `group/[id]/members.tsx` | Avatar tap → photo picker; rename sheet; swipe-Remove (**blocked if net ≠ 0** — "Settle up first"); **Add** via `PersonPicker` (multi-select + inline create). |
| **Recurring** | `group/[id]/recurring.tsx` | Per-rule: **Skip** / **Undo skip** / **Pause·Resume** / **Stop** (confirm → `endRecurring`). `?focus=` highlights a card. |
| **Insights** | `group/[id]/insights.tsx` | ⚠️ **Orphan** — reachable from nowhere; duplicates the inline Insights tab. |

---

## 6. Add flows

All three add screens are `fullScreenModal` (slide from bottom). Money parsed via
`parseToPaise`; saves wrapped in try/catch with haptic + Alert on failure.

### Quick Add — `app/add/quick.tsx` (⚠️ 1250 L monolith)
**Purpose:** log one expense / income / settlement transfer (create or edit).
- **Kind toggle** at top: Expense ↔ Transfer ↔ Income (hidden when editing). Income forces
  the Personal group.
- **Amount input** (large SpaceMono).
- **Expense/Income body:** category + date pills (→ `CategoryPicker` / `DatePickerSheet`);
  group selector (if >1 group); Title/Note card; **budget nudge** ("₹X left in <cat> this
  month", colored, from `getAffordSnapshot`); **More options** (smart-category note,
  split-by-items link, attach receipt, location, recurring card); split-with + paid-by rows;
  remainder warning.
- **Transfer body** (`TransferBody`): from/to people, scope (per-group or "all groups"),
  pay-method (UPI/Cash/Bank), note.
- **Smart category** (flag `smartCategory`): typing a title auto-picks a category via
  learned overrides → rules → "Other".
- **Save** (`✓`, gated by `canSave`): transfer → `handleSaveTransfer`
  (`planAllGroupsSettlement` largest-first, or single group); edit → `updateTxn`;
  recurring-edit → `splitRecurringSeries` ("this & future"); new expense → duplicate-check
  (`findRecentDuplicate`, ±24 h) → `insertTxn`.
- **Receipt attach:** iOS action sheet (camera/library); storage-full → Alert with a
  Storage deep-link; expense still saves.

### Income — `app/add/income.tsx`
Green-themed. Mode toggle flips to Quick (`router.replace`). Amount; source chips
(Salary/Freelance/Investment/Other, synced to category); budget-impact nudge
(surplus/short); group selector (personal only); recurring toggle + frequency + custom
interval + end date. **Save** → `insertTxn`/`updateTxn`/`splitRecurringSeries` with
`payments:[{me,total}]`. ("Yearly" maps to a custom 365-day interval.)

### Itemized — `app/add/itemized.tsx` (817 L)
4-step wizard with progress dots:
1. **Items** — add name/qty/price rows; live subtotal; Tax/Tip/Discount adjustments.
2. **Assign** — assign each item to people ("Split unassigned equally" shortcut); per-person totals; unassigned banner.
3. **Payers** — who paid how much; balanced/remaining indicator.
4. **Review** — category, note, location, your-share + paid-by cards. **Save** →
   `insertItemizedTxn` / `updateItemizedTxn` (items + adjustments + location).

Pure helpers (`computeAdjustedTotal`, `computeItemSubtotal`, `computePerPersonShares`)
handle math including exact remainder distribution.

### Transfer
Not a separate route — it's the **Transfer pill inside Quick Add** (`TransferBody` +
`settleScope.ts`). Records a settlement; does not count as spending.

---

## 7. Plan tab & savings

### Plan — `app/(tabs)/savings.tsx` (route name stays `savings`)
**Question:** "What am I saving toward, and what will my month look like?"
- **Module chips** (horizontal): Insights (always) · Reports (`reportsDonut`) ·
  Subscriptions (`subscriptions`) · Reminders (`reminders`) — each → its screen.
- **Savings pool card** (`savingsGoals`): total saved, unallocated, goal count; **+** add
  to pool, withdraw.
- **Goals** (`savingsGoals`): `DraggableList` (drag = funding priority); each card → icon,
  name, deadline, saved/target bar, needed/contribution per month. Tap → `/savings/<id>`.
  **New** opens a full goal sheet (name, target, icon, color, allocation + frequency,
  target-date chips) → `insertGoal`.
- **Upcoming list** + **month-end forecast card**.

> A large block of this screen (cash card, personal budget, what-if simulator, afford
> button, insights card) is gated behind a constant `SHOW_EXTRAS = false` and is dead.
> **No error state** on this tab (the only tab without one).

### Goal detail — `app/savings/[id].tsx`
SVG progress ring; Saved/Remaining/Goal tiles; monthly-contribution card with nudge;
overfunded banner; contribution history.
- **Add to goal** → `depositAndAllocate` (tops the pool up by the shortfall) + fires
  `GoalCelebration` at 100%.
- **Withdraw** → `withdrawFromGoal` (clamped to saved).
- **Adjust** → `updateGoal`. **Lock** → `setGoalLocked`. **Delete** → confirm → back.

### Savings automation
`runSavingsMaintenance` (on boot + foreground): leftover-sweep → scheduled allocations
(`planAutoAllocations`, drag-rank order) → reconcile. Auto-sweep is opt-in
(`auto_sweep_enabled`).

---

## 8. Settle up

**Route:** `app/settle.tsx` · **Question:** "Record a payment between two people."
**Reached from:** Home balance strip, Groups people row, Friends, Group detail (3 places),
Reminders.
- **Modes:** *wizard* (`?focus=<personId>` — prefilled from `simplify(getGroupNet)`) or
  *direct* (`?from=&to=&amount=&groupId=`).
- **States:** `ErrorState`; **All settled** empty state when nothing is owed.
- **Layout:** person card; amount input + "Full balance" chip; pay-method tiles
  (UPI/Cash/Bank); note. **✓ Save** → inserts a `kind:'settlement'` txn (payment from →
  share to) with `pay_method`, into a shared group → back. (A multi-settlement counter is
  commented out.)

> There are conceptually **three settle entry shapes** (global `/settle` wizard, direct
> mode, and the Transfer pill in Quick Add). They write the same settlement txn but are
> reached differently — flagged in BRUTAL_ANALYSIS as needing unification.

---

## 9. Transaction & category detail

### Transaction detail — `app/txn/[id].tsx`
Hero amount (kind-colored) + category + note + cash line; meta card (When / Group /
Paid via / Added by / recurring link / Location → opens Maps); receipt section
(preview/add/replace/remove; not for settlements); split summary; itemized items
(read-only); audit-log timeline; **Delete** (soft-delete + undo → back).
- **Edit** (only if not a materialized recurring occurrence) → routes to the right add
  screen (itemized / transfer / income / quick).

### Category detail — `app/category/[name].tsx`
Reached from Home category rows (`?period=`) and Reports donut. Period segment
(Today/Month/Year, client-side); budget card (prorated to period) or amount card;
"set budget" → `/group/<personalGroupId>/budget?category=`; transaction list → `/txn/<id>`.

---

## 10. Settings & sub-screens

### Settings — `app/(tabs)/settings.tsx`
Static config list (loaded once; no loading/error state).
- **Profile** — avatar (→ picker), name (→ rename sheet), "Offline-first" sub.
- **Manage** — People → `/friends` · Categories → `/categories` · Budgets & Goals → `/groups`.
- **Preferences** — Currency (INR, no-op) · Default budget cadence (sheet) · Health score
  toggle · Subscription detection toggle · Save transaction location toggle (asks
  permission) · **Sections** → `/features`.
- **Security** — biometric lock · privacy screen · hide amounts (all → AsyncStorage).
- **Reminders** (flag `reminders`) — renewal toggle + lead-day stepper + time; daily toggle
  + time; send test; **Manage notifications** → `/settings/notifications`.
- **Data & Help** — Export PDF (Alert "coming soon") · Help → `/help` · Replay welcome
  tour · History → `/history`.
- **About** — version; tap 7× → `/storage` (hidden debug entry).

### Settings sub-screens
| Screen | Route | What it does |
|---|---|---|
| **People** | `friends.tsx` | You card + contacts with balance chips, group counts, **Settle** → `/settle?focus=`; add/rename person. |
| **Categories** | `categories.tsx` | Expense/Income kind pills; collapsible sections; add (name/icon/color) / delete. ⚠️ delete leaves orphan budget lines (name-string keys). |
| **Sections** | `features.tsx` | "Always on" pillars (no toggle) + 9 optional module switches. Location toggle writes `save_location`. |
| **Help** | `help.tsx` | 10-section static FAQ accordion (hardcoded; partly stale content). |
| **Audit log** | `history.tsx` | Date-grouped change log with colored dots, EDIT/DEL badges, "Load older". Filters by `?groupId=`. |
| **Storage** | `storage.tsx` | Receipt-photo disk usage + "Delete all attachments". |
| **Notifications** | `settings/notifications.tsx` | Permission banner; renewal/daily toggles; test notification. |

---

## 11. Optional modules

| Module | Flag | Surface(s) | Status |
|---|---|---|---|
| Savings goals + pool | `savingsGoals` | Plan tab, `savings/[id]` | ✅ wired |
| Spending forecast | `forecast` | Reports forecast line, Plan velocity | ✅ wired (Reports only) |
| Financial health | `healthScore` | Home ring → `HealthSheet` | ✅ wired |
| Reminders | `reminders` | Settings config, Plan chip, `reminders.tsx`, notifications | ✅ wired (dev build for OS notifications) |
| Subscriptions | `subscriptions` | Plan chip → `plan/subscriptions.tsx`, insights nudge | ✅ wired — **from recurring rules**, not auto-detection |
| Smart category | `smartCategory` (off) | Quick-add note | ✅ wired |
| Reports & charts | `reportsDonut`/`reportsTrend` | `reports.tsx` (Plan chip only) | ✅ wired but off main nav |
| Afford check | `affordCheck` (off) | `afford.tsx` | ⚠️ effectively unreachable (also gated by dead `SHOW_EXTRAS`) |
| Tracking streak | `streak` (off) | `StreakCard` | ⚠️ commented out on Home |
| OCR receipt scan | `itemizedOcr` (on) | — | ❌ **orphan** — `ocr.ts` never called |
| Location tagging | `save_location` pref | Add flows + txn detail Maps link | ✅ wired |

### Reports — `app/reports.tsx` (872 L)
Reached only via the Plan "Reports" chip. Month nav; SPENT/EARNED cards; category donut
(tap segment → `/category/<name>`); 6-month trend; forecast line; year-in-review; export
CSV / PDF (inline HTML template).

### Insights — `app/insights.tsx`
Plan chip → standalone personal insights: velocity hero (only when projected to
overspend), shifts vs last month, what-if simulator (10/20/30%), across-all-groups net,
subscriptions nudge (`subscriptions`).

### Reminders — `app/reminders.tsx`
Plan chip (`reminders`) → upcoming bills (`buildUpcoming`) + settle-ups; "Log payment" →
`/add/quick`; "Settle now" → `/settle?focus=`; settings → `/settings/notifications`.

### Subscriptions — `app/plan/subscriptions.tsx`
Lists active recurring **expense rules** (not detected) with monthly-total summary; rows →
`/group/<id>/recurring`; empty CTA → `/add/quick`.

---

## 12. System components & global behaviors

| Behavior | Component | Notes |
|---|---|---|
| Biometric lock | `LockGate` | Face ID on background; truth in AsyncStorage `biometric_enabled`. |
| App-switcher privacy | `PrivacyScreen` | Branded cover over the snapshot. |
| Undo deletes | `UndoProvider` / `UndoToast` | 5 s toast above nav; survives `router.back()`. |
| Goal celebration | `GoalCelebration` | Full-screen confetti at 100% (auto-dismiss). |
| Health detail | `HealthSheet` | Score ring + 3 dimensions + factors + projected improvement. |
| Boot splash | `BrandedLoader` | Logo + spinner during DB init. |
| Boot failure | `_layout` `ErrorState` | Isolated; Retry re-runs DB init. |
| Recurring catch-up | `materializeDueOccurrences` | On boot + foreground; surfaces the Home catch-up banner. |
| Pull-to-refresh | `useRefresh` / `AppRefreshControl` | 7 screens. |
| Brand animation | `LogoAssembly` | ⛔ **Never modify** (also the onboarding hero ring/fan). |

---

## 13. Feature catalog

A one-line index of every user-facing capability and where it lives.

- **Log expense** — FAB / Quick Add → `insertTxn`.
- **Log income** — Add Income / kind toggle → `insertTxn` (personal).
- **Split a bill (equal/exact/%/shares)** — Quick Add split rows.
- **Itemized split** — 4-step Itemized wizard.
- **Settle a debt** — Settle screen / Transfer pill (min-transaction `simplify`).
- **Groups** — create/edit/archive/delete; members; per-group default split.
- **People / friends** — cross-group balances; add/rename; avatars.
- **Budgets** — per-category limits with cadence; utilization bars; carry-over.
- **Recurring transactions** — rules with skip/pause/resume/end; materialized on open.
- **Savings goals + pool** — manual + auto-funding (drag-rank), lock, overfund handling.
- **Financial health score** — 5-factor engine + improvement projection.
- **Spending forecast** — Bühlmann-blended month-end projection (Reports).
- **Reports** — donut, trend, forecast, year-in-review, CSV/PDF export.
- **Insights** — velocity, shifts, what-if, cross-group net.
- **Subscriptions** — recurring-expense tracker + monthly total.
- **Reminders** — local renewal + daily-log notifications (dev build).
- **Afford check** — yes/tight/no purchase decision (currently unreachable).
- **Smart categories** — keyword guess + learned corrections.
- **Receipt photos** — local attach/view/zoom; storage management.
- **Location tagging** — captured on add; Maps link on detail.
- **Audit log** — every data change, filterable by group.
- **Search** — across category/note/amount, grouped by month.
- **Privacy** — biometric lock, app-switcher cover, hide-amounts.
- **Onboarding** — 8-stage intent → name → income → budget → people → permissions.
