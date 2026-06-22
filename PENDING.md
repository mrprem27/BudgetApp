# BudgetSplit — Pending Work Tracker

**Last Updated:** June 22, 2026  
**App Version:** v1.0 (Local Solo Build)  
**Target Platform:** iOS (React Native / Expo)

---

## Overview

This document tracks pending implementation tasks, bugs, and improvements for BudgetSplit. Work is organized by milestone and priority.

---

## Milestone Status

| Milestone | Title | Status | Priority | Target Date |
|-----------|-------|--------|----------|-------------|
| **M1** | DB Schema + Seed + Navigation | 🔵 Not Started | 🔴 Critical | — |
| **M2** | Quick Expense Entry | 🔵 Not Started | 🔴 Critical | — |
| **M3** | Split Engine + Invariant Enforcement | 🔵 Not Started | 🔴 Critical | — |
| **M4** | Balance Computation + Settle Up | 🔵 Not Started | 🔴 Critical | — |
| **M5** | Itemized Bill Entry | 🔵 Not Started | 🟡 High | — |
| **M6** | Global Dashboard + Charts | 🔵 Not Started | 🟡 High | — |
| **M7** | Budget Limits + Notifications | 🔵 Not Started | 🟡 High | — |
| **M8** | Recurring Transactions | 🔵 Not Started | 🟡 Medium | — |
| **M9** | Reports + CSV/PDF Export | 🔵 Not Started | 🟡 Medium | — |
| **M10** | Polish + Dark Mode + Face ID | 🔵 Not Started | 🟡 Medium | — |

**Legend:** 🔵 Not Started | 🟢 In Progress | 🟠 Blocked | 🔴 Done

---

## M1: Database + Navigation Foundation

**Objective:** Establish data layer, seed initial data, build navigation shell.

### Tasks

- [ ] **DB Schema Implementation**
  - Create SQLite tables per Spec §3 (person, budget_group, group_member, txn, etc.)
  - Add migration/versioning system for future schema changes
  - Implement database initialization on first launch
  - Add `schema.ts` in `src/db/`
  
- [ ] **Seed Data**
  - Create default "Personal" budget group with color and icon
  - Seed default categories: Food, Groceries, Rent, Utilities, Travel, Fuel, Medical, Shopping, Subscriptions, Other
  - Create initial user ("Me") with is_me = 1
  - Implement in `src/db/seed.ts`

- [ ] **Navigation Shell**
  - Set up expo-router file structure (Spec §5)
  - Create tab bar with 4 tabs: Dashboard, Groups, Reports, Settings
  - Stub out all screens (empty components)
  - Add header styling and navigation state

- [ ] **Zustand Store Setup**
  - Create global state store in `src/store/index.ts`
  - Define store shape for groups, transactions, people, ui state
  - Wire up DB queries to store

- [ ] **Person/Group CRUD**
  - Create person: name, color (avatar)
  - Create group: name, icon, color, members
  - Add member to group
  - Update group details
  - Implement edit and delete flows (soft delete)

- [ ] **Testing**
  - Verify app launches and shows empty dashboard
  - Test create group → add member flow
  - Confirm data persists after app restart

**Acceptance Criteria:** Can create a group, add 2+ members, see empty transaction lists. No crashes.

---

## M2: Quick Expense Entry

**Objective:** Enable basic income/expense logging with no split.

### Tasks

- [ ] **Quick Expense Screen**
  - Amount input (rupee formatter: "₹1,500.50")
  - Date picker (default: today)
  - Category picker (per-group custom categories + defaults)
  - Optional: note field, photo attachment, tags
  - Payer selector (default: "me", allow multiple)

- [ ] **Income Entry**
  - Same as expense but marked as kind="income"
  - No shares applied (income is not split)

- [ ] **Transaction List**
  - Show all txns in a group, sorted by date (newest first)
  - Format: category icon + name + optional note + amount (SpaceMono)
  - Soft-delete via swipe-left (hide from list, set is_deleted=1)

- [ ] **Paise Math**
  - Implement `src/lib/money.ts` helpers (§9)
  - formatRupees(), parseToPaise(), splitEqual(), splitByPercent()
  - Test paise rounding on all splits

- [ ] **Save & Validation**
  - Ensure amount > 0 before save
  - Check all required fields before enabling save button
  - Toast feedback on success
  - Handle DB errors gracefully

- [ ] **Testing**
  - Log a ₹500 expense, verify in list
  - Log ₹1,000 income, verify separate kind
  - Soft-delete and verify hidden
  - App restart: confirm data persists

**Acceptance Criteria:** Can log a solo expense and see it in the transaction list. Amount formatting works. Save button only active when valid.

---

## M3: Split Engine + Invariant Enforcement

**Objective:** Build the core split logic with paise math and invariant checking.

### Tasks

- [ ] **Split Type UI Components**
  - Equal split screen
  - Exact amount (paise per person)
  - Percentage split (must sum to 100%)
  - Shares/ratio (e.g. 2:1:1, auto-compute amounts)

- [ ] **Split Logic Implementation**
  - Implement split functions in `src/lib/money.ts`
  - Test paise rounding: remainder goes to earliest-listed members
  - Ensure Σ amounts = total exactly

- [ ] **Multi-Payer Support**
  - Allow 2+ people in txn_payment
  - Distribute payer amounts (same split options as share side)
  - Invariant: Σ txn_payment == Σ txn_share

- [ ] **Invariant Enforcement**
  - Compute signed remainder live as user adjusts split
  - Show "₹50 unassigned" or "₹50 over-assigned" in red
  - Disable save button until remainder = ₹0
  - Highlight unbalanced side (payment or share)

- [ ] **Quick Assign UX (Preview)**
  - Tap a split type → member selection UI
  - Member avatars with checkboxes
  - Per-person running total updates live

- [ ] **Testing**
  - Split ₹1000 equally among 3 people → ₹334, ₹333, ₹333
  - Verify save is blocked if unbalanced
  - Test exact split: assign custom amounts
  - Percentage split: error if not 100%

**Acceptance Criteria:** Can split a ₹1000 bill 50/50, save is blocked if unbalanced, numbers are exact (no floating point).

---

## M4: Balance Computation + Settle Up

**Objective:** Compute who owes whom and simplify payments.

### Tasks

- [ ] **Balance Computation**
  - Implement `computeNet()` in `src/lib/balance.ts`
  - Per-person: net = Σ paid − Σ share
  - Per-group and global scopes

- [ ] **Debt Simplification Algorithm**
  - Implement greedy algorithm in `src/lib/settle.ts` (Spec §8)
  - Input: net balances per person
  - Output: minimal list of settlements
  - Test with 3, 5, 10+ people

- [ ] **Settle-Up Screen**
  - Show simplified payments: "Rahul pays you ₹450"
  - BalanceRow component: avatar + name + amount + "Mark as Paid" button
  - Support both per-group and global settle-up

- [ ] **Settlement Transaction**
  - "Mark as Paid" → creates kind="settlement" txn
  - Records from_person, to_person, amount
  - Balance updates to 0 immediately
  - Can be undone (soft-delete the settlement)

- [ ] **Balances Tab in Group Detail**
  - Show per-person net balance: "You owe X" or "X owes you"
  - "Settle Up" button → Settle-Up screen

- [ ] **Testing**
  - Group with 2 people: one pays ₹1000, split 50/50 → net is ₹±500
  - Mark as settled → txn created, balance = 0
  - Global settle-up across 2 groups

**Acceptance Criteria:** Can see who owes whom, mark as paid, balance resets to 0.

---

## M5: Itemized Bill Entry

**Objective:** Build line-item bill entry with per-item assignment.

### Tasks

- [ ] **Line Item Input**
  - Add item row: name + qty + unit price
  - Running subtotal (SpaceMono, accent color)
  - Delete item button (swipe or X)

- [ ] **Tax/Tip/Discount**
  - Radio/picker: flat amount or percentage
  - Applied proportionally across items (affects per-item price for math)
  - Update subtotal live

- [ ] **Quick-Assign UX**
  - Tap item row → member avatar row appears below
  - Horizontally scrolling avatars (virtualized if 10+ members)
  - Most-recently-used float to left
  - Tap avatar to assign/unassign
  - Per-person running total updates live

- [ ] **Unassigned Indicator**
  - Red tint on unassigned items
  - Badge: "₹XXX unassigned"
  - "Split the rest equally" button

- [ ] **Assignment Collapse**
  - Convert line item assignments → per-person txn_share amounts
  - Apply paise rounding per FR-3.6
  - Move to payer selection screen

- [ ] **Payer Selection**
  - Same as quick split (§M3)
  - Ensure Σ paid == Σ share before save

- [ ] **Review Screen**
  - Per-person totals summary
  - Payer amounts
  - Invariant status (red if unbalanced)

- [ ] **Receipt Photo**
  - Camera button → capture or photo library
  - Attach to txn (store as local uri)
  - Display thumbnail in txn row

- [ ] **Testing**
  - 4 people, restaurant bill: items, tax, tip, assign, save
  - Verify paise math is exact (no floating point leaks)
  - Swipe to delete item

**Acceptance Criteria:** Can enter a restaurant bill with 5+ items, assign per-person, and save with exact paise amounts.

---

## M6: Global Dashboard + Charts

**Objective:** Build overview dashboard with spending insights.

### Tasks

- [ ] **Dashboard Structure**
  - Three tabs: Today / This Month / This Year
  - Header with user avatar

- [ ] **Spending Metrics**
  - "My Spending" = Σ my txn_share in period (not paid)
  - Income = Σ my txn_payment where kind="income"
  - Net = income − spending
  - Savings rate % = (net / income) × 100

- [ ] **Budget Health**
  - Per-group progress bars (green <80%, amber 80-100%, red >100%)
  - Horizontal scroll of group chips
  - Tap chip → navigate to group

- [ ] **Category Donut Chart**
  - My spending breakdown by category
  - Use `react-native-gifted-charts`
  - 3-5 top categories, rest grouped as "Other"

- [ ] **Spending Over Time**
  - Bar chart: daily / weekly / monthly based on tab
  - Y-axis: paise amount
  - X-axis: dates
  - Interactive (tap bar → filter txns)

- [ ] **Owe/Owed Summary**
  - "You owe ₹450 · Owed ₹1,200" across all groups
  - Tap → global settle-up screen

- [ ] **Empty State**
  - If no txns: "No transactions yet" + "Add expense" button

- [ ] **Testing**
  - Log 5 expenses in 2 groups, verify dashboard totals
  - Switch tabs (Today/Month/Year), verify sums
  - Budget health bar shows correct colors

**Acceptance Criteria:** Dashboard shows correct spending totals across all groups, charts render without jank.

---

## M7: Budget Limits + Notifications

**Objective:** Set spending limits and alert user at thresholds.

### Tasks

- [ ] **Budget Limits UI**
  - Per-group: daily, monthly, yearly limits (independent)
  - Global personal limit (tracked separately in settings)
  - Input validation (paise only)
  - Carry-over toggle (per group)

- [ ] **Carry-Over Logic**
  - If enabled: `remaining = limit + unused_prior_period`
  - Only look back one period (no indefinite accumulation)
  - Update limit calculation in balance queries

- [ ] **Notification System**
  - Trigger at 80% and 100% of period limit
  - Use `expo-notifications` (local only, no server)
  - Schedule notifications at period start/middle
  - Show group name + amount + limit in notification

- [ ] **Budget Tab in Group Detail**
  - Show current usage vs. limit
  - BudgetBar progress indicator
  - Edit limit and carry-over toggles
  - Visual breakdown by date (daily/weekly/monthly)

- [ ] **Budget Status in Dashboard**
  - Group health chips update color based on limit status
  - Red if >100%

- [ ] **Testing**
  - Set monthly limit ₹10,000 for Personal group
  - Log expenses up to 80% → verify notification fires
  - Log more to 100% → second notification
  - Enable carry-over, verify unused amount rolls to next period

**Acceptance Criteria:** Can set a budget limit and receive notifications at 80% and 100%.

---

## M8: Recurring Transactions

**Objective:** Enable recurring expenses (rent, salary, subscriptions) with lazy materialization.

### Tasks

- [ ] **Recurrence UI**
  - Frequency picker: daily, weekly, monthly, custom interval
  - Optional end date picker (NULL = forever)
  - Store in txn: recur_freq, recur_interval, recur_end

- [ ] **Lazy Materialization**
  - Do NOT generate instances upfront
  - When querying a date range: compute all dates between range start/end
  - Apply recurrence math: start + (interval × count)
  - Yield virtual txn rows (not persisted)

- [ ] **Edit Instance vs. All Future**
  - User taps recurring txn → prompt: "This instance only" or "This and all future"
  - "This instance": create a one-off txn for that date with override values; recurrence continues
  - "All future": update recur_freq/recur_interval/recur_end on original; past instances unchanged

- [ ] **Delete Recurring**
  - Soft delete original (is_deleted=1)
  - All future instances disappear
  - Materialized past instances remain in history

- [ ] **Testing**
  - Create monthly rent ₹15,000 starting Jan 1
  - View Feb 1 → verify rent appears
  - Edit Mar 1 instance → adjust amount to ₹16,000 only for that month
  - Verify Apr 1 still shows ₹15,000
  - Delete future instances starting Jul 1
  - Verify Jun 1 still appears, Jul onwards hidden

**Acceptance Criteria:** Can create a monthly expense that auto-appears, edit one instance, delete future instances.

---

## M9: Reports + CSV/PDF Export

**Objective:** Generate insights and exportable summaries.

### Tasks

- [ ] **Reports Screen**
  - Date range filter (custom from/to)
  - Per-group monthly summary card: income, expense, net savings, top 3 categories
  - Year-in-review: total saved this year, biggest spending month, most-used category, biggest single txn

- [ ] **CSV Export**
  - All txn fields: date, category, description, amount, payer(s), share(s), group
  - Scoped to current date filter
  - Use `expo-file-system` to write file
  - Open share sheet (`expo-sharing`) for export

- [ ] **PDF Export**
  - Formatted summary page (not raw CSV)
  - Header: date range, group name
  - Summary: income, expense, net
  - Table: date | category | amount
  - Use a lightweight PDF library (e.g. `pdfkit` or similar for RN)

- [ ] **Sharing**
  - Native share sheet: email, AirDrop, print, more
  - File is temporary (auto-deleted after share)

- [ ] **Testing**
  - Export Jan 2026 transactions from Personal group
  - Verify CSV opens in Excel
  - Verify PDF is readable
  - Test with large export (100+ txns)

**Acceptance Criteria:** Can export a month of transactions as CSV and PDF.

---

## M10: Polish + Dark Mode + Face ID + Accessibility

**Objective:** Final touches, security, and accessibility compliance.

### Tasks

- [ ] **Dark Mode**
  - Implement using React Native's appearance API
  - All colors follow Spec §16.2 (near-black bg, warm white text)
  - Icons and charts adapt
  - Test on light and dark modes

- [ ] **Face ID / Touch ID Lock**
  - Optional biometric lock on app open
  - Use `expo-local-authentication`
  - Toggle in Settings
  - Fallback to PIN if biometric fails
  - Test on device with and without biometric

- [ ] **Accessibility Pass**
  - All interactive elements: min 44pt tap target
  - Accessible labels on all buttons/icons
  - Color contrast: WCAG AA (text on bg)
  - Font scaling: respect system dynamic type
  - Screen reader labels on charts, avatars, amounts

- [ ] **Polish**
  - Remove all placeholder text
  - Verify all animations are smooth (no jank)
  - Test on iPhone 12, 14, 15 (various screen sizes)
  - Confirm fonts load correctly (@expo-google-fonts)
  - Swipe animations on txn delete are fluid

- [ ] **Error Handling**
  - DB connection errors → retry with exponential backoff
  - Parse errors on corrupt data → graceful fallback
  - Network errors (v2 prep) → clear messaging

- [ ] **Performance**
  - App launch → dashboard visible in <1s
  - Save txn → complete in <200ms
  - Settle-up compute for 50 people → <100ms

- [ ] **Testing**
  - Full functional test: create group, add txn, split, settle
  - Test on device (not just simulator)
  - Verify Face ID lock works
  - Confirm dark mode colors look good

**Acceptance Criteria:** App is polished, dark mode works, Face ID lock enabled, all tap targets are large enough, no WCAG AA contrast violations.

---

## Known Issues

| Issue | Severity | Notes |
|-------|----------|-------|
| None yet | — | Will be updated during development |

---

## Future Enhancements (v2+)

- [ ] Multi-user sync via Supabase (v2)
- [ ] OCR receipt scanning (v3)
- [ ] Multi-currency support (v3)
- [ ] App widget (v3)
- [ ] AI-powered categorization (post-v1)
- [ ] Group chat / comments (out of scope)
- [ ] Export to spreadsheet with charts (post-v1)

---

## Legend

- 🔴 **Critical** — blocks release
- 🟡 **High** — important for v1, but some flexibility
- 🟢 **Medium** — nice-to-have, can defer to v1.1+
- 🔵 **Low** — future versions

---

## Contact

**Developer:** Prem  
**App:** BudgetSplit  
**Version:** v1.0  
**Last Updated:** 2026-06-22
