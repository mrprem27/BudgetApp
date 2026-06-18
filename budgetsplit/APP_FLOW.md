# BudgetSplit — Complete App Flow

A full map of every screen, every section, and every sub-section, so we can review and fix things one level at a time.

- **Stack:** React Native + Expo (SDK 56) · Expo Router (file-based) · expo-sqlite (local DB) · Zustand (runtime state) · react-native-gifted-charts.
- **Principle:** 100% offline. No accounts, no network, no tracking. All data lives on-device in `budgetsplit.db`.
- **Money:** always stored as integer paise; formatted only at the view layer (`formatRupees`, `formatCompact`).
- **Currency abbreviation:** `formatCompact` → INR uses `K / L / Cr`, other currencies use `K / M / B`.

---

## 0. App shell & gates (`app/_layout.tsx`)

Order in which the app boots and wraps every screen:

1. **Font + DB load gate** — shows a spinner until fonts (Inter, Space Mono) and `openDB()` + `seedIfNeeded()` finish.
2. **Providers** — `SafeAreaProvider` → `GestureHandlerRootView` → `SQLiteProvider` → **`FeatureFlagsProvider`** (feature toggles) → `StatusBar`.
3. **`LockGate`** — biometric (Face ID / Touch ID) lock if enabled in Settings.
4. **`OnboardingGate`** — first-run welcome carousel (see §1).
5. **`PrivacyScreen`** — blur overlay when the app is backgrounded (hides finances in the app switcher).
6. **Stack** — the `(tabs)` group plus the four **Add** screens presented as bottom-sheet modals (`add/quick`, `add/income`, `add/itemized`, `add/transfer`).

> Removed: budget push notifications (lib + permission prompt + help entry) — deferred for now.

---

## 1. Onboarding (`src/components/system/Onboarding.tsx`)

First-run only (re-triggerable via Settings → "Replay welcome tour"). Horizontal carousel of slides, each with a hero icon, title, body, and 3 feature points:

1. **Know where it goes** — logging, categories, charts, recurring.
2. **Split, minus the math** — groups, split types, itemize, settle.
3. **Budgets that hold** — per-category limits, cadence, trend, overspend heads-up.
4. **Name capture** — final slide sets the user's name (`updatePersonName`), then enters the app.

---

## 2. Tab bar (`app/(tabs)/_layout.tsx`)

Four **labelled** tabs on a **frosted-glass** bar (`expo-blur`, translucent, absolute): **Home** (`home`) · **Groups** (`users`) · **Savings** (`target`) · **Settings** (`settings`). Active tint = teal accent. **Reports is not a tab** — it folds into Home (reachable from the dashboard header's chart button). The Personal ledger + all Savings live under the **Savings** tab; **Groups** is purely shared splitting.

> Note: the blur is a native module — needs a dev-client rebuild (`npx expo run:ios`) to render.

---

## 3. Dashboard / Home — `app/(tabs)/index.tsx`

Hero financial overview across all groups. Sub-sections, top to bottom:

- **3.0 Greeting header** — "Good morning/afternoon/evening" + your first name + avatar; a **Reports** chart-button (→ `/reports`) sits top-right.
- **3.1 Time-range pills** — `Today` / `Month` / `Year`; everything below recomputes per range.
- **3.2 Spending hero card**
  - My spending (xl, **compact**) for the range.
  - Delta row vs previous period (% or compact rupees; up = coral, down = green).
  - Stats strip: **Income** · **Net** · **Savings %**.
- **3.3 Budget + Balances tiles** — a 2-column compact grid: **Budget** tile (Budget/Spent/Left + over/near flags → group budget/insights) and **Balances** tile (you owe / owed → Settle Up).
- **3.4 Savings card** — **Pool / Available / Goals** count → Savings tab (only if savings or goals exist).
- **3.5 Insights card** *(gated: `insights`)* — ranked cross-group analytics rows; tap → that group's budget.
- **3.6 Spending-by-category donut** — interactive `PieChart`; tap a wedge to focus; quick-pick chips + legend.
- **3.7 Spending-over-time area chart** — `LineChart` with drag tooltip; compact y-axis.
- **3.8 Recent activity** — latest 3 transactions across all groups → txn detail.
- **3.9 Group health list** — each group's monthly budget bar + %; tap → group detail.
- **3.10 Empty state** — when nothing is logged, a CTA to add the first expense.
- **3.11 FAB** — Expense · Income (→ personal ledger) · Transfer · Itemized Bill.

---

## 4. Groups (Split) — `app/(tabs)/groups.tsx`

Shared splitting only — the **Personal** group is excluded here (it lives under the Money tab).

- **4.0 Balances hero + Settle** — net balance (compact), **You owe / You're owed**, then a **"Settle up · tap a person"** list (who-owes-whom from `simplify(getGlobalNet)`, your view); tap a row → Settle screen.
- **4.1 Filter chips** (only if archived groups exist) — `Active (n)` / `Archived (n)`.
- **4.2 Group list** — shared groups only; each card: color stripe, icon, name, "₹X this month · N members", monthly budget bar + %. **Swipe left** to Archive/Restore.
- **4.3 Empty states** — separate ones for no active groups (CTA: New Group) and no archived groups.
- **4.4 FAB** — New Group · Expense. (No Income — income is personal-only.)
- **4.5 "New Group" sheet** — name, icon picker, color picker → creates and opens the group.

---

## 5. Group detail — `app/group/[id].tsx`

Color-themed gradient header (back, group hero: icon + name + "₹X this month · members · you owe/owed"), a thin overall budget bar, then an underline **tab strip**. Personal groups show only Expenses + Budget; shared groups show all four.

- **5.1 Expenses tab**
  - Filter bar: search (note/category) + kind chips (All / Expense / Income / Settlement).
  - Transactions grouped by date (`Today`, `dd MMM yyyy`); each row tap → txn detail; swipe/delete supported. Recurring instance → opens Recurring screen.
  - Empty states for "no expenses" vs "no matches".
- **5.2 Balances tab** (shared only)
  - "Everyone's balance" card — per-member is-owed / owes / settled.
  - **Simplify debts** toggle (fewest payments vs every direct debt).
  - Settlements list — each `BalanceRow` with "Mark as paid" → opens `SettleSheet` (before→after preview).
  - "All settled up" empty state.
- **5.3 Budget tab**
  - Heading + **Edit** pill → budget editor.
  - Utilization overview card: spent / allocated, big %, stat strip (over / near limit / on track).
  - Recommendations pills (warn/info/good).
  - Status filter bar (All / Over / Near limit / On track).
  - Category budget lines grouped by section, each with cadence tag + spent/allocated + budget bar.
  - "No budget yet" empty state → create budget.
- **5.4 Members tab** (shared only) — member list with net balances + "Manage members".
- **5.5 FAB** — **Personal:** Expense · Income · Itemized. **Shared:** Expense · Transfer · Itemized. (Income is personal-only; shared groups move money via Transfer = settling who-owes-whom.)
- **Personal mode is a solo ledger:** no member attribution — the txn detail hides "Added by / Paid by / Split", and quick-add hides the payer/split UI (single member).
- **5.6 Options menu (⋯ sheet)** — Recurring transactions · History · Edit group · Manage members · Archive group (shared) / personal-space note.

---

## 6. Reports — `app/(tabs)/reports.tsx` (reached from Home, not a tab)

Routed at `/reports`; opened via the **chart button** in the dashboard header.

- **6.1 Header** — title + **CSV** and **PDF** export buttons (share sheet).
- **6.2 Month navigator** — ◀ Month Year ▶.
- **6.3 Per-group summary cards** — Income / Expense / Net (compact) + top categories + budget utilization.
- **6.4 6-month spending trend** — `BarChart`, compact y-axis.
- **6.5 Month-end forecast** *(gated: `forecast`; current month only)* — actual cumulative line + dashed projection, forecast badge (projected total, compact), compact y-axis. Hidden for past months.
- **6.6 Year-in-review** — yearly income / spent / saved + top category + biggest expense.
- **6.7 Empty state** — when no transactions exist for the month.

---

## 6.5 Savings — `app/(tabs)/savings.tsx` (+ goal detail `app/savings/[id].tsx`)

Your personal money hub (all saving is personal-budget). Budgets and savings stay strictly separate — leftover never inflates a budget.

- **Cash available hero** — your real money (derived: income − what you paid out of pocket − settlements you paid + settlements received − money in savings), with an `in · out · saved` breakdown.
- **Personal budget & spending** — entry to the personal ledger + budget (opens the personal group detail).
- **Pool card** — Total **Pool** / **Allocated** / **Available**; **Add** (deposit) and **Withdraw** (take money out of the pool).
- **Insights** — psychological opportunity-cost nudges (emoji + line), tone-varied, from real 30-day spending vs goals.
- **Goals list** — card per goal: icon, name, priority chip, progress bar + %. Tap → goal detail.
- **New-goal sheet** — name, target, priority (High/Med/Low), icon/color, fixed allocation + frequency.
- **Goal detail** — hero (saved/target, %, bar, remaining, priority, est. completion), **Add funds** (allocates from pool, auto-tops-up if short) · **Withdraw to pool** · **lock** · delete; contribution history.
- **Automation** (`runSavingsMaintenance`, on launch + focus): ① **scheduled auto-funding** — each goal's fixed allocation × elapsed periods, priority-ordered when short; ② **auto-reduce** — if allocated exceeds the pool, pull from lowest-priority *unlocked* goals first. *(Budget-leftover auto-sweep exists in code but is currently OFF — under the cash model it would silently lower "Cash available"; funding model TBD.)*

---

## 7. Settings — `app/(tabs)/settings.tsx`

Grouped cards, each under an uppercase section label:

- **7.1 Account** — profile card (avatar + name); tap to edit name.
- **7.2 Privacy & Security** — toggles: Face ID / Touch ID lock · Privacy screen in app switcher · Save transaction location.
- **7.3 Preferences** — Default budget cadence (sheet) · Currency (sheet).
- **7.4 Features** *(feature toggles, default ON)* — Insights & tips · Spending forecast · Itemized split + receipt scan (OCR) · Recurring transactions.
- **7.5 Manage** — Categories · History. (Savings is now its own tab, not here.)
- **7.6 Help & Support** — Help & Guide · Replay welcome tour.
- **7.7 About** — version + "Offline-first · No accounts · No tracking".

---

## 8. Add flows (bottom-sheet modals)

### 8.1 Quick expense — `app/add/quick.tsx`
- Amount with **currency badge** (per-transaction currency switch).
- Group selector (if >1 group).
- **Category** picker (inline-create supported).
- Note · Date.
- **Set schedule** (recurring) *(gated: `recurring`)* — frequency (Daily/Weekly/Monthly/Custom interval) + end date.
- **Who paid?** sheet (multi-payer; must balance to total).
- **Split** sheet — Equal / Exact / Percent / Shares; live "unassigned/over" indicator; save blocked until balanced.

### 8.2 Income — `app/add/income.tsx` (Personal only)
Income = real money **you** received → only the Personal ledger (the group picker lists personal groups only; no shared groups).
- Amount (income green).
- **Source** category picker (income categories; inline-create writes `section='Income'`).
- Note · Date.
- **Set schedule** (e.g. salary) *(gated: `recurring`)* — frequency + end date.

### 8.3 Transfer — `app/add/transfer.tsx`
- Only available in multi-member groups.
- From member → To member · amount · note. Records a settlement-type move that does **not** count as spending.

### 8.4 Itemized bill — `app/add/itemized.tsx`
Four-step flow (`items → assign → payers → review`):
- **Items** — add line items (name, qty, unit price); **Scan receipt** (OCR) *(gated: `itemizedOcr`)* to prefill.
- **Assign** — tap member avatars to assign each item.
- **Payers** — who paid how much.
- **Review** — adjustments (tax / tip / discount, flat or %), per-person breakdown, then save.

---

## 9. Secondary / drill-in screens

- **9.1 Transaction detail — `app/txn/[id].tsx`** — category hero + amount, then (shared groups only) payer/who-paid + split breakdown, line items (if itemized), location/map link, note, and full **audit history**. **Personal-group txns hide all attribution** (Added by / Paid by / Split). Edit / delete actions.
- **9.2 Category detail — `app/category/[name].tsx`** — hero (icon + this-month spend + % of budget + txn count/avg), monthly budget bar, year-to-date summary, this-month transaction list. Reached from Budget & Insights.
- **9.3 Budget & Insights — `app/group/[id]/insights.tsx`** *(V3)* — utilization hero %, status badges (over/near/on-track), daily-allowance projection card, "Needs attention" list, "On track" count, **Trends** (biggest increase/decrease), recommendations, and all-categories list (tap → category detail).
- **9.4 Budget editor — `app/group/[id]/budget.tsx`** — per-category budget rows with cadence (One-time/Daily/Monthly/Yearly) + amount; monthly-equivalent headline; save all.
- **9.5 Recurring — `app/group/[id]/recurring.tsx`** — active recurring rules with frequency label + next occurrence; Pause / Resume / End.
- **9.6 Manage members — `app/group/[id]/members.tsx`** — member list with balances; add existing person or create a new one (name + avatar color); remove member.
- **9.7 Edit group — `app/group/[id]/edit.tsx`** — rename, change icon and color.
- **9.8 Settle Up (global) — `app/settle.tsx`** — fewest cross-group payments to clear everyone; each row → `SettleSheet` (before→after) to record payment. "All settled up" empty state.
- **9.9 Categories — `app/categories.tsx`** — Expense / Income tab; collapsible sections with count badges; add/delete custom categories per section (stored with their `section`).
- **9.10 History — `app/history.tsx`** — audit log (optionally group-scoped); filter by action (Added/Edited/Deleted/Settled/…) and range (Today/Week/Month/All).
- **9.11 Help & Guide — `app/help.tsx`** — 9 collapsible sections (Getting Started, Groups & Splitting, Budgets & Limits, Recurring, Reports & Export, Categories, Privacy & Security, Dashboard, Tips & Tricks), each with expandable Q&A items.

---

## 10. Feature toggles (Settings → Features, default ON)

| Flag | Gates |
|---|---|
| `insights` | Dashboard Insights card + group-detail analytics block |
| `forecast` | Reports month-end forecast chart |
| `itemizedOcr` | Itemized "Scan receipt" (OCR) affordance |
| `recurring` | "Set schedule" recurring option in add flows |

Source: `src/lib/featureFlags.ts` (AsyncStorage, `feature_` prefix) via `FeatureFlagsProvider` / `useFeatureFlags()`.

---

## 11. Data model (SQLite — `src/db/schema.ts`)

`person` · `budget_group` · `group_member` · `txn` (+ `txn_payment`, `txn_share`, `line_item`) · `category` (kind: expense/income, + `section`) · `category_budget` (cadence) · `savings_goal` (priority, allocation, frequency, `last_auto_at`) · `savings_txn` (deposit/allocate/withdraw ledger) · `settings` · `audit_log`. Recurring transactions are computed on the fly (materialization-aware queries), not stored per occurrence.

---

## 12. Current status

- Tests: **69/69 pass**; TypeScript: **clean**.
- OCR: **real** on-device Apple Vision (`modules/expo-ocr`, itemized flow only).
- Notifications: **removed**.
- Compact number formatting (K/L/Cr) and the forecast graph: **done**.
- **Savings Goals** feature complete: pool, goals CRUD, manual + scheduled auto-funding, leftover sweep, auto-reduce, opportunity-cost insights, withdraw.
- **IA restructure:** bottom nav = Home · Groups · Savings · Settings (frosted-glass bar, labels); Reports folds into Home; **Income is personal-only**; **Personal mode is a solo ledger** (no member attribution).
- Onboarding: animated logo-assembly intro + scroll-progress carousel.
