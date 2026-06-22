---
name: budgetsplit-design
description: Use this skill to generate well-branded interfaces and assets for BudgetSplit (an offline-first personal-finance & bill-splitting mobile app), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## What's here
- `readme.md` — the full design guide: product context, content voice, visual foundations, iconography, and a file manifest. **Start here.**
- `styles.css` + `tokens/` — the CSS custom properties (colors, type, spacing) and webfonts (Inter + Space Mono). Link `styles.css` to inherit every token.
- `components/` — React UI primitives (Button, Card, Input, Switch, SettingsRow, EmptyState, AmountText, TransactionRow, BudgetBar, CategoryChip, Badge, MemberAvatar, FAB, Icon/IconCircle). Each has a `.d.ts` (props) and `.prompt.md` (usage).
- `guidelines/` — foundation specimen cards (colors, type, spacing, brand).
- `ui_kits/budgetsplit/` — an interactive phone-framed recreation of the app (onboarding, dashboard, groups, reports, settings, add-sheet).
- `assets/` — the donut logo mark and app icons.

## Brand in one breath
Dark, near-black teal-tinted surfaces; one teal brand accent (#20C4B8) + coral spark (#FF6F61); **Inter for words, Space Mono for money** (₹, Indian grouping); Feather icons in colored circles; everything grouped in bordered cards with soft halo shadows; calm, private, ledger-like. No emoji. One hero number per screen.

## Icons & fonts
- Icons: **Feather** only, 2px stroke. Load `https://unpkg.com/feather-icons` and use `Icon` / `IconCircle`.
- Fonts: Inter + Space Mono (loaded from Google Fonts via `tokens/fonts.css`). If self-hosting is required, drop the woff2s in `assets/fonts/` and swap the `@import` for `@font-face`.
