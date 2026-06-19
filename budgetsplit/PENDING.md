# BudgetSplit — Pending Work & Hardening Plan

The single source of truth for **what is left to do**. Pairs with `APP_FLOW.md`
(what each screen *is*). When an item is done, delete it from here or move it to
§0. Severity: **P0** = crash / data-loss / silent failure · **P1** = clear bug or
rule violation · **P2** = polish / consistency / perf.

Last full audit: every component in `src/components/**` and every screen in
`app/**` was read end-to-end (Jun 2026). Tests 83/83, TypeScript clean.

---

## 0. Done this session (uncommitted unless noted)

- **Donut hardening** — `computeDonutWedges` (pure, tested) so tiny/zero/negative
  categories never vanish or emit NaN. *(committed `52f88f4`)*
- **Per-insight toggles** — split the single `insights` flag into
  `dashboardInsights` · `budgetInsights` · `savingsInsights`; each gates its own
  surface (dashboard card, budget→insights routing, savings nudges). Savings
  insights previously had **no** toggle.
- **Component robustness (12 files):** DatePickerSheet (NaN-date crash guard),
  MemberAvatar (blank-name initials), TransactionRow (invalid-date guard),
  AmountText (`₹NaN` guard), SettleSheet (currency-symbol from token),
  CategoryPicker (try/catch on create), FAB (clears the tab bar now + dead style),
  FeatureFlagsProvider / OnboardingGate / Onboarding.finish / LockGate (never
  hang/trap on AsyncStorage or auth errors), LogoAssembly (hex→tokens), Skeleton
  (dead style).

---

## 1. P0 — Robustness (the dominant theme)

The audit found one pattern in **almost every screen**: async DB work with no
error handling, so a failure either hangs the screen on a loader/blank or masks
itself as an empty state. Plus route-param IDs used before they're validated.

### 1a. Async DB calls with no try/catch
Wrap each `load()` / mutation handler; on failure show an error state or
`Alert` + `haptic.error()`. `app/add/quick.tsx` (`handleSave`) and
`app/add/transfer.tsx` (`handleSave`) already model the correct pattern — copy it.

- `app/_layout.tsx:28` — DB init (`openDB`/`seedIfNeeded`/`runSavingsMaintenance`); failure = **app stuck on loader forever**. Needs a retry screen.
- `app/settle.tsx:29` `load()`, `:38` `markPaid` (settlement silently fails).
- `app/group/[id]/edit.tsx:28` load, save path.
- `app/history.tsx:47` `load()`.
- `app/group/[id]/recurring.tsx:59` load, `:67` pause/resume/end writes.
- `app/group/[id]/budget.tsx:58` load, `:93` `handleSave` (try/finally but **no catch**).
- `app/savings/[id].tsx:52` load, `:68` `handleAdd`, `:80` `handleWithdraw` (multi-write — should also be one `db.withTransactionAsync`).
- `app/group/[id]/members.tsx:37` load, `:51`/`:57`/`:88` add/create/remove writes.
- `app/txn/[id].tsx:47` load, `:84` delete.
- `app/categories.tsx:59` init, `:94` add, `:112` delete (optimistic state diverges from DB on failure).
- `app/(tabs)/groups.tsx:56` `loadGroups`, `:101` `handleCreate` (navigates even if insert threw).
- `app/add/income.tsx:61` mount load.
- `app/add/itemized.tsx:172` **`handleScanReceipt`** — camera/OCR rejection unhandled.
- `app/(tabs)/reports.tsx:88` `load()` (try/finally, **no catch**).

### 1b. `useLocalSearchParams` id used before validation
Typed `string` but undefined at runtime is possible; it flows straight into DB
calls. Add `if (!id) { router.back(); return; }` (or an error state) before use.

- `edit.tsx:19`, `recurring.tsx:52`, `budget.tsx:46`, `savings/[id].tsx:38`, `members.tsx:23`, `txn/[id].tsx:34`.

### 1c. date-fns on raw DB timestamps (RangeError crash)
`new Date(x)` → `format`/`addX`/`isSameDay` throws on a 0/NaN/garbage timestamp.
Guard with `isValid` before formatting. Schema currently always writes a number,
so risk is low — but it's a flagged rule and a hard crash if it ever happens.

- `history.tsx:59,108` · `recurring.tsx:33` (`nextOccurrence` seed) · `txn/[id].tsx:124,214` · `income.tsx:198,238`.

### 1d. Split / quantity math can take NaN or negatives
- `add/quick.tsx:138,143` — `parseInt(percent/share)` → `NaN` propagates into `splitByPercent/Shares` and silently breaks the balance check. Coerce non-finite → 0 (shares → 1).
- `add/itemized.tsx:60` — qty `"0"`→1 (ok) but `"-2"` → negative subtotal / negative bill total. Clamp `Math.max(1, …)`.

---

## 2. P1 — Bugs & rule violations

- **Multi-currency `₹` literals in the split/payer UI** — `add/quick.tsx:474,588` (and the remainder/over displays at `:401,420,428,524`) hardcode `₹` and use `formatRupees` even when a non-INR currency is picked → **wrong symbol shown**. Thread the selected `currency` through `formatAmount(…, currency)` / `CURRENCY_MAP[currency].symbol`. (Static input *placeholders* like `₹0` elsewhere are acceptable.)
- **SecondaryButton.tsx:18** — `fontSize` variable actually holds a `TextStyle` object and double-applies `type.button`/`type.label`; rename + apply size typography cleanly.
- **groups.tsx:196** — every balance row opens the generic `/settle` and ignores the tapped person, though the a11y label says "Settle with {name}". Pass the person if `/settle` supports it.
- **income.tsx:68** — editing a txn whose row is missing still runs `updateTxn` against a non-existent id; Alert + back instead.
- **reports.tsx:147 vs 48/117/241/279** — charts filter `!is_deleted` but summary cards / year-in-review / CSV / PDF may not. Confirm `getTransactionsInRange` excludes soft-deleted; apply consistently.

---

## 3. P2 — Polish, consistency, perf

- **Color-token discipline** — raw hex palette arrays used as real colors and persisted to the DB: `group/[id]/edit.tsx` (`GROUP_COLORS`), `groups.tsx:33` (`GROUP_COLORS`/`GROUP_ICONS`), `categories.tsx:28` (`COLOR_CHOICES`), `reports.tsx:152` (`CHART_COLORS`), `help.tsx` (illustration colors). Most map exactly to existing tokens; move to a shared palette constant. (PDF `<style>` hex in reports is unavoidable — print engine can't read JS tokens.) Note `#FB923C` (orange) in help has **no** token — add one.
- **Touch targets <44pt** — `TabPills` (36), `ScreenHeader` back (32+hitSlop), `FilterBar` chips (32, no hitSlop), `members.tsx` remove icon (~38), `Onboarding` Skip. Add/raise `hitSlop`.
- **`PressableScale`** — sets `accessibilityRole="button"` even when non-interactive; only set when `onPress`/`onLongPress` exists. Consider a `hitSlop` passthrough.
- **`Feather name={… as any}`** — pervasive (`FAB`, `TransactionRow`, `budget`, `txn`, `categories`, `groups`, `recurring`, `edit`, `quick`, `savings/[id]`). Type `categoryVisual().icon` and friends as `keyof typeof Feather.glyphMap` and drop the casts.
- **Loading vs not-found** — `txn/[id].tsx:66` and `savings/[id].tsx:62` render a bare header while loading *and* when the row is missing — indistinguishable. Add a skeleton + a proper "not found" state.
- **Perf (N+1 serial queries)** — `groups.tsx:61`, `transfer.tsx:44`, `reports.tsx:162-203` await per-group/per-month/per-day in series. Batch or query the range once and bucket in memory.
- **Components defined inside render** — `transfer.tsx` `PersonPicker` remounts each keystroke (focus loss). Hoist out.
- **Dead code** — `settle.tsx` unused `getMe` import; `members.tsx:228` + `groups.tsx:352` + `income.tsx:287` unused sheet/chip styles; `groups.tsx:45` unused `showArchived` state.
- **Misc** — `members.tsx:67` doesn't reset `newColor` between creates; `reports.tsx` forecast is noisy for days 1-2 (consider gating to `dayOfMonth ≥ 3`).

---

## 4. Feature / product decisions

**DECIDED (Jun 2026):**
1. **Error UX = inline card + Retry.** Failed load → inline error card with Retry in place of content. Failed action → `Alert` + `haptic.error()`, stay put. App-init failure → full-screen error + retry. Build one reusable `ErrorState` component and use it everywhere in §1a.
2. **INR-only for v1.** Hide the per-transaction currency picker completely; standardize all display on `formatRupees`/`₹`. Keep the currency infra in code (dormant) for a later multi-currency pass. → resolves §2 currency item by *hiding the selector* rather than wiring it.
3. **Budget rollover = reword, no carryover.** Reword empty-state/help copy to "resets each period"; no rollover row, no carryover logic.

**STILL OPEN:**
4. **Savings leftover auto-sweep** — code exists but is OFF (would silently lower "Cash available"). Decide the funding model or delete the dead path.
5. **"How things move around"** — confirm the intended navigation/state model end-to-end (FAB destinations per screen, Transfer vs Settle, Personal-mode hiding, deep-link/back behavior). Walk it screen by screen and lock it in `APP_FLOW`.

---

## 5. Screen status at a glance

| Area | State |
|---|---|
| Dashboard, Category detail, Group budget tab, Budget insights, Savings | DS(2)-aligned ✓ · robustness items in §1 |
| Add flows (quick/income/itemized/transfer) | functional ✓ · §1a/§1d/§2 items |
| Reports | functional ✓ · §1a + perf + token items |
| Groups / Group detail / Members / Settle / Recurring / Edit | functional ✓ · §1a/§1b items |
| Categories / History / Help / Txn detail | functional ✓ · §1 items |
| Gates & system components | hardened this session ✓ |

No screen is missing or half-built. Everything pending is hardening + the §4
decisions.
