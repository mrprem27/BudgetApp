# BudgetSplit — UI/UX Overhaul PRD

## Original problem statement
Continuously improve the app's UI/UX until it reaches production quality
comparable to Apple, Linear, Notion, Stripe, Airbnb, Arc, and Raycast.
Challenge every design decision. Full overhaul, dark-only, main screens
first (Home / Groups / Group Budget / Plan / Insights / Add expense /
transfer / income / Review), plus later rounds on Category detail,
History, overlays, notifications, and Add-flow sub-components.

## Tech stack (existing)
- Expo Router (React Native 0.85, React 19, TypeScript)
- SQLite (expo-sqlite) — local-first, no backend
- Zustand store, gifted-charts, expo-blur, expo-haptics
- Custom `src/theme/` design system (colors / typography / layout / alpha)

---

## What's been implemented

### Round 1 — Design tokens & primitives
Typography (`display`, `overline`, `amountXXL`), softer `bgCard`, new
`divider` token, `radius.xl`/`xxl`, `layout.minTap` (44).
Rewrote `PrimaryButton` (solid + inner highlight), `ScreenHeader`
(subtitle slot, 44pt tap), `TabPills` (animated sliding indicator),
`SectionCard` (rotating chevron), `EmptyState`, `Badge`,
`SecondaryButton`, `AmountText` (added `xxl`).
Added `SectionLabel` — the single source of truth for uppercase
eyebrows across the app.

### Round 2 — Screen polish
- **Group Budget**: live subtitle, 48pt hero total, softer dividers.
- **Motion Pass**: staggered FadeIn on Home (hero/tabs/cats/balance/
  forecast/streak at 0/80/160/220/280/340ms) + per-row cascade in
  `CategoryRankList`.
- **Review**: live header subtitle, swipe-to-delete on every pending
  row, section headers use SectionLabel, cleaner assign-all chips
  with leading icons.
- **Add screens**: "How was it paid?" and "Frequency" swapped to
  SectionLabel; itemized total uses proper typography tokens.

### Round 3 — Overlays, notifications & Add sub-components
- **`DraggableSheet`** (bottom sheet): radius.xl top corners, bigger
  40×4 grabber handle (was 40×5 bordered), 92% max height (was 88%),
  snappier spring (damping 20 / stiffness 220), softer border.
- **`ModalHeader`**: optional `subtitle` slot; smaller close icon
  (22 vs 24) for less visual weight; symmetric 44×44 sides so title
  stays optically centered.
- **`MoreOptions`**: pill-shaped disclosure with animated (rotating)
  chevron and selection haptic, on `bgMuted` — reads as a control now,
  not a lost link.
- **`UndoToast`**: radius.lg (was md), softer `bgElevated` background
  (was flat `bgMuted`), tighter padding, letterSpacing on the Undo
  action.
- **`RecurringSuggestionBanner`**: radius.lg, larger tinted icon dot,
  softer bottom margin.
- **`KindToggle`** (Expense/Transfer/Income): 13pt labels (was 11pt —
  near-illegible), 40pt tall pill, 88pt min width per button,
  selection haptic on switch, border definition on the track.
- **`AmountField`** (Add hero amount): now uses `type.amountXXL` (48pt)
  — was hand-set 36pt. Thicker (3pt) cursor bar, dimmer placeholder.
- **`CategoryDatePills`**: bigger 44pt tap targets, tinted border when a
  category is picked (filled-state affordance), calendar icon on the
  date pill for scanability.

### Round 4 — Category / History / Home consolidation
- **Category detail** (`app/category/[name].tsx`):
  - Live header subtitle: "27 transactions this month".
  - Hand-rolled segmented pills swapped for shared `TabPills`.
  - Hero amount uses `AmountText` xl (was hand-set 30pt SpaceMono).
  - Every uppercase section (Budget / Spent / Where it goes / Top
    places / Recurring / Goals / Transactions) → `SectionLabel`.
- **History** (`app/history.tsx`):
  - Live header subtitle: "42 entries".
  - Date-group headers (Today / Yesterday / dd MMM) → `SectionLabel`
    with entry-count badge.
  - Dropped the intro paragraph (context is in the subtitle now).
- **Home Consolidation**: The `StreakCard` was folded into `ForecastCard`
  — the single "This month" tile now shows Forecast → Biggest shift →
  Streak with dividers between each. Each block hides when empty. The
  separate `StreakCard` is still rendered as a fallback on Today/Year
  tabs where the forecast tile isn't shown. Card uses `radius.xl`
  and the internal eyebrow labels reuse the `overline` token.

---

## Verification status
**No visual verification performed** — this is React Native / Expo;
Emergent's browser preview tool can't render it. All 33+ touched files
pass bracket-balance checks (`{`, `(`, `[` all `+0`). **User must run
`cd /app/budgetsplit && npx expo start`** on their device to visually
QA. If anything looks off, share a screenshot and I'll iterate.

## Backlog / next priorities
- **P1**: Reports (`app/reports.tsx`) — remaining screen with drifted
  inline uppercase labels.
- **P1**: Settings / Storage — likely more shouty labels.
- **P2**: Skeleton loaders on cold load.
- **P2**: TxnDetail screen — check for typography drift.
- **P3**: Consider a global `AppToast` for non-undo notifications
  (currently only `UndoToast` exists for destructive-with-undo).
- **P3**: `HeroCard`'s hand-rolled ring vs a shared `RingProgress`
  primitive so it's reusable.

## User personas
- **Solo spender**: tracks own money (`flags.splitting = false`). Groups
  tab becomes "Personal".
- **Group spender**: flat-mates, trips, families — splits shared costs.
- **Optimizer**: uses Insights / Recurring / Forecast to plan ahead.
