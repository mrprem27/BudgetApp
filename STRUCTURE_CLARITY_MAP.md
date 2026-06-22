# BudgetApp — Structure Clarity Map

**Problem You're Feeling:** "I don't even know where is what. There's no proper line and everything feels random."

**Root Cause:** The specification is comprehensive but scattered. Features, screens, concepts, flows, and business logic are distributed across multiple documents without a clear hierarchy. You need ONE place that maps **what is where and why**.

---

## The Chaos (Current State)

### What Exists Now

| File | Size | Contains | Problem |
|------|------|----------|---------|
| **Spec** | 940 lines | Technical spec (all requirements) | Everything is flattened; no hierarchy |
| **PENDING.md** | 2KB | Task tracking (10 milestones) | Tasks listed but not connected to features |
| **ROADMAP.md** | 8KB | v1/v2/v3 vision | Strategic but not tactical |
| **FEATURE_NOTEBOOK.md** | 18KB | 19 features explained | Features described but not organized |
| **USER_MANUAL.md** | 15KB | How to use the app | User perspective only; misses structure |

### Why It Feels Random

1. **No feature taxonomy** — 19 features are listed but not grouped by type
2. **No screen map** — 10+ screens mentioned but not organized by flow
3. **No priority matrix** — v1 core vs. v2 vs. nice-to-have unclear
4. **No component hierarchy** — 10+ components mentioned but not connected to screens
5. **No data model visualization** — 7 database tables mentioned but relationships unclear
6. **No user journey map** — Flows exist but not connected to features/screens
7. **No business logic map** — Core algorithms (settle, split, round) scattered
8. **No navigation blueprint** — Tab structure and screen transitions unclear

**Result:** You can't answer simple questions like:
- "Where do I add this feature in the app?"
- "Which screen handles multi-payer expenses?"
- "What's the relationship between split types and itemized bills?"
- "Which features can I defer to v2?"

---

## The Solution (What This Document Provides)

This document maps:
1. **Feature taxonomy** — Grouped by type, not by implementation
2. **Screen inventory** — All screens mapped with connections
3. **Feature-to-screen mapping** — Which features live on which screens
4. **Data model diagram** — How tables relate
5. **Core flows** — User journeys from start to finish
6. **Component tree** — Screens → components → props
7. **Business logic map** — Algorithms and invariants
8. **Priority matrix** — v1 core, v1 nice, v2+
9. **Navigation blueprint** — Tab structure and transitions
10. **Terminology glossary** — Approved terms for code/UI/docs

---

## 1. Feature Taxonomy (Grouped by Type)

### Core Features (Must Have for v1)
```
Income & Expense Tracking
├─ Log Income
├─ Log Expense
├─ Edit Transaction
└─ Delete Transaction (Soft)

Budget Groups
├─ Create Group
├─ Add Members
├─ Manage Group Settings
└─ Archive Group

Splitting (Core Logic)
├─ Equal Split
├─ Exact Amount Split
├─ Percentage Split
├─ Ratio Split
└─ Invariant Enforcement (Σ paid == Σ share)

Itemized Bills (Advanced Tracking)
├─ Add Line Items
├─ Tax/Tip/Discount
├─ Quick-Assign Items to Members
├─ Per-Person Totals (Live)
└─ Receipt Photo

Balance & Settlement
├─ Compute Per-Person Balance
├─ Debt Simplification Algorithm
├─ Settle-Up Screen
└─ Mark as Paid

Global Dashboard (Insights)
├─ Today/Month/Year Tabs
├─ Spending Metrics
├─ Category Breakdown (Donut Chart)
├─ Budget Health Indicators
└─ Owe/Owed Summary
```

### Advanced Features (Nice-to-Have for v1 / Defer to v1.1)
```
Budget Management
├─ Set Budget Limits (Daily/Monthly/Yearly)
├─ Carry-Over Logic
├─ Progress Bar & Visualization
└─ Local Notifications (80%, 100%)

Recurring Transactions
├─ Set Frequency (Daily/Weekly/Monthly)
├─ Lazy Materialization
├─ Edit This Instance vs. All Future
└─ Delete Future Instances

Reporting & Export
├─ Monthly Summary
├─ Year-in-Review
├─ CSV Export
├─ PDF Export
└─ Share Sheet

Categories
├─ Custom Categories Per Group
├─ Default Categories (Seeded)
├─ Category Management (Add/Edit/Delete)
└─ Category Icons & Colors

Search & Filter
├─ Txn Search (by name, note)
├─ Date Range Filter
├─ Tag Filtering (#food, #trip)
└─ Category Filter

Personalization
├─ Dark Mode
├─ Custom Icons for Groups
├─ Custom Colors for Groups
├─ Avatar Colors for People

Security
├─ Face ID / Touch ID Lock
└─ PIN Fallback
```

### v2+ Features (Definitely Defer)
```
Multi-User Sync
├─ Supabase Authentication
├─ Real-Time Sync
├─ Join Codes
├─ Shared Groups (is_shared=1)
├─ End-to-End Encryption
└─ Conflict Resolution

Advanced Analytics (v3)
├─ Spend Patterns
├─ Predictions
├─ Smart Categories
└─ Group Insights
```

---

## 2. Screen Inventory (All Screens Mapped)

### Tab 1: Dashboard (Global Overview)
```
(tabs)/index — Dashboard
├─ Header: BudgetSplit + Avatar
├─ Sub-Tabs: Today | Month | Year
├─ My Spending Section
│  ├─ Amount (SpaceMono)
│  ├─ Budget Progress Bar
│  ├─ Income, Net, Savings Rate
├─ Spending by Category (Donut Chart)
├─ Spending Over Time (Bar Chart)
├─ You Owe / Owed Summary
│  └─ Tap → Global Settle-Up
└─ Group Health Chips (Horizontal Scroll)
   └─ Tap → Navigate to Group

Related Features:
  - Dashboard metrics (Share-based accounting)
  - Budget health (Carry-over logic)
  - Category breakdown (Category management)
```

### Tab 2: Groups (Budget Group Management)
```
(tabs)/groups — Groups List
├─ Group Cards (Horizontal Scroll or List)
│  ├─ Icon + Name
│  ├─ Progress Bar (Budget Health)
│  ├─ Spent / Limit
│  └─ Tap → Group Detail
└─ FAB → New Group

(tabs)/groups/new — Create Group
├─ Group Name Input
├─ Icon Picker
├─ Color Picker
└─ Create Button

Group Detail (Dynamic Route)
group/[id] — Group Detail (Tabs)
├─ Header: Back + Group Name + Menu (•••)
├─ Sub-Tabs: Txns | Balances | Budget | Members
│
├─ Txns Tab:
│  ├─ Transaction List (Grouped by Date)
│  ├─ Swipe-to-Delete
│  └─ Tap → Transaction Detail
│
├─ Balances Tab:
│  ├─ Per-Person Balance List
│  ├─ Settle-Up Button
│  └─ Tap Person → (Future: Direct settle with that person)
│
├─ Budget Tab:
│  ├─ Budget Progress Bar
│  ├─ Limit Settings (Daily/Monthly/Yearly)
│  ├─ Carry-Over Toggle
│  └─ Notification Settings
│
└─ Members Tab:
   ├─ Member List (Avatars + Names)
   ├─ Tap Member → (Future: Member detail)
   └─ + Add Member Button

group/[id]/settle — Settle-Up Screen
├─ "X payments needed" (Header)
├─ Simplified Payment List
│  ├─ [Avatar] Person A → [Avatar] Person B
│  ├─ Amount (SpaceMono, Accent Color)
│  └─ [Paid] Button
└─ Mark as Paid → Settlement Txn Created

Related Features:
  - Groups, members, transactions
  - Balances, settlement
  - Budget limits, carry-over
  - Category management (per-group)
```

### Tab 3: Add Transactions (FAB Entry Points)
```
FAB Menu (Orange Circle, Lower Right)
├─ Option 1: Expense
├─ Option 2: Income
└─ Option 3: Itemized Bill

add/quick — Quick Expense/Income
├─ Amount Input (Rupee Format)
├─ Group Picker
├─ Category Picker
├─ Date Picker
├─ Note Input (Optional)
├─ Photo Button (Optional)
├─ Tags Input (Optional)
├─ Payer(s) Selection
├─ Share(s) Selection
│  └─ Split Type Picker: Equal | Exact | % | Ratio
├─ Invariant Status (Live)
│  └─ Red warning if unbalanced
└─ Save Button (Disabled if unbalanced)

add/itemized — Itemized Bill
├─ Item List (Add/Edit/Delete)
│  ├─ Item Name + Qty + Unit Price
│  └─ Running Subtotal (Live)
├─ Adjustments (Tax/Tip/Discount)
│  ├─ Flat or % Option
│  └─ Running Total (Live)
├─ Quick-Assign Section
│  ├─ Item List with Avatar Row Below
│  ├─ Tap Item → Avatars Appear
│  ├─ Tap Avatar to Assign/Unassign
│  └─ Per-Person Total (Live)
├─ "Split the Rest Equally" Button
├─ Payer(s) Selection
├─ Review Section
│  ├─ Per-Person Totals
│  ├─ Payer Amounts
│  └─ Invariant Status
└─ Save Button

Related Features:
  - Income vs. Expense
  - Split types (Equal, Exact, %, Ratio)
  - Itemized bills (Line items, quick-assign)
  - Invariant enforcement
  - Paise rounding
  - Multi-payer support
```

### Tab 4: Reports (Analytics & Export)
```
(tabs)/reports — Reports
├─ Date Range Filter
│  └─ From / To Pickers
├─ Per-Group Monthly Summary Cards
│  ├─ Group Name
│  ├─ Income, Expense, Net, Savings Rate
│  └─ Top 3 Categories
├─ Year-in-Review Card
│  ├─ Total Saved This Year
│  ├─ Biggest Spending Month
│  ├─ Most-Used Category
│  └─ Biggest Single Expense
└─ Export Section
   ├─ [CSV] Button → Share Sheet
   └─ [PDF] Button → Share Sheet

Related Features:
  - Reporting (summaries)
  - CSV export
  - PDF export
  - Date filtering
  - Tag filtering (future enhancement)
```

### Tab 5: Settings
```
(tabs)/settings — Settings
├─ Profile Section
│  ├─ Name
│  └─ Avatar Color
├─ Categories Section
│  ├─ [Select Group] → Category List
│  ├─ Add Category
│  ├─ Edit Category
│  └─ Delete Category
├─ Budget Section (Global)
│  ├─ Global Personal Limit (Daily/Monthly/Yearly)
│  └─ Carry-Over Toggle
├─ Security Section
│  ├─ Face ID / Touch ID Toggle
│  └─ PIN Setting
├─ Notifications Section
│  ├─ Budget Alerts Toggle
│  └─ Other Alerts Toggle
├─ Dark Mode (System)
│  └─ (Follows iOS system setting)
└─ Data & Privacy
   ├─ Export All Txns (CSV)
   ├─ Export All Txns (PDF)
   └─ Delete All Data (Danger Zone)

Related Features:
  - Categories
  - Budget management
  - Biometric lock
  - Notifications
  - Dark mode
  - Export/import
```

### Transaction Detail (Modal or Screen)
```
txn/[id] — Transaction Detail
├─ Back Button
├─ Date, Category, Amount (Read-Only until Edit)
├─ Note
├─ Photo (if attached)
├─ Tags
├─ Payers (Expandable List)
├─ Shares (Expandable List)
├─ Edit Button → Re-open Add Flow
└─ Delete Button → Soft Delete

Related Features:
  - Transaction view/edit/delete
  - Soft-delete
  - Split visualization
```

---

## 3. Feature-to-Screen Mapping

| Feature | Primary Screen | Related Screens | Tab |
|---------|---|---|---|
| **Log Income** | add/quick | Group detail | FAB |
| **Log Expense** | add/quick | Group detail | FAB |
| **Edit Txn** | add/quick (re-opened) | txn/[id] | — |
| **Delete Txn** | Group detail (swipe) | txn/[id] | Groups |
| **Create Group** | groups/new | groups list | Groups |
| **Add Members** | group/[id]/members | — | Groups |
| **Equal Split** | add/quick | add/itemized | FAB |
| **Exact Split** | add/quick | — | FAB |
| **% Split** | add/quick | — | FAB |
| **Ratio Split** | add/quick | — | FAB |
| **Itemized Bill** | add/itemized | add/quick (for payers) | FAB |
| **View Balance** | group/[id]/balances | — | Groups |
| **Settle Up** | group/[id]/settle | group/[id]/balances | Groups |
| **Mark as Paid** | group/[id]/settle | group/[id]/balances | Groups |
| **Dashboard** | (tabs)/index | groups list | Dashboard |
| **Category Chart** | (tabs)/index | reports | Dashboard |
| **Budget Health** | (tabs)/index | group/[id]/budget | Dashboard |
| **Set Limits** | group/[id]/budget | settings | Groups |
| **Carry-Over** | group/[id]/budget | settings | Groups |
| **Recurring Txn** | add/quick (future field) | group/[id] (lazy materialize) | FAB |
| **Reports** | (tabs)/reports | — | Reports |
| **CSV Export** | (tabs)/reports | Share sheet | Reports |
| **PDF Export** | (tabs)/reports | Share sheet | Reports |
| **Categories** | settings | group/[id] | Settings |
| **Face ID** | settings | app-level lock | Settings |
| **Dark Mode** | (Follows system) | settings (info only) | Settings |

---

## 4. Data Model Diagram (Simplified)

```
person
├─ id (PK)
├─ name
├─ avatar_color
├─ is_me (0 or 1)
└─ remote_uid (v2)

budget_group
├─ id (PK)
├─ name
├─ icon, color
├─ limit_daily, limit_monthly, limit_yearly
├─ carry_over (0/1)
├─ is_shared (v2)
├─ is_archived (0/1)
└─ created_at

group_member (junction table)
├─ group_id (FK)
└─ person_id (FK)

txn (transaction)
├─ id (PK)
├─ group_id (FK)
├─ kind (income, expense, settlement)
├─ entry_mode (quick, itemized)
├─ date, category, note
├─ attachment_uri (photo)
├─ tags (JSON array)
├─ recur_freq, recur_interval, recur_end
├─ is_deleted (0/1)
└─ created_at, updated_at

txn_payment (who paid)
├─ txn_id (FK)
├─ person_id (FK)
└─ amount (paise)

txn_share (who owes / consumed)
├─ txn_id (FK)
├─ person_id (FK)
└─ amount (paise)

line_item (for itemized bills)
├─ id (PK)
├─ txn_id (FK)
├─ name, qty, unit_price
└─ assigned_to (JSON array of person ids)

category (custom per group)
├─ id (PK)
├─ group_id (FK)
├─ name, icon, color
```

**Key Insight:**
- Balances are **computed live** (never stored) from txn_payment and txn_share
- Recurring txns are **materialized lazily** (not pre-generated)
- All deletes are **soft-deletes** (is_deleted=1, not removed)

---

## 5. Core Flows (User Journeys)

### Flow 1: Quick Expense (Solo Trip, Day 1)

```
User: "I paid for lunch, need to split with 3 friends"

Tap FAB → Expense
  ↓
Enter Amount: ₹1,200
Select Group: "Mussoorie Trip"
Select Category: "Dining"
Enter Date: (Today)
Select Payer(s): Me (₹1,200)
Select Share Type: Equal (4 people)
  ↓
Live Calculation:
  Me: paid ₹1,200, share ₹300
  Friend A: paid ₹0, share ₹300
  Friend B: paid ₹0, share ₹300
  Friend C: paid ₹0, share ₹300
  Σ paid (₹1,200) == Σ share (₹1,200) ✓
  ↓
Save Button ENABLED
Tap Save
  ↓
Txn appears in Group detail
Balances update: Me +₹900, Friends each −₹300
```

### Flow 2: Itemized Restaurant Bill

```
User: "Restaurant bill, 4 items, 3 people, unequal consumption"

Tap FAB → Itemized Bill
  ↓
Add Items:
  Paneer Butter Masala ×2 @ ₹320 = ₹640
  Dal Makhani ×1 @ ₹220 = ₹220
  Garlic Naan ×4 @ ₹40 = ₹160
  Subtotal: ₹1,020
  ↓
Add Tax: 5% = ₹51
Add Tip: 15% = ₹153
Total: ₹1,224
  ↓
Quick-Assign Items:
  Item 1 (PBM): [Me] [Friend A]
  Item 2 (Dal): [Me] [Friend B]
  Item 3 (Naan): [Me] [Friend A] [Friend B]
  ↓
Per-Person Subtotal (Live):
  Me: ₹740
  Friend A: ₹480
  Friend B: ₹360
  ↓
"Split the rest equally" (if unassigned items exist)
  ↓
Next: Select Payer(s)
  Me: ₹1,224 (I paid restaurant)
  ↓
Review:
  Σ paid (₹1,224) == Σ share (₹1,224) ✓
  ↓
Save → Txn saved with line_item records
```

### Flow 3: Settle-Up (End of Trip)

```
User: "Time to settle debts after trip"

Group Detail → Balances Tab
  ↓
See Net Balances:
  Me: +₹900 (owed)
  Friend A: −₹450 (owes)
  Friend B: −₹300 (owes)
  Friend C: −₹150 (owes)
  ↓
Tap "Settle Up"
  ↓
Algorithm Runs:
  Input: {Me: 900, A: -450, B: -300, C: -150}
  Output (Simplified):
    Friend A pays Me ₹450
    Friend B pays Me ₹300
    Friend C pays Me ₹150
  ↓
See List:
  [A] → [Me]   ₹450  [Paid]
  [B] → [Me]   ₹300  [Paid]
  [C] → [Me]   ₹150  [Paid]
  ↓
Friend A actually hands you ₹450 (IRL)
You tap [Paid]
  ↓
Settlement Txn Created:
  kind = "settlement"
  from = Friend A
  to = Me
  amount = ₹450
  ↓
Balance: Me vs. Friend A now = ₹0
Repeat for others
  ↓
All Balances = ₹0 → "All settled up"
```

### Flow 4: Global Dashboard View

```
User: "Show me my finances across all groups"

Tap Dashboard Tab
  ↓
Select Period: Today | Month | Year (default: Month)
  ↓
See Metrics:
  My Spending: ₹45,000 (sum of my shares across all groups)
  Income: ₹80,000
  Net: +₹35,000
  Savings Rate: 44%
  Budget Progress: 42% (of ₹50k limit)
  ↓
Category Breakdown (Donut):
  Rent: 40%, Groceries: 20%, Food: 15%, Other: 25%
  ↓
Spending Over Time (Bar Chart):
  Week 1: ₹8,000
  Week 2: ₹9,500
  Week 3: ₹12,000
  Week 4: ₹15,500
  ↓
Group Health (Horizontal Scroll):
  Personal: 42% (green)
  Me & GF: 55% (amber)
  Trip: 92% (amber)
  Rent Share: 100% (red — over budget!)
  ↓
You Owe / Owed Summary:
  You owe ₹450
  Owed to you ₹1,200
  Tap → Global Settle-Up Screen
```

---

## 6. Component Tree

```
App (Root)
├─ Navigation (expo-router)
│  └─ (tabs) Layout
│     ├─ (tabs)/index.tsx — Dashboard Screen
│     │  ├─ <TabBar />
│     │  ├─ <DashboardHeader />
│     │  ├─ <PeriodTabs /> (Today/Month/Year)
│     │  ├─ <MetricsSection />
│     │  │  ├─ <AmountText /> (Spending, Income, Net)
│     │  │  └─ <BudgetBar />
│     │  ├─ <CategoryChart /> (Donut)
│     │  ├─ <SpendingChart /> (Bar over time)
│     │  ├─ <OweSummary />
│     │  └─ <GroupHealthChips /> (Horizontal scroll)
│     │     └─ <GroupChip />
│     │
│     ├─ (tabs)/groups.tsx — Groups Screen
│     │  ├─ <GroupList />
│     │  │  └─ <GroupCard />
│     │  │     ├─ <GroupIcon />
│     │  │     ├─ <AmountText /> (Spent/Limit)
│     │  │     └─ <BudgetBar />
│     │  └─ <FAB /> (New Group)
│     │
│     ├─ (tabs)/reports.tsx — Reports Screen
│     │  ├─ <DateRangeFilter />
│     │  ├─ <MonthlySummaryCard /> (per group)
│     │  │  └─ <AmountText /> (Income/Expense/Net)
│     │  ├─ <YearInReviewCard />
│     │  └─ <ExportButtons />
│     │     ├─ [CSV]
│     │     └─ [PDF]
│     │
│     └─ (tabs)/settings.tsx — Settings Screen
│        ├─ <SettingsSection /> (Profile)
│        ├─ <SettingsSection /> (Categories)
│        ├─ <SettingsSection /> (Budget)
│        ├─ <SettingsSection /> (Security)
│        ├─ <SettingsSection /> (Notifications)
│        └─ <SettingsSection /> (Data & Privacy)
│
├─ group/[id].tsx — Group Detail (Dynamic)
│  ├─ <GroupHeader />
│  ├─ <BudgetBar /> (at top)
│  ├─ <TabNav /> (Txns | Balances | Budget | Members)
│  │
│  ├─ Txns Tab:
│  │  └─ <TransactionList />
│  │     └─ <TransactionRow /> (swipeable)
│  │
│  ├─ Balances Tab:
│  │  ├─ <BalanceList />
│  │  │  └─ <BalanceRow /> (Person A owes/owed)
│  │  └─ [Settle Up Button]
│  │
│  ├─ Budget Tab:
│  │  ├─ <BudgetBar /> (progress)
│  │  ├─ <LimitInputs /> (Daily/Monthly/Yearly)
│  │  ├─ <CarryOverToggle />
│  │  └─ <NotificationSettings />
│  │
│  └─ Members Tab:
│     ├─ <MemberList />
│     │  └─ <MemberRow /> (Avatar + Name)
│     └─ [+ Add Member]
│
├─ group/[id]/settle.tsx — Settle-Up Screen
│  ├─ <Header /> ("X payments needed")
│  └─ <SettlementList />
│     └─ <SettlementRow />
│        ├─ <MemberAvatar /> (from)
│        ├─ <Arrow />
│        ├─ <MemberAvatar /> (to)
│        ├─ <AmountText />
│        └─ [Paid Button]
│
├─ add/quick.tsx — Quick Expense/Income
│  ├─ <AmountInput /> (Rupee format)
│  ├─ <GroupPicker />
│  ├─ <CategoryPicker />
│  ├─ <DatePicker />
│  ├─ <NoteInput />
│  ├─ <PhotoButton />
│  ├─ <TagsInput />
│  ├─ <PayerSelector />
│  ├─ <SplitTypeSelector />
│  │  ├─ Equal
│  │  ├─ Exact
│  │  ├─ Percentage
│  │  └─ Ratio
│  ├─ <SplitAssignment /> (Live per-person totals)
│  ├─ <InvariantStatus /> (✓ or ✗ red warning)
│  └─ [Save Button] (enabled if invariant holds)
│
└─ add/itemized.tsx — Itemized Bill
   ├─ <ItemList />
   │  └─ <ItemRow /> (Name, Qty, Price, Delete)
   ├─ <AdjustmentInputs /> (Tax/Tip/Discount)
   ├─ <QuickAssignSection />
   │  ├─ <ItemRow /> (+ Avatar Row Below)
   │  └─ <AvatarRow /> (Scroll horizontally)
   ├─ [Split the Rest Equally Button]
   ├─ <PayerSelector />
   ├─ <ReviewSection />
   │  ├─ Per-Person Totals
   │  ├─ Payer Amounts
   │  └─ <InvariantStatus />
   └─ [Save Button]
```

---

## 7. Business Logic Map

### Core Algorithm 1: Invariant Enforcement

```
When User Saves Transaction:
  1. Compute Σ txn_payment (total paid by all people)
  2. Compute Σ txn_share (total share / owed by all people)
  3. If Σ paid ≠ Σ share:
       → Highlight unbalanced side (red)
       → Show signed remainder: "₹50 unassigned" or "₹50 over-assigned"
       → Disable Save button
       → Return to split screen
  4. If Σ paid == Σ share:
       → Enable Save button
       → User can save
       → Persist both txn_payment and txn_share rows
```

### Core Algorithm 2: Paise Rounding

```
When Splitting Amount Among N People:
  1. Total = ₹1,000
  2. N = 3
  3. Base = ⌊1,000 / 3⌋ = ₹333
  4. Remainder = 1,000 - (333 × 3) = ₹1
  5. Distribute Remainder to Earliest Members:
     → Person 1: ₹333 + ₹1 = ₹334
     → Person 2: ₹333
     → Person 3: ₹333
  6. Verify: ₹334 + ₹333 + ₹333 = ₹1,000 ✓
  
Principle: Deterministic, fair over time, exact sum always.
```

### Core Algorithm 3: Debt Simplification

```
Input: net balance per person
  me: +₹900 (owed ₹900)
  A: −₹450 (owes ₹450)
  B: −₹300 (owes ₹300)
  C: −₹150 (owes ₹150)

Algorithm (Greedy):
  1. Separate into creditors (positive) and debtors (negative)
  2. Sort creditors by balance DESC: [me (+900)]
  3. Sort debtors by balance DESC: [A (450), B (300), C (150)]
  4. Match largest debtor with largest creditor:
     → A (450) pays me (900): reduce both by 450
       Settlement: A → me, ₹450
     → me remaining: 450
     → B (300) pays me (450): reduce both by 300
       Settlement: B → me, ₹300
     → me remaining: 150
     → C (150) pays me (150): reduce both by 150
       Settlement: C → me, ₹150
     → me remaining: 0
  5. Output: [A→me ₹450, B→me ₹300, C→me ₹150]
  
Result: 3 payments instead of 6 possible combinations.
```

### Core Algorithm 4: Balance Computation

```
Per-Person Balance (per group or global):
  balance(person_id) = Σ(txn_payment WHERE person_id = person_id)
                     − Σ(txn_share WHERE person_id = person_id)

  Note: Only non-deleted txns, exclude income from share side

  Interpretation:
    balance > 0: Person is owed money (creditor)
    balance < 0: Person owes money (debtor)
    balance = 0: Settled
```

### Core Algorithm 5: Lazy-Materialized Recurring

```
When User Queries a Date Range (e.g., "June 2026"):
  1. Fetch recurring_txns where recur_freq != NULL
  2. For each recurring txn:
     → Compute all instances between query_start and query_end
     → Using recur_freq, recur_interval, recur_end
     → Example: "Every month starting June 1" → [June 1, July 1, Aug 1, ...]
  3. Yield virtual txn rows (not persisted in DB)
  4. When materializing past instances (e.g., viewing June after fact):
     → If user edited an instance ("this one only"):
        Create one-off txn row for that date
     → Future instances still follow recurrence rule
  5. When deleting:
     → Soft-delete original recurring txn (is_deleted=1)
     → All future instances hidden
     → Past materialized instances remain
```

---

## 8. Priority Matrix (v1 Core vs. Defer)

### V1 CORE (Must Have for August 2026 Launch)

**Tier 1: Absolute Must-Have**
- [ ] Create groups
- [ ] Add members
- [ ] Log income/expense
- [ ] Equal split
- [ ] View balances
- [ ] Settle-Up flow
- [ ] Dashboard (basic metrics)
- [ ] Edit/delete txn
- [ ] Invariant enforcement

**Tier 2: Nearly Essential**
- [ ] Exact amount split
- [ ] Percentage split
- [ ] Itemized bills (line items + assign)
- [ ] Category management
- [ ] Budget limits
- [ ] Soft-delete semantics

**Count:** ~15 features

### V1 NICE-TO-HAVE (If Time Permits, Otherwise → v1.1)

- [ ] Ratio split
- [ ] Recurring txns (lazy materialization)
- [ ] CSV export
- [ ] PDF export
- [ ] Notifications (80%, 100%)
- [ ] Carry-over logic
- [ ] Tags & filtering
- [ ] Receipt photo
- [ ] Year-in-review

**Count:** ~9 features

### V2+ DEFER (Don't Touch in v1)

- [ ] Multi-user sync (Supabase)
- [ ] Real-time collaboration
- [ ] Join codes
- [ ] End-to-end encryption
- [ ] Face ID / Touch ID lock (defer if time is tight)
- [ ] Dark mode (if no time)
- [ ] OCR receipt scanning
- [ ] Multi-currency
- [ ] AI insights
- [ ] App widget

**Count:** ~10 features

**Recommendation:** Ship v1 with Tier 1 + most of Tier 2. Defer rest to v1.1 / v2.

---

## 9. Navigation Blueprint

```
TAB BAR (Bottom, Always Visible)
├─ 🏠 Dashboard (Global overview)
├─ 📚 Groups (Group list + detail)
├─ 📊 Reports (Analytics & export)
└─ ⚙️ Settings (Preferences)

FAB (Orange Circle, Always Visible Above Tab Bar)
├─ 💰 Expense (→ add/quick)
├─ 💵 Income (→ add/quick with kind=income)
└─ 🧾 Itemized Bill (→ add/itemized)

SCREEN TRANSITIONS
├─ Dashboard
│  ├─ Tap Group Chip → group/[id]
│  ├─ Tap "Settle Up" → global settle
│  └─ Tap Charts → reports (future)
│
├─ Groups
│  ├─ Tap + FAB → groups/new
│  ├─ Tap Group Card → group/[id]
│  └─ group/[id] has 4 sub-tabs
│     ├─ Txns → Tap txn → txn/[id] (modal)
│     ├─ Balances → Tap "Settle Up" → group/[id]/settle
│     ├─ Budget → Edit limits
│     └─ Members → + Add member
│
├─ Reports
│  ├─ Date range filter
│  ├─ Export CSV
│  └─ Export PDF
│
└─ Settings
   ├─ Profile
   ├─ Categories
   ├─ Budget (global)
   ├─ Security
   ├─ Notifications
   └─ Data & Privacy

BACK NAVIGATION
├─ Back button on all modal/detail screens
├─ Dismisses screen, returns to previous
└─ Never loses state (Zustand handles)
```

---

## 10. Terminology Glossary

**APPROVED TERMS FOR UI, CODE, DOCUMENTATION**

| Concept | Approved Term | Examples | Avoid |
|---------|---|---|---|
| Individual transaction | **Txn** (UI), **transaction** (docs) | "Add txn", "txn list", "transaction history" | "entry", "record", "log" |
| Person who consumed | **Share** (code: txn_share) | "Your share: ₹500" | "consumption", "split", "owed" |
| Person who paid | **Paid** (code: txn_payment) | "You paid: ₹1,000" | "payer", "payment", "amount paid" |
| When debts are recorded as complete | **Settle Up** (UI), **settlement** (code) | "Tap Settle Up", "settlement txn" | "reconcile", "balance", "pay" |
| Category of spending | **Category** (not "type", "bucket") | "Select category: Food" | "type", "bucket", "tag" |
| Tag for filtering | **Tag** (starts with #) | "#food #date-night", "filter by tag" | "label", "keyword" |
| Equal division | **Equal Split** (not "divided equally") | "Use Equal Split for..." | "split evenly", "divide" |
| Custom amount per person | **Exact Split** (not "custom", "manual") | "Use Exact Split to..." | "manual split", "custom split" |
| Money as integer | **Paise** (₹1 = 100 paise) | "₹1,500.50 = 150,050 paise" | "rupees" (for small amounts), "decimal" |
| Group of people | **Group** (not "circle", "team") | "Create a group", "group members" | "circle", "pool", "team" |
| Person you're tracking | **Member** (not "participant", "user") | "Add members to group" | "participant", "user" |
| Feature deferred to later | **v2** or **v1.1** (be explicit) | "This is v2", "Defer to v1.1" | "future", "next version", "TBD" |

---

## 11. What's Missing (Gaps in Current Structure)

### Architecture Gaps
- [ ] No screen wireframes (text descriptions only)
- [ ] No component prop definitions
- [ ] No state management design (Zustand store shape)
- [ ] No error handling strategy
- [ ] No performance targets per screen
- [ ] No accessibility checklist (WCAG)

### Feature Gaps
- [ ] No search/filter for transactions
- [ ] No bulk operations (edit multiple txns)
- [ ] No undo/redo
- [ ] No data backup/restore strategy
- [ ] No migration strategy (if schema changes)
- [ ] No conflict resolution rules (if v2 added)

### Flow Gaps
- [ ] Onboarding flow (first-time user experience)
- [ ] Empty state flows (new user, no data)
- [ ] Error flows (failed save, DB corruption)
- [ ] Offline handling (when device loses network in v2)

### Business Gaps
- [ ] No user acquisition strategy
- [ ] No retention metrics
- [ ] No pricing model (if v2 becomes paid)
- [ ] No privacy policy template
- [ ] No terms of service
- [ ] No support/feedback channel

---

## Summary: What You Should Do Now

### For Developers (Before Coding)
1. **Read ANALYSIS_PROMPT_FOR_OPUS.md** — Get an expert review
2. **Use This Document** — Refer to sections 1-10 constantly during dev
3. **Clarify Ambiguities** — If anything is unclear, ask Opus
4. **Create Detailed Wireframes** — Convert "screen descriptions" into actual UX
5. **Design Data Models** — Convert section 4 into SQL schema with indexes

### For Product Managers
1. **Review Priority Matrix** (§8) — Decide what's v1 core
2. **Interview Users** — Validate feature priorities
3. **Write PRDs** — For each Tier 1 feature
4. **Define Success Metrics** — What does a successful v1 look like?

### For Everyone
1. **Bookmark This Document** — Refer to it daily
2. **Use Section Headings** — "This goes in group/[id]", "This uses <AmountText>", etc.
3. **Check Terminology** (§10) — Use approved terms in code/docs/UI
4. **Stay Organized** — Don't scatter info; add to this structure

---

## Document Status

| Status | Items |
|--------|-------|
| ✅ Complete | Sections 1-11 |
| 🔄 To Be Detailed | Wireframes (convert to Figma), Component props (TypeScript interfaces) |
| ⏳ Pending Opus Review | Full architecture analysis (see ANALYSIS_PROMPT_FOR_OPUS.md) |

**Next Step:** Share this document + ANALYSIS_PROMPT_FOR_OPUS.md with Claude 4.8 Opus for comprehensive review.

---

**Last Updated:** June 22, 2026  
**Owner:** Prem  
**Version:** 1.0 (Initial Structure Clarity)
