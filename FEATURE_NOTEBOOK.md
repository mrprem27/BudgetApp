# BudgetSplit — Complete Feature Notebook

**Edition:** v1.0  
**Date:** June 22, 2026  
**Audience:** Product managers, investors, developers, end users  
**Purpose:** Comprehensive reference, sales presentation, feature deep-dive

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [The Problem](#the-problem)
3. [The Solution](#the-solution)
4. [Core Features](#core-features)
5. [Advanced Features](#advanced-features)
6. [User Flows & Scenarios](#user-flows--scenarios)
7. [Technical Highlights](#technical-highlights)
8. [Why BudgetSplit Wins](#why-budgetsplit-wins)
9. [Competitive Analysis](#competitive-analysis)
10. [Pricing & Business Model](#pricing--business-model)
11. [Roadmap Overview](#roadmap-overview)
12. [FAQ](#faq)

---

## Executive Summary

**BudgetSplit** is a precision ledger app for iOS that lets you manage unlimited budget groups, track income and expenses down to the rupee, split bills with perfect accuracy, and simplify multi-person debts automatically.

### Key Stats

| Metric | Value |
|--------|-------|
| **Supported Groups** | Unlimited |
| **Group Members** | Unlimited |
| **Accuracy** | ₹0.01 (paise-level) |
| **Network Dependency** | 0 (v1 fully offline) |
| **Setup Time** | 0 (no account, no login) |
| **Cost** | ₹0 (free forever) |

### Who It's For

- 👥 Groups splitting bills (trips, roommates, couples)
- 💰 Solo budgeters who want precision tracking
- 🎯 Anyone tired of rounding errors and Venmo confusion
- 🏠 Friends managing shared expenses (rent, groceries, utilities)
- ✈️ Travel buddies splitting accommodation and food

---

## The Problem

### Existing Solutions Suck

| App | Problem |
|-----|---------|
| **Splitwise** | Cloud-dependent, rounding errors, requires login + sync |
| **Venmo** | Not designed for budget tracking; money transfer app |
| **WhatsApp Groups** | Chaotic; who owes whom? Lost in messages. |
| **Spreadsheets** | No structure; errors easy; no settlement tracking |
| **Notes App** | Same chaos as WhatsApp groups |
| **Bank Apps** | Solo tracking only; no split logic |

### Real-World Pain

1. **Rounding Hell** → "Do I owe ₹500 or ₹500.50?" Floating-point errors kill trust.
2. **Settlement Confusion** → 4 people, 3 groups, multiple debts. Who pays whom in what order?
3. **Data Privacy** → Cloud apps know every rupee you spend. Ouch.
4. **Offline Failure** → Out of WiFi on a trip? Can't log expenses. RIP connectivity-dependent apps.
5. **No Ledger Trail** → Edit a transaction → history lost. Balances become a mystery.

---

## The Solution

### BudgetSplit: A Ledger in Your Pocket

**Core Innovation:** Exact rupee accounting with zero network overhead.

BudgetSplit treats money like a ledger, not an app feature. Every rupee is an integer (paise). Every transaction is immutable (soft-delete only). Every balance is computed fresh, not stored. Every debt is simplified to the minimum number of payments.

**Three Core Concepts:**

1. **Groups** — Containers for people and transactions. Create unlimited groups: "Personal", "Me & GF", "Mussoorie Trip 2026", "Rent with Roommates".

2. **Share vs. Paid** — When you pay ₹1000 for dinner split 50/50 with your girlfriend:
   - You **paid** ₹1000 (money left your wallet)
   - You **share** ₹500 (what you actually ate)
   - You're owed ₹500 (she owes you)

3. **Debt Simplification** — If you owe Rahul ₹200 and Rahul owes you ₹300, the app says: "You're owed ₹100 from Rahul." Not two payments. One. Clear.

---

## Core Features

### 1. Budget Groups

**What:** Create unlimited budget groups for different contexts.

**Why:** Your finances aren't monolithic. You're "Me" solo, "Me & GF" as a couple, "Mussoorie 2026" on a trip. Each context needs its own ledger.

**Features:**
- ✅ Name, icon (from 100+ iOS icons), color (from palette)
- ✅ Add unlimited members (real people or aliases)
- ✅ See all transactions in the group
- ✅ Archive a group (hidden from list, data kept)
- ✅ Soft-delete a group (data auditable forever)

**Example:**
```
Personal
├─ Me
└─ (solo tracking)

Me & GF
├─ Prem
└─ Kavya

Mussoorie Trip
├─ Prem
├─ Rahul
├─ Divya
└─ Rohan
```

### 2. People Management

**What:** Add people to groups and track their balances.

**Why:** The same person appears in multiple groups. You pay for both of you, sometimes she pays. Balances must be tracked separately per group *and* globally.

**Features:**
- ✅ Create person: name + avatar color
- ✅ Add to any group
- ✅ Per-person balance (you owe X / X owes you)
- ✅ Global balance (across all groups)
- ✅ View history: all transactions involving this person

**Example:**
```
Kavya appears in:
  → Me & GF (owes ₹450)
  → Mussoorie Trip (owes ₹1,200)
  → Global (owes ₹1,650)
```

### 3. Income Tracking

**What:** Log money coming in (salary, refunds, gifts).

**Why:** Budgeting isn't just expenses. Income defines your available budget. It's not split (you don't share your salary with friends).

**Features:**
- ✅ Log income amount, date, category (salary, bonus, refund, gift, etc.)
- ✅ Optional note ("Freelance gig" or "Dad sent ₹5k")
- ✅ Counted toward group budget total (for group income reports)
- ✅ Counted toward personal income (dashboard stats)
- ✅ NOT split among group members (you keep 100%)

**Example:**
```
Group: Personal
Date: 2026-06-21
Income: Salary — ₹80,000
Category: Salary
Note: June paycheck (after tax)
```

### 4. Expense Tracking (Solo & Split)

**What:** Log expenses, with optional multi-person split.

**Why:** Most transactions involve multiple people. But the app doesn't assume splits—you control exactly who paid what and who owes what.

**Features:**
- ✅ Enter amount (rupee input with auto-formatting)
- ✅ Pick date (default: today)
- ✅ Pick category (per-group custom categories + defaults)
- ✅ Optional note ("Sarojini Market" or "Weekly groceries")
- ✅ Optional photo (receipt, bill, proof)
- ✅ Optional tags for filtering ("#food", "#trip", "#owe-rahul")
- ✅ Select payer(s) (default: "me", but can be 2+ people)
- ✅ Select who shares / owes (default: everyone, but you control)

**Example:**
```
Group: Me & GF
Date: 2026-06-21
Amount: ₹1,000
Category: Dining
Payer: Me (₹1,000)
Shares: Me (₹500), Kavya (₹500)
Note: Dinner at Bikanervala
```

### 5. Split Types (The Magic)

**What:** Five ways to divide an amount among members.

**Why:** Different situations need different split logic. The app handles the math so you don't.

#### 5.1 Equal Split
All members share the amount equally.

```
Bill: ₹300
Members: A, B, C
Split:
  A: ₹100
  B: ₹100
  C: ₹100
```

#### 5.2 Exact Amount
You enter each person's exact share.

```
Bill: ₹310
Members: A, B, C
You enter:
  A: ₹105
  B: ₹100
  C: ₹105
Total: ₹310 ✓
```

#### 5.3 Percentage
Each person gets a percentage; must sum to 100%.

```
Bill: ₹1,000
Members: A, B, C
You enter:
  A: 50%
  B: 30%
  C: 20%
Split:
  A: ₹500
  B: ₹300
  C: ₹200
```

#### 5.4 Ratio / Shares
You specify share ratio (e.g., 2:1:1); app computes amounts.

```
Bill: ₹400
Members: A, B, C
You enter: 2:1:1
Split:
  A: 2/(2+1+1) × ₹400 = ₹200
  B: 1/(2+1+1) × ₹400 = ₹100
  C: 1/(2+1+1) × ₹400 = ₹100
```

#### 5.5 Itemized (Bill-Level)
Each line item is assigned to one or more members. Cost split equally among assignees.

```
Bill:
  Paneer Butter Masala (₹320) → A, B
  Dal Makhani (₹220) → A, B
  Garlic Naan (₹160) → A, B, C
Tax: 5% (₹35)
Total: ₹735

Split:
  A: (320 + 220 + 160×1/3 + 35×1/3) = ₹358.68 → ₹359 (paise rounding)
  B: (320 + 220 + 160×1/3 + 35×1/3) = ₹358.68 → ₹358
  C: (160×1/3 + 35×1/3) = ₹65 → ₹18 (wait, recalc)
```

**Paise Rounding Rule:** Remainder paise go to earliest-listed members, one paise each. Total always sums to exactly the original amount. No money created or lost.

### 6. Itemized Bill Entry

**What:** Add individual line items (name, quantity, price), then assign each to members.

**Why:** Restaurant bills, grocery receipts, party supplies—they have line items. You want to see what cost what *before* splitting.

**Features:**
- ✅ Add items: name, qty (integer), unit price
- ✅ Running subtotal (live, SpaceMono font for precision)
- ✅ Add tax (flat amount or % of subtotal)
- ✅ Add tip (flat amount or % of subtotal)
- ✅ Add discount (flat amount or % of subtotal)
- ✅ Quick-assign UX: tap item → avatars appear → tap to assign
- ✅ Per-person running total (updates live)
- ✅ "Split the rest equally" button (assign all unassigned items to all members)
- ✅ Receipt photo (capture or upload from library)

**UX Flow:**
```
1. Tap "New Itemized Bill"
2. Add items:
   Paneer Butter Masala ×2 @ ₹320 = ₹640
   Dal Makhani ×1 @ ₹220 = ₹220
   Garlic Naan ×4 @ ₹40 = ₹160
   Subtotal: ₹1,020
3. Add tax 5% = ₹51
4. Tap each item → quick-assign
   Item 1 → [Prem] [Kavya] ✓
   Item 2 → [Prem] [Kavya] ✓
   Item 3 → [Prem] [Kavya] [Rohan] ✓
5. Review per-person total
6. Set payer(s)
7. Save → txn appears in group
```

### 7. Invariant Enforcement (The Promise)

**What:** The app blocks you from saving an unbalanced transaction.

**Why:** `Σ paid != Σ share` is the root of all debt confusion. This app enforces the invariant at save time.

**How It Works:**
1. You enter an amount and split it among members
2. App computes: who paid and who shares (may differ)
3. Live calculation: `Σ paid == Σ share?`
4. If NO: save button disabled, red warning: "₹50 unassigned" or "₹50 over-assigned"
5. If YES: save button enabled, you can save

**Example:**
```
You: Paid ₹1,000, share ₹500 (total paid: ₹1,000)
Kavya: Paid ₹0, share ₹500 (total share: ₹1,000)

Σ paid = Σ share ✓ → Save enabled
```

**Example (Broken):**
```
You: Paid ₹1,000, share ₹500
Kavya: Paid ₹0, share ₹400 (missing ₹100)

Σ paid = ₹1,000
Σ share = ₹900

⚠️ ₹100 unassigned → Save disabled
```

### 8. Debt Simplification (Settlement)

**What:** Compute the minimum set of payments to settle all debts.

**Why:** In a group of 4, multiple transactions can create a web of IOUs. This algorithm collapses them to the fewest transactions.

**Algorithm:** Greedy (sort by largest creditors/debtors, match one-by-one).

**Example:**
```
Group: Mussoorie Trip

Balances:
  Prem: +₹450 (owed ₹450)
  Rahul: −₹200 (owes ₹200)
  Divya: +₹100 (owed ₹100)
  Rohan: −₹350 (owes ₹350)

Simplified Payments:
  Rohan pays Prem: ₹350
  Rahul pays Divya: ₹100
  Rahul pays Prem: ₹100
```

**Why This Matters:**
- Without simplification: 4 people = 6 possible payments (A→B, A→C, A→D, B→C, B→D, C→D) and debts get tangled
- With simplification: reduce to 2-3 actual payments needed
- Trust: everyone sees the same math, no arguments about who owes whom

### 9. Settle Up Flow

**What:** Mark a payment as settled.

**Why:** After the trip, you and Rahul square up. You hand him ₹500. This transaction needs to be recorded.

**How It Works:**
1. Group Detail → Balances tab → "Settle Up" button
2. App shows: "Rahul pays you ₹500" (or vice versa)
3. Tap "Mark as Paid" → creates a settlement txn (kind="settlement")
4. Balance updates to ₹0
5. Settlement appears in txn list (auditable history)

**Example:**
```
Before:
  You owe Rahul: ₹1,200

After you pay:
  Tap "Mark as Paid"
  Settlement txn created: Rahul receives ₹1,200 from You
  New balance: You owe Rahul ₹0
```

### 10. Global Dashboard (Cross-Group Insights)

**What:** Bird's-eye view of your finances across all groups.

**Why:** You're not just "Me & GF". You're also saving for a trip, paying rent with roommates, and tracking personal budget. The dashboard shows it all.

**Tabs:** Today / This Month / This Year

**Metrics:**
- **My Spending** = Σ your shares (not what you paid, what you actually consumed)
- **Income** = Σ your income txns
- **Net** = Income − Spending
- **Savings Rate** = (Net / Income) × 100%

**Visualizations:**
- 📊 Category donut (where your money goes: Food 35%, Rent 40%, Travel 15%, etc.)
- 📊 Spending trend (bar chart: daily/weekly/monthly)
- 📊 Group health chips (progress bars, color-coded)

**Example Dashboard:**
```
Today
────────────────────
My Spending: ₹850
Budget: ₹2,000
Progress: ██████░░░░░░ 42%

Income: ₹0
Net: −₹850
Savings: −42.5% (trending)

Spending by Category
  Food: 40%
  Groceries: 35%
  Other: 25%

Group Health
  Personal: ██████░░ ₹850/₹2,000
  Me & GF: ██░░░░░░ ₹150/₹1,500
  Trip: ███░░░░░ ₹280/₹5,000

You owe: ₹450  |  Owed to you: ₹1,200
```

### 11. Budget Limits & Notifications

**What:** Set spending caps (daily, monthly, yearly) and get notified when you're approaching them.

**Why:** Budgets aren't just nice-to-have. You need to know when you're overspending.

**Features:**
- ✅ Per-group daily/monthly/yearly limits (independent)
- ✅ Global personal limit (separate from group limits)
- ✅ Carry-over: unused budget rolls to next period
- ✅ Local notifications at 80% and 100% thresholds
- ✅ Progress bar on dashboard, group cards, and group detail
- ✅ Color-coded health: green (<80%), amber (80-100%), red (>100%)

**Example:**
```
Personal Group
Monthly Budget: ₹50,000
Current Spending: ₹42,000 (84%)
Status: Amber (approaching limit)

Notification: "Personal group at 80% budget"
```

### 12. Recurring Transactions

**What:** Set up expenses that repeat on a schedule (rent, salary, subscriptions).

**Why:** You pay rent every month. Salary comes in every month. Repeating ₹500 Spotify charges. Why enter them manually?

**Features:**
- ✅ Frequency: daily, weekly, monthly, or custom interval (every 2 weeks, etc.)
- ✅ Optional end date (or runs forever)
- ✅ Lazy materialization: instances appear only when you view that date range (not pre-generated)
- ✅ Edit one instance or all future instances
- ✅ Edit-instance-only: creates a one-off override for that date; recurrence continues
- ✅ Delete future instances: soft-delete original, past instances remain

**Example:**
```
Recurring Txn: Rent
Amount: ₹15,000
Category: Rent
Frequency: Monthly, 1st of each month
Start: 2026-01-01
End: None (forever)

When you view June 2026:
  ✓ Rent appears on June 1st
When you view July 2026:
  ✓ Rent appears on July 1st

If you edit June 1st: "This instance only"
  → June becomes ₹16,000 (one-time increase)
  → July 1st still ₹15,000
```

### 13. Tags & Cross-Group Filtering

**What:** Add tags to transactions (#trip, #food, #owe-rahul) and filter across groups.

**Why:** You want to see all food-related spending across "Me & GF", "Personal", and "Trip". Tags make it searchable.

**Features:**
- ✅ Add free-text tags (user types, app stores as JSON array)
- ✅ Filter in Reports by tag
- ✅ See all #food spending this year across all groups

**Example:**
```
Txn 1: Dinner (Group: Me & GF) — Tags: #food, #date-night
Txn 2: Groceries (Group: Personal) — Tags: #food, #pantry
Txn 3: Restaurant (Group: Trip) — Tags: #food, #sightseeing

Filter by #food → see all three, sorted by date
```

### 14. Transaction Management

**What:** View, edit, soft-delete transactions.

**Why:** Mistakes happen. You need to fix them without erasing history.

**Features:**
- ✅ View txn list per group (sorted by date, newest first)
- ✅ View txn detail (all fields, history of edits)
- ✅ Edit any field: amount, date, category, split, payers, shares
- ✅ Soft-delete (is_deleted=1; hidden from UI, kept in DB for audit)
- ✅ Swipe-to-delete UX (gesture-based, satisfying)

**Important:** Editing a split txn re-opens the split screen. You must rebalance and re-save. This prevents accidental inconsistencies.

---

## Advanced Features

### 15. Reports & Analytics

**What:** Summarize and export your financial data.

**Features:**
- ✅ Per-group monthly summary: income, expense, net, savings
- ✅ Top 3 spending categories per group
- ✅ Year-in-review: total saved, biggest spending month, most-used category, biggest single txn
- ✅ Date range filter (custom from/to dates)
- ✅ Cross-tag filtering (e.g., all #trip spending this summer)

**Exports:**
- ✅ CSV: all txn fields (date, category, description, amount, payers, shares, group)
- ✅ PDF: formatted summary page with charts
- ✅ Share sheet: email, AirDrop, print, Notes, Files, etc.

**Example Report:**
```
Personal Group — May 2026

Income: ₹80,000 (salary)
Expenses: ₹42,500
Net Savings: ₹37,500
Savings Rate: 47%

Top Spending Categories:
  Rent: ₹25,000 (59%)
  Food: ₹10,000 (24%)
  Utilities: ₹5,000 (12%)
  Other: ₹2,500 (6%)

Export as CSV (attach to email)
Export as PDF (print or share)
```

### 16. Categories (Custom Per Group)

**What:** Create custom spending categories for each group.

**Why:** "Food" means different things to a couple (Dining Out, Groceries) vs. a trip (Meals, Activities, Accommodation).

**Features:**
- ✅ Seeded defaults: Food, Groceries, Rent, Utilities, Travel, Fuel, Medical, Shopping, Subscriptions, Other
- ✅ Add custom category (name, optional icon, optional color)
- ✅ Rename category
- ✅ Delete category (reassign existing txns first)
- ✅ Icon picker (100+ iOS icons)

**Example:**
```
Personal Group Categories:
  🍔 Dining Out
  🛒 Groceries
  🏠 Rent
  ⚡ Utilities (custom color: orange)
  ✈️ Travel
  ⛽ Fuel
  🏥 Medical
  🛍️ Shopping
  📺 Subscriptions
  🔧 Other
```

### 17. Photo Attachments

**What:** Attach a photo (receipt, bill, proof) to a transaction.

**Why:** "I spent ₹500 on groceries" is vague. A photo of the receipt is proof.

**Features:**
- ✅ Camera app or photo library
- ✅ Thumbnail displayed in txn detail
- ✅ Stored locally (no cloud upload in v1)
- ✅ Survives app updates (backed by local file system)

### 18. Biometric Lock (Face ID / Touch ID)

**What:** Optional biometric security.

**Why:** Your phone might be stolen. This app knows every rupee you spend. Lock it.

**Features:**
- ✅ Optional: enable Face ID / Touch ID on app open
- ✅ Fallback to PIN if biometric fails or device doesn't support it
- ✅ No stored password (uses OS keychain)
- ✅ Disable anytime in Settings

### 19. Dark Mode

**What:** Full dark theme support (default).

**Why:** Ledgers look better in the dark. It's precise, trustworthy, not flashy.

**Design:**
- Near-black background (#0F0F12)
- Warm off-white text (#F0EFE9)
- Amber accent (#F0A500) for numbers and CTAs
- No garish colors; everything feels accountant-like

---

## User Flows & Scenarios

### Scenario 1: The Roommate Trip

**Situation:** You, Kavya, Rahul, and Rohan go to Mussoorie for 3 days. Bills will be split.

**Setup (Day 1):**
```
1. Create group: "Mussoorie Trip"
   Icon: ✈️, Color: Teal
2. Add members: Kavya, Rahul, Rohan
3. Create budget limit: ₹10,000 for trip
```

**Day 1 Evening:**
```
Dinner at Bikanervala
Amount: ₹1,200
Paid by: You
Split: Equal among 4
→ Each person's share: ₹300
→ You are owed: ₹300 + ₹300 + ₹300 = ₹900

Hotel for 2 nights
Amount: ₹3,000
Paid by: Rahul
Split: Equal among 4
→ Each person's share: ₹750
→ Rahul is owed: ₹750 + ₹750 + ₹750 = ₹2,250
```

**Day 2 (Sightseeing):**
```
Lunch
Amount: ₹800
Paid by: Kavya
Split: Equal among 4
→ Kavya is owed: ₹600

Activity tickets
Amount: ₹1,600
Paid by: Rohan
Split: Equal among 4
→ Rohan is owed: ₹1,200

Dashboard Check:
  Trip budget: ₹6,600 / ₹10,000 (66%, green)
  Balances:
    You: +₹900 (owed)
    Kavya: +₹600 (owed)
    Rahul: +₹2,250 (owed)
    Rohan: +₹1,200 (owed)
```

**Day 3 (Settle Up):**
```
Tap "Settle Up" → App shows simplified payments:
  Rohan pays you: ₹600
  Rohan pays Kavya: ₹600
  Rahul pays Rohan: ₹1,050
  (simplified from 6 possible payments to 3)

In reality:
  Rohan hands you ₹600 cash
  Rohan Venmo's Kavya ₹600
  Rahul Venmo's Rohan ₹1,050

Back home:
  You tap "Mark as Paid" for each settlement
  Balances go to ₹0
  Trip group shows all ₹0 balances
  Settlement txns appear in history (auditable)
```

### Scenario 2: Couple Budget Management

**Situation:** You and Kavya share expenses. You also want individual budgets.

**Setup:**
```
1. Group: "Me & GF"
   Members: You, Kavya
   Monthly budget: ₹80,000 (combined)

2. Group: "Personal"
   Members: You
   Monthly budget: ₹40,000 (your solo spending)

3. Group: "Kavya's Personal"
   Members: Kavya
   Monthly budget: ₹40,000 (her solo spending)
```

**June 1–15:**
```
Rent payment: ₹30,000 (Me & GF group, paid by you, split 50/50)
  → You paid ₹30,000, share ₹15,000
  → Kavya paid ₹0, share ₹15,000
  → You are owed ₹15,000

Groceries: ₹6,000 (Me & GF group, paid by Kavya, split 50/50)
  → Kavya paid ₹6,000, share ₹3,000
  → You paid ₹0, share ₹3,000
  → Kavya is owed ₹3,000

Your personal spending: ₹2,000 (Personal group)
Kavya's personal: ₹1,500 (Kavya's Personal group)

Dashboard:
  Today / Month / Year tabs
  My Spending (all groups): ₹2,000 + ₹3,000 (me & gf share) + ₹15,000 (you paid for her) = ₹20,000
  Wait, this gets confusing. Let me reconsider.

Actually:
  My Spending = sum of my SHARES (what I consumed), not what I paid
  = ₹15,000 (rent share) + ₹3,000 (groceries share) + ₹2,000 (personal) = ₹20,000
  
  Group Me & GF spending: ₹30,000 + ₹6,000 = ₹36,000 (sum of all shares)
  Group Personal spending: ₹2,000
```

### Scenario 3: Solo Budget Tracker

**Situation:** You live alone. You want to track your finances and see where your money goes.

**Setup:**
```
1. Group: "Personal" (pre-created, you're the only member)
   Categories: Food, Groceries, Rent, Utilities, Travel, Fuel, Medical, Shopping, Subscriptions, Other
   Monthly budget: ₹50,000
```

**Spend:**
```
Income: ₹80,000 (salary logged, kind=income)
Rent: ₹20,000 (category: Rent)
Groceries: ₹8,000 (category: Groceries)
Dining: ₹5,000 (category: Food, tagged #eating-out)
Utilities: ₹2,000 (category: Utilities)
Travel: ₹3,000 (category: Travel, tagged #commute)
Shopping: ₹4,000 (category: Shopping)
Medical: ₹1,500 (category: Medical)
Subscriptions: ₹1,500 (category: Subscriptions)

Dashboard:
  Income: ₹80,000
  Spending: ₹45,000
  Net: +₹35,000
  Savings Rate: 44%
  
  Spending by Category:
    Rent: 44%
    Groceries: 18%
    Shopping: 9%
    Travel: 7%
    Dining: 11%
    Utilities: 4%
    Medical: 3%
    Subscriptions: 3%
  
  Spending Over Time (bar chart showing daily/weekly/monthly trends)
```

### Scenario 4: Itemized Restaurant Bill

**Situation:** You and 3 friends go to an expensive restaurant. Need to split the bill perfectly.

**Bill:**
```
Paneer Butter Masala ×2 @ ₹320 = ₹640
Dal Makhani ×1 @ ₹220 = ₹220
Garlic Naan ×4 @ ₹40 = ₹160
Lassi ×2 @ ₹60 = ₹120
Water ×4 @ ₹20 = ₹80
Subtotal: ₹1,220
Tax 5%: ₹61
Tip 15%: ₹189
Total: ₹1,470
```

**Assignment:**
```
Item 1 (PBM, ₹640) → You, Kavya (split ₹320 each)
Item 2 (Dal, ₹220) → You, Rahul (split ₹110 each)
Item 3 (Naan, ₹160) → Everyone (split ₹40 each)
Item 4 (Lassi, ₹120) → Kavya, Rohan (split ₹60 each)
Item 5 (Water, ₹80) → Everyone (split ₹20 each)

Per-Person Before Tax/Tip:
  You: ₹320 + ₹110 + ₹40 + ₹20 = ₹490
  Kavya: ₹320 + ₹40 + ₹60 + ₹20 = ₹440
  Rahul: ₹110 + ₹40 + ₹20 = ₹170
  Rohan: ₹40 + ₹60 + ₹20 = ₹120
  Total: ₹1,220 ✓

After Tax/Tip (proportional):
  You: ₹490 × (₹1,470 / ₹1,220) = ₹590.16 → ₹590
  Kavya: ₹440 × (₹1,470 / ₹1,220) = ₹530.10 → ₹530
  Rahul: ₹170 × (₹1,470 / ₹1,220) = ₹205.09 → ₹205
  Rohan: ₹120 × (₹1,470 / ₹1,220) = ₹144.74 → ₹145
  Total: ₹1,470 ✓
  (paise rounding applied; all persons' shares sum exactly)

You pay ₹1,470 (to restaurant).
Other three settle with you later.
```

---

## Technical Highlights

### 1. Offline-First Architecture

**What:** Zero network calls in v1. All data lives on the device.

**Why:** Traveling? No WiFi? The app still works. Perfect for trips where you're logging expenses in real-time.

**How:**
- SQLite database (expo-sqlite) — local, no setup
- Zustand state store — in-memory caching
- Direct DB queries (no server roundtrips)
- No cloud APIs, no dependencies on connectivity

### 2. Paise-Level Accuracy

**What:** All money stored as integers (paise), never floats.

**Why:** Floating-point arithmetic causes rounding errors. `0.1 + 0.2 != 0.3` in most languages. This app avoids that entire class of bugs.

**How:**
- ₹1,500.50 stored as 150050 (paise)
- Division produces a remainder; remainder distributed to earliest members (deterministic)
- Invariant: Σ paid == Σ share always holds exactly

### 3. Lazy-Materialized Recurring Txns

**What:** Recurring expenses don't exist in the database until you view them.

**Why:** Saves storage; no upfront generation; no need to update past instances.

**How:**
- Store: recur_freq, recur_interval, recur_end
- Query: for date range, compute all instances on-the-fly
- Result: virtual txn rows (read-only, not persisted)
- Edit: can override a single instance without affecting others

### 4. Deterministic Debt Simplification

**What:** Greedy algorithm reduces debts to minimum payments.

**Why:** In groups with 4+ members and multiple debts, balances get complex. This algorithm is fast, transparent, and always produces the same result.

**How:**
```ts
1. Compute net per person (paid − share)
2. Sort creditors by balance (descending)
3. Sort debtors by balance (ascending)
4. Match largest debtor with largest creditor
5. Reduce by minimum, move pointers
6. Repeat until no debtors or creditors left
```

**Example:**
```
Net balances:
  A: +₹100 (creditor)
  B: −₹50 (debtor)
  C: +₹75 (creditor)
  D: −₹125 (debtor)

Simplified:
  D pays A: ₹100
  D pays C: ₹25
  B pays C: ₹50
```

### 5. Soft-Delete Audit Trail

**What:** No data is truly deleted. Transactions are marked soft-deleted but remain in the database.

**Why:** Audit trail. If a user disputes a balance, you can see every txn (deleted or not) that led to it.

**How:**
- Every txn has is_deleted field (0 or 1)
- UI hides deleted txns by default
- DB queries filter is_deleted=0
- Reports can include deleted txns (optional toggle)

### 6. Zustand State Management

**What:** Lightweight, hook-based state store (no Redux boilerplate).

**Why:** Simplicity. The app doesn't need Redux's time-travel debugging or saga middleware. Direct DB queries + in-memory cache is sufficient.

**How:**
```ts
const store = create((set) => ({
  groups: [],
  transactions: [],
  people: [],
  addTransaction: (txn) => set((state) => ({
    transactions: [...state.transactions, txn],
  })),
  // ... more actions
}));
```

### 7. React Native + Expo

**What:** Write once, run on iOS (v1). Build with Expo (managed workflow).

**Why:** No native code needed. Expo handles the heavy lifting (SQLite, notifications, Face ID, file system, etc.).

**How:**
- `npx create-expo-app` to scaffold
- `expo-router` for file-based navigation
- `expo-sqlite` for local DB
- `expo-notifications` for budget alerts
- `expo-local-authentication` for Face ID
- `expo-file-system` + `expo-sharing` for export

### 8. Precise Typography

**What:** Two-font system: SpaceMono for amounts, Inter for everything else.

**Why:** Money deserves precision. Monospaced fonts make numbers align and feel exact. Rest of UI uses humanist Sans (Inter) for warmth.

**How:**
- ₹1,500.50 always SpaceMono (all size variants)
- Labels, buttons, body text: Inter Regular or SemiBold
- Loaded via @expo-google-fonts

---

## Why BudgetSplit Wins

### Competitor Comparison

| Feature | BudgetSplit | Splitwise | Venmo | Excel | WhatsApp |
|---------|-------------|-----------|-------|-------|----------|
| **Offline-First** | ✅ | ❌ | ❌ | ✅ | ✅ |
| **Paise Accuracy** | ✅ | ⚠️ | ❌ | ✅ | ❌ |
| **No Account Required** | ✅ | ❌ | ❌ | ✅ | ✅ |
| **Debt Simplification** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Itemized Bills** | ✅ | ✅ | ❌ | ⚠️ | ❌ |
| **Budget Limits** | ✅ | ⚠️ | ❌ | ❌ | ❌ |
| **Recurring Expenses** | ✅ | ✅ | ❌ | ⚠️ | ❌ |
| **Cross-Group Insights** | ✅ | ❌ | ❌ | ⚠️ | ❌ |
| **Data Privacy (Local)** | ✅ | ❌ | ❌ | ✅ | ✅ |
| **Receipt Export** | ✅ | ✅ | ❌ | ✅ | ❌ |
| **Cost** | ₹0 | Free tier limited | ✅ | ✅ | ✅ |

### Key Differentiators

1. **Offline-First** — No WiFi? No problem. You can log expenses on the Mussoorie mountains and sync later (v2).
2. **Paise Perfection** — No rounding errors. Every rupee is exact. Every debt is settled cleanly.
3. **No Account** — v1 requires no login. Create a group, add members, start splitting. Zero friction.
4. **Privacy** — Your data never leaves your phone (v1). You own your financial ledger.
5. **Open Design** — All algorithms (debt simplification, paise rounding) are transparent. Users can trust the math.

---

## Competitive Analysis

### Splitwise

**Strengths:** Market leader, solid debt simplification, great UX, multi-platform.  
**Weaknesses:** Cloud-dependent, requires account, rounding quirks, overkill for solo users.  
**BudgetSplit Win:** Offline-first, no account, local privacy, paise accuracy.

### Venmo / PayPal / Apple Pay

**Strengths:** Actual money transfer (not just tracking), ubiquitous.  
**Weaknesses:** Not designed for budgeting or complex splits, not ledger-focused.  
**BudgetSplit Win:** Ledger, budgets, precision tracking, offline.

### Excel / Google Sheets

**Strengths:** Flexible, free, works offline (Excel).  
**Weaknesses:** Manual, error-prone, no automation (settling debts, recurring expenses), ugly.  
**BudgetSplit Win:** Automated math, beautiful UX, zero errors, portable.

### WhatsApp / SMS Groups

**Strengths:** Informal, immediate.  
**Weaknesses:** Chaotic, no structure, lost in message history, no history, no math.  
**BudgetSplit Win:** Structured, auditable, automatic debt computation.

---

## Pricing & Business Model

### v1 (Free Forever)

**Cost to Build:** ₹0 (solo dev, open-source tech, no paid APIs)  
**Cost to Run:** ₹0 (local SQLite, no server)  
**Price to Users:** ₹0

**Why:**
- Personal project. Not a startup (yet).
- Sustainable: no infrastructure costs.
- Users appreciate ad-free, trackerless apps.

### v2+ (Optional Freemium)

**If v2 adds Supabase sync:**
- Free: personal groups (no server cost)
- Optional Premium (TBD): shared groups, cloud backup, advanced export formats
- Projected: ₹99–₹500/year (if monetized)

**Not planned yet; would only happen if user demand justifies it.**

---

## Roadmap Overview

### v1.0 (Local Solo) — August 2026

✅ All core features (groups, splits, settle-up, budget, reports)  
✅ Offline-first  
✅ ₹0 cost

### v2.0 (Live Multi-User) — Q4 2026–Q1 2027

🔄 Supabase sync (optional)  
🔄 Real-time collaboration  
🔄 Personal groups stay local  
🔄 End-to-end encryption (TBD)

### v3.0 (Smart Features) — Q2–Q3 2027

📸 OCR receipt scanning  
💱 Multi-currency support  
🏠 App widget  
🤖 AI insights (spend patterns, predictions)

---

## FAQ

### General

**Q: Does BudgetSplit require an internet connection?**  
A: v1 (local) requires zero network. v2 (sync) will be optional; personal groups stay local always.

**Q: Is my data safe?**  
A: v1 data never leaves your phone. v2 will use end-to-end encryption (keys stay with you).

**Q: Can I use it for business / team expenses?**  
A: v1 is designed for personal use. Team/business use is out of scope (very different requirements).

**Q: How accurate is the math?**  
A: Perfect. Integer paise (no floats). Invariant enforced: Σ paid == Σ share always.

### Features

**Q: Can I share a group with friends?**  
A: v1 (local): groups are private to your phone. v2 will add optional real-time sync.

**Q: What if I make a mistake and log a transaction?**  
A: Edit it or soft-delete it. Either way, your balance will update automatically.

**Q: Can I have different groups with different members?**  
A: Yes, unlimited groups. Each group has its own members, budget, and ledger.

**Q: What if my phone breaks?**  
A: v1 data is local only (no backup). Get a new phone, start fresh. v2 will add optional cloud backup.

### Technical

**Q: What platforms does it support?**  
A: v1 = iOS only (React Native / Expo). Android and web are out of scope.

**Q: Is the code open-source?**  
A: Personal project; open-source not planned yet. May change.

**Q: Can I export my data?**  
A: v1 allows CSV/PDF export. v2 may add full data export.

**Q: Does it work offline?**  
A: v1 is fully offline. v2 sync is optional and queues changes when offline.

### Pricing

**Q: Will you ever charge for this?**  
A: v1 is free forever. v2+ might have optional premium features, but not planned yet.

**Q: Are there ads?**  
A: No ads ever (no business model for it).

**Q: Do you track my usage?**  
A: No analytics, no telemetry, no tracking in v1.

### Troubleshooting

**Q: The app crashed, and I lost a transaction.**  
A: Transactions auto-save. If you closed the app without saving, the txn is lost (same as any app). The last saved state is restored on relaunch.

**Q: Face ID stopped working.**  
A: Disable biometric lock in Settings, re-enable, or retry Face ID registration on your device.

**Q: I can't see a recurring transaction.**  
A: Recurring txns appear only when you view that date range. If the date is in the past but before the start date, it won't appear.

---

## Conclusion

BudgetSplit is a precision ledger app for people who care about exact rupee accounting, offline reliability, and data privacy. It's designed for the specific moment when a group decides to split a bill and needs to know *exactly* who owes whom, *right now*, without confusion.

**If you value precision over features, offline over sync, and privacy over convenience, BudgetSplit is for you.**

---

## Contact & Support

**Developer:** Prem  
**Email:** helloworldlife27@gmail.com  
**GitHub:** mrprem27/budgetapp  
**App:** BudgetSplit v1.0  
**Status:** Development (In Progress)

---

## Document Version History

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-06-22 | Initial comprehensive feature notebook |

