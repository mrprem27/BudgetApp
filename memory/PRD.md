# BudgetSplit — UI/UX Overhaul PRD

## Original problem statement
Continuously improve the app's UI/UX until it reaches production quality
comparable to Apple, Linear, Notion, Stripe, Airbnb, Arc, and Raycast.
Challenge every design decision. Dark-only. Priority: Home, Groups, Group
Budget, Plan, Insights, Add expense/transfer/income, Review, Category
detail, History, overlays / notifications / Add-flow sub-components, and
**Groups end-to-end (each sub-section) grounded in FEATURES_AND_FLOWS.md**.

## Guiding constraints (as per user)
- **Don't inflate font sizes unnecessarily.**
- **Don't remove features.**
- **Keep the app fast, calibrated, not clunky.**

## Tech stack (existing)
- Expo Router (React Native 0.85, React 19, TypeScript)
- SQLite (expo-sqlite) — local-first, no backend
- Zustand store, gifted-charts, expo-blur, expo-haptics
- Custom `src/theme/` design system

---

## What's been implemented

### Round 1 — Design tokens & primitives
`display`, `overline`, `amountXXL` type tokens; softer `bgCard`; new
`divider` token; `radius.xl`/`xxl`; `layout.minTap` (44). Rewrote
`PrimaryButton`, `ScreenHeader` (+ subtitle slot), `TabPills`
(animated), `SectionCard`, `EmptyState`, `Badge`, `SecondaryButton`,
`AmountText` (added `xxl`). Added `SectionLabel`.

### Round 2 — Screen polish
Group Budget hero + subtitle; motion pass on Home; Review swipe-to-
delete + live subtitle; Add screens uppercase-label sweep.

### Round 3 — Overlays & Add sub-components
`DraggableSheet` (radius.xl, softer handle, snappier spring),
`ModalHeader` (subtitle slot), `MoreOptions` (pill + animated
chevron), `UndoToast` (softer, radius.lg), `RecurringSuggestionBanner`,
`KindToggle` (13pt labels, tactile), `CategoryDatePills` (44pt taps).
**Note (Round 5 correction)**: `AmountField` briefly used
`amountXXL` (48pt) — reverted to `amountXL` (36pt) per user request.

### Round 4 — Category / History / Home consolidation
Category detail: header subtitle, TabPills, SectionLabel sweep.
History: header subtitle + SectionLabel sweep.
Home consolidation: Streak folded into a single "This month" tile
inside ForecastCard (was two separate cards → one).

### Round 5 — Groups sweep (grounded in FEATURES_AND_FLOWS.md §4 / §5)
- **Group hub** (`app/group/[id].tsx`): removed the hand-rolled
  breadcrumb header ("‹ Groups › {name}") and its duplicate-title
  `GroupHero(name)`. Now a single `ScreenHeader` with the group name
  as title, subtitle `"N members · ₹X this month"`, and the ⋯ menu
  as a themed round header button — matches the pattern used on
  every other screen. Hand-rolled tab strip replaced with the shared
  animated `TabPills` component (Expenses · Recurring · Budget ·
  Members). No feature removed; no font inflation.
- **`GroupHero`**: slimmed to a compact identity strip — coloured
  icon tile + AvatarStack. Name and count now live in the header
  subtitle, so the previous duplicates are gone. Kept the identity
  cues (colour, member faces) that text can't carry.
- **`GroupBalanceCard`**: uppercase label → `type.overline`;
  amount uses `type.amountLG` token (was hand-set 22pt); no size
  change to the visible amount. Consistent tokens throughout.
- **BudgetTab**: "Who paid what" and each section heading
  (Home & Living, Food, …) now use `SectionLabel`. Overview card
  unchanged (already tokenised). No sizes inflated.
- **MembersTab**: "N payments to settle" now uses
  `<SectionLabel count={N}>Payments to settle</SectionLabel>`.
- **Reverts (per user font guidance)**: Home hero back to `xl`
  (36pt) from `xxl` (48pt); Group budget commitment back to `xl`;
  AmountField input back to `xl` (36pt).

---

## Verification status
**No visual verification performed** — React Native / Expo, no
browser preview possible. Every touched file passes bracket-balance
checks. Run `cd /app/budgetsplit && npx expo start` on the device
to see the changes.

## Backlog / next priorities
- **P1**: Reports (`app/reports.tsx`) — sweep remaining inline
  uppercase labels.
- **P1**: Settings — long list of ad-hoc rows; align to `SettingsRow`
  patterns already used elsewhere.
- **P2**: Skeleton loaders on cold-open.
- **P2**: `TxnDetail` screen — check for typography drift.
- **P3**: A global non-destructive `AppToast` alongside `UndoToast`.

## User personas
- **Solo spender**: tracks own money.
- **Group spender**: flat-mates, trips, families — splits shared costs.
- **Optimizer**: uses Insights / Recurring / Forecast to plan ahead.
