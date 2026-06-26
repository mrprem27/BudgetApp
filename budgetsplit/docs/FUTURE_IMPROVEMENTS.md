# BudgetSplit — Future Improvements

> Ideas for where the product and codebase can go next. Organized by category, each item
> tagged with rough **effort** (S/M/L/XL) and whether it respects the **offline promise**
> (no network/accounts/cloud). Items that would break that promise are flagged ⚠️ and kept
> as deliberate, clearly-gated opt-ins only.
>
> For *fixing what's already half-built*, see [REFACTORING_PLAN.md](./REFACTORING_PLAN.md)
> and [BRUTAL_ANALYSIS.md](./BRUTAL_ANALYSIS.md). This doc is about *new* value.

---

## 1. New features

### Finish what's already in the codebase (highest ROI — code exists, just unwired)
- **Wire up Afford Check** (S) — `lib/afford.ts` + `app/afford.tsx` are complete but
  gated behind a dead `SHOW_EXTRAS=false` and an off-by-default flag. Surface the verdict
  *inline in the add flow* ("₹X left in Food — this puts you tight") where it has context,
  and keep the full screen as a deep view.
- **Activate subscription detection** (M) — `lib/subscriptions.ts` (`detectSubscriptions`)
  is fully built + tested but never called. Use it to *suggest* "Looks like a subscription —
  track it?" from logged history, deduped against existing recurring rules.
- **OCR receipt scan** (M/L) — **DECIDED: parked / deprecated, kept in place.**
  `lib/ocr.ts` is marked `@deprecated` and stays dormant (on-device OCR only reads a
  single total, not line items, so it was never surfaced). Revisit as a real
  camera + line-item-model feature; until then `lib/ocr.ts` + `expo-ocr` are
  intentionally unused (not deleted).
- **Tracking streak** (S) — `StreakCard` + streak query exist; currently commented out on
  Home. Re-enable behind the `streak` flag (only show at ≥3 days; never guilt-trip).

### Genuinely new capability (offline-safe)
- **Bulk transaction actions** (M) — multi-select to delete / recategorize / move between
  groups. Frequently needed after a messy import or a wrong category.
- **CSV / JSON data import** (M) — complements the existing export; lets users migrate in.
- **Encrypted local auto-backup + restore** (M) — export an encrypted snapshot to Files /
  AirDrop; restore on a new device. Stays offline (user-driven file, no server).
- **iOS home-screen widget** (L ⚠️ needs dev build) — quick-add + "spent this month" via a
  WidgetKit target + App Group shared JSON.
- **Recurring single-occurrence value edits** (M) — currently only skip-one / this-&-future
  / end are supported. Add "edit just this occurrence" via the `recur_override_date` column
  that already exists in the schema.
- **Net-worth / accounts view** (L) — manual asset/liability tracking layered on the
  existing money model.
- **No-spend-days tracker** (S) — small gamified stat; low priority.
- **Goal templates** (S) — pre-built goals (emergency fund = 6× monthly spend, etc.) seeded
  from the user's actual numbers.

### Network-dependent (⚠️ violates offline promise — opt-in, far-future only)
- **Multi-device cloud sync** (XL ⚠️) — the schema (`remote_uid`) hints at it; would need
  conflict resolution + a backend. Major identity shift.
- **AI receipt itemization** (L ⚠️) — true line-item extraction needs a network model.
- **UPI deep-links for settlement** (M ⚠️ semi-online) — generate a real UPI intent URL so
  "Pay ₹X" actually opens a payment app.
- **Group invite / shared groups** (XL ⚠️) — real multi-user splitting (vs. local-only contacts).

---

## 2. UX / UI improvements

- **One consistent modal-depth metaphor** (M) — today add screens are full-screen modals,
  some sheets are `SheetModal`, a couple are raw RN `<Modal>`, and most management is
  stack-push. Pick one "do-and-return" metaphor and apply it everywhere.
- **Unify the three settle entry points** (M) — global wizard, direct mode, and the
  Quick-Add Transfer pill should converge into one guided "money between people" flow with
  the same UI.
- **Consistent screen-state contract** (S) — every screen should ship empty / loading /
  error / full. Today Home has loading+error, Groups error-only, Plan neither, Settings
  neither; some empties are bare `<Text>`. Standardize on `EmptyState`/`Skeleton`/`ErrorState`.
- **Breadcrumb context on deep screens** (S) — `group/[id]/budget` etc. float without
  "Groups › Flatmates › Budget"; the history back-label is even hardcoded to "Settings".
- **Deep-link group sub-tabs** (S) — the active tab is local state; allow
  `/group/[id]?tab=budget` so links land correctly.
- **Add-flow polish** (M) — collapse the duplicated recurring/group-picker/location UI into
  shared components for a consistent feel across Quick / Income / Itemized.
- **Empty-state CTAs everywhere** (S) — audit every list for an actionable empty state.
- **Accessibility pass** (M) — dynamic type, VoiceOver labels on icon-only buttons,
  contrast check on muted text, 44pt targets verified.
- **Haptic discipline audit** (S) — confirm haptics only fire on meaningful actions per
  AGENTS.md (no nav/tab/sheet haptics).
- **Reports drill-down depth** (M) — every chart segment should route to its transactions;
  surface PDF export + share more prominently.

---

## 3. Engine & business-logic improvements

- **Single month-end projection** (M) — `analytics.projectedMonthEnd` (linear) and
  `forecast.forecastMonthEnd` (Bühlmann) coexist and can disagree. Make `forecast` the one
  source; delete the linear path.
- **One budget-status classifier** (S) — the 80%/100% thresholds are duplicated in
  `budget.getCategoryBudgetStatus` and `analytics.getBudgetAnalytics`. Extract
  `budgetHealth(pct)` and reuse.
- **Consistent recurring→monthly normalization** (S) — three variants exist (`weekly*4`
  vs `weekly*52/12`). Add one `recurringMonthlyEquivalent(amount, freq)` helper.
- **Health score that influences something** (M) — `computeHealthScore` is display-only;
  feed `suggestImprovement` into actionable nudges (e.g. propose a budget tweak or goal).
- **Smarter forecast model** (L) — weekday seasonality + category mix on top of the
  credibility blend (still on-device).
- **Budget rollover modes** (M) — `carry_over` exists in schema; expose true rollover vs
  reset-each-period as a per-group choice.
- **Test the canonical engine** (S) — `budget.ts` (the spend/limit foundation) has **zero
  tests** despite driving analytics + savings. Add coverage before changing it.

---

## 4. Performance optimizations

- **Add the missing hot-path indexes** (S, high impact) — `txn(group_id, date,
  is_deleted)`, `txn(parent_recur_id)`, `line_item(txn_id)`. Every list query filters on
  these unindexed today.
- **Kill the N+1 split loader** (M) — `loadSplits` issues 2 queries per transaction; list
  loaders do `2N+1` queries. Batch payments/shares with `WHERE txn_id IN (...)` (the
  `getSkipsMap` pattern shows how).
- **Cache `getAffordSnapshot`** (S) — it fires 6 range queries (each N+1) on every Quick
  Add open. Compute once / memoize.
- **Reduce full reloads after mutations** (M) — most screens call a full `load()` after
  every write. Move to targeted state updates (this is also the store-authority decision).
- **Trim dead style/JSX** (S) — large blocks of dead styles/branches inflate bundles and
  re-renders (savings.tsx, groups.tsx, index.tsx).
- **Skeletons over spinners** (S) — `reports.tsx` uses a bare `ActivityIndicator`; align
  with the Skeleton convention and drop the artificial 450ms delay.

---

## 5. Scalability improvements

- **Make the data layer index- and query-efficient** (M) — covered above; required before
  power users with thousands of transactions.
- **Paginate / windowize long lists** (M) — search, history, and group expenses load wide
  ranges (e.g. 3-year search window) eagerly.
- **Normalize categories** (L) — `txn.category` and `category_budget.category` are name
  strings, not FKs; renames/deletes orphan data. Move to category IDs for safe rename/merge.
- **Enable foreign keys + cascade rules** (M) — `PRAGMA foreign_keys` is off; cascades are
  hand-written and have gaps (`deleteCategory`). Turn them on and lean on the DB.
- **Component-extract the monoliths** (L) — `quick.tsx` (1250), `group/[id].tsx` (1125),
  `Onboarding.tsx` (959), `reports.tsx` (872), `itemized.tsx` (817) need decomposition to
  stay maintainable as features grow (see REFACTORING_PLAN).
- **Settings schema** (S) — replace ad-hoc AsyncStorage keys with one typed settings module
  (or the dead `settings` table) so new prefs don't sprawl.

---

## 6. Security enhancements

- **Encrypt the SQLite DB at rest** (M) — currently plaintext `budgetsplit.db`; consider
  SQLCipher / an encrypted store, especially given the privacy positioning.
- **Encrypt receipt photos & exports** (M) — local attachments and CSV/PDF exports are
  plaintext on disk.
- **Re-auth on sensitive actions** (S) — biometric re-prompt before export / delete-all /
  disabling the lock.
- **Auto-lock timeout** (S) — lock after N minutes background, not only on cold start.
- **Scrub PII from any future telemetry** (S) — if analytics is ever added, keep it
  on-device/aggregate to preserve the no-tracking promise.
- **Backup encryption** (M) — any auto-backup feature must be encrypted by default.

---

## 7. Other ideas (vague but worth capturing)

- **Spending personality / wrapped** — an annual "year in money" narrative built from the
  existing year-in-review data.
- **Shared-expense fairness insights** — "you always pay for dinners" patterns across groups.
- **Smart category model upgrade** — small on-device embedding model instead of keyword
  rules.
- **Natural-language quick add** — "350 chai with Rahul" parsed into amount + category +
  split (on-device).
- **Goal-linked round-ups** — round each expense up and sweep the difference into a goal.
- **Widget-driven streaks / nudges** — gentle daily-log encouragement.
- **Theming** — light mode / accent customization on top of the token system.
- **Localization beyond INR** — the multi-currency infra is dormant; could revive for NRIs.
- **"What changed" digest** — weekly on-device summary of spend shifts.
