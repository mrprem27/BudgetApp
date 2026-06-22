# BudgetApp — Implementation Roadmap (v1 Ship)

**Status:** Ready to implement  
**Start Date:** 2026-06-22  
**Target:** Fix 5 Critical blockers → 5 High issues → Ship-ready v1  
**Total Effort:** 15–20 dev days (aggressive) or 30–35 days (comprehensive)

---

## Phase 0: Preparation (2–4 hours)

Before touching code, disable deferred features to reduce scope:

### P0-1: Feature Flags Disable
**Files:** `src/lib/featureFlags.ts`, `src/db/seed.ts`

**Task:** Set all non-essential flags to `false`:
- `dashboardInsights` → `false` (will redesign)
- `budgetInsights` → `false` (will integrate or cut)
- `savingsInsights` → `false` (will integrate or cut)
- `reminders` → `false` (defer to v1.1)
- `subscriptions` → `false` (defer to v1.1)
- `afford` → `false` (defer to v1.1 or cut)

**Effort:** 30 min  
**Impact:** Immediately simplifies dashboard, removes hidden entry points

### P0-2: Hide/Remove Hidden Features from Code
**Files:** `app/afford.tsx`, `app/help.tsx`, `app/storage.tsx`

**Task:** Wrap these routes in feature gates or delete from router:
```tsx
// If keeping for future: wrap in <FeatureGate feature="afford">
// If removing: delete app/afford.tsx, app/help.tsx, app/storage.tsx
```

**Decision needed:** Keep for v1.1 (feature-gated) or delete entirely?

**Effort:** 15 min  
**Impact:** Reduces navigation clutter, simplifies mental model

---

## Phase 1: Critical Blockers (Days 1–5)

### C1: Redesign Dashboard (app/(tabs)/index.tsx — 805 lines)

**Current State:**
- Shows: spending summary, pending actions, group health chips, category donut, insights (3x toggles), empty states
- Hero: None (multiple competing elements)
- Problem: Overwhelming; users don't know what to act on

**Target State:**
- Hero: **One clear piece of info** (e.g., "You owe $X to [person]" OR "You're on budget")
- Secondary: Quick actions (add expense, settle, [one CTA])
- Tertiary: Group pills for quick jump
- Insights: Collapsed or removed

**Implementation Steps:**

1. **Flatten insights logic**
   - Remove `dashboardInsights` queries from dashboard
   - Remove the 3 insight cards
   - File: `app/(tabs)/index.tsx` line ~600-750

2. **Redesign hero section**
   - Identify what matters most: pending balance or budget health?
   - **Recommendation:** Show "pending balance" (how much you owe/are owed) as the hero
   - Use `AmountText` in large font (SpaceMono_400Regular, 40px) centered
   - Subtext: "[You owe X] to [person]" or "[X owes you]"

3. **Simplify section layout**
   - Section 1: Hero (1 number)
   - Section 2: Quick actions (add expense, settle)
   - Section 3: Group pills (jump to group)
   - Remove: category donut, insights cards, savings preview

4. **Test empty state**
   - When no pending balance: show "All settled!" with one CTA ("Add expense")

**Files to modify:**
- `app/(tabs)/index.tsx` — cut from 805 to ~350 lines
- Consider: Extract group pills to component `GroupPillRow`

**Effort:** 2–3 days  
**Tests affected:** Dashboard snapshot tests, pending balance queries

---

### C2: Collapse "Add Expense" Flow (app/add/quick.tsx — 816 lines)

**Current State:**
- 5-step flow: quick → full → split → assign → review
- Three entry points: quick (speed), itemized (receipt), transfer (person-to-person)
- Problem: Users don't know which to pick; flow is too long

**Target State:**
- **Single unified entry point** ("Add")
- Progressive disclosure: basic → itemize (toggle) → split (toggle) → assign
- No separate transfer screen (fold into "split to one person")

**Implementation Steps:**

1. **Redesign form state machine**
   - Current: 5 separate forms (quick, fullForm, split, assign, review)
   - Target: 1 form with toggles
   ```tsx
   Form state:
   - basic: { amount, date, category, payer }
   - itemize?: { items[], tax, tip } (toggle)
   - split?: { type, people, amounts } (toggle)
   - review: { preview }
   ```

2. **Create new "Add" screen** `app/add/index.tsx`
   - Single form with 3 toggles:
     - "Itemize" (show items list)
     - "Split" (show split UI)
     - "Person" (for simple 1-on-1 transfer)
   - Reuse existing validation logic

3. **Update router**
   - Remove `app/add/quick.tsx`, `app/add/transfer.tsx`
   - Keep `app/add/itemized.tsx` for complex receipt flows (power user feature, not default path)
   - Create `app/add/index.tsx` as main entry

4. **Deprecate old flows**
   - FAB should link to `app/add/index.tsx`
   - Add button should link to `app/add/index.tsx`

**Files to modify:**
- `app/add/index.tsx` (new) — 300–400 lines
- Delete `app/add/quick.tsx` and `app/add/transfer.tsx`
- Keep `app/add/itemized.tsx` for power users (but hidden from main FAB)
- Update FAB in `src/components/finance/FAB.tsx` or shell

**Effort:** 3–4 days  
**Tests affected:** Add flow tests, validation, split logic

---

### C3: Reduce Tabs from 6 to 4 (app/(tabs)/)

**Current State:**
```
Tabs: groups, index, reports, savings, settings, [+ hidden]
```

**Target State:**
```
Tabs: Home, Groups, Savings, Settings
```

**Changes:**
- **Rename** `index` → "Home"
- **Merge** Reports into Home (toggle/card, not separate tab)
- Keep: Groups, Savings, Settings

**Implementation Steps:**

1. **Modify router** `app/(tabs)/` layout
   - Update `_layout.tsx` (tab bar definition)
   - Remove `reports` from tab bar
   - Rename `index` to `home` (or keep as index but label as "Home")

2. **Move reports into Home**
   - Add "Reports" card or toggle to `app/(tabs)/index.tsx`
   - Tapping opens drawer/modal with:
     - Summary view
     - Donut chart (one view)
     - Forecast (if critical, else remove)
   - File: `app/(tabs)/reports.tsx` → becomes modal/drawer component

3. **Update navigation**
   - All links to `/reports` now point to Home (or home tab + reports modal)

**Files to modify:**
- `app/(tabs)/_layout.tsx` — update tab bar definition
- `app/(tabs)/index.tsx` — add reports toggle
- Create `src/components/system/ReportsDrawer.tsx` or inline modal

**Effort:** 1 day  
**Tests affected:** Navigation tests, tab bar tests

---

### C4: Redesign Settings (app/(tabs)/settings.tsx — 339 lines)

**Current State:**
```
Settings (flat, jumbled):
- Profile (name, avatar)
- Categories (add, edit custom)
- Global budget
- Feature toggles (3x)
- Privacy / lock
- Storage / export
- Reset onboarding
```

**Target State:**
```
Settings (task-organized):
├─ Profile (name, avatar, display)
├─ Money (global budget, savings defaults, currency [if needed])
├─ People (manage friends/aliases)
├─ Categories (manage custom categories)
├─ Features (experimental toggles) [optional, or removed]
├─ Privacy & Data (lock, export, reset)
└─ Help (guide, about)
```

**Implementation Steps:**

1. **Restructure settings sections**
   - Convert flat list to grouped sections (use `SectionList` or custom `SettingsSection` component)
   - Group related rows using dividers

2. **Create sub-screens** (optional, if sections are too long):
   - `app/settings/profile.tsx`
   - `app/settings/people.tsx`
   - `app/settings/categories.tsx`
   - `app/settings/privacy.tsx`

3. **Rename/reorganize rows**
   - "Global budget" → under "Money" section
   - "Features" → collapse under "Experimental" (single toggle to show/hide)
   - "Storage" → move to "Privacy & Data"
   - "Help" → separate section at bottom

4. **Update icons/colors**
   - Ensure consistency with AGENTS.md color discipline
   - Use Feather icons from approved set

**Files to modify:**
- `app/(tabs)/settings.tsx` — refactor from flat to grouped
- Create `src/components/finance/SettingsSection.tsx` (reusable grouped section)
- Optionally create sub-screens under `app/settings/`

**Effort:** 1.5 days  
**Tests affected:** Settings layout tests, navigation to sub-settings

---

### C5: Redesign Group Detail (app/group/[id].tsx — 790 lines + 5 sub-tabs)

**Current State:**
```
Group detail has 5 tabs:
├─ Transactions (list of txns)
├─ Balances (who owes who)
├─ Budget (budget management)
├─ Members (add/remove/roles)
└─ Insights (spending per person)
```

**Target State:**
```
Split into two screens:

1. Group Overview (app/group/[id].tsx)
   ├─ Header: group name + icon
   ├─ Hero: [Your balance] or [Group settled]
   ├─ Balances (2–3 rows showing key debts)
   ├─ Settle button (prominent)
   └─ Transactions (recent list, swipeable to detail)

2. Group Settings (app/group/[id]/settings.tsx) [NEW]
   ├─ Budget management
   ├─ Members (add/remove)
   ├─ Recurring transactions
   ├─ Insights/analytics
   └─ Group actions (edit name, delete)
```

**Implementation Steps:**

1. **Refactor group detail layout**
   - Remove 5 tabs
   - Keep only: transactions, balances, settle button
   - File: `app/group/[id].tsx` — cut from 790 to ~400 lines

2. **Create new group settings screen**
   - File: `app/group/[id]/settings.tsx` (new)
   - Move budget, members, insights, recurring here

3. **Update navigation**
   - Gear icon in group header → opens settings screen
   - Balances → stay on overview (compact view)
   - Settle button → prominent in overview

4. **Integrate recurring**
   - Move `app/group/[id]/recurring.tsx` into settings
   - Or keep as separate power-user flow

5. **Test balance calculations**
   - Ensure balance view is fast (don't calculate 1000x)
   - Memoize balance component

**Files to modify:**
- `app/group/[id].tsx` — refactor (790 → 400 lines)
- Create `app/group/[id]/settings.tsx` (new, ~300 lines)
- Move or refactor: budget.tsx, members.tsx, insights.tsx, recurring.tsx

**Effort:** 3–4 days  
**Tests affected:** Group detail layout, balance queries, navigation

---

## Phase 2: High-Priority Issues (Days 6–10)

### H1: Remove Feature Toggles (or consolidate under "Experimental")

**Current:** `dashboardInsights`, `budgetInsights`, `savingsInsights` scattered throughout

**Target:** Either:
- **Option A:** Remove all toggles (insights are always-off for v1)
- **Option B:** Collapse under single "Experimental features" toggle in Settings

**Files:** `src/lib/featureFlags.ts`, `app/(tabs)/settings.tsx`, all screens using these flags

**Effort:** 1 day  
**Impact:** Simplifies user mental model, removes confusing UX

---

### H2: Integrate Savings into Budget (or defer to v1.1)

**Current:** Savings tab is separate, with goals/pools/auto-sweep

**Decision:** Does savings belong in v1, or should it be deferred?

**If keeping for v1:**
- Show "savings progress" on dashboard
- Integrate into budget flow (show "how much can I save" after budget limit)

**If deferring to v1.1:**
- Hide savings tab (feature gate it)
- Remove savings queries from dashboard

**Files:** `app/(tabs)/savings.tsx`, all savings-related screens and queries

**Effort:** 2–3 days (if integrating) or 4 hours (if deferring)

---

### H3: Hide or Remove "Afford" Feature

**Current:** `app/afford.tsx` exists but has no entry point

**Decision needed:** Is this a power user feature you want to keep, or should it be cut?

**If keeping:** Add to Settings or create secondary menu (feature gate for now)

**If cutting:** Delete `app/afford.tsx`

**Effort:** 4 hours

---

### H4: Collapse Reports (integrate into Home or drawer)

**Target:** Reports becomes toggle/card in Home, not separate tab

**Files:** Fold `app/(tabs)/reports.tsx` into modal/drawer  
**Effort:** 1 day (already counted in C3)

---

### H5: Redesign Recurring Skip/Edit UX

**Current:** Complex logic with 270 lines, janky UX

**Target:** Clearer affordances for "edit single" vs "edit series"

**Approach:** Show modal choice upfront
```
"Edit recurring?"
[Edit this time only] [Edit all future] [Cancel]
```

**Files:** `app/group/[id]/recurring.tsx` and related logic

**Effort:** 1.5 days

---

## Phase 3: Quick Wins (Days 11–12)

Quick, high-impact fixes that don't require architecture changes:

### W1: Cut "Transfer" from FAB
- Remove from quick add
- Users can split to one person instead

### W2: Move "Help" to Settings submenu
- Not a top-level tab item
- Reduce tab count

### W3: Rename "Add" flows
- "Quick" → "Expense"
- "Itemized" → "Receipt" or "Itemize"

### W4: Add bottom sheet descriptions to tabs
- Help users understand each tab

### W5: Fix empty states
- Ensure all empty states follow AGENTS.md pattern (icon + title + description + CTA)

**Effort:** 1 day total

---

## Phase 4: Testing & Polish (Days 13–15)

- Run full test suite (88/88 tests)
- Regression testing on redesigned screens
- User testing with fresh user (if possible)
- Design system compliance check (AGENTS.md rules)
- Performance audit (screen load times)

---

## Implementation Order

**Recommended approach:**

1. **Start with Phase 0** (disable features) — frees up context
2. **Run Phase 1 blockers in parallel:**
   - **Branch 1:** C1 (Dashboard) + C3 (Tabs) — low dependencies
   - **Branch 2:** C2 (Add flow) — requires its own focus
   - **Branch 3:** C4 (Settings) — independent
   - **Branch 4:** C5 (Group detail) — depends on nav stability from C3

3. **Then Phase 2** (high issues) — refinement
4. **Then Phase 3** (quick wins) — polish
5. **Then Phase 4** (testing) — ship ready

---

## Risk Management

**Key risks:**

- **C2 (Add flow collapse):** If poorly executed, users lose functionality (itemized split)
  - Mitigation: Keep `app/add/itemized.tsx` as power-user fallback
  
- **C5 (Group detail split):** Creates new screen; increased navigation depth
  - Mitigation: Ensure group settings is discoverable (gear icon, button text)
  
- **Feature flags:** If disabled incorrectly, features still render
  - Mitigation: Test each feature gate carefully

---

## Success Criteria

- [ ] Dashboard is ≤350 lines, has clear hero
- [ ] Add expense is single unified form with toggles
- [ ] Tabs reduced to 4 (Home, Groups, Savings, Settings)
- [ ] Settings reorganized by task
- [ ] Group detail split into overview + settings
- [ ] All 88 tests pass
- [ ] No console errors or TypeScript issues
- [ ] Feature toggles cleaned up or consolidated
- [ ] No hidden features (everything discoverable or feature-gated)
- [ ] Design system compliance check (AGENTS.md)

---

## Next Steps

1. Confirm Phase 0 is acceptable (feature flags to disable)
2. Choose implementation order (parallel vs sequential branches)
3. Begin with highest-risk item first (C2: Add flow) or easiest item first (C3: Tabs)?
4. Set up branch strategy: single feature branch or multiple PR-per-blocker?

**Recommendation:** Start with C3 (Tabs) to unblock navigation, then parallel C1+C4+C5, then C2 last.

