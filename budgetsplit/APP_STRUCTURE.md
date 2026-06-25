# BudgetSplit — App Structure & Implementation Status

> **Source of truth** for every screen, route, and feature.  
> Before building anything new, check this file first.  
> **No different logic for the same thing.** One computation, one place.

---

## Navigation Shell

```
Bottom Tab Bar
├── Home        → app/(tabs)/index.tsx
├── Groups      → app/(tabs)/groups.tsx
├── [FAB]       → opens Add bottom-sheet (quick.tsx)
├── Plan        → app/(tabs)/savings.tsx
└── Settings    → app/(tabs)/settings.tsx
```

---

## Tab 1 — Home  `app/(tabs)/index.tsx`

| State | Design # | Status | Notes |
|---|---|---|---|
| Full state | Screen 1 | ✅ Done | Hero card, WHERE IT WENT, COMING UP, health band |
| Empty / first-run | Screen 7, 23 | ✅ Done | EmptyState + first-run hints |
| Loading skeleton | Screen 32 | ✅ Done | Skeleton component |
| Error state | Screen 34 | ✅ Done | ErrorState component |
| Money Health sheet | Screen 8 | ✅ Done | `HealthSheet` component (receives pre-computed `HealthResult`) |

**Key data computed here (do NOT re-derive elsewhere without reading this first):**
- `computeHealthScore` result → stored in state, passed to `HealthSheet` and to Plan via shared logic
- This month's `txns`, `prevTxns`, `analyticsAll` — fetched on focus

---

## Tab 2 — Groups  `app/(tabs)/groups.tsx`

| State | Design # | Status | Notes |
|---|---|---|---|
| Groups list | Screen 5 | ✅ Done | MY GROUPS + PEOPLE balance rows |
| Empty state | Screen 43 | ✅ Done | EmptyState with example chips |
| New group sheet | Screen 35 | ✅ Done | Emoji picker, name, type chips, members |

---

## Group Detail  `app/group/[id].tsx`

This is the **single tab screen** for all group content. Sub-tabs are embedded here.

| Tab | Design # | Status | Notes |
|---|---|---|---|
| Expenses tab | Screen 6 | ✅ Done | Transaction list, balance card, month sections |
| Budget tab (summary) | Screen 16 | ✅ Done | Category bars, overall utilisation |
| Members tab | Screen 21 | ✅ Done | Balance per member, settle CTA |
| Insights tab | Screen 22 | ✅ Done | Per-member spend bars, TOP CATEGORIES, trend callout |
| Recurring tab | Screen 40 | ✅ Done | Purple summary card, recurring items list |

### Group Sub-Screens (full management pages, pushed from settings menu)

| Screen | Route | Design # | Status | Notes |
|---|---|---|---|---|
| Edit group | `app/group/[id]/edit.tsx` | Screen 41 | ✅ Done | Emoji, name, split method, members, archive/delete |
| Budget editing | `app/group/[id]/budget.tsx` | Screen 16 | ✅ Done | Full per-category budget management |
| Member management | `app/group/[id]/members.tsx` | Screen 21 | ✅ Done | Add/remove members, invite link |
| Recurring management | `app/group/[id]/recurring.tsx` | Screen 40 | ✅ Done | Pause/resume/end/skip recurring rules |

> ⚠️ **No duplication** — the inline tab is a **read/summary view**; the sub-screen is the **management view**. Both are needed.

---

## Add Flows  `app/add/`

| Screen | Route | Design # | Status | Notes |
|---|---|---|---|---|
| Quick expense | `app/add/quick.tsx` | Screen 2, 14 | ✅ Done | Expense/Income toggle, recurring section |
| Income | `app/add/income.tsx` | Screen 24 | ✅ Done | Source chips, budget impact nudge |
| Itemized split | `app/add/itemized.tsx` | Screen 13 | ✅ Done | Line items, adjustments, per-person breakdown |
| Transfer | `app/add/transfer.tsx` | — | ✅ Done | Settlement transfer |
| **OCR scan** | `app/add/ocr.tsx` | Screen 48 | ❌ Missing | Camera viewfinder, text detection, total extraction |

---

## Tab 3 — Plan  `app/(tabs)/savings.tsx`

This is the **Plan tab** — the hub for savings goals, insights, and optional modules.

| Section | Design # | Status | Notes |
|---|---|---|---|
| Savings pool card | Screen 3 | ✅ Done | Total saved, unallocated, auto-sweep |
| Goals list | Screen 36 | ✅ Done | Active goals with progress bars |
| COMING UP (recurring/subscriptions) | Screen 3 | ✅ Done | Upcoming bills from recurring rules |
| Velocity alert hero | Screen 17 | ✅ Done | Overspend warning card |
| SHIFTS VS LAST MONTH | Screen 17 | ✅ Done | Top-3 category deltas with arrows |
| ACROSS ALL GROUPS | Screen 17 | ✅ Done | Net position across groups |
| Subscription nudge | Screen 17, 31 | ✅ Done | Purple nudge card (Review / Dismiss) |
| Financial Health score link | Screen 39 | ✅ Done | Taps → `app/plan/health.tsx` |
| Afford Check link | Screen 28 | ✅ Done | Taps → `app/afford.tsx` |
| **Reminders section** | Screen 33 | 🔶 Partial | Lib exists (`reminders.ts`), no dedicated screen — upcoming reminders surfaced in COMING UP |

### Plan Sub-Screens

| Screen | Route | Design # | Status | Notes |
|---|---|---|---|---|
| Financial Health full page | `app/plan/health.tsx` | Screen 39 | ✅ Done | Circular ring, breakdown, action card — fetches its own data |
| Savings Goal detail | `app/savings/[id].tsx` | Screen 20 | ✅ Done | Ring progress, contributions, add/withdraw |
| **Reports** | `app/(tabs)/reports.tsx` | Screen 27 | ✅ Done | Donut, bar chart, PDF export (feature-flagged) |

> ⚠️ **Health score duplication note:** `plan/health.tsx` re-fetches data independently from `index.tsx`. Acceptable — it's a detail page with its own lifecycle. Do NOT add a third `computeHealthScore` call anywhere.

---

## Transaction & Category Detail

| Screen | Route | Design # | Status | Notes |
|---|---|---|---|---|
| Transaction detail | `app/txn/[id].tsx` | Screen 11 | ✅ Done | Amount hero, paid by, split, metadata, edit/delete |
| Category detail | `app/category/[name].tsx` | Screen 10 | ✅ Done | Budget utilisation, period tabs, transaction list |

---

## Settle  `app/settle.tsx`

| State | Design # | Status | Notes |
|---|---|---|---|
| Active balances | Screen 4, 19 | ✅ Done | YOU OWE / OWED TO YOU, UPI/Cash/Bank |
| All settled | Screen 15 | ✅ Done | Success ring + "All squared" state |

---

## Search  `app/search.tsx`

| Feature | Design # | Status | Notes |
|---|---|---|---|
| Search input + kind filter chips | Screen 25 | ✅ Done | All/Expenses/Income/Settlements |
| **Result count** | Screen 25 | 🔶 Partial | Count shown in EmptyState but not as sticky header |
| **Group-source filter chips** | Screen 25 | ❌ Missing | Design shows Personal / Groups filter |
| **Grouped by month** | Screen 25 | ❌ Missing | Currently flat FlatList — design shows month section headers |

---

## Tab 5 — Settings  `app/(tabs)/settings.tsx`

| Section | Design # | Status | Notes |
|---|---|---|---|
| Profile (name, avatar) | Screen 12 | ✅ Done | Avatar picker, name edit |
| MANAGE: People | Screen 26 | ✅ Done | → `app/friends.tsx` |
| MANAGE: Categories | Screen 29 | ✅ Done | → `app/categories.tsx` |
| MANAGE: Budgets & Goals | Screen 30 | ✅ Done | → group budget pages |
| PREFERENCES: Toggles | Screen 12, 18 | ✅ Done | Feature flags via `FeatureFlagsProvider` |
| Biometric lock toggle | Screen 46 | ✅ Done | Face ID / Touch ID |
| Privacy screen toggle | Screen 46 | ✅ Done | App switcher blur |
| Reminders config | — | ✅ Done | Lead days, time picker |
| History / Audit Log | Screen 37 | ✅ Done | → `app/history.tsx` |
| **Hide amounts on home** | Screen 46 | ❌ Missing | Toggle to show ₹••• until tapped |
| **Location tagging toggle** | Screen 46 | ❌ Missing | Tag transactions with place name |

### Settings Sub-Screens

| Screen | Route | Design # | Status | Notes |
|---|---|---|---|---|
| People management | `app/friends.tsx` | Screen 26 | ✅ Done | Balance tags, add/rename person |
| Categories | `app/categories.tsx` | Screen 29 | ✅ Done | Core + custom, drag-reorder hint |
| Feature sections | `app/features.tsx` | Screen 18 | ✅ Done | Module toggles (all optional features) |
| Help & Guide | `app/help.tsx` | Screen 42 | ✅ Done | Accordion sections, all topics |
| Audit Log | `app/history.tsx` | Screen 37 | ✅ Done | Colored dots, TODAY/YESTERDAY, EDIT/DEL badges |
| Storage | `app/storage.tsx` | — | ✅ Done | Export/delete data |

---

## System Components

| Component | Path | Design # | Status |
|---|---|---|---|
| Onboarding carousel | `src/components/system/Onboarding.tsx` | Screen 9, 38 | ✅ Done — hero, 4 feature slides, name stage, budget stage |
| Lock Gate | `src/components/system/LockGate.tsx` | Screen 45 | ✅ Done |
| Privacy Screen | `src/components/system/PrivacyScreen.tsx` | Screen 46 | ✅ Done |
| Undo Toast | `src/components/system/UndoToast.tsx` | Screen 47 | ✅ Done |
| Goal Celebration | `src/components/finance/GoalCelebration.tsx` | Screen 44 | ✅ Done |
| Health Sheet | `src/components/finance/HealthSheet.tsx` | Screen 8 | ✅ Done — bottom sheet (receives pre-computed result) |

---

## Optional Modules (Feature-Flagged)

| Module | Flag Key | Where surfaced | Status |
|---|---|---|---|
| Savings Goals | `savingsGoals` | Plan tab, `savings/[id].tsx` | ✅ Done |
| Spending Forecast | `forecast` | Reports tab | ✅ Done |
| Financial Health | `healthScore` | Home (band), Plan link, `plan/health.tsx` | ✅ Done |
| Afford Check | `affordCheck` | Plan tab link, `afford.tsx` | ✅ Done |
| Subscription Tracker | `subscriptions` | Plan tab nudge card | ✅ Done (nudge only — no dedicated list page) |
| Reminders | `reminders` | Settings config, COMING UP in Plan | ✅ Done |
| Reports & Charts | `reportsDonut`, `reportsTrend` | `reports.tsx` | ✅ Done |
| Location Tagging | — | — | ❌ Missing |
| **OCR Receipt Scan** | — | `app/add/ocr.tsx` | ❌ Missing |

---

## Summary — What Still Needs Work

### Missing (not implemented at all)
| # | Feature | Where | Effort |
|---|---|---|---|
| 1 | **OCR receipt scan** | `app/add/ocr.tsx` | High — needs camera + ML |
| 2 | **Search: group-source filter + month grouping** | `app/search.tsx` | Low |
| 3 | **Hide amounts on home toggle** | `settings.tsx` + `index.tsx` | Low |
| 4 | **Location tagging** | Settings toggle + add flow | Medium |

### Partial (design gap vs current implementation)
| # | Feature | Gap | Effort |
|---|---|---|---|
| 1 | **Search result count** | Show "N transactions · ₹X total" sticky header when results exist | Low |
| 2 | **Subscription Tracker dedicated list** | Design shows `/plan/subscriptions` full page; only nudge card exists | Medium |

### Intentional Deviations (design has it, we skipped for good reason)
- Onboarding "what brings you here?" radio choice (Screen 9) — all features always available, the `features.tsx` toggle screen replaces this
- Separate `/settings/privacy` page — privacy settings are inline in Settings tab (one fewer navigation level)

---

## Single-Source Rules (DO NOT DUPLICATE)

| Computation | Where it lives | Used by |
|---|---|---|
| `computeHealthScore` | `src/lib/financialHealth.ts` | `index.tsx` (dashboard band), `plan/health.tsx` (detail) |
| `getBudgetAnalytics` | `src/lib/analytics.ts` | `index.tsx`, `savings.tsx`, `plan/health.tsx`, group budget pages |
| `detectSubscriptions` | `src/lib/subscriptions.ts` | `savings.tsx` only |
| `getGroupNet` | `src/db/queries/balances.ts` | `savings.tsx`, `plan/health.tsx`, `settle.tsx` |
| Category spending totals | computed inline per-screen from `getTransactionsInRange` | Do NOT add a 4th location |
| `formatRupees` / `formatCompact` | `src/lib/money.ts` | Everywhere — import from one place |
