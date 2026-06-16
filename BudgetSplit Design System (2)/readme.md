# BudgetSplit — Design System

**BudgetSplit** is an offline-first personal-finance and bill-splitting mobile app, built for urban Indian working professionals (the category catalog is tuned for life in a city like Gurgaon — rent, society maintenance, household help, food delivery, cabs, metro, SIPs and EMIs). Two jobs in one app: **budget your own money**, and **split shared bills** with flatmates, friends and trip groups — settling up in the fewest payments. No account, no cloud, no tracking; everything lives on the phone and exports to CSV/PDF.

The product is a single React Native (Expo) app with four tabs — **Home** (dashboard), **Groups**, **Reports**, **Settings** — plus add flows (expense, income, transfer, itemized bill), group detail/budget/members, and a privacy lock gate.

This design system captures BudgetSplit's dark, teal-accented visual language as reusable web (React) components, foundation tokens, brand assets, and an interactive UI-kit recreation of the app — so you can design on-brand screens, mocks and prototypes.

## Sources

Built by reading the production codebase:

- **GitHub:** https://github.com/prem-bhati-27/BudgetApp — the `budgetsplit/` Expo app. The repo's `budgetsplit/AGENTS.md` is an exhaustive, non-negotiable design spec (hierarchy, cards, buttons, spacing, color discipline, icons, animations); the token values here are lifted verbatim from `src/constants/{colors,typography,layout}.ts` and component patterns from `src/components/`.
- Explore that repository further to build higher-fidelity recreations — every screen in `budgetsplit/app/` is a faithful reference.

> Note: a second repo, `prem-bhati-27/BudgetApp`, was named in the brief; the live product code lives under its `budgetsplit/` folder, which is what this system is based on.

---

## Content Fundamentals

How BudgetSplit writes copy. Match this voice in any new screens or marketing.

- **Voice — plain, calm, second person.** It talks to *you* ("Know where it goes", "Yours alone", "See what's left and the trend"). Warm but never chatty or salesy. No jargon, no exclamation marks (except a brief "Saved!" confirmation).
- **Benefit-first, short.** Feature lines lead with the payoff: "Split, minus the math.", "Budgets that hold.", "Log a spend in two taps and see the full picture." Sentences are short; fragments are fine.
- **Casing.** Screen/tab titles and section labels are sentence-case or UPPERCASE small-caps for section headers ("PRIVACY & SECURITY", "ACCOUNT"). Buttons are Title Case ("Get Started", "Settle Up", "Create Group", "Start using BudgetSplit"). Never ALL-CAPS shouting in body.
- **Privacy as a value, stated flatly.** "No account, no cloud, no tracking." · "Works fully offline" · "Offline-first · No accounts · No tracking". This is a core message — repeat it plainly.
- **Numbers & money.** Always Indian rupees with Indian digit grouping: `₹1,23,456.00`. Dashboard summaries round to whole rupees (`₹42,180`); transaction rows show paise. Money is the hero — give it room.
- **Microcopy is reassuring and concrete.** "Takes 20 seconds · no sign-up", "It's shown when you split bills with others.", "A heads-up before you overspend." Tell the user what happens and why.
- **Empty states never say "nothing here."** They explain and offer an action: *"No groups yet — Create a group to track shared expenses with friends, family or roommates."*
- **Dot separators (·)** join short related facts: "₹6,840 this month · 3 members", "Offline-first · No accounts · No tracking".
- **No emoji.** The brand expresses tone through Feather icons and color, never emoji.
- **Indian context.** Category names and examples are local: Chai & Snacks, Cab & Auto, Metro & Bus, Mobile Recharge, Investments / SIP, EMI & Loans, Household Help. Names in examples are Indian (Aarav, Priya, Rohit).

---

## Visual Foundations

The complete look and feel. See the **Design System tab** for live specimen cards.

### Mood
Dark, focused, ledger-like and trustworthy — a near-black canvas with a subtle teal tint, one confident teal brand color, a coral spark, and monospaced money. It reads like a calm private ledger, not a flashy fintech ad.

### Color
- **Surfaces are near-black, teal-tinted, and layered for elevation:** `--bg #0A0F11` (screen) → `--bg-card #13201F` (cards/sheets) → `--bg-input #162825` → `--bg-muted #1B302D` (pills, progress track) → `--bg-elevated #1E3633` (tooltips). Depth comes from these steps plus soft shadows, not from borders alone.
- **One brand accent: teal `--accent #20C4B8`.** Primary buttons, active tabs, selected states, links, focus rings. `--accent-deep #15A89D` is the gradient end / pressed state; `--accent-muted #0E2C29` tints accent backgrounds.
- **Coral `--coral #FF6F61`** is the highlight — the FAB gradient end and danger hints. It also doubles as `--expense`.
- **Money/status semantics are fixed:** income/positive = green `#2BD49B`, expense/negative = coral `#FF6F61`, settlement/transfer = purple `#8B7CF8`. Budget health: green / amber `#F5B301` / red `#FF5C5C`.
- **Text hierarchy:** `--text-primary #ECF3F1` (everything important), `--text-secondary #8FA3A0` (labels, support), `--text-muted #5A6B69` (placeholders, captions, disabled).
- **Color discipline:** never raw hex in product code — always a token. Category icons are the one place a wide hue palette appears, each category owning a distinct color used at ~13% opacity for its icon-circle background (`color + "22"`).

### Gradients
Used sparingly, only on striking surfaces: `--gradient-accent` (teal sheen) fills the **primary button**; `--gradient-brand` (teal→coral, 135°) fills the **FAB** and the **onboarding logo tile**. Never gradient backgrounds on whole screens or cards.

### Type
- **Two families, strict roles.** **Inter** carries every word (headings, body, labels, buttons — weights 400/500/600/700). **Space Mono** is reserved *exclusively* for money amounts — the tabular, ledger feel is the brand signature.
- **Scale, max 3 sizes per screen:** title 28/600 → heading 20/600 → subheading 16/600 → body 15/400 → label 13 → caption 11. Money: 36 (hero) / 24 / 18 / 14, slightly negative tracking on the large sizes.
- **One hero per screen.** Exactly one number or element dominates (the dashboard's "My spending"); everything else steps down and never competes.

### Spacing, radii, elevation
- **Spacing scale:** 4 · 8 · 16 · 24 · 32 · 48. Card padding 16; gap between cards 16; gap between sections 24; screen gutter 16.
- **Radii:** buttons & inputs 12 (`--radius-md`), cards & sheets 16 (`--radius-lg`), chips/pills/avatars 999. The FAB is a soft-square radius 20.
- **Elevation = soft black halos** (pure black at low opacity reads as a glow on dark, the current iOS look): `--shadow-sm` (cards/rows), `--shadow-md` (hero card), `--shadow-lg` (sheets/modals). The FAB carries its own coral glow (`--shadow-fab`).

### Cards & layout
Everything is grouped into cards — form fields, rows and data never float bare on the dark background. A card is `--bg-card`, `1px solid --border (#21302E)`, radius 16, `--shadow-sm`. Rows inside a card are separated by 1px hairlines, indented past the leading icon (≈ marginLeft 64). Settings/form rows are min 52px tall: `[32px icon circle] [label] … [value] [›]`. Transaction rows are min 64px.

### Borders & transparency
Hairline borders `#21302E` define cards and dividers. The bottom tab bar uses a translucent, blurred surface (frosted `backdrop-filter`) over content. Modals/sheets slide up from the bottom over a `rgba(0,0,0,0.6)` scrim with a top grab-handle.

### Imagery
The app is essentially imagery-free — meaning is carried by **Feather icons in colored circles**, color-coded amounts, and charts (donut for category split, area/line for trend, animated budget bars). The only brand image is the logo: a multi-segment **donut/ring mark** in the four brand hues (amber, teal-green, purple, coral) on near-black. Charts use a fixed 10-color rotation that echoes the category palette.

### Motion
Restrained and physical, never decorative loops. Tappable cards/rows spring-scale to ~0.97 on press; the primary button dips to 0.97; the FAB to 0.9 then springs back. Lists fade-and-rise in with a small stagger (`delay = index × 55ms`, total ≤ 330ms). Budget bars animate their fill width on mount (~650ms ease-out). Navigation: modals/sheets slide from the bottom, pushed screens slide from the right, tabs cross-fade. Skeleton loaders (never a bare spinner) hold space while data loads.

### Interaction states
- **Hover/press:** scale-down (cards, rows, buttons), not color shifts; the spring is the feedback.
- **Disabled:** 40% opacity.
- **Selected:** solid teal fill with dark text (chips, tab pills, the active tab); or a 2px white ring (avatars); or a teal border (selected cards/options).
- **Focus:** input border switches to teal (`--border-focus`).
- **Destructive:** coral text/fill.
- **Haptics (native):** only on meaningful actions (save, settle, delete, validation error, segmented selection) — never on navigation or informational taps.

---

## Iconography

- **One icon set: Feather.** The app uses `@expo/vector-icons`' Feather exclusively, at a uniform **2px stroke**. Only valid Feather names — unknown names render as `?` (note: there is no `wallet` in Feather; the app uses `credit-card`). For the web design system, this system loads **Feather via CDN** (`<script src="https://unpkg.com/feather-icons"></script>`) and the `Icon` / `IconCircle` components render `feather.icons[name].toSvg(...)`. *Substitution flag: the app ships Feather as a native font; the web cards/components use the official Feather web build from unpkg — visually identical, same names.*
- **The signature motif is the colored icon circle:** a Feather glyph centered in a circle whose background is the glyph's color at ~13% opacity (`color + "22"`). Sizes: 64px (empty states), 40px (transaction & FAB-menu rows), 36–46px (group tiles), 32px (settings rows). Use `IconCircle`.
- **Categories each own an icon + color** (see table below) — this is the main place the full hue palette appears.
- **No emoji, ever.** No Unicode-glyph icons. All iconography is Feather SVG.
- **Assets:** the logo donut mark lives in `assets/` (`logo-icon.png` full tile, `logo-mark.png` transparent ring, `splash-icon.png`, `favicon.png`).

### Category catalog (name · Feather icon · color)
Home & Living: Rent `home` #7C6AF7 · Maintenance `tool` #A78BFA · Household Help `user-check` #C084FC · Home Supplies `package` #A3E635 · **Food:** Groceries `shopping-cart` #3ECF8E · Food Delivery `shopping-bag` #F0A500 · Eating Out `coffee` #FB923C · Chai & Snacks `box` #FBBF24 · **Transport:** Cab & Auto `navigation` #FACC15 · Metro & Bus `navigation-2` #22D3EE · Fuel `droplet` #F97316 · Parking & Toll `disc` #FDBA74 · **Bills:** Electricity `zap` #60A5FA · Mobile Recharge `smartphone` #38BDF8 · WiFi & Broadband `wifi` #0EA5E9 · Bills `file-text` #94A3B8 · **Lifestyle:** Shopping `shopping-bag` #A78BFA · Subscriptions `repeat` #2DD4BF · Entertainment `film` #F87171 · Gym & Fitness `activity` #34D399 · Salon & Grooming `scissors` #E879F9 · Electronics `monitor` #818CF8 · Gifts `gift` #F9A8D4 · **Health:** Health & Pharmacy `heart` #F06060 · Insurance `shield` #0EA5E9 · **Money & Growth:** Investments / SIP `trending-up` #10B981 · Savings `dollar-sign` #22C55E · EMI & Loans `credit-card` #F43F5E · Education `book-open` #4ADE80 · Taxes `percent` #FCD34D · **Other:** Travel `map` #F472B6 · Family & Support `users` #FB7185 · Other `more-horizontal` #8B8A99. Income kinds (own set): Salary `briefcase`, Freelance `edit-3`, Business `trending-up`, Bonus `award`, Cashback `corner-up-left`, Refunds `rotate-ccw`, etc.

---

## Index / Manifest

Root files
- **`styles.css`** — the single entry point consumers link; `@import`s the four token files below.
- **`tokens/colors.css`** · **`tokens/typography.css`** · **`tokens/spacing.css`** · **`tokens/fonts.css`** (Inter + Space Mono via Google Fonts).
- **`assets/`** — `logo-icon.png`, `logo-mark.png`, `splash-icon.png`, `favicon.png`.
- **`SKILL.md`** — Agent-Skill manifest (usable in Claude Code).

Components (`components/`) — React, styled with the CSS tokens, namespace `window.BudgetSplitDesignSystem_…` once the bundle is loaded.
- **ui/** — `Icon` + `IconCircle`, `Button`, `Card` + `Divider`, `Input`, `Switch`, `TabPills`, `SettingsRow`, `EmptyState`.
- **finance/** — `AmountText` (+ `formatRupees`/`formatRupeesShort`), `TransactionRow`, `BudgetBar`, `CategoryChip`, `Badge`, `MemberAvatar` (+ `avatarColor`), `FAB`.
- Each component has a sibling `.d.ts` (props) and `.prompt.md` (what/when + usage). Card HTML in each directory feeds the Design System tab.

Foundation cards (`guidelines/`) — specimen cards for the Design System tab: Colors (surfaces, brand, semantic, text & gradients), Type (money, headings, body, fonts), Spacing (scale, radii, elevation), Brand (logo, iconography).

UI kit (`ui_kits/budgetsplit/`) — an interactive recreation of the app: onboarding → dashboard, groups, group detail, reports, settings, and the FAB add-sheet, in a phone frame. `index.html` is the entry; screens are separate JSX files composing the components above.

### Using a component (in a card or screen HTML)
```html
<link rel="stylesheet" href="styles.css" />
<script src="https://unpkg.com/feather-icons"></script>
<script src="_ds_bundle.js"></script>
<script type="text/babel">
  const { Button, Card, AmountText } = window.BudgetSplitDesignSystem_f6e8de;
  // ...render with React
</script>
```
(Confirm the exact namespace with `check_design_system`.)
