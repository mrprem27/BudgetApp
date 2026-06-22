# BudgetApp (budgetsplit) — Comprehensive Architecture & UX Analysis Prompt

**For:** Claude 4.8 Opus  
**Context:** Real working Expo app with 30+ screens, full split/budget/savings/insights system  
**Goal:** Deep analysis of structure, UX, logic, component design, and business coherence

---

## Context: What Exists

### Screens (30+ built)
**Tabs:** groups, dashboard (index), reports, savings, settings  
**Add flows:** quick (expense), income, itemized, transfer  
**Group detail:** main view + sub-screens (budget, members, recurring, insights, edit)  
**Transactions:** detail, history, search, settle  
**Other:** afford, categories, category detail, features, friends, help, storage

### Components (50+)
- **UI:** Button, Card, Input, Sheet, Modal, TabPills, Badge, FAB, Filter, Picker, Skeleton, ErrorState
- **Finance:** AmountText, BalanceRow, BudgetBar, CategoryChip, CategoryDonut, TransactionRow, PersonPicker, MemberAvatar
- **System:** Onboarding, FeatureGate, LockGate, PrivacyScreen, LogoAssembly

### Data & Logic (25+ utilities)
afford, analytics, budget, cash, donut, featureFlags, financialHealth, forecast, money, notifications, ocr, recurrence, reminders, savings, savingsEngine, savingsInsights, settle, smartCategory, subscriptions, and more

### Key Features
- Split (equal/exact/itemized)
- Groups + members
- Savings (goals, pools, auto-sweep)
- Recurring with skip/edit/pause
- Reminders (custom lead-days, exact time)
- Budget tracking + insights
- Reports with forecast
- Subscriptions detection
- "Can I afford this?" feature
- Feature toggles (dashboard insights, budget insights, savings insights)

---

## Analysis Dimensions

### 1. INFORMATION ARCHITECTURE & INFORMATION HIERARCHY

**Questions:**
- Are there redundant screens showing the same data?
- Is navigation depth optimal? (How many taps to reach each feature?)
- Are major user flows clear, or are they fragmented across multiple places?
- Does the tab bar organization make sense?
- Are related features grouped together logically?
- Is the entry point for each major action obvious?

**Specific checks:**
- Dashboard vs. Groups — what's the distinction? Do both show group cards/summaries?
- Add flows (quick, income, itemized, transfer) — are they necessary distinct, or could they be one flow?
- Group detail has many sub-screens — should some be promoted to tabs?
- "Afford" screen — where is it accessed from? Is it discoverable?
- "Settle" screen — is it discoverable from balance view, or does user not know it exists?
- Savings feature — is it properly integrated or feels bolted-on?

### 2. UI/UX FLOWS & INTERACTION PATTERNS

**Questions:**
- Are the most common actions (add expense, see balance, settle) under 2 taps?
- Are modals/sheets being overused vs. full screens?
- Is the information hierarchy on each screen clear (one hero element)?
- Are empty states, errors, and edge cases handled with grace?
- Are there confusing affordances or hidden features users won't discover?
- Is the FAB optimal, or should entry points be organized differently?

**Specific flows to analyze:**
1. **Add transaction** — quick → full → split/assign → save. Is this intuitive?
2. **See balance with someone** — groups list → group → balances → settle. Is settlement discoverable?
3. **Set up recurring** — groups → group → recurring. Is it clear you can manage existing recurring txns?
4. **Check if I can afford this** — where is the "afford" feature? Is it a hidden gem or well-marketed?
5. **Savings goal tracking** — savings tab → [id] → goal management. Is flow coherent?

### 3. COMPONENT DESIGN & REUSABILITY

**Questions:**
- Are components properly layered (ui → finance → screens)?
- Are components over-parameterized (too many props) or under-parameterized?
- Are there components that do too much (violate single responsibility)?
- Are similar UI patterns reused, or is there duplicate logic?
- Are component dependencies clear, or is there circular dependency?
- Are styled variants (error, loading, disabled, focus) handled consistently?

**Specific checks:**
- `AmountText` — is it used everywhere amounts appear?
- `TransactionRow`, `BalanceRow` — do they handle all needed variants?
- `PersonPicker`, `CategoryPicker` — are these sufficiently flexible?
- `SettingsRow` — is this used in all settings-like UI, or are there one-offs?
- Are form components (Input, DatePickerSheet) composable and reusable?
- Is error handling (ErrorState) applied uniformly?

### 4. FEATURE COHERENCE & CLARITY

**Questions:**
- Does each feature (savings, reminders, subscriptions, afford, insights) feel like a core part of the product, or like add-ons?
- Are feature toggles necessary, or is the app trying to do too much?
- Is the business logic for each feature clear and documented?
- Are features competing for the same space (e.g., budget + savings both showing financial goals)?
- Is the feature roadmap aligned with user needs, or adding complexity for complexity's sake?

**Specific checks:**
- Savings (goals, pools, auto-sweep) — is this core or optional? How does it relate to budget?
- Reminders — are these notifications replacing or augmenting the base budget feature?
- Subscriptions detection — is this valuable, or solving a non-problem?
- "Afford" feature — who needs this? Is it a gimmick or essential?
- Smart category matcher — is this working well, or does it feel AI-for-AI's-sake?
- Feature toggles — should toggles exist, or should features just be on/off?

### 5. SCREEN ORGANIZATION & CLARITY

**Analyze each major screen:**

| Screen | Current behavior | Issues? |
|--------|---|---|
| Dashboard (index) | Shows summary + donut + insights | Is it cluttered? Too many options? |
| Groups list | Card per group + tappable | Should groups be elsewhere? |
| Group detail | Tabs: transactions, balances, budget, members | Are these tabs necessary, or could they be reordered? |
| Add expense (quick) | Amount, date, category, payer, split | Is UX simple or overwhelming? |
| Itemized | Items, tax/tip, assign, payer, review | Is 5-step flow necessary or can it be collapsed? |
| Savings | Goal list, pool view, auto-sweep status | Is this confusing to new users? |
| Reports | Monthly summary, donut, forecast, year-in-review | Is this a drawer or full screen? Is it organized? |
| Settings | Profile, categories, budget, features, privacy | Is hierarchy logical or random? |
| Afford | Cost, income, savings, financial health | Is this ever discovered, or is it an easter egg? |

### 6. BUSINESS LOGIC & INVARIANTS

**Questions:**
- Is the paise-rounding rule correct and consistent?
- Are invariants (Σ paid == Σ share) enforced everywhere they should be?
- Is the debt simplification algorithm correct for all cases?
- Are edge cases handled (zero amounts, negative balances, deleted txns)?
- Is the recurring materialization robust (concurrent reads, clock changes)?
- Are savings, reminders, and budget calculations accurate?

### 7. NAVIGATION PATTERNS & DISCOVERABILITY

**Questions:**
- Are all major features discoverable without reading docs?
- Are there features that are "hidden" (like Afford, Settle)?
- Is the back-button behavior consistent?
- Are there dead ends (screens you can't navigate out of)?
- Is deep-linking set up, or is navigation always modal-based?
- Are there ghost buttons or UI elements that look tappable but aren't?

### 8. FEATURE BLOAT & SCOPE CREEP

**Questions:**
- How many major features are in the app now? (Estimate: 15–20?)
- Does each feature feel equally polished, or are some half-baked?
- Are features competing for space, or do they feel intentional?
- Is the product trying to be "Splitwise + YNAB + Reminders + AI"?
- Should some features be deferred to v2, or are they all v1-essential?

**List every feature:**
1. Group budget tracking
2. Expense splitting (equal, exact, itemized)
3. Debt simplification + settle-up
4. Income tracking
5. Recurring with skip/edit/pause
6. Reminders (custom lead-days)
7. Savings (goals, pools, auto-sweep)
8. Insights (spending, budget, savings)
9. "Afford" (can I afford this)
10. Subscriptions detection
11. Smart category matcher
12. Reports + forecast
13. Receipt attach + OCR (half-baked, deferred)
14. Budget insights toggle
15. Savings insights toggle
16. Dashboard insights toggle
17. ... (more?)

**Verdict:** Is the app coherent, or is it a feature collection?

### 9. BUSINESS PERSPECTIVE

**Questions:**
- What is the app's core value prop? (Answer in one sentence.)
- Who is the target user? (Solo budgeter? Couples? Roommates? All?)
- Are all features serving the core value prop, or are some distractions?
- Is the free/offline-first promise sustainable, or will v2 need accounts/sync/monetization?
- Are there features that don't make business sense (low ROI, high maintenance)?
- Is the design system consistent enough to ship, or are there rough edges?

### 10. USER PERSPECTIVE & POLISH

**Questions:**
- If a new user installed this app today, would they know what to do?
- Are onboarding, empty states, and errors guided clearly?
- Is the app fast? (Screen load <1s? Action feedback <200ms?)
- Are there bugs or crashes (or is the app production-ready)?
- Is the design cohesive, or are there UI inconsistencies?
- Are all tap targets ≥44pt? Are there any too-small buttons?
- Is text readable (font sizes, contrast)?

---

## Deliverables Expected

### 1. **Executive Summary** (1 page)
- Top 5 critical issues (blocking ship)
- Top 5 high issues (should fix before shipping)
- Quick wins (easy fixes, high impact)
- Verdict: Is the app ready to ship, or does it need rework?

### 2. **Detailed Issue Analysis** (per dimension)
For each of the 10 dimensions above, identify:
- **Issue description** (what's wrong?)
- **Severity** (critical/high/medium/low)
- **Impact** (why does this matter?)
- **Root cause** (why did it happen?)
- **Proposed fix** (how to fix it?)
- **Effort** (quick/medium/big)

### 3. **Specific Screen-by-Screen Audit**
For the 8 major screens:
- Layout assessment (is it clear?)
- Information hierarchy (is the hero obvious?)
- UX flow (is it intuitive?)
- Consistency (does it match the design system?)
- Suggested improvements

### 4. **Feature Coherence Assessment**
- List all major features (with descriptions)
- Mark each as: core / important / nice-to-have / should-cut
- Justify your categorization
- Identify features that don't belong
- Suggest prioritization for v1 shipping

### 5. **Navigation & IA Redesign** (if needed)
If the information architecture is broken:
- Proposed tab structure (keep/remove/reorganize)
- Proposed sub-screen organization
- Where each feature should live
- Entry points for each major action

### 6. **Component Audit**
- Are components properly named and organized?
- Are there duplicate components that should be consolidated?
- Are component props sensible?
- Are there missing components that would improve reusability?

### 7. **Risk Register**
- What could go wrong if we ship this?
- Are there bugs or crashes waiting?
- Are there features that will frustrate users?
- What's the #1 project risk?

### 8. **Ship/No-Ship Verdict**
- Is the app ready for v1 release?
- If not, what are the blockers?
- If yes, what's the first v1.1 item to tackle?

---

## Tone & Style

- **Be direct.** If something is bad design, say so with specific examples.
- **Be specific.** Don't say "confusing navigation" — say "users won't find the Settle button because it's nested in Group → Balances → button instead of being in the FAB or a dedicated tab."
- **Be constructive.** Every issue should have a proposed fix.
- **Prioritize ruthlessly.** Focus on high-impact issues, not nits.
- **Respect the work.** The app is feature-rich; identify what's good so it's not thrown away.

---

## Context for Analysis

- **Tech Stack:** React Native + Expo, SQLite local, Zustand, expo-router
- **Status:** Main branch is v1, feature branch ready to PR for final ship
- **Quality Gate:** 88/88 tests passing, TypeScript clean
- **Constraints:** Solo dev, no paid APIs, offline-first promise
- **Scope:** 30+ screens, 50+ components, 25+ utility libraries

---

**Ready to analyze? Read the PLAN.md and AGENTS.md carefully first to understand the developer's vision and design rules — then assess whether the app lives up to them.**
