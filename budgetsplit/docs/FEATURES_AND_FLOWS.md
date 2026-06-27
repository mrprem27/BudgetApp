# BudgetSplit — Features & User Flows

> **The single source of truth for behaviour.** Every feature, every screen, every state,
> every component (top → bottom), and every user action with its exact destination and
> every pill/segment — grounded in the actual code. For how it's built, see
> [ARCHITECTURE.md](./ARCHITECTURE.md).
>
> **Notation:** `→` = navigates to · *(sheet)* = bottom-sheet modal · *(toggle)* = switch,
> no nav · 🔘 = pill/segmented control. Pushed screens have a `‹` back chevron
> (`ScreenHeader`); tab screens have no back button; Add flows are modal sheets
> (`ModalHeader`). Money is paise internally, shown via `formatRupees`/`formatCompact`.
> "Flag" = a `useFeatureFlags()` gate.
>
> **Status (reconciled 2026-06-27, branch `refactor/phase-1-perf-safety`):** current with the
> phase-2 redesign. Key shifts from the old baseline: **Settle** is now the Quick-Add
> **Transfer pill** everywhere — the standalone `/settle` screen is **deleted**; all entry
> points open `/add/quick?kind=transfer&to=…`. **Home** shows a **Month-end ForecastCard**
> (below the Owe/Owed strip) and the **StreakCard** is live. **Group detail** tab order is
> **Expenses · Recurring · Budget · Members**, Balances merged into Members, Insights is a
> header-icon view, and the ⋯ menu is trimmed to History · Edit · Archive. **Plan** shows the
> Cash card + Savings insights + a Forecast card, has an error state, and dropped the
> Reminders chip. **Settings** Manage→**Budget** opens the personal budget directly; module
> toggles live only in **Feature management**; reminder config lives on its own
> Notifications screen. **GroupSelector** is frequent-pills + a **More** picker sheet.
>
> **Personal/Budget/Insights redesign (Phases 1–4, see [PERSONAL_REDESIGN.md](./PERSONAL_REDESIGN.md)):**
> "Subscriptions" renamed to **Recurring** (labels only). **Goals**: completed sort to bottom with a
> distinct card. **Transfers**: picker shows your balance with each person. **Undo** on every delete
> (txn/member/goal). New unified **Personal** view at `/personal` (pinned in Groups). Budgets are
> **my-share**: a global personal budget + optional per-group budgets. The Dashboard category tap
> opens a **comprehensive category-insights page** (spend split · places · recurring · goals).

---

## Contents
1. [First run & onboarding](#1-first-run--onboarding)
2. [The navigation shell + graph](#2-the-navigation-shell--graph)
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
13. [Every pill, in one table](#13-every-pill-in-one-table)
14. [Feature catalog (quick reference)](#14-feature-catalog)
15. [Developer / QA tooling](#15-developer--qa-tooling)
16. [Component inventory (every component)](#16-component-inventory)
17. [Manual test flows (data pre-staged)](#17-manual-test-flows)

---

## 1. First run & onboarding

`OnboardingGate` checks AsyncStorage `onboarding_done`. If unset, it renders the
8-stage `Onboarding` flow. A single DB commit (`finalize`) happens at the very end —
nothing is written mid-flow except two AsyncStorage preferences.

| # | Stage | What the user does | Persisted |
|---|---|---|---|
| 0 | **Hero** | `LogoAssembly` brand animation plays (⛔ off-limits), wordmark + tagline fade in. Tap **Get Started**. | nothing |
| 1 | **Intent** | "What brings you here?" — pick *personal* / *split* / *both* (default both). | `onboarding_intent` (AsyncStorage; soft preference, **not yet wired to flags**) |
| 2 | **Feature carousel** | 4 swipeable slides (Spend / Split / Budget / Privacy) + progress bar. **Skip** → Name. | nothing |
| 3 | **Name** | Type your name (≤30). **Continue** (sets "add first expense" intent) or **Skip — just explore**. | committed in `finalize` |
| 4 | **Income + pay-day** | Take-home `₹` field + preset chips (30k/45k/60k/1L) + pay-day chips. **Skip**. | committed in `finalize` |
| 5 | **Budget** | Monthly cap field + presets; shows "X% of take-home" if income set. **Skip**. | committed in `finalize` |
| 6 | **People** | Add split-contacts inline (dedup by name). **Skip**. | committed in `finalize` |
| 7 | **Permissions** | Prime **Notifications** (→ renewal reminders on grant) and **Location** (→ `save_location='true'`, read by add flows). | `save_location` on grant |

**`finalize()`** (best-effort, each step isolated so one failure never blocks finishing):
- `updatePersonName(me)` if a name was entered.
- If income>0: inserts a **recurring monthly Salary income** in the Personal group anchored to pay-day; persists `monthly_income` + `payday`.
- If budget>0: writes a `Total` monthly `category_budget` on the Personal group.
- Each contact → `insertPerson`.
- If "add first" intent: persists `pending_first_add='true'` (Home auto-opens Add once).
- Calls `onDone()` → gate writes `onboarding_done='true'`.

**Replay:** Settings → "Replay welcome tour" removes `onboarding_done` and restarts this flow.

---

## 2. The navigation shell + graph

Custom bottom tab bar: **Home · Groups · [FAB] · Plan · Settings**.
- **FAB** (coral→teal gradient `+`): one tap → `/add/quick?kind=expense` (light haptic — the one sanctioned nav haptic).
- Active tab tint = teal; inactive = muted. `BlurView` backdrop above the home indicator.

```
Tab bar:  Home · Groups · (＋FAB) · Plan · Settings

Home ──► Search, History, Settings, Insights, Category, Group budget, Add(expense/transfer)
Groups ──► Personal (pinned), Group detail, Add(transfer)
Personal ──► Txn (source), Budget editor, group Recurring
Plan ──► Goal detail, Insights, Reports, Recurring, Afford, Add
Settings ──► People, Categories, Budget, Features, Notifications, Reports, Help, History, Storage
Group detail ──► Txn, Budget, Members, Recurring, Edit, History, Add(expense/transfer)
Add(quick) ──► Itemized, Storage(attach)
```

---

## 3. Home / Dashboard

**Route:** `app/(tabs)/index.tsx` · **Question:** "How am I doing financially right now?"

### States
- **Loading:** renders nothing (deliberate — avoids flashing an empty home).
- **Error:** `ErrorState` + retry.
- **Empty (first run):** no spend, no income, no category history → a `₹0` empty hero
  ("Nothing logged yet", **Log first expense** → `/add/quick?kind=expense`) + a GET STARTED
  tile list: budget (→ `/group/{personal}/budget`), group (→ `/groups`), friends (→ `/friends`).
- **Full:** hero + period pills + breakdown + balances + forecast + coming-up + streak.

### Layout (top → bottom) & actions
1. **Header** — greeting + first name; 🔍 → `/search`; 🔔 (unread dot) → `/history`; avatar → `/settings`.
2. **Catch-up banner** (conditional) — amber, when app was closed 30+ days with active recurring rules. **Review entries** → `/history`; **Dismiss**.
3. **HeroCard** — XL period spend (SpaceMono); pace bar + "X% · ₹Y left" **only if a budget is set** (else number + delta vs previous period); SVG health ring → **HealthSheet** *(sheet)*.
4. 🔘 **TabPills** — `Month · Today · Year` (re-runs the data load for that period).
5. **CategoryRankList** ("WHERE IT WENT") — top 3 category bars; row tap → `/category/{name}?period={tab}`; **+N more** expands.
6. **BalanceStrip** — shown if you owe / are owed > 0: "You owe / Owed to you" + **Settle** → `/add/quick?kind=transfer`.
7. **ForecastCard** *(flag `forecast`, Month view only, when `forecast.ready`)* — **below the Owe/Owed strip**: month-end projection vs budget + pace bar; biggest-shift teaser *(flag `dashboardInsights`)*; **See all insights** → `/insights`.
8. **ComingUpList** — next recurring bills (`buildUpcoming`); hidden when empty.
9. **StreakCard** *(flag `streak`)* — self-hides under 3 consecutive logged days.

**Data loaded:** persons, groups (also pushed to the Zustand store), this+previous period
txns, global net, per-group budget analytics, recurring rules, `computeHealthScore`,
`buildUpcoming`, and (Month view) the last-month totals that feed the forecast + shift
teaser. Reads AsyncStorage `hide_amounts` (obfuscates the hero) and `app_last_open`.

---

## 4. Groups

**Route:** `app/(tabs)/groups.tsx` · **Question:** "Who/what do I split with, and where do my balances stand?"

### States
- **Error:** `ErrorState` + retry. No loading state (renders stale store data until reload).
- **Empty:** `EmptyState` ("No groups yet" + New Group CTA); separate empty for archived.
- **Full:** FlatList of group cards + a People balances footer.

### Layout & actions
1. **Header** — title flips "Groups"/"Archived"; archive-toggle (only if archived groups exist); **+ New** group (active view only) → GroupForm *(sheet)*.
2. **People balance chips** (`renderBalances`) — friends with non-zero net; tap → `/add/quick?kind=transfer&to={personId}`.
3. **Group card** (`renderGroup`) — swipeable (swipe-left → Archive/Restore, suppressed for Personal); icon, name, "member count · spend", **AvatarStack**, **BudgetBar** + utilization label + over-budget badge, **BalanceChip**/chevron. **Tap → `/group/{id}`**.
4. **New Group sheet** (`SheetModal` + `GroupForm`): emoji/icon, name, type, members, default split. **Create** → `insertGroup` → reload → `/group/{newId}`.

> **Personal card** (pinned first, "Everything involving you") → **`/personal`** (not `/group/{id}`):
> the unified view (`app/personal.tsx`) — Owe/Lent/Net header + 🔘 tabs **Activity · Budget ·
> Recurring**. Activity = every txn involving me (`getMyActivity`) with 🔘 filters
> `Personal · Groups · All · {each group}`, my-share amounts, tap → source `/txn/{id}`. Recurring =
> collapsible, grouped by group. Budget tab currently links to the personal budget editor (global
> budget arrives in Phase 3). See [PERSONAL_REDESIGN.md](./PERSONAL_REDESIGN.md).

**Data loaded:** all groups (→ store), archived groups, me, per-group analytics+members+net,
global net, all persons, friend balances via `simplify`.

---

## 5. Group detail & sub-screens

### Group hub — `app/group/[id].tsx`
**Reached from:** Groups list, Home group cards, Plan (personal group), Settings → Budget.
**Tabs (local state, haptic on switch):** non-personal → **Expenses · Recurring · Budget ·
Members**; personal → **Expenses · Budget**.

1. **Header** — breadcrumb back `‹ Groups › {name}`; **Insights** chart icon (non-personal) → switches to the in-hub Insights view (`InsightsTab`); **⋯ options** *(sheet)*.
2. **Group hero** — icon + name + (Personal: "₹X this month" · Shared: **AvatarStack** + "N members").
3. **Balance card** (non-personal, your net ≠ 0) — "YOU OWE / OWED TO YOU" + amount + counterpart name + **Settle up** → `/add/quick?kind=transfer&to={primaryPerson}`.
4. 🔘 **Tab pills** (see set above).

**Tab — Expenses:** **FilterBar** (collapsible 🔍 "Search note or category" + 🔘 `All · Expense · Income · Settlement`) → **SectionList** of **TransactionRow** grouped by date. Row tap → `/txn/{id}` (or → recurring manager for a materialized occurrence). Swipe/delete: non-recurring → confirm + soft-delete + undo toast; recurring → 3-way Alert (rule only / rule + logged occurrences / cancel). Settlement rows render **both members' avatars**. **EmptyState** when none. **FAB** → `/add/quick?groupId={id}&kind=expense`.

**Tab — Budget:** "Budget" heading + **Edit** pill → `/group/{id}/budget`. Overview card (used / of total + **BudgetBar** + counts **over · near limit · on track**); recommendation pills; "Driving overspend" rows (worst-first) *or* "Every category within budget"; "Who paid what" contributions (shared); 🔘 status filter `All · Over · Near limit · On track`; per-category **BudgetBar** cards.

**Tab — Members** (shared): Group balances (Total spent · Your balance); member rows (avatar, name, "is owed / owes / settled"); **Invite someone** → `/group/{id}/members`; 🔘 **Simplify debts** *(toggle)* ("Fewest payments" ↔ "Every direct debt"); **BalanceRow** settlement rows ("N payments to settle") → **Settle amount** → `/add/quick?kind=transfer&from=&to=&amount=&groupId=`.

**Tab — Recurring:** active / paused / ended rules; row → `/group/{id}/recurring?focus={ruleId}`; add → `/add/quick?groupId={id}&kind=expense`.

**Insights view** (header chart icon): per-member spend bars, top categories, recommendations (the real group insights, via `InsightsTab`).

**⋯ Options sheet:** **History** (`/history?groupId={id}`) · **Edit group** (`/group/{id}/edit`) · **Archive group** (confirm → `archiveGroupSafe` → back). *(Recurring & Manage-members were removed — they're tabs now.)*

### Sub-screens
| Screen | Route | Purpose & key actions |
|---|---|---|
| **Budget editor** | `group/[id]/budget.tsx` | Per-category limit + 🔘 cadence *(sheet)*; collapsible sections; **Save** → `setCategoryBudgets` (only amounts > 0). Deep-link `?category=` auto-focuses a row. |
| **Edit group** | `group/[id]/edit.tsx` | `GroupForm`; **Save** diffs members (add/remove); Archive → `/groups`; Delete → `deleteGroup` (Personal can't be deleted). |
| **Members** | `group/[id]/members.tsx` | Avatar tap → photo picker; rename *(sheet)*; swipe-Remove (**blocked if net ≠ 0** — "Settle up first"); **Add or create person** via `PersonPicker` (multi-select + inline create). |
| **Recurring** | `group/[id]/recurring.tsx` | Per-rule: **Skip** / **Undo skip** / **Pause·Resume** / **Stop** (confirm → `endRecurring`). `?focus=` highlights a card. |

---

## 6. Add flows

All add screens are modal sheets (slide from bottom). Money parsed via `parseToPaise`;
saves wrapped in try/catch with haptic + Alert on failure.

### Quick Add — `app/add/quick.tsx`
**Purpose:** log one expense / income / settlement transfer (create or edit).
1. **ModalHeader** + 🔘 **kind** — `Expense · Income · Transfer` (hidden when editing; Income forces the Personal group).
2. **Amount input** (large SpaceMono).
3. **Expense/Income body:** category + date pills (→ `CategoryPicker` / `DatePickerSheet`); **GroupSelector** (expense, >1 group) — frequent-group pills + a **More** picker *(sheet)*; Title/Note card; **budget nudge** ("₹X left in {cat} this month", from `getAffordSnapshot`); **More options** (smart-category note, **Split by items** → `/add/itemized`, attach receipt, location, recurring card); split-with + paid-by rows; remainder warning.
4. **Transfer body** (`TransferBody`): from/to people, scope (per-group or "all groups"), 🔘 pay-method (UPI/Cash/Bank), note.
5. **SplitSheet** *(sheet, shared expense)* — 🔘 `Equal · Exact · % · Shares`.
6. **Smart category** (flag `smartCategory`): typing a title auto-picks a category via learned overrides → rules → "Other".
7. **Save** (`✓`, gated by `canSave`): transfer → `handleSaveTransfer` (`planAllGroupsSettlement` largest-first, or single group); edit → `updateTxn`; recurring-edit → `splitRecurringSeries` ("this & future"); new expense → duplicate-check (`findRecentDuplicate`, ±24 h) → `insertTxn`.
8. **Receipt attach:** iOS action sheet (camera/library); storage-full → Alert with a `/storage` deep-link; expense still saves.

### Income — `app/add/income.tsx`
Green-themed. Mode toggle flips to Quick (`router.replace`). Amount; source chips
(Salary/Freelance/Investment/Other, synced to category); budget-impact nudge (surplus/short);
group selector (personal only); recurring toggle + frequency + custom interval + end date.
**Save** → `insertTxn`/`updateTxn`/`splitRecurringSeries` with `payments:[{me,total}]`.
("Yearly" maps to a custom 365-day interval.) **No "split by items".**

### Itemized — `app/add/itemized.tsx`
4-step wizard with progress dots:
1. **Items** — name/qty/price rows; live subtotal; Tax/Tip/Discount adjustments.
2. **Assign** — assign each item to people ("Split unassigned equally" shortcut); per-person totals; unassigned banner.
3. **Payers** — who paid how much; balanced/remaining indicator.
4. **Review** — category, note, location, your-share + paid-by cards. **Save** → `insertItemizedTxn` / `updateItemizedTxn`.

Pure helpers (`computeAdjustedTotal`, `computeItemSubtotal`, `computePerPersonShares`) handle
math including exact remainder distribution.

---

## 7. Plan tab & savings

### Plan — `app/(tabs)/savings.tsx` (route name stays `savings`)
**Question:** "What am I saving toward, and what will my month look like?"
- **States:** `ErrorState` + retry; pull-to-refresh.
1. **ScreenHeader** "Plan" (large) + month pill.
2. 🔘 **Module chips:** `Insights` (always, `/insights`) · `Reports` (`reportsDonut`, `/reports`) · `Recurring` (flag `subscriptions`, `/plan/subscriptions`) · `Can I afford?` (`affordCheck`, `/afford`). *(Reminders chip removed — it's notification config, in Settings.)*
3. **Cash available** card — income in − paid out − saved.
4. **PoolCard** (`savingsGoals`): total saved, unallocated, goal count; **+** add to pool / withdraw *(sheets)*.
5. **Savings insights** card (`savingsInsights`): opportunity-cost / habit nudges.
6. **Goals** (`savingsGoals`): `DraggableList` (drag = funding priority); each **GoalCard** → icon, name, deadline, saved/target bar, needed/contribution per month. Tap → `/savings/{id}`. **New** → full goal sheet (name, target, icon, color, allocation + frequency, target-date) → `insertGoal`. / **EmptyState**.
7. **ComingUpList** "Upcoming this month".
8. **plan/ForecastCard** — month-end projection (distinct component from the Home `home/ForecastCard`).

### Goal detail — `app/savings/[id].tsx`
SVG progress ring; Saved/Remaining/Goal tiles; monthly-contribution card with nudge;
overfunded banner; contribution history.
- **Add to goal** → `depositAndAllocate` (tops the pool up by the shortfall) + fires `GoalCelebration` at 100%.
- **Withdraw** → `withdrawFromGoal` (clamped to saved). **Adjust** → `updateGoal`. **Lock** → `setGoalLocked`. **Delete** → confirm → `/savings`.

### Savings automation
`runSavingsMaintenance` (on boot + foreground): leftover-sweep → scheduled allocations
(`planAutoAllocations`, drag-rank order) → reconcile. Auto-sweep is opt-in (`auto_sweep_enabled`).

---

## 8. Settle up

**No standalone route** — `app/settle.tsx` is **deleted**. Settling is the **Transfer pill
inside Quick Add** (`TransferBody` + `settleScope.ts`). It records a `kind:'settlement'` txn
(payment from → share to) with `pay_method`, into a shared group; it does **not** count as
spending. **Reached from** (all open `/add/quick?kind=transfer…`):
- Home **BalanceStrip** → `…&` (picks a counterpart in the flow)
- Groups **People chip** / Friends row → `…&to={personId}`
- Group detail **Balance card** → `…&to={primaryPerson}`
- Group **Members** settlement rows → `…&from=&to=&amount=&groupId=`
- **Reminders** settle-ups → `…&to={counterpart}`

Scope can be a single group or "all groups" (`planAllGroupsSettlement`, largest-first).

---

## 9. Transaction & category detail

### Transaction detail — `app/txn/[id].tsx`
Hero amount (kind-colored) + category + note + cash line; meta card (When / Group / Paid via /
Added by / recurring link → `/group/{id}/recurring?focus=` / Location → opens Maps); receipt
section (preview/add/replace/remove; not for settlements); split summary; itemized items
(read-only); audit-log timeline; **Delete** (soft-delete + undo → back).
- **Edit** (only if not a materialized recurring occurrence) → routes to the right add screen (itemized / transfer / income / quick).

### Category insights — `app/category/[name].tsx`
Reached from Home category rows (`?period=`) and Reports donut — a **comprehensive
category-insights page** (all figures = my share). Period segment (Today/Month/Year); budget
card (prorated) or amount card + "set budget"; **Where it goes** (personal vs each group);
**Top places** (location-tagged); **Recurring** rules in the category → `/group/{id}/recurring`;
**Goals** tagged to it → `/savings/{id}`; transaction list → `/txn/{id}`.

---

## 10. Settings & sub-screens

### Settings — `app/(tabs)/settings.tsx`
Static config list (loaded once; no loading/error state).
1. **Profile card** — avatar (→ photo picker), name (→ rename *(sheet)*), "Offline-first · no accounts".
2. **Manage** — People → `/friends` · Categories → `/categories` · **Budget** ("Personal budget") → `/group/{personal}/budget` (→ `/groups` if none).
3. **Preferences** — Currency (`INR`, no-op) · Default budget cadence *(sheet)* · **Feature management** → `/features`. *(Health/Subscription/Location toggles live in Feature management now, not here.)*
4. **Security** *(toggles → AsyncStorage)* — Face/Touch ID lock · Privacy screen in app switcher · Hide amounts on home.
5. **Notifications** (flag `reminders`) — **Notifications & Reminders** ("Bills · daily log") → `/settings/notifications`.
6. **Data & Help** — Export & reports → `/reports` · Help & Feedback → `/help` · Replay welcome tour *(resets `onboarding_done`)* · History & Audit log → `/history`.
7. **About** — version; tap **7×** → `/storage` (hidden debug entry).

### Settings sub-screens
| Screen | Route | What it does |
|---|---|---|
| **People** | `friends.tsx` | You card + contacts with balance chips, group counts, tap → `/add/quick?kind=transfer&to=`; add/rename person *(sheet)*. |
| **Categories** | `categories.tsx` | 🔘 `Expense · Income` kind tabs; collapsible sections; add (name/icon/color) / rename / delete. |
| **Feature management** | `features.tsx` | "Always on" pillars (no toggle) + module 🔘 switches by section (Insights & reports · Money tools · Smart capture). Location toggle asks OS permission + writes `save_location`. |
| **Help** | `help.tsx` | Static FAQ accordion. |
| **Audit log** | `history.tsx` | Date-grouped change log with colored dots, EDIT/DEL badges, "Load older". Filters by `?groupId=`. |
| **Search** | `search.tsx` | `Input` + 🔘 kind & source filters → `SectionList` of `TransactionRow` (→ `/txn/{id}`). |
| **Storage** | `storage.tsx` | Receipt-photo disk usage + "Delete all attachments"; **TESTING:** Load demo data / Erase all data (see §15). |
| **Notifications** | `settings/notifications.tsx` | Permission banner; 🔘 renewal/daily toggles + `TimePickerSheet`; test notification. |

---

## 11. Optional modules

| Module | Flag | Surface(s) | Status |
|---|---|---|---|
| Savings goals + pool | `savingsGoals` | Plan tab, `savings/[id]` | ✅ wired |
| Spending forecast | `forecast` | **Home ForecastCard** + Plan forecast card + Reports line | ✅ wired |
| Dashboard insight teaser | `dashboardInsights` | Home ForecastCard shift teaser | ✅ wired |
| Financial health | `healthScore` | Home ring → `HealthSheet` | ✅ wired |
| Reminders | `reminders` | Settings → Notifications, `reminders.tsx`, OS notifications | ✅ wired (dev build for OS notifications) |
| Recurring (label; flag still `subscriptions`) | `subscriptions` | Plan **Recurring** chip → `plan/subscriptions.tsx`, insights nudge | ✅ wired — tracked recurring rules **+** a "Maybe recurring" detector over logs |
| Smart category | `smartCategory` (off) | Quick-add note | ✅ wired |
| Reports & charts | `reportsDonut`/`reportsTrend` | `reports.tsx` (Plan chip) | ✅ wired |
| Afford check | `affordCheck` (off) | Plan chip → `afford.tsx` | ✅ wired |
| Tracking streak | `streak` (off) | Home `StreakCard` | ✅ wired (self-hides < 3 days) |
| OCR receipt scan | `itemizedOcr` (on) | — | ❌ parked — `ocr.ts` never called (camera capture only) |
| Location tagging | `save_location` pref | Add flows + txn detail Maps link | ✅ wired |

### Reports — `app/reports.tsx`
`ScreenHeader` "Reports" + CSV/PDF export (right slot). Month nav; SPENT/EARNED cards; category
donut (tap segment → `/category/{name}`); 6-month trend (Bar/Line charts); forecast line;
year-in-review; export CSV / PDF (inline HTML template).

### Insights — `app/insights.tsx`
`ScreenHeader` "Insights" + month pill → eyebrow; **velocity hero** (only when projected to
overspend) → "See what to cut" (`/group/{personal}`); **shifts vs last month**; 🔘 **what-if**
`10% · 20% · 30%`; **across-all-groups net**; **recurring** nudge (→ `/plan/subscriptions`).

### Reminders — `app/reminders.tsx`
`ScreenHeader` → upcoming bills (`buildUpcoming`) → "Log payment" (`/add/quick?kind=expense`);
settle-ups → "Settle now" (`/add/quick?kind=transfer&to=`); settings → `/settings/notifications`.

### Recurring — `app/plan/subscriptions.tsx`
Title "Recurring". Tracked recurring **expense rules** + monthly-total summary; rows →
`/group/{id}/recurring`; a **"Maybe recurring"** detector section surfaces repeating un-ruled
charges; empty CTA → `/add/quick?kind=expense`. *(Route/flag keep the legacy `subscriptions` name.)*

### Afford check — `app/afford.tsx`
Amount input + 🔘 **CategoryChip** picker → yes/tight/no verdict → CTA (`/add/quick` or `/savings`).

---

## 12. System components & global behaviors

| Behavior | Component | Notes |
|---|---|---|
| Biometric lock | `LockGate` | Face ID on background; truth in AsyncStorage `biometric_enabled`. |
| App-switcher privacy | `PrivacyScreen` | Branded cover over the snapshot. |
| Undo deletes | `UndoProvider` / `UndoToast` | 5 s toast above nav; survives `router.back()`. |
| Cross-screen refresh | `DataRefreshProvider` | `refresh()` bumps a version; `useRefreshOnDataChange` re-loads screens after a write elsewhere. |
| Goal celebration | `GoalCelebration` | Full-screen confetti at 100% (auto-dismiss). |
| Health detail | `HealthSheet` | Score ring + 3 dimensions + factors + projected improvement. |
| Boot splash | `BrandedLoader` | Logo + spinner during DB init. |
| Boot failure | `_layout` `ErrorState` | Isolated; Retry re-runs DB init. |
| Recurring catch-up | `materializeDueOccurrences` | On boot + foreground; surfaces the Home catch-up banner. |
| Pull-to-refresh | `useRefresh` / `AppRefreshControl` | Home, Groups, Plan, Insights, Recurring, Reminders, group detail, Personal. |
| Brand animation | `LogoAssembly` | ⛔ **Never modify** (also the onboarding hero ring/fan). |

---

## 13. Every pill, in one table

| Screen | Pill set | Options |
|---|---|---|
| Home | Period | Month · Today · Year |
| Add | Kind | Expense · Income · Transfer |
| Add (expense) | GroupSelector | frequent-group pills + **More** picker *(sheet)* |
| Add (shared) | Split mode | Equal · Exact · % · Shares |
| Add (transfer) | Pay method | UPI · Cash · Bank |
| Plan | Modules | Insights · Reports · Recurring · Can I afford? |
| Personal | Tabs | Activity · Budget · Recurring |
| Personal › Activity | Scope filter | Personal · Groups · All · {each group} |
| Group | Tabs | Expenses · Recurring · Budget · Members |
| Group › Expenses | Kind filter | All · Expense · Income · Settlement |
| Group › Budget | Status filter | All · Over · Near limit · On track |
| Insights | What-if | 10% · 20% · 30% |
| Categories | Kind | Expense · Income |
| Settings | Cadence *(sheet)* | One-time · Daily · Monthly · Yearly |

---

## 14. Feature catalog

A one-line index of every user-facing capability and where it lives.

- **Log expense** — FAB / Quick Add → `insertTxn`.
- **Log income** — Add Income / kind toggle → `insertTxn` (personal).
- **Split a bill (equal/exact/%/shares)** — Quick Add split rows + `SplitSheet`.
- **Itemized split** — 4-step Itemized wizard.
- **Settle a debt** — Quick-Add Transfer pill (min-transaction `simplify` / largest-first); the picker shows your balance with each person + per-group scope amounts.
- **Personal** — unified "everything involving me" view (`/personal`): Owe/Lent/Net + Activity (filters, my-share, source-linked) + global Budget + Recurring-by-group.
- **Groups** — create/edit/archive/delete; members; per-group default split; simplify-debts toggle.
- **People / friends** — cross-group balances; add/rename; avatars.
- **Budgets** — individual & **my-share**: a global personal budget (across all groups) + optional per-group budget; per-category cadence (once/daily/monthly/yearly).
- **Recurring transactions** — rules with skip/pause/resume/end; materialized on open.
- **Savings goals + pool** — manual + auto-funding (drag-rank), lock, overfund; **completed goals** sort to the bottom with a distinct card.
- **Financial health score** — 5-factor engine + improvement projection.
- **Spending forecast** — Bühlmann-blended month-end projection (Home + Plan + Reports).
- **Reports** — donut, trend, forecast, year-in-review, CSV/PDF export.
- **Insights** — velocity, shifts, what-if, cross-group net, recurring; **per-category insights page** (spend split, places, recurring, goals) from the Dashboard.
- **Recurring tracker** — recurring-expense tracker + monthly total + "maybe recurring" detector.
- **Undo** — every delete (txn, member, goal) shows a 5s Undo toast.
- **Reminders** — local renewal + daily-log notifications (dev build).
- **Afford check** — yes/tight/no purchase decision.
- **Smart categories** — keyword guess + learned corrections.
- **Receipt photos** — local attach/view/zoom; storage management.
- **Location tagging** — captured on add; Maps link on detail.
- **Audit log** — every data change, filterable by group.
- **Search** — across category/note/amount, grouped by month.
- **Privacy** — biometric lock, app-switcher cover, hide-amounts.
- **Onboarding** — 8-stage intent → name → income → budget → people → permissions.

---

## 15. Developer / QA tooling

Reached via **Settings → tap "BudgetSplit v2.0" ×7 → `/storage`**.

- **Load demo data** — wipes the DB and rebuilds a comprehensive dataset that exercises every
  component state. Also flips **all feature flags on** and preserves your name & avatar.
  Source: `src/db/seedDemo.ts → loadDemoData`. Coverage:
  - **6 people · 8 groups** (Personal, Roommates, Goa, Office, Family, Manali, an **empty** group
    "Weekend Plans" for empty-tab states, and an **archived** "Old Flat") · ~70 transactions / 3 months.
  - **Splits:** equal · exact · shares/weights · itemized (tax + tip + **discount**). **Settlements:** partial (live balances) + fully-settled, all pay methods. **simplify-debt OFF** on Goa.
  - **TransactionRow states:** note-primary, **category-primary (no note)**, attachment clip, lent/borrowed attribution, income, settlement (two avatars).
  - **Recurring:** active / paused / ended across daily→weekly→monthly→yearly→**custom**; plus **near-due rules** (1–3 days out) so **Home "Coming up"** + **Plan "Upcoming"** populate.
  - **Recurring:** tracked rules (varied cadence + next-charge dates) **and** a repeating un-ruled charge that triggers the **"Maybe recurring"** detector.
  - **Budgets:** over / near / under, every cadence (once/daily/monthly/yearly).
  - **Savings — 7 goals:** locked@40% · reached 100% (deadline) · over-funded 120% · partial · 0% empty · withdrawal history · **overdue** (deadline past) · manual + auto funding.
  - **Edge cases:** ₹65k large, ₹5 tiny, soft-deleted txn, location-tagged + attachment rows.
- **Erase all data** — `resetToEmpty`: wipes everything to an empty app (name/avatar kept) for
  testing empty states.
- **Delete all attachments** — clears receipt photo files + DB refs.

---

## 16. Component inventory

Every component in `src/components/**`, with what it is and where it's used. Folder rule:
`ui/` = generic primitives (no domain knowledge); `finance/` = budget/txn/member/settle
widgets; `system/` = onboarding, gates, privacy. `ui/` never imports from `finance`/`system`.

### `ui/` — generic primitives
| Component | What it is / where |
|---|---|
| `AmountText` | Money text in SpaceMono, kind-colored, obfuscation-aware. Used in balances, forecast, goals, reports. |
| `AppRefreshControl` (+ `useRefresh`) | Themed pull-to-refresh for scroll/list screens. |
| `Badge` | Small labeled pill (e.g. Reports forecast badge). Used across reports/insights/history/settings/etc. |
| `BalanceChip` | Owe/owed chip on group cards (Groups list). |
| `DatePickerSheet` | Bottom-sheet date picker (Add flows). |
| `DraggableList` | Gesture-handler reorderable list — drag = savings funding priority (Plan). |
| `DraggableSheet` | Low-level draggable-sheet primitive used internally by `SheetModal`. |
| `EmptyState` | Icon circle + title + body + CTA. Every list's empty state. |
| `ErrorState` | Error icon + message + Retry. |
| `FAB` | Floating action button — `aboveTabBar` (tab-bar centered) or bottom-right (group detail). |
| `FadeIn` | Staggered fade-in wrapper for list/section mounts. |
| `FilterBar` | **Search box + chip filter groups**; collapsible mode (chips + 🔍 icon → expanding search). Group Expenses/Budget, Search, History. |
| `Input` | Design-system text input (bgInput, focus border, amount mode). |
| `ModalHeader` | Header for modal sheets (title + close). Add flows. |
| `MoreOptions` | Expandable "more options" block in Add — date, attachment, location, pay method, recurring. (quick/income) |
| `PressableScale` | Spring-scale tappable wrapper for cards/rows. |
| `PrimaryButton` | Gradient primary CTA (52px). All primary actions. |
| `ScreenHeader` | Safe-area header (back chevron + title + right slot) for every **pushed** screen. |
| `SecondaryButton` | Bordered secondary button. |
| `SettingsRow` (+ `settingsRowDivider`) | Icon + label + value + chevron row. Settings, group ⋯ menu. |
| `SheetModal` | The reusable gesture-handler **bottom sheet** used everywhere (pickers, menus, forms). |
| `Skeleton` / `SkeletonCard` | Skeleton loaders (Reports, Category, Goal detail). |
| `TabPills` | Segmented pill control (Home period; reused for in-screen segments). |
| `TimePickerSheet` | Bottom-sheet time picker (Notifications). |

### `finance/` — domain widgets
| Component | What it is / where |
|---|---|
| `AvatarStack` | Overlapping member avatars (Groups cards, group hero). |
| `BalanceRow` | "A owes B" row + **Settle amount** CTA (group Members settlements). |
| `BudgetBar` | Animated utilization bar, health-colored. Budgets, group cards, category detail. |
| `CategoryChip` | Selectable category chip (Afford check). |
| `CategoryDonut` | SVG donut of category spend (Reports). |
| `CategoryPicker` | **Searchable** category grid *(sheet)* + inline create. Add flows. |
| `GoalCelebration` | Full-screen confetti at 100% goal (auto-dismiss). |
| `GroupForm` | Create/edit group form — icon, name, type, members, default split. |
| `GroupSelector` | **Frequent-group pills + a "More" picker sheet** for switching group in Add-expense. |
| `HealthSheet` | Financial-health detail sheet (ring + dimensions + factors). |
| `InsightText` | Rich/parsed insight text with emphasis (Plan insights). |
| `MemberAvatar` | Circular avatar (initials or photo), tappable for photo pick. Everywhere people appear. |
| `PersonPicker` | **Searchable** multi-select person list + inline create (Members add). |
| `TransactionRow` | Transaction list row — title/category, amount, attribution, attachment clip, settlement avatars. |
| `TransferBody` | Transfer/settle body — from/to people, scope, pay-method, note (Quick-Add Transfer). |

### `finance/home/` — Dashboard widgets
| Component | What it is |
|---|---|
| `HeroCard` | Hero period spend + pace bar + prev-delta + health ring. |
| `TabPills` *(ui)* | Period segments (re-listed here for context). |
| `CategoryRankList` | "Where it went" top-category bars, expandable. |
| `BalanceStrip` | Owe/Owed summary + Settle. |
| `ForecastCard` (home) | Month-end forecast + budget pace + biggest-shift teaser → Insights. |
| `ComingUpList` | Upcoming recurring bills. |
| `StreakCard` | Logging-streak calendar (self-hides < 3 days). |
| `HealthBand` | Health band strip — **imported on Home but not currently rendered** (HeroCard's ring is used instead). |

### `finance/group/`, `finance/plan/`, `finance/add/`
| Component | What it is |
|---|---|
| `group/InsightsTab` | In-hub group Insights view (member spend bars, top categories, recommendations). |
| `plan/ForecastCard` | Plan-tab month-end forecast card (distinct from `home/ForecastCard`). |
| `plan/GoalCard` | Savings goal card — progress bar, deadline, contribution/needed per month. |
| `plan/PoolCard` | Savings pool card — saved/unallocated + add/withdraw. |
| `add/SplitSheet` | Split editor *(sheet)* — Equal / Exact / % / Shares. |

### `system/` — global behaviors
| Component | What it is |
|---|---|
| `BrandedLoader` | Boot splash (logo + spinner) during DB init. |
| `DataRefreshProvider` (+ `useRefreshOnDataChange`) | Version-bump context so screens reload after a write elsewhere. |
| `FeatureFlagsProvider` (+ `useFeatureFlags`) | Feature-flag context (AsyncStorage-backed). |
| `LockGate` | Biometric (Face/Touch ID) lock on background. |
| `LogoAssembly` | Brand assembly animation — ⛔ **never modify**. |
| `Onboarding` | The 8-stage onboarding flow. |
| `OnboardingGate` | Gates onboarding via AsyncStorage `onboarding_done`. |
| `PrivacyScreen` | App-switcher privacy cover. |
| `UndoToast` (+ `UndoProvider`) | 5-second undo toast above nav. |

> **Two `ForecastCard`s exist:** `home/ForecastCard` (Dashboard, with the shift teaser) and
> `plan/ForecastCard` (Plan tab). Different props, different screens.

---

## 17. Manual test flows

These are the **interactive** behaviours that static data can't show on its own — the demo
seed (§15) **pre-stages the data so each is one or two taps from completing**. After **Load
demo data**, run these:

| # | Flow / component to see | Pre-staged data | Steps to complete |
|---|---|---|---|
| 1 | **GoalCelebration** (100% confetti) | "Weekend Getaway" goal at **97.5%** (₹19.5k/₹20k) | Plan → Weekend Getaway → **Add to goal** ₹500 → confetti fires. |
| 2 | **Undo toast** (`UndoToast`) | Personal txn noted **"Delete me — tests the Undo toast"** | Open it (or long-press in a list) → Delete → tap **Undo** within 5 s. |
| 3 | **Settle up** (Transfer pill) | Live balances in Roommates / Goa / Family / Manali | Home **Owe/Owed → Settle**, or Group → Members → **Settle amount** → pick method → Save. |
| 4 | **Recurring skip / pause / stop** | Active rules incl. **near-due** ones (1–3 days) | Group/Personal → Recurring → a rule → **Skip next / Pause / Stop**. |
| 5 | **Member remove — blocked vs allowed** | Roommates members have balances; **Office Lunch** is fully settled | Group → Members → swipe-remove: blocked in Roommates ("settle first"), allowed in Office Lunch. |
| 6 | **Empty states** (within a populated app) | **"Weekend Plans"** group (members, 0 txns) | Open it → empty Expenses & Budget tabs. (Whole-app empty → **Erase all data**.) |
| 7 | **"Maybe recurring"** detection | 3× un-ruled "Prime Video" ₹199/mo charges | Plan → Recurring → scroll to **"MAYBE RECURRING"**. |
| 8 | **Coming up / Upcoming** | 3 near-due recurring rules (1–3 days out) | Home **"Coming up"** + Plan **"Upcoming this month"** already show them. |
| 9 | **Smart-category learning** | flag ON; many noted txns to learn from | Add expense → type a title (e.g. "Uber") → category auto-suggests; correct it once → it learns. |
| 10 | **Itemized split** (4-step wizard) | groups with members | Add → expense → **Split by items** → add items, assign, payers, review → Save. |
| 11 | **Budget over/near/under live** | Groceries **over**, Eating Out **near**, Fuel **under** | Personal → Budget tab; or add a Groceries expense to watch a bar flip red. |
| 12 | **Goal withdraw / lock / adjust / delete** | funded goals (Emergency locked, Laptop partial) | Plan → a goal → withdraw / lock / adjust / delete. |
| 13 | **Group create / edit / archive / delete** | existing groups | Groups → **New**; or Group → ⋯ → Edit / Archive. |
| 14 | **Receipt attach** *(needs camera/library)* | — | Add expense → More options → **Attach receipt**. (OCR auto-fill is parked.)|
| 15 | **Export CSV / PDF** | 3 months of data | Reports (Settings → Export, or Plan → Reports) → **CSV / PDF**. |
| 16 | **Replay onboarding** | — | Settings → **Replay welcome tour** → fully reopen the app. |
| 17 | **Privacy** (hide amounts / biometric) | amounts present | Settings → Security toggles; Home amounts mask to ••••. |
