# BudgetSplit — Refactoring Plan

> An implementation-ready plan to pay down the debt catalogued in
> [BRUTAL_ANALYSIS.md](./BRUTAL_ANALYSIS.md), without breaking the working engines or the
> design system. Sequenced lowest-risk-first so each phase is independently shippable and
> leaves the tree green.
>
> **Ground rules** (carry through every phase):
> - Keep the SQLite schema/query contracts; the test suite (`src/__tests__/*`) stays green.
> - Reuse existing `ui/` + `finance/` components and `constants/*` tokens; extract from
>   monoliths, don't add parallel patterns.
> - Money stays integer paise; multi-table writes stay in `withTransactionAsync`.
> - **Never touch** `LogoAssembly` or the onboarding hero ring/fan animation.
> - Each phase: `tsc` clean + tests green, then commit. Stop for review at phase boundaries.

---

## ✅ Completion status — reconciled 2026-06-26

This plan has now been **executed** (branch `refactor/phase-1-perf-safety`, ~18 commits,
`tsc` clean, **149/149 tests** — 7 dead-code tests removed). What shipped:

- **Phase 1 (perf + safety):** hot-path `txn`/`line_item` indexes; batched split loader
  (killed the N+1); atomic `splitRecurringSeries`; `deleteCategory` budget-orphan fix;
  idempotent leftover sweep; recurring→monthly bug fixed via one `recurringMonthlyEquivalent`.
- **Phase 2 (state + settings):** dead Zustand surface trimmed to `groups`/`setGroups`;
  new `lib/settings.ts` (one typed prefs store; ~30 AsyncStorage sites migrated); flag
  defaults deduped; `search` retry + Plan error-state fixed.
- **Phase 3 (helpers):** `budgetHealth` + `utilLabel` — one source in `lib/budget`
  (incl. the `groups.tsx` leftover, fixed in the final reconcile pass).
- **Phase 4 (monoliths):** `reports` CSV/PDF → `lib/reportExport`; onboarding commit →
  `lib/onboarding`; itemized math → `lib/itemized`; Plan `GoalCard`/`PoolCard`/`ForecastCard`;
  group `InsightsTab`; quick `SplitSheet`. The quick.tsx add flow is otherwise **frozen**
  (owner: "it's perfect") — only an additive deep-link prefill was added.
- **Phase 5 (naming + engine):** ONE forecast model (`lib/forecast` everywhere); analytics
  budget status via `budgetHealth`; `history` back-label; `insertSavingsTxn` rename;
  `recordSettlement` (one settlement write path).
- **Phase 6 (cleanup):** deleted `Card.tsx`, `settle.tsx`, `group/[id]/insights.tsx`,
  `computeNet`, `getDashboardInsights`/`rankInsights` (+tests); removed dead branches
  (group `false && budgetUsage`, groups filter chips + `listMode==='budget'`); resolved
  `SHOW_EXTRAS`.

**Beyond the plan (owner-directed):**
- **Settle = one flow:** the Quick-Add Transfer pill is now primary; all 8 entry points
  re-pointed; standalone `/settle` screen removed.
- **Surfaced hidden features:** Plan **Cash available** card + **Savings insights**; group
  **Balances** tab (Simplify-debts toggle + settle plan); **category rename** (propagates
  to all txns/budgets).
- **Wired orphans:** Streak re-enabled, subscription detection live, Afford reachable,
  onboarding "first add" hand-off. **OCR** parked (`@deprecated`, kept).
- **Feature management** screen sectioned (Insights & reports / Money tools / Smart
  capture); duplicate toggles removed from Settings.

**Deliberately NOT done:** drop dead schema columns + `settings` table (risky rebuild
migration, ~0 benefit); full category-ID normalization (the safe `renameCategory` delivers
the real value); a real OCR build.

> The other four docs (ARCHITECTURE, FEATURES_AND_FLOWS, BRUTAL_ANALYSIS, FUTURE_IMPROVEMENTS)
> were written as the **pre-refactor baseline**. Read them with this status in mind — many
> "current state" / "problem" statements in them are now **resolved** (see each doc's top banner).

---

## Decisions locked (owner, this cycle)

- **Keep all 4 orphan features for future wiring — do NOT delete:** Afford check
  (`lib/afford.ts` + `afford.tsx`), Subscription detection (`lib/subscriptions.ts`),
  Tracking streak (`StreakCard` + its commented Home re-enable point), and OCR (`lib/ocr.ts`
  + the `expo-ocr` dependency + the `itemizedOcr` flag). Their tests stay green. They are
  unfinished roadmap items, not dead code. See [FUTURE_IMPROVEMENTS.md](./FUTURE_IMPROVEMENTS.md).
- **Start with the performance + safety phase (below), which deletes nothing.** Capture the
  biggest wins with zero removal risk first.
- **Dead-code removal is a later, conservative, reviewed pass** — not a bulk sweep. Git
  history preserves everything regardless, so removals are always reversible.
- **Zustand store → delete the dead surface** (it just matches today's SQLite-direct
  reality); deferred to the state phase.

---

## Phase 1 — Data layer: performance + safety (low risk, deletes nothing) ⚡ START HERE

**Indexes** (`src/db/schema.ts` migrations):
- [ ] `CREATE INDEX idx_txn_group_date ON txn(group_id, date)`.
- [ ] `CREATE INDEX idx_txn_lookup ON txn(group_id, is_deleted, recur_freq)`.
- [ ] `CREATE INDEX idx_txn_parent ON txn(parent_recur_id)`.
- [ ] `CREATE INDEX idx_line_item_txn ON line_item(txn_id)`.

**Kill the N+1 split loader** (`transactions.ts`):
- [ ] Replace per-row `loadSplits` with a batched loader: one
  `SELECT … WHERE txn_id IN (...)` for payments + one for shares, grouped in JS (mirror
  `getSkipsMap`). Apply to `getTransactionsForGroup`, `getTransactionsInRange`,
  `getRecurringForGroup`, `getActiveRecurringRules`.

**Transaction-safety fixes:**
- [ ] Make `splitRecurringSeries` atomic — wrap the new-rule insert + old-rule cap in **one**
  `withTransactionAsync` (refactor `insertTxn` to accept an existing txn context, or inline
  the insert).
- [ ] Document `runLeftoverSweep`'s cross-store non-atomicity and make it idempotent
  (guard on the marker before depositing).

**Orphan-data fix:**
- [ ] `deleteCategory` must also delete matching `category_budget` rows and decide on
  `txn.category` (keep historical strings, but prevent new orphans).

**Live correctness bug (pulled forward from Phase 3):**
- [ ] Fix the recurring→monthly inconsistency — `group/[id].tsx` uses `weekly*4` while
  `insights.tsx`/`plan/subscriptions.tsx` use `weekly*52/12`, so the same rule shows
  different monthly figures. Add one `recurringMonthlyEquivalent(amount, freq)` in `lib/`
  and route all three through it.

**Enable FKs (optional, after cascades verified):**
- [ ] Turn on `PRAGMA foreign_keys=ON` on the live connection once `deleteGroup`/
  `deleteCategory`/member-removal cascades are confirmed correct.

Add the missing **`budget.ts` tests** here before anyone refactors it.

---

## Phase 2 — State & settings consolidation

**Store decision — LOCKED: delete the dead surface.**
- [ ] Remove `txns`/`addTxn`/`removeTxn`/`currentGroupId`/`isLocked`/`biometricEnabled`/
  `getMe()` from the Zustand store; keep only what `index.tsx`/`groups.tsx` actually use,
  or remove the store entirely and standardize on SQLite-direct + a `useGroupData`/
  `usePersons` hook with cache invalidation. *(Matches today's reality; not making the store
  authoritative this cycle.)*

**One settings module:**
- [ ] Create `lib/settings.ts` — a typed wrapper over AsyncStorage (get/set with defaults,
  one place to enumerate keys). Migrate all raw `AsyncStorage.getItem('...')` call sites.
- [ ] Collapse the duplicated flag defaults: `FeatureFlagsProvider` imports `DEFAULTS` from
  `lib/featureFlags.ts` (single source).
- [ ] Remove the dead Zustand `isLocked`/`biometricEnabled` (handled by `LockGate`).

**Screen-state contract:**
- [ ] Give every screen empty/loading/error using `EmptyState`/`Skeleton`/`ErrorState`.
  Priority fixes: `savings.tsx` (add try/catch + error state), `search.tsx` retry (call
  `load()`, not `setLoadError(false)`), and replace bare-text empties in `index.tsx`,
  `categories.tsx`, `friends.tsx`, `txn/[id].tsx`, `reports.tsx`.

---

## Phase 3 — Extract shared components & helpers (de-duplication)

Each extraction removes a copy-paste cluster from BRUTAL_ANALYSIS §4. Build in
`components/ui/` (generic) or `components/finance/` (domain); import tokens from `../tokens`.

**Shared lib helpers** (`lib/`):
- [ ] `budgetHealth(pct) → 'green'|'amber'|'red'` + `utilLabel(pct)` — replace 3 copies in
  `group/[id].tsx`, `group/[id]/insights.tsx`(if kept), `reports.tsx`, `category/[name].tsx`.
- [ ] `recurringMonthlyEquivalent(amount, freq)` — **fixes the live `weekly*4` vs
  `weekly*52/12` inconsistency**; replace inline copies in `group/[id].tsx`, `insights.tsx`,
  `plan/subscriptions.tsx`.
- [ ] Route all %/× formatting through `money.formatChangeMagnitude` (kill the inline
  reimplementations in `analytics.ts`).
- [ ] Add `DAY_MS` constant + an `alpha(color, n)` helper to replace the `+ '22'` string-suffix idiom.
- [ ] Delete the local `nextOccurrence` in `recurring.tsx`; use `lib/recurrence`.

**Shared UI components:**
- [ ] `<IconCircle icon color size>` — the single most-duplicated primitive (~17 screens).
- [ ] `<RecurrenceEditor>` — collapse the duplicated recurring UI+state in `quick.tsx`/`income.tsx`.
- [ ] `<GroupPickerSheet>` — used in `quick.tsx`/`income.tsx`.
- [ ] `<LocationRow>` + `useCapturedLocation()` hook — `quick.tsx`/`itemized.tsx`.
- [ ] `<PersonEditSheet>` (rename/add) — `friends.tsx`/`members.tsx`.
- [ ] `<AmountInput>` — unify the big SpaceMono field across `quick`/`income`/savings sheets.
- [ ] `<SectionCard collapsible>` — `budget.tsx`/`categories.tsx`/`help.tsx`.
- [ ] Resolve the two `CHART_COLORS` (one source in `constants/palette.ts`).
- [ ] Pick one modal metaphor for "do-and-return": migrate the raw RN `<Modal>` usages
  (`quick.tsx` split editor, `txn/[id].tsx` receipt viewer, `CategoryPicker`) to
  `SheetModal`/`DraggableSheet`.

---

## Phase 4 — Break the monoliths

Now that shared pieces exist, decompose the big screens by *using* them. Leave each screen
smaller than you found it; no behavior change.

- [ ] **`app/add/quick.tsx` (1250 → target < 300):** extract `TransferForm`,
  `RecurrenceEditor` (Phase 3), `SplitSheet`, `PayersSheet`, `AmountInput`; collapse the
  ~50 `useState` into per-concern `useReducer`/hooks; replace `canSave` with named predicates.
- [ ] **`app/group/[id].tsx` (1125 → target < 350):** extract each tab into
  `components/finance/group/`: `GroupExpensesTab`, `GroupBudgetTab`, `GroupMembersTab`,
  `GroupInsightsTab`, `GroupRecurringTab` + the options sheet. (This is also what lets the
  orphan insights file be cleanly retired.)
- [ ] **`Onboarding.tsx` (959 → target < 300):** extract `onboarding/illustrations/*`,
  per-stage components, and move `finalize()` + `paydayAnchor()` into `lib/onboarding.ts`.
  ⛔ Do not touch `LogoAssembly`/hero ring.
- [ ] **`app/reports.tsx` (872):** extract the donut/trend/forecast blocks into
  `components/finance/reports/*`; move the PDF HTML template to a `lib/reportPdf.ts`.
- [ ] **`app/add/itemized.tsx` (817):** extract `ItemsStep`/`AssignStep`/`PayersStep`/`ReviewStep`.
- [ ] **`app/(tabs)/savings.tsx` (674):** extract `PoolCard`/`GoalList`/`UpcomingList`/
  `ForecastRow` (most dead styles already gone in Phase 0).

---

## Phase 5 — Naming, engine unification & deeper structure

- [ ] **Single month-end projection:** make `forecast.forecastMonthEnd` canonical; delete
  `analytics.projectedMonthEnd`; update consumers + tests.
- [ ] **One budget-status classifier:** `budget.getCategoryBudgetStatus` and
  `analytics.getBudgetAnalytics` share `budgetHealth()` (Phase 3).
- [ ] **Naming pass:** align screen titles with routes (or document the mapping); fix the
  hardcoded "Settings" back-label in `history.tsx`; rename the private savings `insertTxn`;
  standardize the `id`/`groupId` param alias; collapse `category_budget.period` into
  `cadence`; reconcile `savings_goal.priority` vs `sort_order` (keep drag-rank, drop priority
  from the create path or document it as a pure fallback).
- [ ] **Token convention:** decide canonical import path (recommend: screens keep
  `constants/*`, components keep `../tokens`, and update AGENTS.md to match reality) — then
  fix the few components that bypass `../tokens` (`FAB`, `BrandedLoader`, `LockGate`,
  `StreakCard`) and the stray raw-hex usages.
- [ ] **Move reporting out of `savings.ts`:** relocate `getCashPosition`/`getAffordSnapshot`/
  `buildSavingsInsights`/`getCategorySpend30d` into a `db/queries/reporting.ts`.
- [ ] **Unify the settle flow:** one `SettleFlow` component behind the global wizard, the
  direct mode, and the Quick-Add Transfer pill.
- [ ] **(Optional) Normalize categories** to IDs (enables safe rename/merge) — larger, do
  last; covered in FUTURE_IMPROVEMENTS §5.

---

## Phase 6 — Conservative dead-code cleanup (deferred; reviewed item-by-item)

Done **last**, not first — and never as a bulk sweep. **The 4 orphan features stay**
(Afford, Subscriptions, Streak, OCR + `expo-ocr` + `itemizedOcr`). Git history keeps
everything, so each removal is reversible.

**Safe to remove now (truly inert / actively misleading):**
- [ ] `settle.computeNet` — a *buggy* duplicate of the canonical balance SQL (it disagrees
  with `getGroupNet`); removing it prevents calling the wrong one.
- [ ] `analytics.getDashboardInsights` — no callers (`rankInsights` is test-only). *Keep
  only if it becomes the basis for a real insights surface — otherwise remove.*

**Review individually before removing (each maps to a possible future feature):**
- [ ] `app/group/[id]/insights.tsx` orphan — fold into the inline tab during Phase 4, then delete.
- [ ] `groups.tsx` `listMode==='budget'` branch + `false &&` filter chips — abandoned UI; remove unless on roadmap.
- [ ] `group/[id].tsx` `'balances'` tab body + `false && budgetUsage` mini-bar — same.
- [ ] `savings.tsx` `SHOW_EXTRAS` block — these are the cash/what-if/afford surfaces; **keep
  the code, just gate it cleanly** once Afford is wired (Future Improvements).
- [ ] Commented multi-settlement counter in `settle.tsx`.

**Explicitly keep (do NOT delete this cycle):**
- [ ] `index.tsx` commented `StreakCard`/`HealthBand` — these are the re-enable points for
  kept features.
- [ ] `components/ui/Card.tsx` — adopt it (Phase 3) rather than delete; it's the documented card pattern.
- [ ] Dead schema columns + dead `settings` table — leave them (column drops need risky
  rebuild migrations for near-zero benefit; `remote_uid` even hints at a future sync path).

---

## Suggested sequencing & checkpoints

| Phase | Theme | Risk | Deletes anything? | Ship gate |
|---|---|---|---|---|
| **1** ⚡ | DB indexes / safety / live recurring bug | low | **no** | tests green; measure query speed before/after |
| 2 | State + settings | medium | dead store fields only | every screen has all 4 states; no AsyncStorage outside `lib/settings` |
| 3 | Extract shared pieces | medium | no | no behavior change; duplication count drops |
| 4 | Break monoliths | medium-high | no | each target file smaller; tests green; manual smoke of add/group flows |
| 5 | Naming + engine unify | medium | dead duplicate engines | one projection, one classifier; naming consistent |
| 6 | Conservative cleanup | low | yes (reviewed, orphan features kept) | tsc + tests green; app visually identical |

**Start with Phase 1** — cheap, safe, deletes nothing, and delivers the biggest user-visible
wins (speed + correctness). Pause for review after each phase. Treat the test suite as the
contract: extractions are pure refactors and should need **no** test changes; engine
unification (Phase 5) is the only phase expected to touch tests.
