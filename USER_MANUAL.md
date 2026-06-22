# BudgetSplit — User Manual & Complete Guide

**Edition:** v1.0 (Local Solo)  
**Date:** June 22, 2026  
**For:** End users who want to master BudgetSplit

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Understanding the Basics](#understanding-the-basics)
3. [Managing Groups](#managing-groups)
4. [Logging Transactions](#logging-transactions)
5. [Splitting Bills](#splitting-bills)
6. [Settling Debts](#settling-debts)
7. [Budget Management](#budget-management)
8. [Reports & Export](#reports--export)
9. [Settings & Preferences](#settings--preferences)
10. [Troubleshooting](#troubleshooting)
11. [Tips & Tricks](#tips--tricks)

---

## Getting Started

### First Launch

When you open BudgetSplit for the first time:

1. **Welcome Screen** — The app is setting up your local database. This takes ~2 seconds.
2. **Automatic Setup** — You'll see:
   - A user profile named "Me" (or your phone's display name)
   - A budget group called "Personal"
   - 10 default categories: Food, Groceries, Rent, Utilities, Travel, Fuel, Medical, Shopping, Subscriptions, Other

**You're ready to go. No sign-up. No password. No account.**

### Dashboard Overview

The home screen has four tabs at the bottom:

| Icon | Name | Purpose |
|------|------|---------|
| 🏠 | **Dashboard** | Your global financial overview (Today/Month/Year) |
| 📚 | **Groups** | List of all your budget groups |
| 📊 | **Reports** | Analytics, summaries, export options |
| ⚙️ | **Settings** | Preferences, categories, profile, security |

---

## Understanding the Basics

### Key Concepts

#### 1. **Share vs. Paid**

The most important concept in BudgetSplit:

- **Paid:** Money that actually left your wallet.
- **Share:** What you actually consumed or owe.

**Example:**
```
You pay ₹1,000 for dinner with your girlfriend.
Split 50/50.

You:
  Paid: ₹1,000 (money left your wallet)
  Share: ₹500 (what you ate)
  Net: +₹500 (she owes you ₹500)

Girlfriend:
  Paid: ₹0 (her money didn't leave)
  Share: ₹500 (what she ate)
  Net: −₹500 (she owes you ₹500)

Your Personal Budget:
  Takes a ₹500 hit, not ₹1,000.
  (Because you only consumed ₹500, even though you paid ₹1,000)
```

#### 2. **Groups**

A group is a container for:
- A set of people (e.g., "Me & GF", "Trip Friends", "Roommates")
- All transactions between those people
- Separate budget and spending tracking

**Why Groups?**
- Your finances aren't one ledger. You're you solo, you're a couple, you're a trip buddy.
- Each context has different people and different budgets.

**Example Groups:**
```
Personal      → Me (solo tracking)
Me & GF       → Me + Girlfriend
Trip 2026     → Me + Rahul + Divya + Rohan
Rent Share    → Me + 2 Roommates
```

#### 3. **Balances**

Your balance with someone tells you who owes whom.

```
Balance: +₹450     → They owe you ₹450
Balance: −₹450     → You owe them ₹450
Balance: ₹0        → All settled
```

**Important:** Balances are computed fresh every time. They're not stored. This means if you edit or delete a transaction, balances update immediately.

#### 4. **Invariant**

The Golden Rule: **Σ Paid == Σ Share**

In every transaction, the total amount paid must equal the total amount shared.

```
Bill: ₹1,000

Valid:
  Person A paid ₹1,000, shares ₹500
  Person B paid ₹0, shares ₹500
  ✓ Paid (₹1,000) == Share (₹500 + ₹500)

Invalid:
  Person A paid ₹1,000, shares ₹600
  Person B paid ₹0, shares ₹400
  ✗ Paid ₹1,000 ≠ Share ₹1,000... wait, that's balanced.

Actually Invalid:
  Person A paid ₹1,000, shares ₹500
  Person B paid ₹0, shares ₹400
  ✗ Paid (₹1,000) ≠ Share (₹900) — missing ₹100
```

**The app prevents you from saving an unbalanced transaction.** This is protection, not punishment.

---

## Managing Groups

### Create a Group

**Path:** Tab Bar → Groups → [Floating Action Button (+)] → New Group

**Steps:**
1. Tap **Groups** tab (lower left)
2. Tap **+ button** (lower right, orange)
3. Fill in:
   - **Group Name:** e.g., "Me & GF", "Mussoorie 2026", "Rent Share"
   - **Icon:** Tap to open picker. Choose from 100+ icons (e.g., ✈️ for trips, 🏠 for rent)
   - **Color:** Tap to open color palette. Assign a color (for UI, not functional)
4. Tap **Create Group**

**Done!** Group appears in your Groups list. It's empty (no members yet, no transactions).

### Add Members to a Group

**Path:** Groups → Tap a group → Members tab → [+ Add Member]

**Steps:**
1. Tap a group (e.g., "Me & GF")
2. Tap **Members** tab
3. Tap **+ Add Member**
4. Choose:
   - **Existing Member** (if they're in another group)
   - **New Person** (create a new person)

**If New Person:**
1. Enter name (e.g., "Kavya")
2. Tap **Avatar Color** (pick a color that represents them)
3. Tap **Add**

**Done!** Member appears in the group. You can now log transactions involving them.

### Edit a Group

**Path:** Groups → Tap group → [... menu] → Edit Group

**Edit Options:**
- Group name
- Icon
- Color
- Budget limits (see §Budget Management)
- Carry-over toggle
- Archive (hide from main list)

### Delete a Group

**Path:** Groups → Tap group → [... menu] → Delete Group

**Warning:** This soft-deletes the group (hidden from UI, data retained). You can't undo this in-app. All transaction history remains (for audit).

---

## Logging Transactions

### Add a Quick Expense (Solo or Split)

**Path:** Any tab → [+] FAB → Expense

**Steps:**
1. Tap **orange + button** (lower right)
2. Tap **Expense**
3. Fill in:
   - **Amount:** Tap input, type (e.g., "500" or "1500.50")
   - **Group:** Tap to select group (default: Personal)
   - **Category:** Tap to pick (e.g., "Food", "Groceries")
   - **Date:** Tap to pick (default: today)
   - **Note:** Optional (e.g., "Dinner at Bikanervala")
   - **Photo:** Optional (tap camera icon to capture receipt)
   - **Tags:** Optional (type, comma-separated, e.g., "#food,#date")
4. Scroll down → **Payer(s)**
   - Default: "Me" (you paid)
   - Tap to add/remove co-payers
5. Scroll down → **Shares**
   - Default: Equal split among group members
   - Tap to change split type (see §Splitting Bills)
6. Review invariant status:
   - ✅ Green → Paid == Share → Save enabled
   - ❌ Red → Unbalanced → Save disabled + warning shown
7. Tap **Save**

**Done!** Expense appears in the group's transaction list and dashboard.

### Add Income

**Path:** Any tab → [+] FAB → Income

**Steps:**
1. Tap **orange + button**
2. Tap **Income**
3. Fill in:
   - **Amount:** (e.g., "80000" for salary)
   - **Group:** (e.g., "Personal")
   - **Category:** (e.g., "Salary", "Bonus", "Refund", "Gift")
   - **Date:** (default: today)
   - **Note:** Optional (e.g., "June paycheck")
4. Tap **Save**

**Note:** Income is NOT split. You keep 100% (no shares applied). It's just logged for your dashboard.

### Edit a Transaction

**Path:** Group Detail → Transaction List → Tap transaction

**Steps:**
1. Tap a transaction in the list
2. Tap **Edit**
3. Change any field (amount, date, category, note, payers, shares)
4. **If editing a split:** Tap "Rebalance" to re-open the split screen and adjust amounts
5. Tap **Save**

**Note:** Editing a split requires you to rebalance. The app won't let you save unless the invariant holds (Σ paid == Σ share).

### Delete a Transaction

**Path:** Group Detail → Transaction List → Swipe left on transaction

**Steps:**
1. In the transaction list, find the txn
2. Swipe **left** on the row
3. Red delete zone appears
4. Tap **Delete** (red button)
5. Confirm: "Delete this transaction?"
6. Tap **Delete** again

**Done!** Transaction is soft-deleted (hidden from UI, kept in DB). Balances recompute automatically.

**Can Undo?** No in-app undo. But the transaction stays in the database (marked is_deleted=1). If you need to recover it, contact support or restore from backup.

---

## Splitting Bills

### Understanding Split Types

BudgetSplit offers five split types. Choose based on your situation.

#### Type 1: Equal Split

**Use when:** Everyone consumes roughly the same amount.  
**Example:** 4 friends at a restaurant, each ate similarly.

**How:**
```
Bill: ₹1,000
Split Type: Equal
Members: A, B, C, D

Result:
  A: ₹250
  B: ₹250
  C: ₹250
  D: ₹250
```

**Steps in app:**
1. Add expense, amount ₹1,000
2. Scroll to **Shares** section
3. Tap "Split Type" → choose **Equal**
4. App shows: "Split ₹1,000 equally among 4 members: ₹250 each"
5. Tap **Save**

#### Type 2: Exact Amount

**Use when:** You know each person's exact share.  
**Example:** Rent: ₹20,000 total. You pay ₹12,000, roommate pays ₹8,000. But maybe you actually pay ₹20,000 and they reimburse ₹8,000.

**How:**
```
Bill: ₹20,000
Split Type: Exact
Entries:
  Person A: ₹12,000
  Person B: ₹8,000

Result:
  A: ₹12,000
  B: ₹8,000
```

**Steps in app:**
1. Add expense, amount ₹20,000
2. Scroll to **Shares**
3. Tap "Split Type" → choose **Exact**
4. Tap each member, enter their share
5. App shows warning if total ≠ ₹20,000
6. Tap **Save** (only enabled when total = bill)

#### Type 3: Percentage

**Use when:** You want to split by percentage (e.g., 50%, 30%, 20%).  
**Example:** Project cost ₹10,000. Partner A handles 60%, Partner B handles 40%.

**How:**
```
Bill: ₹1,000
Split Type: Percentage
Entries:
  A: 60%
  B: 40%

Result:
  A: ₹600
  B: ₹400
```

**Steps in app:**
1. Add expense, amount ₹1,000
2. Scroll to **Shares**
3. Tap "Split Type" → choose **Percentage**
4. Tap each member, enter their percentage
5. App shows warning if total ≠ 100%
6. Tap **Save** (only enabled when total = 100%)

#### Type 4: Ratio / Shares

**Use when:** You think in ratios (e.g., "Split 2:1 between A and B").  
**Example:** Housework split: you do 70%, roommate does 30%. But you want to think of it as 7:3.

**How:**
```
Bill: ₹1,000
Split Type: Ratio
Entries:
  A: 7
  B: 3

Calculation:
  A: 7/(7+3) × ₹1,000 = ₹700
  B: 3/(7+3) × ₹1,000 = ₹300

Result:
  A: ₹700
  B: ₹300
```

**Steps in app:**
1. Add expense, amount ₹1,000
2. Scroll to **Shares**
3. Tap "Split Type" → choose **Ratio**
4. Tap each member, enter their share number
5. App auto-computes amounts: A gets ₹700, B gets ₹300
6. Tap **Save**

#### Type 5: Itemized (Bill with Line Items)

**Use when:** The bill has many items, and different people consumed different items.  
**Example:** Restaurant: you ordered PBM, friend ordered Dal, another friend ordered Naan. Plus tax and tip.

**See next section: Itemized Bill Entry**

### Itemized Bill Entry

**Path:** Any tab → [+] FAB → Itemized Bill

**Steps:**

#### Step 1: Add Items

1. Tap **+** FAB → **Itemized Bill**
2. Screen shows: **[+ Add Item]** button
3. Tap **[+ Add Item]**
4. Fill in:
   - **Item Name:** (e.g., "Paneer Butter Masala")
   - **Quantity:** (e.g., "2")
   - **Unit Price:** (e.g., "320")
5. Tap **✓ Add**
6. Item appears in list. Running subtotal updates.
7. Repeat for all items.

**Example Bill Build:**
```
Item 1: Paneer Butter Masala, qty 2, price ₹320 = ₹640
Item 2: Dal Makhani, qty 1, price ₹220 = ₹220
Item 3: Garlic Naan, qty 4, price ₹40 = ₹160
Subtotal: ₹1,020
```

#### Step 2: Add Tax / Tip / Discount

1. Scroll down to **Adjustments** section
2. Tap **+ Tax** (or **+ Tip** or **+ Discount**)
3. Choose:
   - **Flat Amount** (e.g., ₹50) or **Percentage** (e.g., 5%)
4. Enter value
5. Tap **✓ Apply**

**Example:**
```
Subtotal: ₹1,020
Tax (5%): ₹51
Tip (15%): ₹153
Total: ₹1,224
```

#### Step 3: Quick-Assign Items to Members

1. Scroll back up to item list
2. Tap an **item row** (e.g., "Paneer Butter Masala — ₹640")
3. Below it, a row of **member avatars** appears
4. Tap avatars to assign/unassign
   - Tap avatar → highlighted (assigned)
   - Tap again → unhighlighted (unassigned)
5. Item's cost is split equally among assigned members
6. Per-person running total updates live (at bottom of screen)
7. Repeat for all items

**Example:**
```
Item 1 (PBM, ₹640):
  [Prem] [Kavya]
  → Prem: ₹320, Kavya: ₹320

Item 2 (Dal, ₹220):
  [Prem] [Kavya]
  → Prem: ₹110, Kavya: ₹110

Item 3 (Naan, ₹160):
  [Prem] [Kavya] [Rohan]
  → Prem: ₹53.33, Kavya: ₹53.33, Rohan: ₹53.34 (paise rounding)

Per-Person Subtotal:
  Prem: ₹483.33
  Kavya: ₹483.33
  Rohan: ₹53.34
```

#### Step 4: "Split the Rest Equally"

If some items are unassigned:
1. Tap **"Split the rest equally"** button
2. All unassigned items are assigned to all group members (equal split)

**Unassigned Indicator:**
- Item with no avatars is shown in red
- At bottom: "⚠️ ₹XXX unassigned"

#### Step 5: Set Payers

1. Scroll down to **Payers** section
2. All items have been assigned. Now decide who *paid* the restaurant.
3. Usually: one person (you)
4. Tap to select/deselect payers
5. Payer's amount defaults to total bill

**Example:**
```
Total Bill: ₹1,224
Payer: You (₹1,224)

(Others will reimburse later or share the payment)
```

#### Step 6: Review & Save

1. Scroll down → **Review** section shows:
   - Per-person share (what they owe/consumed)
   - Payer amounts
   - Invariant status (✅ or ❌)
2. If ✅ **All Balanced** → **Save** button enabled
3. If ❌ **Unbalanced** → **Save** button disabled + warning
4. Tap **Save**

**Done!** Itemized bill saved as a transaction. Appears in group.

---

## Settling Debts

### View Balances

**Path:** Group Detail → Balances tab

**What You See:**
```
Me & GF Group Balances:

You:     −₹450 (you owe Kavya ₹450)
Kavya:   +₹450 (Kavya is owed ₹450)
```

**Interpretation:**
- Positive balance → This person is owed money
- Negative balance → This person owes money
- Zero balance → All settled

### Global Settle-Up (Cross-Group)

**Path:** Dashboard → "You owe ₹450 · Owed ₹1,200" card → Tap "Settle Up"

**What Happens:**
1. App computes your net balance **across all groups**
2. Simplifies debts using the greedy algorithm
3. Shows minimum payments needed

**Example:**
```
Global Balances:
  Me & GF: You owe Kavya ₹450
  Trip: Rahul owes you ₹1,200
  Rent: You owe Roommate ₹300

Global Settle-Up:
  [1] You pay Kavya ₹450
  [2] Rahul pays you ₹1,200
  [3] You pay Roommate ₹300
```

### Per-Group Settle-Up

**Path:** Group Detail → Balances tab → [Settle Up] button

**What Happens:**
1. App computes net balance **within this group only**
2. Simplifies debts
3. Shows simplified payments

**Example:**
```
Me & GF Group Settle-Up:

You owe Kavya: ₹450
Kavya owes you: ₹0

Simplified:
  [1] You pay Kavya ₹450
```

### Mark a Settlement as Paid

**Path:** Settle-Up screen → Tap [Paid] button on a payment row

**Steps:**
1. View Settle-Up screen
2. Find payment you made (e.g., "You pay Kavya ₹450")
3. Tap **[Paid]** button (blue, right side)
4. Confirmation: "Mark as paid?"
5. Tap **Confirm**

**What Happens:**
- A `settlement` transaction is created (kind="settlement")
- Records who paid whom and the amount
- Balance updates to ₹0
- Settlement appears in transaction history

**Can Undo?**
Yes, if you tap the settlement txn and delete it, the balance becomes non-zero again (you'd need to re-settle).

---

## Budget Management

### Set a Budget Limit

**Path:** Group Detail → Budget tab

**Steps:**
1. Tap a group
2. Tap **Budget** tab
3. Scroll to **Budget Limits** section
4. Tap **+ Add Limit** (or edit existing)
5. Choose:
   - **Period:** Daily / Monthly / Yearly
   - **Amount:** (e.g., ₹50,000 for monthly)
6. Tap **Save**

**Example:**
```
Personal Group Budget:
  Daily: ₹2,000
  Monthly: ₹50,000
  Yearly: ₹600,000
```

### Enable Carry-Over

**Path:** Group Detail → Budget tab → Carry-Over toggle

**What It Does:**
If your monthly limit is ₹50,000 and you spend ₹45,000:
- **Without carry-over:** ₹5,000 unused budget is lost. Next month starts fresh at ₹50,000.
- **With carry-over:** ₹5,000 rolls to next month. Next month's limit becomes ₹55,000.

**How It Works:**
```
June Budget: ₹50,000
June Spending: ₹45,000
Unused: ₹5,000

July Budget (with carry-over): ₹50,000 + ₹5,000 = ₹55,000
July Spending Allowed: up to ₹55,000
```

**Important:** Only carries over one period. You can't accumulate indefinitely.

### Budget Notifications

**How They Work:**
- When you spend **80% of your budget**, you get a notification: "Personal group at 80% budget"
- When you spend **100% of your budget**, you get another: "Personal group at 100% budget — you're over"

**Example:**
```
Monthly Budget: ₹50,000
At 80% (₹40,000 spent): 🔔 Notification
At 100% (₹50,000 spent): 🔔 Notification (over budget)
At 110% (₹55,000 spent): No new notification, but health indicator is red
```

**Where to Disable:**
Settings → Notifications → Toggle off (if you don't want alerts)

### Budget Health Indicator

**Location:** Dashboard → Group health chips (horizontal scroll)

**What It Shows:**
- Group name
- Progress bar
- Budget spent / Budget limit
- Color:
  - 🟢 Green: <80%
  - 🟡 Amber: 80-100%
  - 🔴 Red: >100%

**Example:**
```
Personal  ██████░░░░░░ ₹42,000 / ₹50,000  (84%, amber)
Me & GF   ███░░░░░░░░░ ₹3,500 / ₹15,000   (23%, green)
Trip      ██████████░░ ₹9,200 / ₹10,000   (92%, amber)
```

---

## Reports & Export

### View Reports

**Path:** Tab Bar → Reports

**What's Available:**
1. **Monthly Summary** (per group)
   - Total income
   - Total expense
   - Net savings
   - Top 3 categories by spending
2. **Year-in-Review**
   - Total saved this year
   - Biggest spending month
   - Most-used category
   - Single biggest expense
3. **Date Range Filter**
   - Tap to select custom from/to dates
   - Reports update for that range

### Export as CSV

**Path:** Reports → [CSV] button

**What You Get:**
- File: `budgetsplit_transactions.csv`
- Columns: Date, Category, Description, Amount, Payers, Shares, Group
- Opens share sheet: Email, AirDrop, Notes, Files, etc.

**Example CSV:**
```
Date,Category,Description,Amount,Payers,Shares,Group
2026-06-21,Dining,Dinner at Bikanervala,1000,"You","You: 500, Kavya: 500",Me & GF
2026-06-20,Groceries,Weekly groceries,800,You,"You: 800",Personal
```

### Export as PDF

**Path:** Reports → [PDF] button

**What You Get:**
- File: `budgetsplit_summary.pdf`
- Formatted summary with:
  - Date range
  - Group name
  - Total income, expense, net
  - Category breakdown chart
  - Transaction table
- Opens share sheet: Email, AirDrop, Print, etc.

---

## Settings & Preferences

### Profile

**Path:** Tab Bar → Settings → Profile

**Edit:**
- **Name:** Your display name (default: device name)
- **Avatar Color:** Pick a color that represents you

### Categories (Per Group)

**Path:** Tab Bar → Settings → [Select Group] → Categories

**Manage:**
- **Add:** Tap **+ Add Category**, enter name, pick icon/color
- **Edit:** Tap category → rename
- **Delete:** Tap category → delete (reassign existing txns first)

**Seeded Defaults:**
- Food, Groceries, Rent, Utilities, Travel, Fuel, Medical, Shopping, Subscriptions, Other

### Biometric Lock (Face ID / Touch ID)

**Path:** Tab Bar → Settings → Security

**Enable:**
1. Tap **Face ID** or **Touch ID** (whichever your iPhone supports)
2. Tap **Enable**
3. iPhone asks for biometric confirmation
4. Done! App now locks on background.

**Disable:**
1. Go back to Security section
2. Tap **Disable**

**What Happens:**
- When you open the app, it asks for Face ID / Touch ID
- If biometric fails, falls back to PIN (if set in Settings)
- If no biometric and no PIN, app opens normally

### Dark Mode

**How It Works:**
- BudgetSplit follows your iPhone's system appearance setting
- If you set iPhone to Dark Mode → app uses dark theme
- If you set to Light Mode → app uses light theme
- If you set to Auto → app matches system schedule

**Can't Override:**
- App respects system setting (no in-app toggle planned)

### Notifications

**Path:** Tab Bar → Settings → Notifications

**Toggle:**
- **Budget Alerts:** On/Off (when you hit 80% or 100% of budget)
- **Other Alerts:** On/Off (future notifications)

### Export All Data

**Path:** Tab Bar → Settings → Data & Privacy

**Options:**
1. **Export All Txns as CSV** → Share or backup all your data
2. **Export All Txns as PDF** → Formatted summary of everything
3. **Delete All Data** (CAUTION) → Wipe the database (no undo)

---

## Troubleshooting

### The App Crashes

**Likely Cause:** Corrupted database or low memory.

**Fix:**
1. Force-close the app (swipe up from home, close BudgetSplit)
2. Wait 10 seconds
3. Reopen the app
4. If still crashing: check iPhone storage (Settings → General → iPhone Storage). If <1GB free, delete something.

### Transactions Don't Save

**Likely Cause:** Invariant not met (Σ paid ≠ Σ share) or required field missing.

**Fix:**
1. Check the warning message on screen (red text)
2. If "₹100 unassigned": adjust the split so all amounts are assigned
3. If validation error: fill in all required fields (amount, category, date, payers, shares)
4. Try again

### Balance Shows Wrong Amount

**Likely Cause:** You edited a transaction, or a settlement was marked paid incorrectly.

**Fix:**
1. Go to Group Detail → Transaction List
2. Review all txns (check if any are soft-deleted: is_deleted=1)
3. If balance still wrong: open Group Detail → Balances tab → tap a person's balance
4. It should compute from scratch. If not, force-close and reopen app.

### Can't Add More Members to a Group

**Likely Cause:** You already added max members (no limit in v1, so this shouldn't happen).

**Fix:**
1. Check: are they already in the group?
2. Try adding as "New Person" instead of "Existing Member"
3. If still fails: force-close app and try again

### Lost a Transaction

**Likely Cause:** You deleted it, or app crashed before saving.

**If You Deleted It:**
- Soft-delete data is kept (marked is_deleted=1) but hidden
- In-app, no undo. But data is not truly lost.
- Contact support if you need recovery.

**If App Crashed:**
- Crash before save = transaction lost (never was persisted)
- Crash after save = transaction is fine (it was saved)
- Reopen app. Check if txn appears.

### Face ID / Touch ID Not Working

**Likely Cause:** Device settings or biometric registration.

**Fix:**
1. Settings → Security → disable Face ID / Touch ID lock
2. Go to iPhone Settings → Face ID / Touch ID → re-register
3. Come back to BudgetSplit Settings → re-enable lock
4. Test

### Can't Export as PDF

**Likely Cause:** Font loading issue or permissions.

**Fix:**
1. Try exporting as CSV instead
2. Force-close and reopen app
3. Go to Settings → General → iPhone Storage → BudgetSplit → Offload (this clears cache)
4. Reopen and try PDF again

---

## Tips & Tricks

### Speed Up Data Entry

**Tip 1: Repeat Frequent Items**
- If you often log ₹500 groceries on Sundays, create a recurring transaction (see Recurring Transactions).

**Tip 2: Use Tags**
- Add tags like #food, #trip, #owe-rahul while entering txns.
- Later, filter by tag in Reports for quick summaries.

**Tip 3: Notes = Context**
- Tap the Note field and type context (e.g., "Sarojini Market, main items: tshirts and jeans").
- Future you will appreciate it.

### Manage Multiple Groups Efficiently

**Tip 1: Archive Old Groups**
- After a trip ends, archive "Trip 2026" so it doesn't clutter your list.
- (Not visible day-to-day, but data is kept.)

**Tip 2: Color-Code Groups**
- Personal = Blue, Me & GF = Pink, Trip = Orange, Rent = Green
- Quickly identify which group a txn belongs to by color.

**Tip 3: Check Global Dashboard Often**
- Dashboard tab shows all groups at once.
- Quick way to see overall spending, savings, and owe/owed.

### Understand Paise Rounding

**Scenario:** ₹1,000 split 3 ways.

**Math:**
- ₹1,000 ÷ 3 = ₹333.33... per person
- You can't have fractional paise
- So: Person 1 gets ₹334, Person 2 gets ₹333, Person 3 gets ₹333
- Total: ₹334 + ₹333 + ₹333 = ₹1,000 ✓

**Rule:** The first person(s) in the list get the extra paise. This is deterministic and fair over time.

### Reconcile with Friends

**Tip:** Before marking a settlement paid:
1. Make sure you've actually settled (cash exchange or Venmo)
2. Tell the other person to check their balance too
3. Once both mark it paid, both balances go to ₹0
4. Done!

### Regular Backups

**v1 Limitation:** No cloud backup yet.

**What You Should Do:**
- Every month, export your data as CSV
- Email it to yourself as a backup
- (v2 will have optional cloud backup)

### Recurring Transactions Tips

**Tip 1: Lazy Materialization**
- Rent on the 1st of every month
- It won't appear until you scroll to that month's date
- Future instances don't clutter your past

**Tip 2: Edit "This Instance Only"**
- Usually rent is ₹15,000
- This month, rent increased to ₹16,000
- Edit that instance only → next month still ₹15,000

**Tip 3: Delete Future Instances**
- You're moving out in July
- Delete the recurring rent starting July 1st
- June 1st still appears; July onwards, hidden

### Settle-Up Best Practices

**Best Practice 1:** Use Global Settle-Up Sparingly
- Works great for groups
- For global, it can get complex (many groups, many people)
- Better to settle per-group, then handle remaining balances

**Best Practice 2:** Settle Frequently
- After a trip, settle immediately (emotions fresh, money-math clear)
- Don't let balances pile up over months

**Best Practice 3:** Screenshot the Settle-Up List
- Before settling, take a screenshot of the "Settle Up" screen
- Send to the group: "Here's what we agreed. I'm paying X, you're paying Y."
- Reduces disputes later.

---

## Glossary of Terms

| Term | Definition |
|------|-----------|
| **Paise** | 1 rupee = 100 paise. Smallest money unit tracked. |
| **Share** | What you actually consumed or owe. |
| **Paid** | Money that physically left your wallet. |
| **Group** | Container for people and transactions. |
| **Invariant** | Rule: Σ paid == Σ share (always true). |
| **Settlement** | Transaction marking a debt as paid off. |
| **Soft Delete** | Hidden from UI, kept in database for audit. |
| **Carry-Over** | Unused budget rolls to next period. |
| **Recurring** | Expense that repeats on a schedule. |
| **Lazy Materialization** | Instances appear only when viewed, not pre-generated. |

---

## Keyboard Shortcuts (Future)

*Not in v1. Planned for v2.*

---

## Frequently Asked Questions

**Q: Can I sync my data between devices?**  
A: v1 = no sync (local only). v2 will have optional sync.

**Q: Can I use BudgetSplit with Android?**  
A: v1 = iOS only. Android planned for v3 or later.

**Q: What if I reinstall the app?**  
A: v1 data is local. Reinstalling erases everything. Export and backup first (see Tips & Tricks).

**Q: Is there a web version?**  
A: No. v1 is iOS only. Web planned for v3+.

**Q: How do I report a bug?**  
A: Contact: helloworldlife27@gmail.com (include device, iOS version, steps to reproduce).

---

## Conclusion

BudgetSplit is designed to be simple:
1. Create groups with people
2. Log expenses (split as needed)
3. Check balances
4. Settle up
5. Repeat

If you understand "Share vs. Paid" and trust the Invariant, everything else follows naturally.

**Happy splitting!**

---

**Manual Version:** 1.0  
**Last Updated:** June 22, 2026  
**For More Help:** helloworldlife27@gmail.com

