# BudgetApp Analysis — Comprehensive Findings

**Date:** 2026-06-22  
**Analyzer:** Claude Opus 4.8  
**Status:** Deep code review + UX/architecture audit  
**Verdict:** App is feature-rich but showing critical signs of **scope creep, component bloat, and information architecture fragmentation**. Shipping will expose these issues to users immediately.

---

## Executive Summary

### The Core Problem
The app is trying to do **too much in v1**: split expense tracking + personal budgeting + savings goals + recurring with complex skip logic + reminders + smart categorization + subscriptions detection + forecasting + an "afford" feature. Each feature is individually polished (88/88 tests pass), but **the whole is incoherent**.

### Top 5 Critical Issues (Block Shipping)

| # | Issue | Severity | Impact | Fix |
|---|-------|----------|--------|-----|
| **C1** | Dashboard is 805 lines, does 7 things, no clear hero | CRITICAL | Users overwhelmed; can't find what they came for | Cut non-essential insights; redesign for one hero (balance or pending action) |
| **C2** | "Add expense" flow is 816 lines, 5-step flow with ambiguous decisions | CRITICAL | Users confused about quick vs. itemized vs. transfer; form feels overwhelming | Collapse to one "Add" screen with progressive disclosure (itemize on toggle, not screen fork) |
| **C3** | Settings screen is a junk drawer (17 unrelated items) | CRITICAL | Users can't find what they're looking for; settings is not organized by task | Reorganize around user tasks: manage-people, manage-groups, manage-budget, manage-profile |
| **C4** | Six tabs + FAB is 2x too many entry points | CRITICAL | Navigation is ambiguous; users don't know where to go for their next action | Reduce to 4 tabs max (Home, Groups, Savings, Settings); fold Reports into Home |
| **C5** | Group detail is 790 lines with 5 sub-tabs (transactions, balances, budget, members, insights) | CRITICAL | Single screen doing 5 things; tabs are necessary because one screen can't hold it all | Split group detail into 2 flows: (A) see-balance-and-settle, (B) manage-group-config |

### Top 5 High Issues (Fix Before Shipping)

| # | Issue | Severity | Impact | Fix |
|---|-------|----------|--------|-----|
| **H1** | Feature toggles (dashboardInsights, budgetInsights, savingsInsights) suggest user confusion | HIGH | Users don't understand what insights are; toggles are a band-aid for unclear feature | Remove toggles; make insights always-on or always-off depending on user preference at onboarding |
| **H2** | Savings feature is under-integrated (separate tab, separate goals, separate auto-sweep) | HIGH | Feels like add-on; users don't understand relationship between savings goals and budget limits | Integrate savings into main budget flow; show "how much I can save" prominently on dashboard |
| **H3** | "Afford" feature is hidden (no discoverable entry point) | HIGH | Feature exists but 99% of users won't find it; low ROI, high maintenance | Either promote to dashboard or cut for v1.1 |
| **H4** | Reports tab (801 lines) is a data dump (summary, donut, trends, forecast, year-in-review) | HIGH | Too much information; users don't know which view to use for their goal | Pick 1-2 primary views; make others toggle/drawer |
| **H5** | Recurring skip/edit/pause logic is complex (270 lines) but feels janky to users | HIGH | Logic is correct (88 tests) but UX is unclear; users don't know if they can edit a single instance | Redesign skip/edit/pause UX with better affordances (calendar view?) |

### Quick Wins (Easy, High Impact)

- **W1** Cut "Afford" screen from main nav (hide in feature flags)
- **W2** Consolidate "transfer" into "quick" (9/10 users don't need it)
- **W3** Move "Help" and "Storage" to Settings submenu (2 extra screens cluttering nav)
- **W4** Rename "Quick" add-flow to "Expense" (clear naming)
- **W5** Add one-sentence description of each tab in bottom tab bar (discovery)

---

## Detailed Issue Analysis

### Dimension 1: INFORMATION ARCHITECTURE

#### Issue I-1: Six tabs is too many
- **Description:** Bottom navigation has 6 tabs: groups, home (index), reports, savings, settings, + others hidden
- **Current state:** Not all tabs visible; users swipe to discover
- **Problem:** iOS HIG recommends ≤5 tabs. At 6, you're forcing users to swipe. This is a red flag.
- **Root cause:** Each feature (savings, reports) felt big enough to deserve its own tab during development
- **Fix:** Reduce to 4 main tabs: **Home**, **Groups**, **Savings**, **Settings**. Move Reports into Home as a toggle/card.
- **Effort:** Medium (reroute navigation, update router)

#### Issue I-2: Dashboard and Groups tabs show overlapping data
- **Description:** 
  - Dashboard shows "group health chips" (small cards with budget bar)
  - Groups tab shows "group list" (full cards with budget bar)
  - Both are ways to navigate to a group
- **Problem:** Redundant. Users don't know which to use. One should be the primary drill-down.
- **Root cause:** During iterative dev, both felt useful so both shipped
- **Fix:** Make **Home** the primary entry (show your summary + group pills for quick access). Make **Groups** the management screen (full group cards, add group, settings per group).
- **Effort:** Medium

#### Issue I-3: Settings is a junk drawer (unrelated items scattered)
- **Description:** Settings has: profile, categories (add/edit), global budget limit, feature toggles (3x), privacy, storage, onboarding reset
- **Problem:** Users looking for "change my name" have to wade through toggles and features they don't understand
- **Root cause:** Settings accumulated items over time; no IA discipline
- **Fix:** Reorganize settings by user task:
  ```
  Settings
  ├─ Profile       (name, avatar, display prefs)
  ├─ Money         (global budget, currency [hidden], savings defaults)
  ├─ People        (manage friends/aliases)
  ├─ Categories    (manage custom categories)
  ├─ Features      (collapse all toggles under one "Experimental" section)
  ├─ Privacy & Data (lock, export, reset)
  └─ Help          (guide, about, contact)
  ```
- **Effort:** Medium

#### Issue I-4: Group detail tries to do 5 things in tabs
- **Description:** Group detail has 5 sub-tabs: transactions, balances, budget, members, insights
- **Problem:** Tabs should never exceed 3-4. When you have 5+, it means one screen is doing too much.
- **Root cause:** Group detail is the "hub" for everything about a group, so everything ended up there
- **Fix:** Split into two flows:
  - **Group Overview** (transactions tab stays): list of txns, at-a-glance balance, settle button
  - **Group Settings** (new screen): budget, members, insights, recurring management
  - Balances stays in overview; full management goes to settings
- **Effort:** High (restructure group detail, create new screen, update router)

---

### Dimension 2: UI/UX FLOWS

#### Issue F-1: "Add expense" is a 5-step journey with unclear decision points
- **File:** `app/add/quick.tsx` (816 lines)
- **Current flow:**
  1. Choose add type (quick/income/itemized/transfer) — FAB menu
  2. Enter amount, date, category, note
  3. Choose payer(s)
  4. Choose split type (equal/exact/itemized)
  5. Assign shares & review
- **Problem:**
  - Decision at step 1 (quick vs. itemized) forces users to know the answer before they've started
  - 816 lines in one file suggests component is doing too much
  - Error handling and validation are mixed with UI logic
  - No undo/back within the flow (if user realizes they chose wrong split type)
- **Root cause:** Form was iteratively expanded; no refactoring to break it down
- **Fix:** 
  ```
  New flow (one entry point):
  1. "Add Expense" screen (quick): amount, date, category, note
  2. [Itemize toggle] — if ON, moves to items screen
  3. [Split type selector] — if changed, re-opens split UX
  4. Review & save
  
  Collapse quick + itemized into one intelligent form.
  ```
- **Effort:** High (major refactor of add logic)

#### Issue F-2: Itemized bill flow is 705 lines with 3 distinct sub-flows embedded
- **File:** `app/add/itemized.tsx`
- **Current structure:**
  - Items list (add/edit/delete items)
  - Tax/tip/discount input
  - Quick-assign UI (tap item, avatars appear)
  - Payer selection
  - Review
- **Problem:**
  - All in one file makes testing and reuse hard
  - Sub-flows aren't separated into components
  - Line-item assignment is powerful but UI is crowded
- **Fix:** Extract itemized logic into reusable components:
  - `<ItemList />` (manage items)
  - `<AdjustmentInput />` (tax/tip/discount)
  - `<QuickAssign />` (assign items to people)
  - `<PayerSheet />` (choose payer)
- **Effort:** Medium (component extraction)

#### Issue F-3: Settlement (Settle) flow is a hidden screen with no clear entry point
- **Description:** `/settle` screen exists but is only reachable from Group → Balances → button
- **Problem:** 
  - Users don't know settle-up exists unless they drill into a group
  - No global settle-up visible from home
  - The "settle" button should be more prominent
- **Fix:** 
  - Show settle-up mini-card on dashboard ("You owe ₹450 to Kavya · Settle now")
  - Make settle-up discoverable from group → balances
  - Consider a dedicated "Settle" action in FAB
- **Effort:** Medium

#### Issue F-4: Recurring edit (skip/pause/resume/end) is complex UX crammed into 267 lines
- **File:** `app/group/[id]/recurring.tsx`
- **Current state:**
  - List of recurring rules
  - Tap to open modal with 4 actions (skip next, edit series, pause, resume, end)
  - Modal has sub-flows for each action
- **Problem:**
  - Modal within modal is confusing
  - UX doesn't clearly communicate what each action does
  - No visual calendar showing when instances occur
- **Fix:**
  - Create dedicated "Recurring Management" screen (not modal)
  - Show a mini-calendar with upcoming occurrences
  - Actions are buttons, not a dropdown menu
  - Make skip/edit/pause more visually distinct
- **Effort:** High

---

### Dimension 3: COMPONENT DESIGN

#### Issue C-1: Large screens (800+ lines) suggest components are doing too much
- **Affected screens:**
  - `add/quick.tsx` (816)
  - `index.tsx` (dashboard, 805)
  - `reports.tsx` (801)
  - `group/[id].tsx` (790)
- **Problem:** >800 lines in a single file is hard to test, hard to maintain, hard to reason about
- **Root cause:** Components grew incrementally; no refactoring to extract sub-components
- **Fix:** Break into smaller sub-components:
  ```
  Example: app/(tabs)/index.tsx (805) should be:
  ├─ <DashboardHero /> — shows top balance/action
  ├─ <SpendingCard /> — spending metric + bar
  ├─ <GroupHealthChips /> — group cards
  ├─ <InsightCards /> — insights (conditional on toggle)
  ├─ <DonutSection /> — category donut
  └─ <SettlePrompt /> — settle-up CTA (if needed)
  ```
  This lets each sub-component be ~100–150 lines.
- **Effort:** High (component extraction refactor)

#### Issue C-2: Feature toggles suggest confusion about core vs. optional
- **Description:**
  - `dashboardInsights` toggle
  - `budgetInsights` toggle
  - `savingsInsights` toggle
  - Feature toggles in Settings → Features
- **Problem:**
  - Users see toggles and don't understand what they do
  - Toggles are a band-aid for unclear product vision
  - If insights are good, they should be on; if not, they shouldn't exist
- **Root cause:** Insights were added iteratively and became optional to avoid bloating UI
- **Fix:**
  - **Option A (recommended):** Remove toggles. Always show insights (they're valuable).
  - **Option B:** If insights are nice-to-have, move them to v1.1.
  - **Option C:** If some insights are core, others optional, split them: keep core on, hide optional behind one toggle.
- **Effort:** Low (remove toggles + adjust UI)

#### Issue C-3: Missing component: "One-line action prompt" (used 10+ times)
- **Description:** Several screens show "You owe ₹450 to Kavya · [Settle now]" or similar
- **Problem:** This pattern is repeated in slightly different ways across screens (dashboard, group detail, txn history)
- **Fix:** Create `<ActionPrompt label={...} action={() => ...} />` component
- **Effort:** Low

#### Issue C-4: SettingsRow component exists but isn't used everywhere settings appear
- **Description:** `src/components/ui/SettingsRow.tsx` exists but some setting forms use custom row components
- **Problem:** UI inconsistency; makes settings look fragmented
- **Fix:** Audit all settings/config screens; replace custom rows with `<SettingsRow />`
- **Effort:** Low-Medium

---

### Dimension 4: FEATURE COHERENCE

#### Issue FC-1: Savings is under-integrated (feels like an add-on, not core)
- **Description:**
  - Savings is a separate tab
  - Goals and pools are separate concepts
  - Auto-sweep is a hidden toggle
  - Savings insights are a separate card on dashboard
- **Problem:**
  - Users don't understand "how does savings relate to my budget?"
  - Is savings a goal? A category? A separate ledger? Unclear.
  - The feature feels bolted-on rather than core
- **Root cause:** Savings was added as an optional feature; wasn't integrated into the core model
- **Fix:**
  - **Option A:** Make savings core to budget (e.g., "each month, save 20% of income after expenses")
  - **Option B:** Keep it optional but integrate it into budget UI (show "savings available" on budget card)
  - **Option C:** Cut savings from v1; launch in v1.1 after core split/budget is stable
- **Recommendation:** **Option C** — ship v1 without savings, ship v1.1 with savings properly integrated
- **Effort:** High (redesign)

#### Issue FC-2: "Afford" feature is a hidden gem with zero discoverability
- **File:** `app/afford.tsx` (209 lines)
- **Description:** Screen exists that asks "Can I afford this? (Cost + income + savings + health)"
- **Problem:**
  - No way to reach it from main flow
  - No mention in help or onboarding
  - Why would a user need this in the middle of budgeting?
  - Feels like a prototype that shipped unfinished
- **Root cause:** Feature was built, tested, but never integrated into product flow
- **Fix:**
  - **Option A:** Promote "Afford" into dashboard as a card or mini-calculator
  - **Option B:** Move it to a drawer or modal from the FAB
  - **Option C:** Cut for v1; ship in v1.1 if users ask for it
- **Recommendation:** **Option C** — there's no evidence users need this
- **Effort:** Low (hide the screen)

#### Issue FC-3: Smart category matcher is powerful but feels like AI-for-AI's-sake
- **Files:** `src/lib/smartCategory.ts`, `src/lib/smartCategoryLearn.ts` (together: ~200 lines)
- **Description:** System learns category associations from txn notes ("Sarojini → Shopping", "Uber → Travel")
- **Problem:**
  - Is it actually solving a problem? Does it work well?
  - No UI feedback on why a category was suggested
  - If it's wrong, how do users correct it?
  - Is this a v1 priority?
- **Root cause:** Feature was built because it's cool, not because users asked for it
- **Fix:**
  - **Option A:** Keep it, but add user feedback ("Category suggestion · change to [X]?")
  - **Option B:** Hide for v1; ship in v1.1 after validation
- **Recommendation:** **Option B** — v1 should focus on core features
- **Effort:** Low (disable feature flag)

#### Issue FC-4: Reminders are complex (custom lead-days, exact time) but feel disconnected from budget
- **Files:** `src/lib/reminders.ts`, `src/lib/reminderPlan.ts`, `src/lib/notifications.ts` (~8KB total)
- **Description:** System sends notifications with custom lead-days ("Remind me 3 days before rent") and exact times
- **Problem:**
  - Do users actually need this?
  - Notifications require dev-build (extra complexity)
  - Feature is not integrated into transaction/budget UI
  - No clear entry point for setting reminders
- **Root cause:** Feature was built as a v2 feature but shipped in v1
- **Fix:**
  - **Option A:** Disable for v1; keep code, ship in v1.1
  - **Option B:** Hide behind feature flag
- **Recommendation:** **Option A** — this is not core to v1
- **Effort:** Low (disable)

#### Issue FC-5: Subscriptions detection is clever but unclear how it helps
- **File:** `src/lib/subscriptions.ts` (85 lines)
- **Description:** Detects recurring subscriptions (Netflix, Spotify, etc.) from category + amount patterns
- **Problem:**
  - Why is this valuable?
  - If a user logs "Netflix" as a subscription, they already know it's a subscription
  - Is this solving a real problem or solving for hypothetical power users?
- **Root cause:** Feature was built as a "nice-to-have"
- **Fix:**
  - **Option A:** Remove for v1; validate with users first
  - **Option B:** Make it opt-in; show subscription badge on recurring txns
- **Recommendation:** **Option A** — cut for v1
- **Effort:** Low (delete)

---

### Dimension 5: SCREEN-BY-SCREEN AUDIT

#### Screen 1: Dashboard `app/(tabs)/index.tsx` (805 lines)

| Aspect | Assessment | Issues |
|--------|-----------|--------|
| Layout | Hero (spending) + cards + donut + insights | Cluttered; no clear hero; too much info at once |
| Hero | My spending: ₹X (good) | Hero is correct (share-based spending), but surrounded by 6 other pieces of data |
| Information Hierarchy | Spending → budget → groups → insights | Logical, but "insights" cards add noise |
| Tabs | Today / Month / Year | Good — let user slice data by period |
| Cards | Group health chips, settle prompt, insights | Cards compete for attention |
| Empty State | "No transactions yet" | Good, but should have CTA to add first txn |
| Performance | Loads category donut + insights each time | May be slow on slow devices |
| **Verdict** | **REWORK** | Too much visual information; cut insights; focus on one hero (balance) + groups |

#### Screen 2: Groups `app/(tabs)/groups.tsx` (483 lines)

| Aspect | Assessment | Issues |
|--------|-----------|--------|
| Layout | List of group cards + FAB | Clean |
| Group Card | Icon, name, budget bar, current spending | Good visual hierarchy |
| Tap → Group | Navigates to group detail | Good |
| FAB | "Add Group" | Could have sub-options (group vs. template) |
| Empty State | "No groups yet" | Good, has CTA |
| Sorting | Alphabetical? Last-used? | Unclear if sorted or random |
| **Verdict** | **GOOD** | This screen is well-designed; keep it. Make it a secondary entry point (not primary tabs). |

#### Screen 3: Add Expense `app/add/quick.tsx` (816 lines)

| Aspect | Assessment | Issues |
|--------|-----------|--------|
| Entry | FAB → Expense | Good entry point |
| Form Fields | Amount, date, category, payer, split | Logically complete |
| UX | Linear top-to-bottom flow | Form is long; no scroll context |
| Split UI | Dropdown → select split type → form per type | Works but feels clunky |
| Validation | Blocked save if invariant not met | Good (✓ paid == ✓ share) |
| Review | Shows who paid + who owes before save | Good |
| **Verdict** | **NEEDS REFACTOR** | 816 lines suggests component should be split; UX is functional but not delightful |

#### Screen 4: Group Detail `app/group/[id].tsx` (790 lines)

| Aspect | Assessment | Issues |
|--------|-----------|--------|
| Hero | Group name + budget bar + current spending | Good |
| Tabs | Transactions, Balances, Budget, Members, Insights | **Too many (5); should be ≤3** |
| Tab 1 (Txns) | List of txns grouped by date | Good |
| Tab 2 (Balances) | Who owes whom; settle button | Good, but settle is buried |
| Tab 3 (Budget) | Budget limit + progress + detailed breakdown | Good |
| Tab 4 (Members) | List of members; add/remove | Good |
| Tab 5 (Insights) | Spending breakdown per member | Redundant with donut elsewhere |
| **Verdict** | **NEEDS REDESIGN** | Tabs are too many; split into two flows (view vs. manage) |

#### Screen 5: Savings `app/(tabs)/savings.tsx` (544 lines)

| Aspect | Assessment | Issues |
|--------|-----------|--------|
| Tab Content | Goals list, pool summary, auto-sweep status | Logically complete |
| IA | Savings as separate tab | Feels disconnected from budget |
| Integration | No clear link between savings goal and budget limit | Users don't understand the relationship |
| **Verdict** | **NEEDS INTEGRATION** | Savings should be part of budget, not separate |

#### Screen 6: Reports `app/(tabs)/reports.tsx` (801 lines)

| Aspect | Assessment | Issues |
|--------|-----------|--------|
| Content | Summary, donut, trends, forecast, year-in-review | **Too much in one screen** |
| Organization | Horizontal scroll between sections? | Not clear how user navigates |
| Use Case | What would a user come here for? | Unclear; feels like a data dump |
| **Verdict** | **NEEDS COLLAPSE** | Pick 1-2 primary views; move others to drawers or modals |

---

### Dimension 6: BUSINESS LOGIC

#### Issue BL-1: Paise rounding is correct but untested in edge cases
- **Status:** ✓ Correct in general, but
- **Missing tests:** 
  - Rounding with 10+ members
  - Rounding with very small amounts (₹1 → 100 paise)
  - Rounding negative amounts
- **Fix:** Add edge-case tests
- **Effort:** Low

#### Issue BL-2: Invariant enforcement is correct but error messages are vague
- **Status:** ✓ Saves blocked if unbalanced, but
- **Problem:** User sees "₹50 unassigned" but doesn't know how to fix it
- **Fix:** Add more granular error messages ("Need to assign ₹50 to someone")
- **Effort:** Low

#### Issue BL-3: Recurring materialization is complex but appears correct
- **Status:** ✓ 88 tests pass, but
- **Risk:** Concurrent reads during materialization could cause race conditions
- **Fix:** Audit for race conditions; add integration tests
- **Effort:** Medium

---

### Dimension 7: NAVIGATION & DISCOVERABILITY

#### Issue N-1: Hidden features
- **Afford** — No entry point (hidden gem)
- **Settle** — Only reachable from Group → Balances (not discoverable)
- **Recurring Management** — Buried in Group → Recurring tab (users don't know they can skip/pause/resume)
- **Help** — Link to help screen is hard to find

#### Issue N-2: Unclear entry points
- **Transfer** — Is this different from "quick expense"? When would users use this?
- **History** — Where is the history screen? (`app/history.tsx` exists but not in main nav)
- **Search** — Exists but no clear entry point

#### Issue N-3: Navigation depth
- Settle: Groups → Group → Balances → [button] (4 taps)
- Recurring edit: Groups → Group → Recurring → [item] (4 taps)
- Both should be 2 taps max

---

### Dimension 8: FEATURE BLOAT & SCOPE CREEP

#### Estimated Feature Count
1. Expense splitting (equal, exact, itemized) ✓ v1 core
2. Income tracking ✓ v1 core
3. Group budgeting ✓ v1 core
4. Debt simplification + settle-up ✓ v1 core
5. Recurring (with skip/edit/pause) ✓ v1 core
6. Reminders (custom lead-days) 🟡 v1, but should defer
7. Savings (goals, pools, auto-sweep) 🟡 v1, but feels disconnected
8. Insights (smart analytics) 🟡 v1, but hidden behind toggles
9. Reports (forecast, year-in-review) 🟡 v1, but maybe too much
10. Budget limits (daily, monthly, yearly) ✓ v1 core
11. Categories (custom per group) ✓ v1 core
12. Smart category matcher 🟡 v1, but feels unfinished
13. Subscriptions detection 🔴 v1, but unclear value
14. "Afford" calculator 🔴 v1, but no entry point
15. Receipt attachment (photo) 🟡 v1 core
16. Receipt OCR 🔴 v1, disabled/partial
17. Feature toggles (3x) 🔴 v1, suggests confusion
18. Transfer (person-to-person) 🟡 v1, but unclear when to use
19. Multi-currency support 🔴 v1, hidden
20. Onboarding flow ✓ v1 core

**Count:** 20 features. **Verdict:** Too many. v1 should have ≤10.

---

### Dimension 9: BUSINESS PERSPECTIVE

#### App's core value prop
**"Exact bill splitting with zero math errors, plus personal budgeting, all offline."**

#### Target user
**Ambiguous.** Currently trying to serve:
- Solo budgeter (personally budgeting)
- Couple (splitting shared expenses)
- Roommates (managing shared household)
- Trip friends (settling debts)
- Subscription tracker (opt-in)
- Savings goal-setter (opt-in)

#### Problem
**One app can't be good for all of these.** Each user type has different needs:
- Solo budgeter needs insights + forecasting
- Couple needs simplicity + quick settle
- Roommates need recurring + detailed breakdown
- Trip friends need quick entry + settle

#### Fix
**Choose a primary user for v1:**
- **Recommended:** Couples & small groups (split + budget, together)
- **Secondary:** Solo budget tracking
- **Defer to v2:** Advanced features (savings, insights, reminders)

---

### Dimension 10: USER PERSPECTIVE & POLISH

#### Onboarding
- ✓ Onboarding screen exists
- ✓ First group ("Personal") is pre-created
- ✓ First add prompt guides user
- **Issue:** No explanation of share vs. paid (core concept)
- **Fix:** Add a 1-minute tutorial on share vs. paid

#### Empty States
- ✓ Most empty states have CTA
- **Issue:** Some are generic text, not proper `<EmptyState />` component
- **Fix:** Audit and use `<EmptyState />` everywhere

#### Performance
- **Status:** Unknown (not measured)
- **Risk:** Dashboard (805 lines) + donut + insights load together
- **Fix:** Measure load times; lazy-load non-critical sections

#### Design System Adherence
- ✓ `AGENTS.md` is comprehensive
- **Issue:** Not all screens follow design rules (some don't use `SettingsRow`, some have custom buttons)
- **Fix:** Audit all screens for design system compliance

#### Tap Targets
- **Status:** Unknown
- **Risk:** Small buttons, icon-only buttons might be <44pt
- **Fix:** Audit all tap targets using design inspector

#### Typography & Contrast
- **Status:** Unknown
- **Risk:** On dark background, some text might not meet WCAG AA
- **Fix:** Audit using color contrast checker

---

## Detailed Recommendations

### Priority 1: Ship Blockers (Must fix before shipping)

1. **C1 — Redesign Dashboard (cut insights, focus on hero)**
   - Remove optional insights; show only: balance + settle prompt + groups
   - **Effort:** 2–3 days
   - **Impact:** Users understand the home screen

2. **C2 — Collapse "Add Expense" flow (one entry point, progressive disclosure)**
   - Merge quick + itemized into one form
   - **Effort:** 4–5 days
   - **Impact:** Reduce confusion about "when do I use itemized?"

3. **C3 — Reduce tabs from 6 to 4 (remove Reports, fold into Home)**
   - **Effort:** 2–3 days
   - **Impact:** iOS HIG compliance, cleaner navigation

4. **C4 — Reduce Group detail tabs from 5 to 2 (split view/manage)**
   - **Effort:** 3–4 days
   - **Impact:** Clearer information hierarchy

5. **C5 — Reorganize Settings (junk drawer → task-based)**
   - **Effort:** 1–2 days
   - **Impact:** Users can actually find what they're looking for

### Priority 2: High Issues (Fix before v1.1)

1. **H1 — Remove feature toggles (confusing users)**
   - **Effort:** 1 day
   - **Impact:** Simplified product

2. **H2 — Integrate Savings into Budget (or cut for v1.1)**
   - **Effort:** 3–4 days (if integrating) or 0 days (if cutting)
   - **Impact:** Clearer product story

3. **H3 — Hide "Afford" screen (or promote to dashboard)**
   - **Effort:** 1 day
   - **Impact:** Remove confusing hidden feature

4. **H4 — Collapse Reports (pick 1-2 primary views)**
   - **Effort:** 2–3 days
   - **Impact:** Users know where to get insights

5. **H5 — Redesign Recurring UX (calendar view for skip/edit/pause)**
   - **Effort:** 3–4 days
   - **Impact:** Users understand how to manage recurring

### Quick Wins

- [ ] Cut "Transfer" screen (reachable from "quick expense", not needed as separate)
- [ ] Hide "Help" and "Storage" in Settings submenu
- [ ] Add one-sentence descriptions to tab bar labels
- [ ] Fix typos/inconsistent naming in UI
- [ ] Add SettingsRow component usage everywhere
- [ ] Disable "Afford", "Reminders", "Subscriptions" features for v1
- [ ] Remove 3x feature toggles (enable insights always)

---

## Ship / No-Ship Verdict

### Current State
- ✓ 88/88 tests passing
- ✓ TypeScript clean
- ✓ Design system defined
- ✗ Information architecture is fragmented
- ✗ Too many features (20, should be 10)
- ✗ Feature discoverability is poor
- ✗ Some screens are 800+ lines (unmaintainable)
- ✗ Savings feels disconnected
- ✗ Reports is a data dump
- ✗ Settings is disorganized

### Recommendation

**🔴 DO NOT SHIP in current state.**

### Path Forward

**Option A: Ship in 1–2 weeks (aggressive)**
- Fix blockers C1–C5 (10–15 days of work)
- Disable non-core features (afford, reminders, subscriptions)
- Ship as v1 without savings
- Plan v1.1 (savings, reports, insights)

**Option B: Polish for 4–6 weeks (safer)**
- Fix blockers + high issues (20–25 days)
- Refactor 800+ line screens into sub-components (10–15 days)
- Full design system audit (3–5 days)
- Performance testing (2–3 days)
- Ship a rock-solid v1

### Recommendation: **Option A** (Ship in 2 weeks)
Reason: Current v1 is 80% there. The remaining 20% is polish + scope clarification. Shipping a good v1 now lets you learn what users actually want, rather than guessing.

---

## Post-Ship (v1.1) Priorities

Once v1 ships, prioritize:
1. Integrate savings into budget (or cut if users don't use it)
2. Collapse reports into focused views
3. Refactor 800+ line screens
4. Add design system audit + accessibility pass
5. Based on user feedback, add: reminders, subscriptions, afford

---

**Analysis Complete.** Ready to implement?
