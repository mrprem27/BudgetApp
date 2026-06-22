# BudgetSplit — Build Plan (v1, Revised Architecture)

**Status:** Ready to build  
**Target User:** One person managing 1–4 groups, all on one phone, no accounts  
**Target Ship Date:** ~8 weeks from M0 start  
**Tech Stack:** React Native (Expo 56), SQLite local (expo-sqlite), Zustand, expo-router  

---

## Overview

This plan builds BudgetSplit from scratch following REVISED_ARCHITECTURE.md, not the full Spec.

**Revised Scope:** 10 core features, 5 milestones, 3 tabs, no settle-up screen, no lazy-materialized recurring, no multi-step split types.

**Key Constraints:**
- Zero network calls (fully offline)
- One user per device
- Groups are local, shared manually (no sync in v1)
- All money is integer paise (₹1 = 100 paise)
- Hard invariant: `Σ paid == Σ share` on every transaction

---

## M0: Environment & Spike (1 week)

**Risk:** This is the blocker. Without Xcode + dev build, the app doesn't exist.

### M0-1: iOS Environment Setup
- [ ] Install Xcode (latest)
- [ ] Configure Apple ID (free or paid, must allow app signing)
- [ ] `npx expo run:ios` succeeds on physical device or simulator
- [ ] Verify `expo-sqlite` loads and basic module works

**Deliverable:** One working dev build on device, logs showing SQLite is available.

**Effort:** 1–3 days (depends on Xcode install time and Apple ID friction)

### M0-2: Database Spike
- [ ] Create minimal `src/db/schema.ts` with 3 tables: `person`, `budget_group`, `transaction`
- [ ] Create `src/db/init.ts` to initialize DB on first launch
- [ ] Write one transaction to SQLite, read it back, log result
- [ ] Test app reload — verify data persists

**Deliverable:** Working SQLite DB with a test row, proof of persistence.

**Effort:** 2–3 days

### M0-3: Navigation Spike
- [ ] Set up `expo-router` with basic tab structure (Home, Reports [stub], Settings)
- [ ] FAB navigation: Add Expense, Add Income
- [ ] Verify routing works (tabs, FAB, modals)

**Deliverable:** App skeleton with nav, no data yet.

**Effort:** 1 day

---

## M1: Core Data Model (1.5 weeks)

### M1-1: Complete Database Schema
**File:** `src/db/schema.ts` (follow Spec §3, adapted to v1 scope)

```sql
person (id, name, avatar_color, is_me, created_at, updated_at)
budget_group (id, name, icon, monthly_limit, is_archived, created_at, updated_at)
group_member (person_id, group_id, joined_at)
transaction (id, group_id, payer_id, amount_paise, category, date, note, is_deleted, created_at, updated_at)
txn_share (transaction_id, person_id, share_paise, created_at)
```

**Key decision:** Keep the `txn_share` table even though v1 won't use settle-up. It's correct and future-compatible.

**Tests:**
- Schema initializes without error
- Each table has expected columns
- Foreign key constraints work (or explicit null handling if SQLite doesn't support)

**Effort:** 2–3 days

### M1-2: Seed Data & First-Launch Flow
**File:** `src/db/seed.ts`

Initialize on first app launch with:
- One "Me" person (the device owner)
- One "Personal" group
- 10 common expense categories (food, travel, entertainment, etc.)

**Screens:**
- Onboarding modal on app launch (if first time): "Welcome to BudgetSplit. Add some people you split with."
- Button to "Complete Setup" → Home

**Effort:** 2–3 days

### M1-3: Money Utilities
**Files:** `src/lib/money.ts` (integer paise handling)

Functions:
- `parseToPaise(₹amount: number): number` — 123.45 → 12345
- `formatRupees(paise: number): string` — 12345 → "₹123.45"
- `splitEqual(paise: number, count: number): number[]` — split 12000 equally among 3 → [4000, 4000, 4000]
- `splitRound(amounts: number[]): number[]` — ensure sum matches total (rounding fix)

**Tests:**
- `parseToPaise(100) == 10000`
- `formatRupees(10000) == "₹100.00"`
- `splitEqual(12000, 3) == [4000, 4000, 4000]` ✓
- `splitEqual(12001, 3) == [4001, 4000, 4000]` ✓ (first person absorbs rounding)

**Effort:** 1 day

---

## M2: Transactions & Split (2 weeks)

### M2-1: Database Queries
**File:** `src/db/queries/transaction.ts`

Functions:
- `createTransaction(groupId, payerId, amount, category, shares: [{personId, sharePaise}])` → transactionId
  - Validate: `Σ shares == amount` (hard invariant)
  - Write in transaction (db.withTransactionAsync)
  - Return transaction ID
- `getTransaction(id)` → {id, payer, amount, shares[]}
- `updateTransaction(id, {amount?, category?, shares[]?})` → apply invariant check
- `deleteTransaction(id)` → soft delete (set is_deleted=1)
- `getGroupTransactions(groupId, dateRange)` → ordered list

**Tests:**
- Can create transaction with valid shares
- Cannot create with invalid shares (sum mismatch)
- Delete marks is_deleted=1, not removed
- Queries return correct data

**Effort:** 3–4 days

### M2-2: Balance Calculations
**File:** `src/lib/balance.ts`

Functions:
- `getPersonBalanceInGroup(groupId, personId): {paid, share, net}` → from transaction data
  - `paid = Σ paid by this person`
  - `share = Σ share of this person`
  - `net = paid - share` (positive = owed to, negative = owes)
- `simplifyBalances(groupId): [{from, to, amount}]` → greedy debt reduction
  - For v1: if 2 people, just return the net balance
  - For 3+: use greedy algorithm (keep it simple, not production-perfect)

**Tests:**
- You pay 1000 for dinner, split 50/50 with GF → your net = +500
- GF's net = -500
- Three-way split settles correctly

**Effort:** 2–3 days

### M2-3: Add Expense Flow
**Screen:** `app/add/expense.tsx` (unified form, not split into quick/itemized/transfer)

State:
- Basic: amount, category, date, note
- Payer: who paid? (picker)
- Split: how to split? (Equal / Exact / Itemized)
  - Equal: automatically distribute to all group members
  - Exact: manually enter each person's share
  - Itemized: toggle on, show line items, assign items to people, system calculates shares

Flow:
1. Enter amount
2. Pick category + date + note
3. Pick payer
4. Choose split type (buttons: Equal / Exact / Itemize)
5. Enter split details
6. Review & save (validate invariant)

**Screens:**
- `app/add/expense.tsx` — main form
- `src/components/finance/SplitEqual.tsx` — show "Split equally among X people: ₹Y each"
- `src/components/finance/SplitExact.tsx` — manual entry rows
- `src/components/finance/SplitItemized.tsx` — line items + assignment

**Validation:**
- Amount > 0
- Invariant check: `Σ shares == amount`
- Live error feedback (red text, disabled save button)

**Effort:** 4–5 days

### M2-4: Add Income Flow
**Screen:** `app/add/income.tsx`

Simple form:
- Amount
- Source (category picker)
- Date
- Note

Single person (the "Me" person) receives the full amount.

**Effort:** 1 day

---

## M3: Home & Navigation (1.5 weeks)

### M3-1: Home Screen (merged Dashboard + Groups)
**Screen:** `app/(tabs)/index.tsx`

Layout:
```
Hero section
├─ "Your share this month: ₹12,345"       ← labeled, tappable for paid vs. share split
├─ "Income ₹50,000 · Net ₹-5,000 · Savings 10%"
└─ Category donut (tap → expand to list)

Groups section
├─ "GROUPS" (section header)
├─ [Group card 1]
│  ├─ Icon + name
│  ├─ Budget bar (used/limit)
│  └─ Your balance (if > 0: "+₹500 owed to you")
├─ [Group card 2]
├─ ...
└─ [Add group button]
```

**Components:**
- `AmountText` (hero amount, SpaceMono_400Regular, 40px)
- `StatRow` (Income, Net, Savings%)
- `CategoryDonut` (pie chart or donut)
- `GroupCard` (reusable, with budget bar)

**Queries:**
- `getMyTotalShareThisMonth()`
- `getMyTotalPaidThisMonth()`
- `getMyIncomeThisMonth()`
- `getGroupsList()` → array of {id, name, icon, limit, balance for me}
- `getCategoryBreakdown()` → {category, amount, percent}

**Effort:** 3–4 days

### M3-2: Group Detail Screen
**Screen:** `app/group/[id].tsx`

Tabs: (2 tabs only)
1. **Transactions** — list of all expenses, tap to detail
2. **Settings** — budget, members, recurring button

Sub-screens:
- `app/group/[id]/settings.tsx` — manage budget limit, add/remove members
- `app/txn/[id].tsx` — detail view, edit, delete

**Effort:** 3–4 days

### M3-3: Settings Tab
**Screen:** `app/(tabs)/settings.tsx`

Sections:
- **Profile:** name, avatar color
- **Money:** global monthly limit, currency (read-only for v1)
- **Help:** version, about
- **Manage categories** → `app/settings/categories.tsx`
- **Debug/Testing:** reset app (nuke all data), show DB size

**Effort:** 2 days

### M3-4: FAB Navigation
**Component:** `src/components/finance/FAB.tsx`

Two options:
- Add Expense → `app/add/expense`
- Add Income → `app/add/income`

No transfer in v1 (it's just a split to one person).

**Effort:** 1 day

---

## M4: Budget & Constraints (1 week)

### M4-1: Budget Tracking
**File:** `src/lib/budget.ts`

Functions:
- `getGroupBudget(groupId, month): {limit, used, remaining, percent}`
  - limit = from budget_group.monthly_limit
  - used = Σ paid in this month
  - remaining = limit - used
  - percent = used / limit * 100
- `checkBudgetStatus(groupId): "ok" | "warning" | "exceeded"`
  - warning: > 80%
  - exceeded: > 100%

**Warnings:**
- When adding a transaction that exceeds budget, show warning modal
- Still allow save (don't block)

**Effort:** 1–2 days

### M4-2: Budget Management Screen
**Screen:** `app/group/[id]/settings.tsx` (part of M3-2)

Form:
- Monthly limit (input, paise)
- Global limit toggle (if enabled, sum of all group limits can't exceed global limit)

Save validation:
- Limit > 0
- If global limit set: sum of group limits ≤ global limit

**Effort:** 1–2 days

---

## M5: Polish & Testing (1 week)

### M5-1: Design System Compliance
- [ ] All screens follow AGENTS.md rules (spacing, colors, typography)
- [ ] All buttons are 52px height, 12px radius
- [ ] All touch targets ≥ 44pt
- [ ] Empty states all follow pattern (icon + title + description + CTA)
- [ ] Cards use consistent styling
- [ ] Animations: PressableScale on tappables, FadeIn on lists

**Effort:** 2–3 days

### M5-2: Error Handling & Edge Cases
- [ ] DB query failures show error state (not crash)
- [ ] Invalid input prevents save (not submit-and-fail)
- [ ] Soft delete confirmed (can undo? defer to v1.1)
- [ ] Group member removal clears their transactions (or archive group?)
- [ ] Negative balances display correctly
- [ ] Very large numbers format without overflow

**Effort:** 2 days

### M5-3: Performance & Polish
- [ ] Screen load time < 1s
- [ ] Taps respond < 200ms
- [ ] List scroll is smooth (memoize components)
- [ ] No console errors or warnings
- [ ] No TypeScript errors

**Effort:** 2 days

### M5-4: Testing
- [ ] Unit tests: money.ts (100% coverage), balance.ts, budget.ts
- [ ] Integration: transaction create → queries → UI updates correctly
- [ ] E2E: add expense flow, verify appears in home
- [ ] Target: 80+ test pass rate

**Effort:** 3 days

---

## Implementation Checklist

### M0 (1 week)
- [ ] Xcode + dev build working on device
- [ ] SQLite spike: write and read one row
- [ ] expo-router nav skeleton (3 tabs, FAB)

### M1 (1.5 weeks)
- [ ] Full schema defined and tested
- [ ] Seed data (Me, Personal group, categories)
- [ ] Onboarding modal on first launch
- [ ] Money utilities (paise conversion, split, format)

### M2 (2 weeks)
- [ ] Transaction queries (create, get, update, delete)
- [ ] Balance calculations (paid, share, net)
- [ ] Debt simplification (greedy, 2+ person groups)
- [ ] Add Expense form (Equal / Exact / Itemized)
- [ ] Add Income form
- [ ] Transaction detail screen
- [ ] Split validation (invariant check)

### M3 (1.5 weeks)
- [ ] Home screen (hero + groups + donut)
- [ ] Group detail (2 tabs: transactions, settings)
- [ ] Settings screen (profile, money, help, categories)
- [ ] FAB routing
- [ ] Navigation links all work

### M4 (1 week)
- [ ] Budget queries
- [ ] Budget warning modal
- [ ] Budget management form
- [ ] Global limit toggle

### M5 (1 week)
- [ ] All screens styled per AGENTS.md
- [ ] Error states handled
- [ ] Performance audit (load times, tap response)
- [ ] Unit + integration tests
- [ ] No TS errors or console warnings

---

## Architecture Decisions (locked)

1. **No accounts in v1.** One phone = one user. Sharing a group means manually re-entering transactions.
2. **No recurring in v1.** Use "Duplicate last month" or "Repeat" button instead of lazy materialization.
3. **No settle-up screen in v1.** Just show balances; settle in real life.
4. **3 split types only: Equal, Exact, Itemized.** No Percentage or Ratio in v1.
5. **One monthly limit per group.** No daily/yearly, no carry-over in v1.
6. **Integer paise everywhere.** Never floats.
7. **Hard invariant: Σ paid == Σ share.** Enforced on save, live validation in UI.
8. **Tab bar: Home, Reports [stub], Settings.** Reports is hidden in v1 (shows "Coming in v1.1").

---

## Known Risks

| Risk | Likelihood | Impact | Mitigation |
|------|---|---|---|
| Xcode/dev build setup fails | Medium | Project blocked at M0 | Use community support, Apple ID troubleshooting |
| SQLite performance (100K+ txns) | Low | Queries slow down | Index on date, lazy-load lists, pagination in v1.1 |
| Invariant check is too strict | Low | Users can't save valid data | Test rounding edge cases, relax if needed |
| Split UI too confusing | Medium | Users don't understand share vs. paid | Onboarding modal, tooltips, redo in v1.1 based on feedback |
| Debt simplification algorithm incorrect | Low | Shows wrong balance | Thorough testing, compare vs. manual calc |

---

## Effort Estimate

| Milestone | Days | Notes |
|-----------|------|-------|
| M0 (Environment) | 5–7 | Depends on Xcode/Apple ID friction |
| M1 (Data Model) | 7–10 | Schema, seed, money utils |
| M2 (Transactions & Split) | 10–14 | Add flows, split logic, validation |
| M3 (Navigation & Home) | 7–10 | Home, group detail, settings |
| M4 (Budget) | 5–7 | Queries, warning modal, settings form |
| M5 (Polish) | 5–7 | Design, errors, testing |
| **Total** | **39–55 days** | ~8–11 weeks with breaks |

**Ideal pace:** 5 days/week (solo dev) = 8–11 weeks to ship v1.

---

## Success Criteria

- [ ] All 88 tests pass (or first iteration has 50+)
- [ ] No TypeScript errors
- [ ] No console errors in dev or prod build
- [ ] Can create expense, see it on home, verify balance
- [ ] Can split 3-way, verify math is correct
- [ ] Budget warning shows when exceeded
- [ ] Dark mode works
- [ ] All screens follow AGENTS.md design system
- [ ] Empty states look polished (not broken)
- [ ] Performance: screen load < 1s, tap response < 200ms
- [ ] Works after app kill/relaunch (persistence)

---

## Post-v1 (v1.1, v2)

Once v1 ships, prioritize in this order:

**v1.1 (2–3 weeks):**
- Settle-Up screen + settlement transactions
- Reports tab (monthly summary, donut, trends)
- "Repeat transaction" button (cheap recurrence)
- CSV export

**v2 (2–3 months after v1.1):**
- Supabase auth + sync
- Shared groups (real multi-user)
- True recurring (lazy materialization)
- Ratio split type
- Receipt photos + OCR

---

## Notes

- This plan is a fork of Spec v3.0, not a replacement. Full Spec stays as reference.
- REVISED_ARCHITECTURE.md defines the scope; this plan details the build.
- Each milestone is a checkpoint: ship that milestone before starting the next.
- If a milestone takes >50% longer than estimate, pause and reassess before continuing.

