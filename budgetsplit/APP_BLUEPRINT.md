# BudgetSplit — Final App Blueprint

> **This is the single source of truth.**  
> Read before building anything. Design files are *inspiration*, not instruction.  
> Where this doc and a design file conflict — this doc wins.

---

## 1. App Mission

**One-line:** Track personal money and split group bills — entirely on-device, zero cloud.

**User:** Urban Indian professional (20s–35s). Splits rent, dining, and trips with friends. Tracks salary, SIPs, subscriptions. Wants clarity on "where did it go" without an accountant.

**Core promise:**
- Log a spend in 2 taps
- Split a bill in under 10 seconds
- Know at a glance if you're on track this month
- Nothing leaves the phone

---

## 2. UX Principles

1. **One hero number per screen.** Every screen answers one question loudly, everything else supports it.
2. **No orphan data.** Empty states always have a CTA. Errors always have a retry.
3. **Money is always paise internally.** Display via `formatRupees` / `formatCompact` only.
4. **Optional is truly optional.** Every module behind a flag. Core app works with zero flags enabled.
5. **No accounts, no friction.** Name is enough to start. Budget setup is skippable.
6. **Animations earn their place.** Only the logo intro and goal celebration get complex animations. Everything else is functional.

---

## 3. Navigation Shell

```
┌─────────────────────────────────────────┐
│  Status bar (dark content)              │
├──────┬──────┬──────────┬───────┬────────┤
│ Home │Groups│  [FAB]   │ Plan  │Settings│
└──────┴──────┴──────────┴───────┴────────┘
```

- **FAB** (coral→orange gradient, + icon): Opens add bottom sheet. One tap from anywhere.
- Tab bar sits above system home indicator. Height = `layout.tabBarHeight + insets.bottom`.
- Active tab: teal icon + label. Inactive: `colors.textMuted`.

---

## 4. Screen-by-Screen Specification

---

### 4.1 HOME TAB — `app/(tabs)/index.tsx`

**Question it answers:** "Am I on track this month?"

#### States

| State | Trigger | What shows |
|---|---|---|
| Loading | First render | Skeleton cards (HeroCard shape + CategoryRankList shape) |
| Empty (new user) | Zero transactions | Dashed hero card ₹0 + 3 get-started tiles |
| Full | Has data | Hero card + WHERE IT WENT + COMING UP + Health band |
| Error | DB failure | ErrorState + stale cached data notice |

#### Hero Card
- **Dominant number:** spend this month (SpaceMono, XL)
- **With budget set:** pace bar (green→amber→red at 80%/100%) + "X% · ₹Y left"
- **No budget:** delta vs last month (↑ red / ↓ green)
- **obfuscate mode:** shows `₹ ••••` — toggled from Settings › Security
- Period toggle pill (Month / Today / Year) sits just below the card

#### WHERE IT WENT (Category breakdown)
- Top 3–5 categories by spend, mini horizontal bars
- Teal bar fill, width proportional to max category
- "+ N more →" chip that pushes to `app/category/[name].tsx` of top category
- Only shows for Month tab (today/year use same component, just different data)

#### COMING UP
- Upcoming recurring bills + reminders — sourced from `buildUpcoming()`
- Max 3 items visible; "+ N more" if overflow
- Auto-detected subscriptions get "auto-detected" badge in amber
- Empty: section hidden entirely (not an empty state)

#### Tracking Streak Card
- Shown only when `flags.trackingStreak` is ON AND user has been logging
- "TRACKING STREAK" section label
- Card: 🔥 icon + streak count (SpaceMono, coral `#FF7A6D`) + "X-day streak!" bold title + "You've logged every day this month."
- Row of 10×10 rounded squares for each day of the month: coral for logged days (opacity fades further back), muted teal for future days
- UX note: only show when streak ≥ 3 days — don't punish new users with day 1

#### Money Health Band
- Shown only when `flags.healthScore` is ON
- Thin colored strip with band label (Great / Good / Fair / Poor) + score
- Tap → opens `HealthSheet` bottom sheet (pre-computed `HealthResult`, never re-fetches)

#### Balance Strip
- Shown only when `flags.dashboardBalances` is ON AND (oweTotal > 0 OR owedTotal > 0)
- "You owe ₹X · Owed to you ₹Y · Settle →"
- Taps → `app/settle.tsx`

#### UX Decisions (intentional deviations from design)
- Design shows separate "Cash Available" card — **skipped** in favor of cleaner hero. Cash is in Plan tab.
- Design shows savings summary on home — **skipped**, lives in Plan tab only. Home = spending clarity.
- Health band is a strip, not a full card — one line, doesn't steal hero focus.

---

### 4.2 GROUPS TAB — `app/(tabs)/groups.tsx`

**Question it answers:** "Who do I owe / who owes me?"

#### Groups List
- MY GROUPS section: each group card shows name, member count, monthly spend, net balance (red = you owe, green = owed to you), budget utilization bar if budget set
- PEOPLE section: quick-access balance rows for active contacts — "Settle" button inline
- Filter chips: Active / Archived (hidden until user has archived groups)

#### Empty State
- Illustration: overlapping avatar circles with ➕ center
- "No groups yet" + "Create a group for flatmates, a trip, or anyone you split with regularly."
- CTA: "Create first group" + example chips (🏠 Flatmates · ✈️ Trip · 🍽️ Dining)

#### New Group Sheet (modal)
- Emoji picker → large tappable circle, opens emoji grid
- Name text input (auto-focused)
- Type chips: Home · Trip · Work · Dining · Other (purely cosmetic, affects default icon color)
- Members: avatar chips of existing contacts + "+ Add" dashed chip
- Default split method: Equal / Exact / % / Shares
- "Create group" CTA — disabled until name is non-empty

---

### 4.3 GROUP DETAIL — `app/group/[id].tsx`

**Question it answers:** "What happened in this group and what do I owe?"

#### Header
- Breadcrumb: "← Groups · [Group Name]"
- Group emoji + name + member count
- Three-dot menu (⋯): Edit group / Manage members / Recurring transactions / History / Archive

#### Balance Card (non-personal groups only)
- "You owe ₹X to [Name]" (red) OR "You're owed ₹X" (green) OR "All settled" (muted)
- "Settle up" button → pushes to `app/settle.tsx`

#### Tab Strip (6 tabs for groups, 2 for personal)
Non-personal: **Expenses · Budget · Members · Insights · Recurring** (+ Balances for groups with active debts)
Personal: **Expenses · Budget**

##### Expenses Tab
- Transactions grouped by month — month label as section header
- Each row: category icon circle, note/category name, amount (my share for expenses, total for settlements), date
- Swipe left to delete (with undo toast)
- FAB opens add sheet pre-filled with this group's ID

##### Budget Tab (summary — read only)
- Overall utilisation: large % number, bar, "₹X of ₹Y this month"
- Per-category rows: icon circle, name, BudgetBar, ₹spent / ₹limit, % label
- "Edit budget →" pill → pushes to `app/group/[id]/budget.tsx`
- If no budget: empty state with "Set a budget →" CTA

##### Members Tab
- GROUP BALANCES card: total spent, my balance
- Member rows: avatar, name, net balance (colored), "Largest contributor" tag on top payer
- "+ Invite someone" dashed row
- "Settle group balances" CTA if any member owes

##### Insights Tab
- SPENDING THIS MONTH: horizontal bar per member, proportional to max spender
- TOP CATEGORIES: top 3 by spend, colored Feather icon circles, bar, amount
- Trend callout: green card with best analytics recommendation

##### Recurring Tab
- Purple summary card: "Group recurring ₹X/mo · N active"
- List of active rules: category icon circle (colored by category), name, amount, frequency, my share
- "+ Add recurring expense" dashed CTA → pushes to add/quick with recurring mode

#### Group Sub-Screens (management, not summary)

| Sub-Screen | Route | Purpose |
|---|---|---|
| Edit Group | `/group/[id]/edit` | Change emoji, name, split method, remove members, archive/delete |
| Budget Management | `/group/[id]/budget` | Set per-category limits, add/remove budget lines |
| Member Management | `/group/[id]/members` | Add members, see detailed balances, generate invite |
| Recurring Management | `/group/[id]/recurring` | Full CRUD for recurring rules — pause, resume, skip, end |

---

### 4.4 ADD FLOWS — `app/add/`

**All are bottom sheets / full-screen modals, never push screens.**

#### Quick Add — `app/add/quick.tsx`
- Toggle at top: Expense ↔ Income (affects color theme — dark red vs dark green)
- Large amount display (tap digits on custom keypad or native input)
- Note input with **Smart Category auto-detection** (flag: `smartCategory`):
  - When note text matches a known merchant/keyword (e.g. "Uber", "Swiggy"), category chip auto-fills with teal border + "Auto" badge (⚡ icon)
  - Inline nudge: "You typically log [merchant] under [Category] — applied." in green
  - User can override by tapping the chip to open CategoryPicker
- Category picker row (tappable chip → CategoryPicker sheet)
- Date row (today by default, tappable → DatePickerSheet)
- "Split with" row (shows avatars of group members if groupId in params)
- Budget nudge: "₹X left in [Category] this month" — green if healthy, amber if near, hidden if no budget
- RECURRING section (collapsible, purple): frequency tabs, next date, end condition
- CTA: "Log expense" / "Log income" — disabled until amount > 0

#### Income — `app/add/income.tsx`
- Green color theme
- Source chips: Salary · Freelance · Investment · Business · Other
- Budget impact nudge: "Month covered + ₹X surplus" when income > budget

#### Itemized Split — `app/add/itemized.tsx`
- Line items: name, price, people (avatar chips) — each item assigned to 1+ people
- Tap person avatar on item to assign/unassign
- ADJUSTMENTS section: Tax (%), Delivery, Discount
- Per-person breakdown (purple summary card): each person's total
- Total must balance before save is enabled

#### Transfer — `app/add/transfer.tsx`
- From person / To person pickers
- Amount
- Does NOT count as spending — records settlement

#### Receipt Attachment (on Transaction Detail)
- Camera icon button in transaction detail toolbar
- Opens native image picker or camera
- Thumbnail shown inline in txn detail — tappable to view full size
- "Remove receipt" option in long-press menu on thumbnail
- Stored as local file URI (not cloud) — shown in txn detail only

#### OCR Scan — `app/add/ocr.tsx` ❌ NOT BUILT
- Camera viewfinder with corner detection marks
- Detected total highlighted with teal border
- "Use ₹X" → pre-fills Quick Add with amount
- "Rescan" to retry
- **Note:** High effort, needs expo-camera + ML. Build last.

---

### 4.5 PLAN TAB — `app/(tabs)/savings.tsx`

**Question it answers:** "Am I building toward anything? What are my risks?"

This tab is the **insight + planning hub**. Sections appear/hide based on feature flags and data availability.

#### Section Order (top to bottom)

1. **Cash Available card** (flag: `dashboardCash`) — liquid money = income − spending − saved goals
2. **Velocity Alert** (flag: `forecast`, data: forecast > budget) — red hero card, only when overspend projected
3. **Savings Pool card** (flag: `savingsGoals`) — total saved, unallocated, auto-sweep status
4. **Goals list** (flag: `savingsGoals`) — each goal: emoji, name, progress bar, monthly needed, deadline
5. **COMING UP THIS MONTH** — recurring bills + reminders for next 30 days (max 4, "+ more" chip)
6. **SHIFTS VS LAST MONTH** (flag: `dashboardInsights`) — top-3 category changes, ↑↓ badges
7. **ACROSS ALL GROUPS** (flag: `dashboardInsights`) — net position, owed/owing tiles
8. **Subscription nudge** (flag: `subscriptions`, data: unreviewed subs exist) — purple card, Review/Dismiss
9. **Financial Health link** (flag: `healthScore`) — row tapping to full health page
10. **Afford Check link** (flag: `affordCheck`) — "Can I afford something?" row

#### What-If Simulator
- Shown inside the Plan tab (inline, no separate screen)
- "What if I cut [Category] by X%?" — percentage chips: 10% / 20% / 30%
- Projection updates inline: "You'd save ₹X/mo · ≈ ₹Y a year"
- Uses the top-spending category for the current month by default
- Already implemented in `savings.tsx` (state: `whatIfCat`, `whatIfPct`)

#### Key UX Decisions
- Velocity alert ONLY appears when `forecastMonthEnd > forecastBudget`. If on track, this entire card is hidden — no anxiety when not needed.
- SHIFTS section ONLY appears when both this month AND last month have data. Never shows on first use.
- COMING UP uses `buildUpcoming()` — same function as Home. Not re-computed separately.
- Subscription nudge ONLY appears once per session; "Dismiss" hides it until next data refresh.

#### Plan Sub-Screens

**Subscription Tracker — `app/plan/subscriptions.tsx`** (flag: `subscriptions`)
- "Subscriptions" title + "Auto-detected recurring charges" subtitle
- Purple summary card (1.5px settle border): "MONTHLY TOTAL" label, total paise in SpaceMono 28px, "N active · N to review" right column
- REVIEW NEEDED section (amber header with count): items with amber "Unknown" label or red "OVERLAP" badge — unknown merchant, overlapping services
  - Each row: 40×40 category icon circle (dark bg), name, frequency, amount (SpaceMono), next date
- CONFIRMED section (muted header): same row layout, smaller visual weight
- Actions: swipe row to confirm/dismiss — confirmed moves to CONFIRMED section; dismissed is hidden for 30 days
- Empty state when all confirmed: "All clear" green card

**Financial Health — `app/plan/health.tsx`**
- "← Plan" back button
- SVG circular ring: score (0–100), colored by band (green/amber/red)
- "Your Money Health" hero title + subtitle
- BREAKDOWN: 3 dimension rows (Spending/Trend/Budget), each with colored progress bar, score/max, description
- Action card: "Biggest improvement: [factor]" — green card with recommended action + "Add to savings goal →"
- Fetches its own data on focus (independent from Home — acceptable for a detail page)

**New Goal Sheet** (bottom sheet, launched from Plan tab or Budgets & Goals)
- Sheet handle + "New goal" title + X close
- Name input (auto-focused)
- TARGET AMOUNT input
- PRIORITY chips: High (coral) / Medium (amber) / Low (muted)
- ICON grid: Feather icon swatches (6–8 options), teal border on selected
- COLOR swatches: 8 color circles with white border on selected
- FIXED ALLOCATION (OPTIONAL): amount input + frequency chips (None / Daily / Monthly / Yearly)
- "Create goal" PrimaryButton — teal fill
- On save: fires `GoalCelebration` overlay, dismisses sheet

**Savings Goal Detail — `app/savings/[id].tsx`**
- Ring progress (41% saved)
- Goal name, target date, months away
- Amounts grid: Saved / Remaining / Goal
- MONTHLY CONTRIBUTION: auto-sweep amount, needed amount, warning if underfunded
- RECENT: last 5 contribution transactions
- "Add to goal" CTA (large, teal) + "Adjust" secondary
- Goal celebration overlay (`GoalCelebration`) fires when progress hits 100%

**Reports — `app/(tabs)/reports.tsx`** (flag: `reportsDonut` + `reportsTrend`)
- Month selector (← June 2026 →)
- SPENT card + EARNED card with % change vs prior month
- Category donut (flag: `reportsDonut`) — interactive, tap segment filters transaction list
- 6-month bar trend (flag: `reportsTrend`) — tap bar to jump to that month
- Forecast line (flag: `forecast`) — projected end of month
- Export as PDF CTA (generates real PDF via `expo-print`)

---

### 4.6 SETTLE — `app/settle.tsx`

**Question it answers:** "Who do I need to pay, and what's the minimum transactions?"

#### Active State
- Net position pill: "Your net position: −₹X overall" or "+₹X"
- YOU OWE section (red header): each person you owe, "Pay [Name] ₹X" button, UPI/Cash/Record tabs
- OWED TO YOU section (green header): each person who owes you, "Mark as received" option
- Settle algorithm: fewest transactions needed (min-cost flow in `src/lib/settle.ts`)

#### All Settled State
- "🎉 All settled up!" ring animation
- "Everyone is square."
- Avatars with checkmarks
- "View groups" + "Add new expense" CTAs

---

### 4.7 SEARCH — `app/search.tsx`

**Question it answers:** "Find any transaction, ever."

- Auto-focused search input on open
- Kind filter chips: All · Expenses · Income · Settlements
- Result count strip: "N transactions · ₹X total" (only when results exist)
- Results grouped by month (SectionList, month label as section header)
- Each result in a card (bgCard, border, shadow)
- Empty search (no query): prompt message
- No results: "No matches · Try a different word or amount."
- Searches across: category, note, amount (formatRupees match), rounded rupee number

---

### 4.8 TRANSACTION DETAIL — `app/txn/[id].tsx`

- Amount hero (large, colored by kind)
- Category pill + date
- PAID BY: payer avatar(s) + amount(s)
- SPLIT: each person's share + paid/owes status
- Metadata: Group · Date · Note · Location (if tagged)
- Actions: Edit (teal) · Receipt (gray) · Delete (red → confirmation alert → undo toast)

---

### 4.9 CATEGORY DETAIL — `app/category/[name].tsx`

- Budget utilisation card: % used, ₹spent, ₹budget, colored bar
- Period tabs: Month · Week · Year
- Transaction list for that category in the selected period
- "+ N more this [period]" load-more link

---

### 4.10 SETTINGS TAB — `app/(tabs)/settings.tsx`

#### Profile Section
- Avatar (tappable → image picker)
- Name (tappable → inline rename sheet)
- Email (display only, for user reference)

#### Manage Section
- People → `app/friends.tsx`
- Categories → `app/categories.tsx`
- Budgets & Goals → `app/budgets.tsx`
- Sections (modules) → `app/features.tsx`

#### Preferences Section
- Currency: INR (display only for now)
- Default budget cadence: Once / Daily / Monthly / Yearly
- Insight comparisons: % / Multiple (×)
- Health score toggle
- Subscription detection toggle
- Save transaction location toggle

#### Security Section
- Face ID / Touch ID lock toggle
- Privacy screen in app switcher toggle
- **Hide amounts on home** toggle (new) — shows `₹ ••••` on hero card

#### Reminders Section
- Renewal reminders toggle → lead days stepper + time picker
- Daily log reminder toggle → time picker
- "Send a test reminder" row
- **Notification Permission Modal** (shown once when first toggle is turned ON, if permission not yet granted):
  - Full-screen illustration: bell with sparkles
  - "Stay on top of your money" title
  - "BudgetSplit will remind you to log and alert you before bills renew."
  - "Allow notifications" PrimaryButton → calls `Notifications.requestPermissionsAsync()`
  - "Not now" Ghost link → skips (toggle reverts to off)

#### Data & Help Section
- Export PDF
- Help & Feedback → `app/help.tsx`
- Replay welcome tour (resets onboarding)
- History & Audit log → `app/history.tsx`

#### ABOUT Section
- App version number (tap 7× to unlock storage easter egg → navigates to `app/storage.tsx`)

#### Notifications link
- Row in Reminders section: "Manage notifications" → `app/settings/notifications.tsx`

---

### 4.11 SETTINGS SUB-SCREENS

#### People — `app/friends.tsx`
- YOU section: your profile (gradient avatar, name, email)
- CONTACTS list: each person with balance badge (green "owes you ₹X", red "you owe ₹X", grey "settled"), group count
- Per-avatar: teal camera-badge overlay for photo replace
- Tap Settle/Pay CTA → prefilled Transfer screen
- Long-press row → rename sheet; tap camera badge → photo picker
- "+ Add a person" dashed row: name input → creates contact
- Delete person: only allowed if no outstanding balances

#### Categories — `app/categories.tsx`
- Indigo info banner: "Drag to reorder. Used in personal and group expenses."
- CORE list: default categories (drag handle, icon, name, transaction count, chevron)
- CUSTOM list: user-created categories (CUSTOM badge instead of count)
- "+ Add custom category" dashed CTA → name input + icon/color picker sheet
- Each category tappable → `app/category/[name].tsx`
- Rows are drag-to-reorder

#### Budgets & Goals — `app/budgets.tsx`
- "← Settings" breadcrumb + "Budgets & Goals" title
- MONTHLY BUDGET card:
  - "Total limit" row with editable amount pill (teal border when focused)
  - "Unallocated = flexible spending." caption
  - Progress bar: ₹X spent of ₹Y total this month, % label green
- PER CATEGORY section:
  - Each category row: category icon circle (color-coded), name, editable amount input (right-aligned SpaceMono pill), BudgetBar below with spend/left or "over last month" label
  - Bar color: teal (healthy) → amber (near) → coral (over)
  - "+ Add category limit" dashed teal CTA at bottom
  - "Unallocated (flexible)" row at very end: grayed, shows remaining ≈ amount
- SAVINGS GOALS link row: 🎯 icon, "Savings Goals", "N active · [goal name]", chevron → `savings/[id].tsx`

#### Sections (Feature Flags) — `app/features.tsx`
- DASHBOARD group (6 toggles): Cash available, Budget summary, Where it went, Balances, Savings summary, Top insights
- REPORTS group (3 toggles): Spending by category, 6-month trend, Spending forecast
- INSIGHTS group (2 toggles): Budget insights, Savings insights
- MODULES group (7 toggles): Smart categories, Subscription detection, Can I afford this?, Tracking streak, Financial health score, Itemized bills, Recurring transactions
- AUTOMATION group (1 toggle): Auto-sweep leftover budget
- OFF rows render at 0.6 opacity; toggles take immediate effect
- Footer: "Enabled sections appear in their natural home. Nothing is deleted when a section is off."
- UX note: this replaces the onboarding "what brings you here?" choice — better because changeable any time

#### Notifications — `app/settings/notifications.tsx`
- Permission state banner: when permission denied → red-border card, bell-off icon, "Notifications are off", "Open Settings to allow" red CTA → deep-links to iOS Settings
- When permission granted: no banner shown
- WHAT YOU'LL RECEIVE list (always shown, even while denied — value preview):
  - Bill reminders 📅 — toggle per type
  - Settle-up nudges 🤝 — toggle per type
  - Streak reminder 🔥 — toggle per type
  - Goal milestone 🎯 — toggle per type
- Test notification row: "fires in 5 seconds" + teal "Test" button
- Footer note: "All notifications are local — no server, no push, always offline."
- Linked from Settings › Reminders section

#### Help — `app/help.tsx`
- Accordion sections: Getting Started · Groups & Splitting · Budgets & Limits · Savings & Goals · Recurring Transactions · Reports & Export · Categories · Privacy & Security · Tips & Tricks
- Each section has 4–8 items
- Items expand to show full explanation text
- No network required — all content is hardcoded

#### Audit Log — `app/history.tsx`
- "Audit Log" title + "Every change made to your data, in order."
- Entries grouped by TODAY / YESTERDAY / DD MMM YYYY
- Each entry: 8px colored dot (teal=created, amber=updated, red=deleted, purple=settled), action label, summary, timestamp
- EDIT / DEL badge for updated/deleted entries
- "Load older entries" pagination (30 per page)
- Supports `?groupId=X` param to filter by group

#### Storage — `app/storage.tsx`
- Storage stat card: hero number (MB used), "N receipt photos" subtitle
- Privacy copy: "photos never leave device"
- "Delete all attachments" destructive button (preserves transactions, removes receipt photos only)
- Separate "Export all data" row (CSV or JSON)
- **Design note:** Storage is primarily about receipt photo disk usage; general data export is a secondary action

---

### 4.12 ONBOARDING — `src/components/system/Onboarding.tsx`

**Stages (in order):**

1. **Hero** — LogoAssembly ring/fan animation (⛔ NEVER TOUCH), BudgetSplit wordmark fades in, "Get Started" CTA
2. **Features** — 4-slide swipeable carousel (Know where it goes / Split minus the math / Budgets that hold / Yours alone). Progress bar. Skip option.
3. **Name** — "First, your name" with user icon disc. Input + "Continue" (proceeds to Budget stage). "Skip — just explore" also proceeds.
4. **Budget** — "What's your monthly take-home?" progress dots, amount display card, preset chips (₹30k / ₹45k / ₹60k / ₹1L+), suggested budget callout (80% of income). "Set this budget" saves and completes. "Skip — I'll set it later" completes without saving.

**Key rule:** Stage hero and LogoAssembly are permanently off-limits. Never modify animation timings, delays, or visual structure.

---

### 4.13 SYSTEM COMPONENTS

| Component | File | Purpose | Touch? |
|---|---|---|---|
| LogoAssembly | `system/LogoAssembly.tsx` | Ring/fan brand animation | ⛔ Never |
| LockGate | `system/LockGate.tsx` | Biometric lock overlay — shows logo ring + padlock badge + Face ID hint + "Unlock" CTA | ✅ Safe |
| PrivacyScreen | `system/PrivacyScreen.tsx` | App switcher blur | ✅ Safe |
| UndoToast | `system/UndoToast.tsx` | Delete undo — white pill, red trash icon, item name + amount, teal "Undo" button | ✅ Safe |
| HealthSheet | `finance/HealthSheet.tsx` | Health detail bottom sheet | ✅ Safe |
| GoalCelebration | `finance/GoalCelebration.tsx` | 100% goal confetti overlay — full-screen, colored confetti rectangles, award icon, "New goal" + "Done" CTAs | ✅ Safe |
| BrandedLoader | `system/BrandedLoader.tsx` | Loading screen — 84px logo square, subtle spinner ring, "Setting up your database…" label | ✅ Safe |
| DatePickerSheet | `ui/DatePickerSheet.tsx` | Shared calendar sheet (month nav, day grid, Today shortcut) | ✅ Safe |
| TimePickerSheet | `ui/TimePickerSheet.tsx` | Chip-based time picker (hour grid, minute grid, AM/PM toggle) — used in reminders | ✅ Safe |

#### App Boot DB Error — `_layout.tsx`
- Renders before SQLite opens — no navigation, no lock gate, no onboarding accessible
- Red-tinted error icon, "Couldn't start BudgetSplit" title, reassuring body copy
- Single red "Retry" button (refresh icon) → re-attempts DB init
- Completely isolated — no navigation shell visible

---

### 4.14 EDGE CASES (Design Reference — Screens 17)

These are important UX states documented in the design but with minimal or no current code handling:

| Edge Case | Where | What happens |
|---|---|---|
| Itemized bill: items sum < total | `add/itemized.tsx` | Red inline banner showing delta (₹X mismatch), Save blocked, yellow "Add ₹X item" chip CTA |
| Transfer: FROM = TO same person | `add/transfer.tsx` | FROM→TO card gets red border, inline error, Save disabled |
| Recurring catch-up | `/(tabs)/index` | Yellow banner when app opens after 30+ days absent: "N missed occurrences added across M rules (Date range)". CTAs: "Review entries" / "Dismiss" |
| Goal overfunded > 100% | `savings/[id].tsx` | Amount turns amber, progress bar uses teal→amber gradient, surplus nudge banner. CTAs: "Move to new goal" / "Withdraw ₹X" |
| LockGate: biometric not enrolled | `/lock` | Red-border error card, "Face ID not set up". CTAs: "Open iOS Settings" (primary) / "Disable lock" (secondary muted) |
| Low storage: receipt attach fails | `add/quick.tsx` | Expense saves, photo silently fails. Persistent red-border banner + "Storage settings" deep-link + separate green chip confirming expense was saved |
| OCR: no total detected | `add/ocr.tsx` (deferred) | Corner marks go grey, magnifier icon + lighting tip, "Rescan" + "Enter manually" CTAs |

---

## 5. Optional Modules — Complete Map

| Module | Flag Key | Surfaces | Status |
|---|---|---|---|
| Savings Goals | `savingsGoals` | Plan tab (pool + goals), New Goal Sheet, `savings/[id].tsx` | ✅ |
| Spending Forecast | `forecast` | Reports, Plan velocity alert | ✅ |
| Financial Health | `healthScore` | Home band, Plan link, `plan/health.tsx` | ✅ |
| Afford Check | `affordCheck` | Plan link, `app/afford.tsx` | ✅ |
| Subscription Tracker | `subscriptions` | Plan nudge card + `plan/subscriptions.tsx` full page | ✅ |
| Reminders | `reminders` | Settings config, COMING UP in Plan, notification permission modal | ✅ |
| Smart Category | `smartCategory` | Quick Add note field auto-detect | ✅ |
| Tracking Streak | `streak` | Home streak card (`StreakCard`) | ✅ |
| Reports & Charts | `reportsDonut` / `reportsTrend` | `app/(tabs)/reports.tsx` | ✅ |
| Dashboard Balances | `dashboardBalances` | Home balance strip | ✅ |
| Dashboard Budget | `dashboardBudget` | Home hero budget bar | ✅ |
| Dashboard Donut | `dashboardDonut` | Home WHERE IT WENT | ✅ |
| Dashboard Savings | `dashboardSavings` | Home savings summary | ✅ |
| Dashboard Insights | `dashboardInsights` | Home + Plan insight sections | ✅ |
| Receipt Attachment | `receiptAttachment` | Quick Add camera/gallery pick + URI stored | ✅ |
| OCR Receipt Scan | — | `app/add/ocr.tsx` | ❌ Deferred (needs expo-camera + ML) |
| Location Tagging | — | Settings toggle + add flow | ❌ Deferred (privacy-sensitive) |

---

## 6. Remaining Gaps — Priority Order

### All high-value items completed ✅

| # | Item | Status |
|---|---|---|
| 1 | Onboarding Budget Step | ✅ Done |
| 2 | Subscription tracker full page (`app/plan/subscriptions.tsx`) | ✅ Done |
| 3 | Budget Setup page (`app/budgets.tsx`) | ✅ Done |
| 4 | New Goal Sheet | ✅ Done (in savings.tsx) |
| 5 | Smart Category auto-detect | ✅ Done (in quick.tsx) |
| 6 | Tracking Streak card | ✅ Done (StreakCard + index.tsx integration) |
| 7 | Notification Permission modal | ✅ Done (in settings.tsx) |
| 8 | Receipt Attachment | ✅ Done (in quick.tsx) |
| 9 | Search: Personal / Groups filter | ✅ Done (source filter chips in search.tsx) |
| 10 | Settings › Budgets & Goals → `/budgets` | ✅ Done |
| 11 | Plan tab Subscriptions "View all →" link | ✅ Done |

### Deferred (not in scope unless user requests)
| # | Gap | Risk | Decision |
|---|---|---|---|
| 12 | OCR Receipt Scan | Needs `expo-camera`, complex ML, likely poor accuracy | Build only if user specifically requests |
| 13 | Location Tagging | Privacy-sensitive, adds complexity to add flow | Build only if user specifically requests |

---

## 7. Single-Source Rules — Never Duplicate

| Computation | Canonical location | Current consumers |
|---|---|---|
| `computeHealthScore` | `src/lib/financialHealth.ts` | `index.tsx`, `plan/health.tsx` |
| `getBudgetAnalytics` | `src/lib/analytics.ts` | `index.tsx`, `savings.tsx`, `plan/health.tsx`, group budget pages |
| `detectSubscriptions` | `src/lib/subscriptions.ts` | `savings.tsx` only |
| `buildUpcoming` | `src/lib/upcoming.ts` | `index.tsx`, `savings.tsx` |
| `getGroupNet` | `src/db/queries/balances.ts` | `savings.tsx`, `plan/health.tsx`, `settle.tsx` |
| `formatRupees` / `formatCompact` | `src/lib/money.ts` | Everywhere |
| `categoryVisual(name)` | `src/constants/categories.ts` | Returns `{ icon, color }` — NO emoji property |

---

## 8. Design System Quick Reference

### Colors
```
bg:           #0A0F11   — screen background
bgCard:       #13201F   — card background
bgMuted:      #1B302D   — tab pills, segmented controls
bgInput:      #162825   — text input background
border:       #21302E   — card borders, dividers
textPrimary:  #ECF3F1
textSecondary:#8FA3A0
textMuted:    #5A6B69
accent:       #20C4B8   — teal: buttons, active states, links
income:       #2BD49B   — green: positive amounts
expense:      #FF6F61   — coral/red: negative amounts, warnings
settle:       #8B7CF8   — purple: settlements, recurring
coral:        #FF6F61   — FAB gradient, danger hints
healthAmber:  #F5B301   — warning state
```

### Typography
- Hero amounts: `SpaceMono_400Regular`
- All other text: `Inter_400Regular` / `Inter_600SemiBold`
- Max 3 font sizes per screen: title (28) → body (14–15) → caption (11–12)

### Spacing
```
xs: 4   sm: 8   md: 16   lg: 24   xl: 32   xxl: 48
screenPaddingH: 16
```

### Component Rules
- **PrimaryButton** for every primary CTA — never plain TouchableOpacity with accent bg
- **PressableScale** on all tappable cards (spring scale 0.97)
- **EmptyState** always: 64×64 icon circle + bold title + body + CTA
- Cards: `bgCard` + `radius.lg (16)` + `1px border` + `shadow.sm`
- Icon in colored circle: `color + '22'` bg (13% opacity)

---

## 9. What This App Is NOT

- Not a bank or payment app — records only, no actual money movement
- Not a social app — no accounts, no profiles, no sharing (invite links only)
- Not a spreadsheet — no manual formulas, no custom calculations
- Not a tax tool — no GST, no ITR, no income tax calculations
- Not multi-currency — INR only, all amounts in paise

---

*Last updated: June 2026*  
*Screens referenced: 48 across 12 design files + implementation analysis*
