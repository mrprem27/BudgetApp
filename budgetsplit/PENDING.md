# BudgetSplit — Pending Work & Hardening Plan

The single source of truth for **what is left to do**. Pairs with `APP_FLOW.md`
(what each screen *is*). When an item is done, delete it from here or move it to
§0. Severity: **P0** = crash / data-loss / silent failure · **P1** = clear bug or
rule violation · **P2** = polish / consistency / perf.

Last full audit: every component in `src/components/**` and every screen in
`app/**` was read end-to-end (Jun 2026). Tests 83/83, TypeScript clean.

---

## 0. Done

### Latest batch (P0 hardening)
- **§1a async error handling — DONE** across `_layout` (app-init retry screen),
  settle, history, edit, recurring, budget, savings/[id], members, txn,
  categories, groups, income, reports, itemized (scan). Pattern: `loadError`
  state + `<ErrorState onRetry>` for failed loads (header preserved); mutations
  `try/catch` + `haptic.error()` + `Alert`. New `ErrorState` component.
- **§1b route-id guards — DONE** (edit, recurring, budget, savings, members, txn).
- **§1c date-fns `isFinite` guards — DONE** (history, recurring, txn, income).
- **§1d split/qty guards — DONE** (quick.tsx percent/share NaN→0/1; itemized qty `Math.max(1,…)`).
- **INR-only (§4.2) — DONE** (currency picker + setting hidden; copy updated).
- **Rollover reword (§4.3) — DONE** (group detail, budget editor, budget.ts, help).
- **savings/txn loading-vs-not-found — DONE** (skeleton vs ErrorState vs EmptyState).
- **Dead code — DONE**: settle `getMe`, members sheet styles, groups `showArchived`.

### Earlier this session

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

## 1. P0 — Robustness ✅ DONE (see §0)

The dominant theme — async DB work with no error handling, unchecked route-param
IDs, unguarded date-fns, and NaN/negative split math — is resolved across all
screens. `savings/[id]` add/withdraw should still ideally be wrapped in a single
`db.withTransactionAsync` (currently sequential writes in a try/catch) — **minor
P1 follow-up**.

---

## 2. P1 — Bugs & rule violations ✅ DONE

- **SecondaryButton** — typography no longer double-applied; size style applied cleanly (base style is color-only).
- **groups.tsx** — balance row now opens `/settle?focus=<personId>`; settle auto-opens that person's settlement sheet once on load.
- **reports.tsx** — verified `getTransactionsInRange` already excludes soft-deleted (`is_deleted = 0` in the query); removed the redundant always-true `!t.is_deleted` checks so all paths are consistent.
- **savings/[id]** — new `depositAndAllocate` query wraps pool top-up + allocation in one `db.withTransactionAsync`; `handleAdd` uses it.
- ~~Multi-currency `₹` literals~~ — moot: INR-only for v1 (currency UI hidden).
- ~~income.tsx missing-txn on edit~~ — DONE (Alert + back).

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
