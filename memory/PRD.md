# BudgetSplit — UI/UX Overhaul PRD

## Original problem statement
Continuously improve the app's UI/UX until it reaches production quality
comparable to Apple, Linear, Notion, Stripe, Airbnb, Arc, and Raycast.
Challenge every design decision. Full overhaul, dark-only, main screens
first (Home / Groups / Group Budget / Plan / Insights / Add expense/
transfer/income / Review).

## Tech stack (existing)
- Expo Router (React Native 0.85, React 19, TypeScript)
- SQLite (expo-sqlite) — local-first storage, no backend
- Zustand store, gifted-charts, expo-blur, expo-haptics
- Custom `src/theme/` design system (colors / typography / layout / alpha)

## What's been implemented (Jan 2026)

### Design-token refinements (cascades to every screen)
- **Typography** (`src/theme/typography.ts`): added `display` (34pt), `overline`
  (11pt uppercase). Tightened tracking on all headings and numeric sizes
  (Apple-numeric feel). Added `amountXXL` (48pt) for hero surfaces.
- **Colors** (`src/theme/colors.ts`): raised `bgCard` a shade (softer
  stripe against bg). Added `divider` token (softer than `border`).
  Tightened the `accent` gradient stops so buttons don't read as
  "two-tone stripe".
- **Layout** (`src/theme/layout.ts`): added `radius.xl` (20), `radius.xxl`
  (28), `layout.minTap` (44 — iOS HIG minimum tap target), `layout.hairline`.

### Core UI primitives (rewritten)
- **`PrimaryButton`**: flat solid accent (no gradient), 1px inner top
  highlight (Apple tactile finish), no drop-shadow (cleaner on dark),
  deeper 0.96 press-scale.
- **`ScreenHeader`**: 44×44 back tap-target (was 32×32), optional
  `subtitle` slot for context (kills the "intro paragraph beneath the
  header" pattern used in ~6 screens).
- **`TabPills`**: animated sliding indicator (was hard-cut swap on every
  change). Uses selection haptic on change.
- **`SectionCard`**: rotating chevron (was icon-swap flicker), icon disc
  tinted by `iconColor` (was always accent), body divider on expand.
- **`EmptyState`**: tighter proportions (56px icon vs 64), softer 8%
  background tint (was 13%), heading typography.
- **`Badge`**: unified 14% background across all tones (was per-tone
  re-invented).
- **`SecondaryButton`**: filled subtle surface + accent border (was
  outline-only — now reads properly as second-choice).
- **`AmountText`**: new `xxl` size (48pt tabular).

### New primitive
- **`SectionLabel`** (`src/components/ui/SectionLabel.tsx`): the single
  source of truth for uppercase eyebrow labels. Replaces ~20 inline
  TextStyle declarations across screens with drifted fontSize (10/11/12)
  and letterSpacing (0.5/0.8/1). Built-in `count` prop.

### Priority screen updates
- **Home** (`app/(tabs)/index.tsx`): hero amount now 48pt (was 36pt) —
  more premium. "Get started" uses SectionLabel.
- **Groups** (`app/(tabs)/groups.tsx`): "My groups" and "People" use
  SectionLabel.
- **Insights** (`app/insights.tsx`): 6 shouty inline labels
  ("RECOMMENDATIONS", "DRIVING OVERSPEND", "SHIFTS VS LAST MONTH", etc.)
  swapped for SectionLabel. Header now uses `subtitle` slot for the
  date context (removed the "MonthPill" and eyebrow paragraph).
- **Recurring** (`app/plan/recurring.tsx`): `ScreenHeader.subtitle` shows
  live "3 active · ₹4,200/mo" context, killing the intro paragraph.
  "Active · N" label uses SectionLabel.

## Backlog / next priorities
- **P0**: Verify visually via `expo start` on the user's device — I
  cannot render React Native in this environment.
- **P1**: Apply the same primitives to Review, Group Budget, Add
  Expense, Add Transfer, Add Income screens (same patterns — ~10 more
  inline `secLabel` occurrences to swap).
- **P1**: Refine the FAB — the coral shadow reads a touch aggressive
  on the dark bg; consider a softer glow radius.
- **P2**: `SheetModal` — add snap-point handoff for the group form
  sheets so long forms don't overflow.
- **P2**: Streak / Forecast cards — consider consolidating into a single
  "This month" summary tile for less vertical scroll.
- **P2**: Skeleton loaders on the initial data load (currently renders
  nothing until ready, which flashes an empty screen briefly on cold
  starts).

## User personas
- **Solo spender**: tracks own money, no splitting (`flags.splitting = false`).
  Groups tab becomes "Personal".
- **Group spender**: flat-mates, trips, families — splits shared costs.
- **Optimizer**: uses Insights, Recurring, and Forecast to plan.
