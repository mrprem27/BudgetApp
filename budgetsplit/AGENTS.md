# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

---

# BudgetSplit — Design System & Build Rules

Based on production patterns from Revolut, YNAB, Wallet by BudgetBakers, and Apple HIG.
**These rules are non-negotiable.** Violating them makes the app look amateur.

---

## 1. Visual Hierarchy — One hero element per screen

- Each screen has ONE number or piece of info that matters. Make it visually dominant.
- Money amounts in `SpaceMono_400Regular`. Everything else in `Inter_400Regular` / `Inter_600SemiBold`.
- Max 3 font sizes per screen: heading → body → caption. Never compete with the hero.
- Screen titles use `type.title` (28px, SemiBold). Tab-level, not every screen.
- Modal headers use `type.heading` (20px, SemiBold).

---

## 2. Empty States — Never just text

Every list/data empty state MUST have ALL of these:

```
[64×64 icon circle — accentMuted bg, accent icon]
[Bold short title — type.subheading]
[1–2 line explanation — type.body, textSecondary]
[Primary CTA button — PrimaryButton component]
```

Never render just a `<Text>` saying "Nothing here" or "No X yet". That looks broken.

---

## 3. Cards — Group everything

Never let form fields, rows, or data float bare on the dark background.

**Use the `Card` component** (`components/ui/Card.tsx`) — the four-property recipe
below was hand-written ~30 times, and the screens that didn't bother left their
content floating.

```tsx
// Correct
<Card>
  <ListRow … />
  <Divider indent="text" />
  <ListRow … />
</Card>

<Card padded>{/* `padded` when the card holds content, not rows */}</Card>

// Wrong: bare field in ScrollView
<TextInput style={...} />
<TextInput style={...} />
```

What `Card` gives you (don't re-declare these):
- Card background: `colors.bgCard`
- Border: `1px, colors.border`
- Border radius: `radius.lg` (16px)
- Shadow: `shadow.sm`

Spacing is still the caller's job:
- Between cards: `marginBottom: space.md` (16px)
- Between sections: `marginBottom: space.lg` (24px)

Section eyebrows use **`SectionHeader`**, which owns its own vertical margins — do
not also put a `gap` on the scroll container, or the two silently add up.

---

## 4. Form Rows (for forms inside cards)

**Use the `ListRow` component** (`components/ui/ListRow.tsx`) — don't hand-roll rows.
It has two variants, and both are correct:

```
inline   [icon circle 32×32]  [Label]            [Value text]  [›]
stacked  [icon circle 32×32]  [LABEL]                          [›]
                              [Value text                        ]
```

- **`inline`** — settings rows, and anything whose value is short. The label holds
  its width; the value shrinks and is capped at 45%.
- **`stacked`** — form rows whose value can be long: category names, place labels,
  `"Monthly · until 12 Dec"`. The value gets the full row width, so it doesn't
  truncate, and a labelled value is a stronger signifier of "tappable" than a bare
  pill. `V2_PRODUCT_REVIEW.md` §7.4 called truncation "a pattern, not four bugs" —
  caused by fixed-width value text. This variant is what closes that class.

Rules for both:
- Row height: minimum `layout.rowMinHeight` (52pt, iOS HIG minimum touch target)
- Left: `layout.iconCircle` (32) `IconCircle` + label (`type.body`, `textPrimary`)
- Right: value + `chevron-right` if tappable
- Inline TextInput: right-aligned, NO separate border inside a card row
- Hairline divider between rows: **`<Divider indent="text" />`** (`layout.dividerIndent`,
  64px — clears the icon disc). `settingsRowDivider` is a deprecated alias for it.

`SettingsRow` still exists as a thin adapter over `ListRow` for the icon+label+value
case; prefer `ListRow` directly in new code.

---

## 5. Buttons — Use PrimaryButton, never plain TouchableOpacity for CTAs

```tsx
// Correct
<PrimaryButton label="Save" onPress={handleSave} loading={saving} />

// WRONG — never use plain TouchableOpacity with accent background for primary actions
<TouchableOpacity style={{ backgroundColor: colors.accent, ... }}>
  <Text>Save</Text>
</TouchableOpacity>
```

**Exception — modal headers.** A `fullScreenModal` form puts its commit action in the
header's right slot as a text button (`type.button`, tinted, `hitSlop={10}`), opposite
the ✕. The two ends of one bar read as "leave without saving" / "save"; a footer CTA
reads as a page action and pushes the form up. `add/quick.tsx` is the reference.
Everywhere that isn't a modal header, the rule below stands.

Rules:
- **Primary CTA**: `PrimaryButton` component (gradient fill, 52px height, white text)
- **Secondary**: border `1px colors.accent`, `colors.accent` text
- **Destructive**: `colors.expense` fill or text
- **Ghost**: `colors.accent` text only, no border, no background
- All buttons: 52px height, `radius.md` (12px) border radius

---

## 6. Touch Targets — iOS HIG minimum 44×44pt

- Every interactive element must be at least 44×44pt
- Use `hitSlop={10}` on icon-only buttons
- List rows: minimum 48pt height
- Tab bar items: height = `layout.tabBarHeight + insets.bottom`

---

## 7. Haptic Feedback — Sparingly, only for meaningful actions

```ts
haptic.success()   // ✅ successful save / create / settle
haptic.warning()   // ✅ delete / remove / destructive confirm
haptic.error()     // ✅ validation failure
haptic.selection() // ✅ segmented control / category grid selection
haptic.light()     // ✅ FAB open (one-time, meaningful)

// ❌ NEVER for:
// - navigation (router.back, router.push)
// - tab switching
// - opening modals or bottom sheets
// - informational taps on cards/rows
// - any PressableScale press (the spring animation IS the feedback)
```

`PressableScale` `haptics` prop defaults to `false`. Set `haptics={true}` only on destructive rows.

---

## 8. Icons — Only Feather icons

**Valid Feather icons only.** Unknown names render as `?`.

Verified working icons for group types:
`credit-card`, `home`, `users`, `map`, `coffee`, `shopping-cart`, `heart`, `zap`, `star`, `briefcase`, `book`, `music`, `camera`, `globe`, `activity`, `award`

Icon in a colored dot — **use the `IconCircle` component**, don't hand-roll it:
```tsx
// Correct
<IconCircle icon="coffee" color={colors.accent} size={36} />
<IconCircle icon="bell" color={colors.accent} bg={colors.accentMuted} />   // token bg

// WRONG — this inline shape was copy-pasted ~40 times before IconCircle existed
<View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
  <Feather name={icon} size={18} color={color} />
</View>
```

- `IconCircle` lives in `components/ui/IconCircle.tsx`. Defaults reproduce the old
  snippet exactly: icon = `size / 2`, background = icon colour + `'22'`.
- Icon opacity bg = icon color + `'22'` (hex ~13% opacity)
- Never `'wallet'` — it doesn't exist in Feather. Use `'credit-card'`.

---

## 9. Spacing System

| Token | Value | Use |
|---|---|---|
| `space.xs` | 4px | Icon gap, dot separator |
| `space.sm` | 8px | Between label and value, row padding |
| `space.smd` | 12px | Chip padding, tight row gaps — the step that was being improvised as `space.sm + 4` |
| `space.md` | 16px | Card padding, between cards, row padding |
| `space.lg` | 24px | Between sections, bottom of screen |
| `space.xl` | 32px | Empty state padding, hero padding |
| `space.xxl` | 48px | Top of hero section |
| `layout.screenPaddingH` | 16px | Screen horizontal padding |

**Never do arithmetic on a spacing token.** `space.sm + 2` (=10) and `space.sm + 4` (=12) appeared ~70 times between them and are not part of the scale. Use `space.smd` for 12; round a 10 to 8 or 12.

Sizing tokens — reach for these instead of a literal:

| Token | Value | Use |
|---|---|---|
| `layout.touchMin` | 44 | Minimum tappable size (§6) |
| `layout.rowMinHeight` | 52 | Settings / list row floor (§4) |
| `layout.txnRowHeight` | 60 | Transaction row floor (§12) |
| `layout.iconCircle` | 32 | Icon disc in a form row (§4) |
| `layout.avatarSize` | 40 | Member/person avatar |
| `layout.dividerIndent` | 64 | Row divider indent, clears the icon disc |

Bottom padding for a scroll container comes from **`useContentInset({ fab, tabBar, footer })`** (`src/hooks/useContentInset.ts`) — never a literal. Hard-coded `paddingBottom: 100` is why `UX_AUDIT.md` High #3 found the FAB covering real content on six screens.

### Pills and chips — one component, no exceptions

**The pill shape is `ui/Chip`.** Never hand-roll one. Seven near-identical variants
existed before it, and four *survived* the first sweep — the Add screen ended up with
primitive-built chips stacked directly above hand-rolled pills of almost the same shape,
which reads worse than plainly different controls do.

A chip has **one** trailing affordance, and it says what tapping does:

| Trailing | Means | Prop |
|---|---|---|
| `✕` | this value can be cleared | `onRemove` |
| `⌄` | this opens a picker | `chevron` |
| nothing | it's a toggle, or read-only | — |

Never both — a chip showing `✕` and `⌄` claims to be each.

**The icon is identity, not state.** Every chip shows its own glyph in *every* state.
Unset is when the user most needs to know what a control is, so a shared `+` glyph on
four unset chips (which is what `DetailChips` shipped with) is exactly backwards. State
is carried by the tint, by the value replacing the name, and by the `✕`.

Use `grow` for a chip that should fill its row; it wraps in a plain `View` because
`PressableScale` applies `style` to an inner `Animated.View`.

**Segmented choice → `TabPills`, not a chip row.** A row of chips says "toggle any of
these"; a segmented control says "pick exactly one". `RecurringControls`' frequency and
end-mode were chip rows and read as multi-select.

**One deliberate second pill weight exists:** `finance/add/ContextPill`. It is quieter
and centred because a transaction's destination is *context above the hero*, not a field
— uniform tokens, deliberate hierarchy. That distinction is the reason this rule is about
hand-rolling rather than about looking identical.

---

## 10. Color Discipline

Never raw hex. Always use tokens.

**Canonical theme = `src/theme/`** — the single source of truth for every design token
(`colors`, `gradients`, `type`, `line`, `space`, `radius`, `layout`, `shadow`), plus a composed
`theme` object. Import from `src/theme` (or `../tokens` inside a component subfolder, which
re-exports it). `src/constants/{colors,typography,layout}` are back-compat re-export shims that
also point at `src/theme` — prefer `src/theme` in new code. White-on-fill text/icons use
`colors.onAccent` (never raw `#fff`).

| Token | Color | Use |
|---|---|---|
| `colors.accent` | Teal `#20C4B8` | Primary buttons, active tabs, selected borders, links |
| `colors.coral` | `#FF6F61` | FAB gradient end, danger hints |
| `colors.income` | Green `#2BD49B` | Positive amounts, success |
| `colors.expense` | Coral `#FF6F61` | Negative amounts, warnings |
| `colors.settle` | Purple `#8B7CF8` | Settlement transactions |
| `colors.bg` | `#0A0F11` | Screen background |
| `colors.bgCard` | `#13201F` | Card background |
| `colors.bgMuted` | `#1B302D` | Tab pills, segmented control bg |
| `colors.bgInput` | `#162825` | TextInput background |
| `colors.textPrimary` | `#ECF3F1` | All primary text |
| `colors.textSecondary` | `#8FA3A0` | Supporting text, labels |
| `colors.textMuted` | `#7C918E` | Placeholders, captions, disabled. Was `#5A6B69` — 2.98:1 on `bgCard`, below WCAG AA. `contrast.test.ts` holds the floor |
| `colors.border` | `#21302E` | Card borders, dividers |

---

## 11. Animations

**Take one off the shelf; don't hand-roll.** The primitives live in
`components/ui/` and `components/ui/anim/`:

| Primitive | For |
|---|---|
| `PressableScale` | All tappable cards and rows — spring 0.97, `haptics={false}` |
| `FadeIn` | A single element entering on mount |
| `Stagger` | A list cascading in. Enforces the 330ms cap for you |
| `Collapse` | A row leaving, and the gap closing behind it |
| `StepTransition` | Moving between wizard steps (onboarding, itemized) |
| `AnimatedNumber` | The one hero figure on a screen landing on its value |
| `AnimatedBar` | Progress / meter fills |

Rules:
- **Native driver, opacity and transform only.** `height` and `width` are not
  native-drivable — animating them interpolates on the JS thread. Animate `scaleX`
  or use Reanimated's `layout` prop instead. A percentage `left`/`top` is a *layout*
  property too — it re-runs layout every frame. Measure once with `onLayout` and
  `translateX` instead.
- ⛔ **`withSpring` / `withTiming` return an animation, not a number.** They are valid
  **only** as a style property's value, or assigned to a shared value. Passing one as an
  *argument* — `interpolateColor(withSpring(x), …)`, or `` `${withSpring(x)}deg` `` —
  **typechecks** (both are `number` to TypeScript) and then crashes the app on the UI
  thread: `Invalid color value: "rgba(NaN, NaN, NaN, NaN)"`, or a silent
  `"[object Object]deg"`. Nothing in the toolchain catches it — not tsc, and not the test
  suite, which never renders a component. **Drive a shared value and let the animated
  style only read it:**
  ```tsx
  const p = useSharedValue(0);
  useEffect(() => { p.value = withSpring(on ? 1 : 0, SPRING); }, [on]);
  const style = useAnimatedStyle(() => ({ color: interpolateColor(p.value, [0, 1], [a, b]) }));
  ```
  This shipped twice in one change (`TabPills`, `TransferBody`) and crashed on launch.
- **Reanimated is already a dependency** (required by `expo-router`, used by
  `DraggableList`/`DraggableSheet`, worklets plugin configured in `babel.config.js`).
  Use it where layout itself must animate. Do **not** use `LayoutAnimation` — it's a
  legacy global API, unreliable under the New Architecture, and can't be scoped to
  one component.
- **Reanimated layout-animation callbacks run on the UI thread** (they're returned
  from inside a `'worklet'`). Reaching a React closure from one needs `runOnJS`.
- **Honour Reduce Motion.** Reanimated animations take
  `.reduceMotion(ReduceMotion.System)`; RN `Animated` ones read
  `useReducedMotion()` (exported by `react-native-reanimated` — don't write your own)
  and snap to the final state. Motion is polish; it must never be the only signal
  that something changed.
- **Never animate on scroll.** `Stagger` must not go inside a `FlatList`/`SectionList`
  `renderItem` — rows mount on recycle, so every row would re-animate as you scroll.
- Skeleton loaders while data loads — never bare `ActivityIndicator` on full screens
- Navigation: modals slide from bottom, push screens slide from right, tabs fade
- ⛔ `LogoAssembly.tsx` and the onboarding hero ring/fan are **never** modified.

---

## 12. Lists and Transactions

- **Transaction lists use `TransactionRow` inside `TxnCell`** — a section's rows share
  one card (first rounds the top, last the bottom, `Divider indent="text"` between).
  One chrome, everywhere. Rows must never float bare on `colors.bg` (§3).
- Transaction rows: min `layout.txnRowHeight` (64; §12's floor is 60)
- Section headers: **use `SectionHeader`**. It owns its vertical margins — do not also
  put a `gap` on the scroll container, or the two add up.
- ⛔ **Never put `gap` on the `contentContainerStyle` of a list that renders
  card-grouped rows.** The gap applies between *every* child, including each row, which
  slices a `TxnCell` card into separate slabs — the card's whole point is that its rows
  are contiguous. This shipped twice (`personal.tsx`, then `category/[name].tsx`) and
  was reported both times as "the rows have spacing left". Space the *header blocks*
  instead, or give individual items margins.
- ⛔ **`ScreenHeader` already applies `insets.top`.** Don't add it again on the list
  below it — `category/[name].tsx` did, for ~47pt of dead space on a notched phone.
- Row separators: **`Divider`**. `indent="text"` (64px, clears the icon) or `"none"`.
- Date section headers come from **`dateSectionLabel`** (`lib/txnGrouping`):
  "Today" / "Yesterday" / "14 Jun" / "14 Jun 2025" outside the current year.
- **`stickySectionHeadersEnabled={false}`** on transaction lists — these headers have
  no background, so a stuck one sits transparently over the rows scrolling under it.
- Swipe-to-delete with `react-native-gesture-handler`
- Bottom padding from **`useContentInset({ fab })`**, never a literal.

### The three kinds: analysis is two-sided, the ledger is three-sided

`txn.kind` is `expense` / `income` / `settlement` (a **Transfer** in the UI). They are not
interchangeable in an aggregation, and the rule is:

| Surface | expense | income | settlement |
|---|---|---|---|
| **Analysis** — category breakdowns, budgets, spend pace, the Reports donut | ✅ counted | ✅ counted, separately | ⛔ **excluded** |
| **Ledger** — transaction lists, Search, the expanded month list | ✅ shown | ✅ shown | ✅ **shown** |
| **Money math** (`lib/cash.ts`) | lowers cash | raises cash | moves cash both ways |

**Why settlements are excluded from analysis:** settling a debt isn't consumption. The
original purchase was already booked as an expense; counting the settlement too would
double-count the same money. `cash.ts` is the exception on purpose — cash genuinely moved.

**Never show one total across kinds.** Money in, money out and money moved do not belong in
a single figure — a "₹12,400 total" over a mixed list is measuring nothing. Sum per kind and
label it (`spent` / `received` / `moved`), or show a two-sided figure. Both
`report-transactions` and `search` shipped this bug: one dropped settlements from a filter
labelled "All", the other summed only expenses under the word "total".

**A kind's categories are its own** (`CATEGORY_KIND`), and the Add screen calls a transfer's
category its "Reason". If a kind's categories are collected, something must show them back —
collecting input you never display is the same as not collecting it.

### Pull-to-refresh — one rule

A screen gets `AppRefreshControl` **iff it loads DB data via `useScreenData`
AND owns its scroll container.** No exceptions by taste — either it matches or
it's on the exempt list below.

```tsx
<ScrollView refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
```

**Exempt, with the reason** (these load data but must NOT have it):
| Screen | Why |
|---|---|
| `search` | Query-driven. The list *is* the query result; pulling would re-run a stale search. |
| `afford`, `group/[id]/edit`, `settings/notifications` | Forms. A pull gesture fights the keyboard and there's no feed to refresh. |
| `txn/[id]` | Detail + actions, not a feed. Refetches on focus already. |
| `add/*` | Wizards. Never. |

---

## Code Quality Rules

- **Money is always integer paise.** `parseToPaise()` to convert. `formatRupees()` to display. Never floats.
- **Multi-table writes** always inside `db.withTransactionAsync()`. Zero partial writes.
- **UUIDs**: `import 'react-native-get-random-values'; import { v4 as uuid } from 'uuid';`
- **No `new Date()` in DB operations** — use `Date.now()` for timestamps.
- **StyleSheet.create()** for all styles. Inline objects only for dynamic values (color from state, etc).
- **Component folders**: place new components in the right bucket —
  `components/ui/` (generic primitives, no domain knowledge),
  `components/finance/` (budget/transaction/member/settle widgets),
  `components/system/` (onboarding, gates, privacy). `ui` must never import from `finance`/`system`; the others may import from `ui`. Shared tokens live at `components/tokens.ts`.
- **Import from tokens**: from inside a component subfolder use `import { colors, type, space, radius, shadow, gradients } from '../tokens'`; screens import components via `../../src/components/<folder>/<Name>`.
- **No `any` types** unless wrapping an untyped third-party API.
- **Null checks**: check results before using — DB queries can return null for missing rows.

---

## State & Data Access

The app is **local-first**: SQLite is the single source of truth. There is no Redux/React Query
and no in-memory data mirror. Layering:

| Layer | Lives in | Rule |
|---|---|---|
| Data (SQLite reads/writes) | `src/db/queries/` | All SQL here. Screens never inline SQL. |
| Pure logic / engines | `src/lib/` | No React, no `db`, no RN. Unit-testable (e.g. `settle`, `owe`, `savingsEngine`, `money`). |
| Reusable hooks | `src/hooks/` | React hooks shared across screens (e.g. `useScreenData`). |
| Global client state | `src/store/` (zustand) | Tiny + app-wide only (`me`, `groups`). **Not** a data mirror. |
| Screens | `app/` | Compose the above; see "screen thinness" below. |

- **Loading data in a screen → use `useScreenData`** (`src/hooks/useScreenData.ts`). It owns the
  `loading`/`error`/`refreshing` states, focus refetch, cross-screen refetch, and pull-to-refresh.
  Do **not** hand-roll `useState`+`load()`+try/catch+`useFocusEffect`+`useRefresh`.
  ```tsx
  const { data, loading, error, refreshing, onRefresh, reload } = useScreenData(
    async (db) => ({ items: await getItems(db, groupId) }),
    [groupId],
  );
  ```
  Reference implementations: [app/friends.tsx](app/friends.tsx) (simple), [app/personal.tsx](app/personal.tsx) (multi-value).
- **After a write, call `refresh()`** from `useDataRefresh()` (`components/system/DataRefreshProvider`).
  That re-runs every mounted screen's `useScreenData` *and* re-hydrates the store — never manually
  poke other screens. (A screen-local re-fetch is `reload()` from the hook.)
- **Current user / groups → read from the store** (`useStore(s => s.me)` / `s.groups`), don't
  re-query `getMe`/`getAllGroups` in every loader. The store is hydrated at the root by
  `StoreHydrator` and refreshed on the data-change signal.

## Project Structure — screen thinness

- Screens **compose**; they don't hold business logic. Heavy derivation/computation belongs in
  `src/lib/` (pure) or a feature hook in `src/hooks/`.
- When a screen file grows past **~300 lines**, extract: pull sub-views into
  `components/finance/<area>/` and logic into `src/lib`/`src/hooks`. Don't let screens become
  1000-line monoliths.
- Migrate legacy screens to `useScreenData` **opportunistically** — whenever you're already
  editing one for a feature, convert it; no big-bang migration.
