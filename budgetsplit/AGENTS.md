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

```tsx
// Correct: grouped in a card
<View style={{ backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadow.sm }}>
  <Row />
  <Divider />
  <Row />
</View>

// Wrong: bare field in ScrollView
<TextInput style={...} />
<TextInput style={...} />
```

Rules:
- Card background: `colors.bgCard`
- Border: `1px, colors.border`
- Border radius: `radius.lg` (16px)
- Shadow: `shadow.sm`
- Between cards: `marginBottom: space.md` (16px)
- Between sections: `marginBottom: space.lg` (24px)

---

## 4. Settings-Style Form Rows (for forms inside cards)

All forms use this pattern:

```
[icon circle 32×32]  [Label]             [Value text]  [›]
```

- Row height: minimum 52pt (iOS HIG minimum touch target)
- Left: 32×32 colored icon circle + label (`type.body`, `textPrimary`)
- Right: value (`type.body`, `textSecondary`) + `chevron-right` if tappable
- Inline TextInput: right-aligned, NO separate border inside a card row
- Hairline divider between rows: `{ height: 1, backgroundColor: colors.border, marginLeft: 32 + 16 + 16 }` (indented past icon)

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

Icon in a colored dot:
```tsx
<View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
  <Feather name={icon} size={18} color={color} />
</View>
```

- Icon opacity bg = icon color + `'22'` (hex ~13% opacity)
- Never `'wallet'` — it doesn't exist in Feather. Use `'credit-card'`.

---

## 9. Spacing System

| Token | Value | Use |
|---|---|---|
| `space.xs` | 4px | Icon gap, dot separator |
| `space.sm` | 8px | Between label and value, row padding |
| `space.md` | 16px | Card padding, between cards, row padding |
| `space.lg` | 24px | Between sections, bottom of screen |
| `space.xl` | 32px | Empty state padding, hero padding |
| `space.xxl` | 48px | Top of hero section |
| `layout.screenPaddingH` | 16px | Screen horizontal padding |

---

## 10. Color Discipline

Never raw hex. Always use tokens.

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
| `colors.textMuted` | `#5A6B69` | Placeholders, captions, disabled |
| `colors.border` | `#21302E` | Card borders, dividers |

---

## 11. Animations

- `PressableScale` on all tappable cards and rows — spring scale 0.97, `haptics={false}`
- `FadeIn` with stagger on list renders: `delay={index * 55}`, don't exceed 330ms total
- `BudgetBar` animated on mount
- Skeleton loaders while data loads — never bare `ActivityIndicator` on full screens
- Navigation: modals slide from bottom, push screens slide from right, tabs fade

---

## 12. Lists and Transactions

- Transaction rows: min 60px height
- Section headers: `type.caption`, UPPERCASE, `colors.textMuted`, `letterSpacing: 0.5`
- Row separators: 1px `colors.border`, full width OR indented to text (not icon)
- "Today" / "Yesterday" / "14 Jun" for date section headers
- Swipe-to-delete with `react-native-gesture-handler`

---

## Code Quality Rules

- **Money is always integer paise.** `parseToPaise()` to convert. `formatRupees()` to display. Never floats.
- **Multi-table writes** always inside `db.withTransactionAsync()`. Zero partial writes.
- **UUIDs**: `import 'react-native-get-random-values'; import { v4 as uuid } from 'uuid';`
- **No `new Date()` in DB operations** — use `Date.now()` for timestamps.
- **StyleSheet.create()** for all styles. Inline objects only for dynamic values (color from state, etc).
- **Import from tokens**: `import { colors, type, space, radius, shadow, gradients } from '../components/tokens'`
- **No `any` types** unless wrapping an untyped third-party API.
- **Null checks**: check results before using — DB queries can return null for missing rows.
