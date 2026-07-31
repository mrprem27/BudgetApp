# BudgetSplit — UI/UX Overhaul PRD

## Original problem statement
Continuously improve the app's UI/UX until it reaches production quality
comparable to Apple, Linear, Notion, Stripe, Airbnb, Arc, and Raycast.
Challenge every design decision. Full overhaul, dark-only, main screens
first (Home / Groups / Group Budget / Plan / Insights / Add expense /
transfer / income / Review).

## Tech stack (existing)
- Expo Router (React Native 0.85, React 19, TypeScript)
- SQLite (expo-sqlite) — local-first, no backend
- Zustand store, gifted-charts, expo-blur, expo-haptics
- Custom `src/theme/` design system (colors / typography / layout / alpha)

---

## What's been implemented

### Round 1 (Jan 2026) — Design tokens & primitives

- **Typography** (`src/theme/typography.ts`): added `display` (34pt),
  `overline` (11pt uppercase), `amountXXL` (48pt). Tighter tracking on
  all headings and numeric sizes (Apple-numeric feel).
- **Colors** (`src/theme/colors.ts`): raised `bgCard` shade, added
  `divider` token, tightened `accent` gradient stops.
- **Layout** (`src/theme/layout.ts`): `radius.xl` (20), `radius.xxl` (28),
  `layout.minTap` (44), `layout.hairline`.
- **`PrimaryButton`**: solid accent + inner top highlight (no gradient/
  shadow), deeper 0.96 press-scale.
- **`ScreenHeader`**: 44×44 back button, optional `subtitle` slot.
- **`TabPills`**: animated sliding indicator (was hard-cut swap).
- **`SectionCard`**: rotating chevron, tinted icon disc, body divider.
- **`EmptyState`**: tighter proportions (56px icon, 8% tint).
- **`Badge`**: unified 14% background across tones.
- **`SecondaryButton`**: filled surface + accent border.
- **`AmountText`**: new `xxl` (48pt tabular) size.
- **New `SectionLabel`**: single source of truth for uppercase eyebrows.

### Round 2 (Jan 2026) — Screen polish

- **Group Budget** (`app/group/[id]/budget.tsx`):
  - Header now uses live `subtitle`: "3 categories · ₹42k/mo".
  - Hero total swapped to `AmountText size="xxl"` (48pt) — was 36pt.
  - Removed the verbose intro paragraph.
  - Cleaner `radius.xl` totalCard, softer `divider` between rows,
    dropped double-divider on first row of each section.
- **Motion Pass** (`app/(tabs)/index.tsx` + `CategoryRankList`):
  - Home hero, tabs, category list, balance strip, forecast, streak
    each get their own `FadeIn` with staggered delays (0/80/160/220/
    280/340ms) — premium cascade on cold open.
  - Category rows inside `CategoryRankList` fade in at `i * 50ms`.
  - `CategoryRankList` "WHERE IT WENT" label swapped for `SectionLabel`.
- **Review Redesign** (`app/review.tsx`):
  - Header uses live `subtitle`: "12 to review", "8 of 24" when filtered,
    "3 selected of 24" when in select mode.
  - Dropped the duplicate "To review · N transactions" ListHeader intro
    paragraph (info is in the header subtitle now).
  - "Assign all to" chips get leading icons (`user` / `users`) for
    faster scanning.
  - "Select all" now a button with checkbox icon (was plain text link).
  - Section headers (source groups) swapped for `SectionLabel count={n}`.
  - **Swipe-to-delete**: every pending row is now `Swipeable`
    (react-native-gesture-handler) with a coral "Remove" action on
    right-swipe — matches the pattern already used on Groups. Undo
    toast is triggered as before.
- **Add screens** (`app/add/quick.tsx`, `RecurringControls`):
  - "HOW WAS IT PAID?" → `SectionLabel` ("How was it paid?").
  - "FREQUENCY" (recurring) → `SectionLabel` tinted purple.
- **Itemized bill wizard** (`app/add/itemized.tsx`):
  - Total label uses `type.overline` (was ad-hoc caption+letterSpacing).
  - Total amount uses `type.amountLG` (24pt tabular; was 28 hand-set).

---

## Verification status
**No visual verification performed** — this is React Native / Expo;
Emergent's browser preview tool can't render it. All changes are code-
level with bracket-balance-verified files. **User must run
`cd /app/budgetsplit && npx expo start`** on their device to visually
QA. If anything looks off, share a screenshot and I'll iterate.

## Backlog / next priorities
- **P1**: Category detail screen (`app/category/[name].tsx`) — likely
  has more inline `secLabel` occurrences to sweep.
- **P1**: History (`app/history.tsx`), Reports (`app/reports.tsx`),
  Storage / Settings screens — same treatment.
- **P2**: Consider consolidating Home's Streak + Forecast cards into a
  single "This month" summary tile to reduce vertical scroll on the
  dashboard.
- **P2**: Skeleton loaders on cold load (currently flashes empty).
- **P2**: `SheetModal` — snap-point handoff so long forms don't overflow.
- **P3**: Motion pass on Groups list (staggered FadeIn per group row).

## User personas
- **Solo spender**: tracks own money (`flags.splitting = false`). Groups
  tab becomes "Personal".
- **Group spender**: flat-mates, trips, families — splits shared costs.
- **Optimizer**: uses Insights / Recurring / Forecast to plan ahead.
