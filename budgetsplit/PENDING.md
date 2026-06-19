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

## 3. P2 — Polish, consistency, perf ✅ DONE

- **Color-token discipline** — new `src/constants/palette.ts` centralises the
  duplicated/scattered palette data (`GROUP_ICONS`/`GROUP_COLORS`,
  `CATEGORY_ICON_CHOICES`/`CATEGORY_COLOR_CHOICES`, `CHART_COLORS` built from
  tokens, plus a `decor` set for non-semantic hues). edit/groups/categories/
  reports import from it; help.tsx hex → tokens + `decor.orange` (the one missing
  hue). Picker swatches stay as documented data (they don't map to semantic
  tokens). PDF hex is intentional (print document, see below).
- **`Feather name={… as any}` — eliminated.** Catalog typed (`categoryVisual()`
  returns `FeatherName`), picker arrays typed, and one `asFeather()` helper
  coerces DB-sourced icon strings. Zero `as any` icon casts remain.
- **Touch targets** — `hitSlop` added/raised on TabPills (+empty guard),
  FilterBar chips, members remove/back, Onboarding Skip; ScreenHeader verified OK.
- **`PressableScale`** — `accessibilityRole`/`accessibilityState` only when
  interactive; `hitSlop` passthrough added.
- **Loading vs not-found** — done in §1 batch (savings/txn skeleton vs not-found).
- **Perf (N+1)** — groups & transfer per-group queries now `Promise.all` batched.
  (reports daily loop already fetches once + buckets in memory; per-month trend is
  bounded to 6 and left as-is.)
- **Components in render** — `transfer.tsx` `PersonPicker` hoisted to module scope.
- **Dead code** — removed across settle/members/groups/quick (styles, state).
- **Forecast** — projection now gated to `dayOfMonth ≥ 3` (1–2 points were misleading).

### PDF export (reported separately)
- The PDF was dark-themed (near-black bg, near-white text) → invisible on white
  paper / when backgrounds are dropped by printers. **Rewritten as a light
  document**: white background, solid dark text throughout (`#1A1A1A` body,
  `#0A0F11` headings, dark grays for labels/notes), dark-on-white amount colors.

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

---

## 6. Recurring Edit — first-principles design (PLANNING, pre-implementation)

**Status: design only. Do NOT implement until the decision points below are
resolved.** Recurring edits are not a simple `UPDATE` — every CRUD op must be
reasoned about against history, future occurrences, assignments, relationships,
state, and time. This section defines the scenarios and behaviours first.

### 6.1 How recurring works today (the constraint)
- A recurring transaction is **one template row** on `txn` with `recur_freq`,
  `recur_interval`, `recur_end`, `recur_state` (`active|paused|ended`), and an
  **unused** `recur_override_date`.
- Occurrences are **virtual**: `materializeInstances()` (`src/lib/recurrence.ts`)
  projects them on the fly within a date range, with synthetic ids
  `${txn.id}_${timestamp}`. They are **never persisted**.
- Consequence: editing the template **retroactively rewrites every past and
  future occurrence** — amounts, splits, category, payer, even the start date all
  change history. There is no notion of "this occurrence", "this and future", or
  a per-occurrence exception. **This is the core defect.**
- Today's "edit" routes a recurring row into `add/quick`/`add/income` with
  `editId`, i.e. a blind template overwrite. Pause/Resume/End mutate
  `recur_state`; End sets `recur_end`.

### 6.2 First principles
1. **History is immutable.** An occurrence that has already happened (date ≤ now)
   is a record of a real (or assumed-real) event. Editing the rule must not
   silently alter past occurrences.
2. **A rule and an occurrence are different entities.** Editing one occurrence ≠
   editing the schedule. The UI must always disambiguate scope.
3. **Every edit has a temporal scope:** *this occurrence only* · *this and all
   future* · *the whole series* (rarely; only for true corrections). The default
   offered must be the safe one.
4. **Referenced occurrences are frozen.** If an occurrence has been settled,
   included in a closed report, or otherwise referenced, it cannot be mutated in
   place — only superseded/adjusted with an audit trail.
5. **Auditability:** every change records what changed, when, by whom, and its
   scope.

### 6.3 Required model change (the decision that unlocks everything)
The virtual-only model cannot represent exceptions. Options:
- **(A) Materialize-on-touch + exceptions table (recommended).** Keep generating
  virtually, but persist an occurrence row the moment it is edited/skipped/settled
  ("materialize this instance"), keyed by `(series_id, occurrence_date)`. A
  `recur_exception` (or a `parent_id` + `recur_override_date` on `txn`) marks an
  occurrence as detached/overridden/skipped. Virtual generation skips dates that
  have a persisted exception.
- **(B) Split-the-series on "this and future."** Editing "this and future" ends
  the current rule at the split date (`recur_end = splitDate - ε`) and creates a
  **new** rule starting at the split date with the new values. Past stays intact;
  future diverges. (Compose with A for single-occurrence edits.)
- **(C) Fully materialize all occurrences up front.** Simpler reads, but bloats
  the DB and reintroduces the "edit rewrites all" problem unless paired with A.
  Not recommended.

→ **Decision needed:** adopt **A + B** (exceptions for single edits, series-split
for this-and-future)? This is the recommended path and the rest assumes it.

### 6.4 Scope-of-edit matrix
For each edit the user picks a scope; behaviour:

| Scope | Past occurrences | The edited occurrence | Future occurrences |
|---|---|---|---|
| **This occurrence only** | untouched | persisted as a detached exception with new values | untouched (still follow the rule) |
| **This and future** | untouched | becomes the first of a new split rule | regenerated from the new rule |
| **Entire series** (correction) | rewritten (guarded; warns it alters history) | rewritten | rewritten |

The picker must appear for **every** field change, and "This and future" should
be the default for schedule-shaped fields (frequency, interval, end), while
"This occurrence only" is the default for value-shaped fields (amount, note).

### 6.5 Field-by-field semantics (define each before building)
- **Amount / split / payers:** value-shaped. Default *this occurrence*; offer
  *this and future*. Past edits only via *entire series* with a warning.
- **Category:** value-shaped, same as above; but reassigning category affects
  budget attribution per period (see 6.7).
- **Date of one occurrence:** moves only that occurrence (exception); must not
  collide with another occurrence's date in the series (conflict → 6.8).
- **Frequency / interval:** schedule-shaped → *this and future* via series-split.
  Never silently re-space past occurrences.
- **Start date:** only meaningful as *entire series* (it is the rule anchor);
  warn that it shifts all unreferenced occurrences.
- **End date (recur_end):** truncates/extends future only; cannot end before the
  last already-referenced occurrence.

### 6.6 Delete / skip semantics
- **Skip one occurrence:** persist a "skipped" exception; virtual generation omits
  that date. Reversible.
- **Delete this and future:** set `recur_end` to before the chosen date (soft);
  past stays.
- **Delete entire series:** soft-delete the template; past occurrences that were
  materialized (settled/referenced) must survive (don't cascade-delete history).

### 6.7 Impact on derived data (must stay consistent)
- **Budgets:** per-period budget usage counts occurrences in that period. A *this
  and future* change must not retroactively change a closed period's usage.
- **Reports / analytics / forecast:** must read the same materialization rules;
  an exception or split must show correctly in the month it applies to, not
  smeared across the series.
- **Balances / settlements:** if an occurrence created a debt that was settled,
  editing its amount/split afterwards must NOT silently change the settled
  balance — see 6.8.

### 6.8 Conflict resolution (already-processed / referenced)
- Occurrence already **settled** → block in-place edit; offer "create an
  adjustment entry" instead, preserving the original.
- Occurrence already in a **closed/exported report** → allow edit only as a new
  forward-dated correction; never mutate the historical figure.
- **Date collision** (moving an occurrence onto another's date) → reject with a
  clear message.
- Editing a **paused** series → allowed for future; clarify it takes effect on
  resume. Editing an **ended** series → only *entire series* corrections, with a
  strong warning, or disallow.

### 6.9 Auditability
Every recurring mutation writes an audit entry: series id, occurrence date (if
scoped), fields changed (before→after), scope, timestamp, actor. The existing
`audit` log is the home; extend its entity types for `recur_series` /
`recur_occurrence`.

### 6.10 Decisions (locked Jun 2026)
1. **Model = A + B (exceptions + series-split).** ✅ Decided. Occurrences stay
   virtual until touched; "this & future" ends the current rule and starts a new
   one. History never mutates.
2. **Persistence = materialize-on-touch (recommended resolution).** When an
   occurrence is edited/skipped/settled, persist it as a real `txn` row linked to
   the series via `parent_id` + `recur_override_date` (reuse the existing unused
   column) and a `recur_kind`/marker of `detached|skipped`. Virtual generation
   skips any date that has a persisted override/skip. → reuses the `txn` table and
   existing rendering; no separate exceptions table. *(Confirm when building.)*
3. **Default scope per field (recommended resolution):** value-shaped fields
   (amount, note, split, payers, category) default to **this occurrence**;
   schedule-shaped fields (frequency, interval, end) default to **this & future**.
   Since single-occurrence value edits are **deferred from v1** (see 6), v1's only
   editable path is "this & future" on schedule fields. *(Confirm when building.)*
4. **Settlement / referenced conflict = adjustment-entry (recommended
   resolution, follows from #5).** Never mutate a settled/closed-report occurrence
   in place; offer a new dated adjustment entry that preserves the original.
   *(Confirm when building.)*
5. **History rewrites = forward corrections only.** ✅ Decided. Past occurrences
   are immutable; the "entire series incl. past" rewrite is **not** offered. Fixes
   to history are new dated adjustments.
6. **v1 scope = skip-one + this-and-future split + end.** ✅ Decided.
   Single-occurrence *value* exceptions deferred to a later pass.

**Interim safety:** ✅ DONE — the blind-overwrite "Edit" entry point is hidden on
the Recurring screen (`app/group/[id]/recurring.tsx`); only Pause / Resume / End
remain until the redesign ships. Skip-one is part of v1 and will be added with it.

### 6.11 Build outline (when greenlit)
1. Schema: add `parent_id` (series link) + reuse `recur_override_date`; a
   `skipped` marker (column or `recur_state` value on the override row).
2. `recurrence.ts`: skip dates that have a persisted override/skip when
   materializing; resolve overrides to their stored values.
3. Series-split helper: end current rule (`recur_end = splitDate - ε`), clone a
   new rule from `splitDate` with edited values.
4. Skip-one: persist a `skipped` override for `(series, date)`.
5. UI: scope picker (this & future / skip this one / end) on the Recurring screen;
   re-introduce an edit affordance wired to these safe ops only.
6. Verify budgets/reports/balances read the same materialization + overrides;
   add audit entries for each op.
