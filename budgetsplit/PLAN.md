# BudgetSplit — Master Plan (single source of truth)

> This is the **only** planning doc. It supersedes and folds in the former
> `PENDING.md`, `UX_PLAN.md`, and `APP_FLOW.md` (deleted — see git history).
> `AGENTS.md` (design-system/build rules) stays separate.

---

## 1. Vision & principles

A **premium, offline, private** money app — splitting + personal budgeting +
savings in one. The bar: every screen reads in <1s, every common action ≤2 taps,
nothing looks like a 2010 form.

1. **One hero per screen.** Balances / "what needs attention" first.
2. **Sentences over forms.** "Paid by *you* · split *equally*" beats stacked form rows.
3. **Color = meaning, always.** green = owed/income · coral = owe/expense · purple = settlement · muted = settled. No decorative color.
4. **No dated/childish chrome.** No stacked label-form rows, cartoon glyphs, gem buttons, gradients-for-nothing. Premium = restraint + type + spacing.
5. **≤2 taps** for add-expense, settle, attach.
6. **Confirm destructive, celebrate completion.**

---

## 2. Invariants

- **Stack:** React Native + Expo SDK 56 · Expo Router · expo-sqlite · Zustand · react-native-svg (donut) · gifted-charts (Reports).
- **100% offline.** No accounts, no network, no tracking. All data in `budgetsplit.db`. *(This is a product promise — see Decision D2: no cloud AI.)*
- **Money = integer paise**, formatted only at the view (`formatRupees` exact, `formatCompact` K/L/Cr).
- **Compact on overviews, exact on entry/transaction rows.**
- **Multi-table writes inside `db.withTransactionAsync`.** Recurring occurrences are computed on the fly, not stored (except skip/override rows).

---

## 3. Status — v1 (release-ready)

**Quality gate:** TypeScript clean · **88/88 tests** · on branch
`feat/design-adoption-bugfixes-toggles` (ready to PR to `main` as v1 — Decision D1).

**Shipped this cycle:**
- **Per-insight toggles** — `dashboardInsights` / `budgetInsights` / `savingsInsights` (was one `insights` flag) + Settings → Features section; plus `forecast`, `itemizedOcr`, `recurring`, opt-in `auto_sweep`.
- **Robustness (P0):** every screen wraps loads in try/catch → inline `ErrorState` + Retry; mutations → try/catch + haptic + Alert; route-id guards; date-fns `isFinite` guards; split/qty NaN+negative guards; `_layout` DB-init retry.
- **Bugs (P1):** SecondaryButton typography; groups balance-row targets the tapped person (`/settle?focus=`); reports soft-delete consistency; atomic savings `depositAndAllocate`.
- **Polish (P2):** central `palette.ts` (typed Feather names + `asFeather`, deduped swatches, chart colors, decor); dropped ~28 `as any` icon casts; touch targets ≥44pt; `PressableScale`/`PersonPicker`/dead-code cleanup.
- **INR-only v1** — currency picker + setting hidden (infra dormant).
- **Budget = resets each period** (no rollover) — copy reworded everywhere.
- **Recurring-edit v1** — `recur_skip` table; `materializeInstances` honors skips; `skipNextOccurrence` + `splitRecurringSeries` (history-safe "this & future"); UI Skip / Edit / Pause / Resume / End; the old blind-overwrite edit is gone.
- **Savings** — goals, pool, cash-available, auto-save, **opt-in budget auto-sweep** (off by default), insights.
- **Reports** — compact K/L/Cr; **upgraded interactive donut** (selected month · all groups — distinct from the dashboard donut); trend; forecast; year-in-review; **solid-theme PDF** + CSV.
- **Add forms** — "Repeat this" Switch toggle; tighter keyboard gap; fixed cramped interval field.
- **Receipt scan removed from Itemized** (on-device OCR could only read a single total; deferred — Decision D2/D3).
- **Help & Guide** updated to match reality (Savings section, recurring Skip/Edit, honest scan, Features toggles).

---

## 3.5 Feedback queue (live)

> Standing rule: apply the **Splitwise reference-screenshot taste** (inline
> "Paid by · split" sentence, owes-tree, "you lent/you borrowed", colored
> activity, clean detail) to everything here. Each item: gate + commit, then move on.

**✅ Shipped (this polish session)**
- **F1** Balances bug — income leaked into net → excluded `kind='income'` (`balances.ts`).
- **F2** Transaction detail → paid→owes summary + history timeline (no form rows).
- **F3** Itemized scan hidden (on-device OCR can't itemize; Decision D2/D3).
- **F4** Dashboard leads with **Top insights**; Recent activity removed.
- **F6** Zero day shows a quiet `—` (AmountText `zeroDash`), not an animated ₹0.
- **F9** Income recurring gains a **Custom "every N days"** interval.
- **F11** Compact decimals — 1 dp for K, 2 dp for L/Cr/M/B (summary math reads right).
- **F13a** Compact K/L/Cr across the Budget tab + group header/balances.
- **F14** Semantic coloring pass — health-colored budget spent amounts (BudgetBar,
  group detail header, category rows, utilization hero); action-colored history
  amounts; compact K/L/Cr in insight recommendations (`analytics.ts`).
- **F15** Donut fix — tap-to-deselect (was: tap-again navigated away, dimmed state
  stuck); selection resets on tab/data change.
- **F16** Add-form UX — top-right Save button (quick/income/transfer/itemized review);
  schedule toggle simplified to label+switch (no icon row); Never button bigger
  with accent color.
- **F13b/c** Budget IA — promoted Budget tile to hero position on dashboard (above
  donut, health-colored %, over/near badges); groups list cards now show
  category-level budget data + "X over" badge; balances card standalone.
- **F7** Settings UI — regrouped into Security / Budget & Data / Insights /
  Experimental / Manage / Help; killed the sparse Preferences section + long
  flat Features list; removed per-toggle captions (labels are self-explanatory).
- **F5** Navigation flicker — donut deselect fix covers the main visible issue;
  broader focus-refetch flicker noted, deferred to device repro.

**🔨 Active**
- **F8** v1 release — PR `feat/design-adoption-bugfixes-toggles` → `main`.

**📋 Queued → mapped to phases in §6**
- **F12** Budget *entry* redesign — collapsible parent-category sections w/ icons +
  faster entry (smart defaults / quick-set). *(User refining exact UX.)* → Phase 3.
- **F10** Forecast redesign — on-device model (month patterns, weekday seasonality,
  category mix) + "needs N days" gate. Strictly offline, no cloud ML. → Phase 3.
- **F8** v1 release — PR this branch to `main` (Decision D1). → Phase 1 close-out.

(These feed the v2-P0 "premium pass" workstreams in §6.)

**Working mode:** execute this queue + §6 roadmap **autonomously, one phase at a
time, gate + commit each**. New user feedback is appended here and the work
continues without pausing to ask. Standing rule: apply the Splitwise-screenshot
taste throughout.

**Conventions (standing):**
- **Use enums / named constants for states & options** — no bare magic strings
  for finite sets (status, kind, frequency, split type, etc.). New code uses a TS
  `enum` (or a single `as const` map) so states are referenced by name; retrofit
  opportunistically when touching a file.
- Money = paise; compact on overviews, exact on entry/rows; Feather icons only;
  tokens not raw hex; ≥44pt targets (per `AGENTS.md`).

---

## 4. Decisions log (locked)

- **D1 — Ship current branch as v1** (PR to `main`); everything below is v2/next.
- **D2 — Stay strictly offline.** AI receipt itemization needs the network, which breaks the offline promise, so it is **out** (at most a far-future, clearly-flagged opt-in). Don't build cloud features.
- **D3 — Receipt scanning deferred to last / effectively shelved.** Without true line-item extraction it has no value, and D2 rules out the AI that would make it work. The Itemized scan button is **hidden**. Manual itemized entry stays.
- **D4 — People = a segment on Groups** (not a new tab yet): reusable picker + cross-group friend balances; promote to a tab later only if earned.
- **D5 — Recurring single-occurrence *value* exceptions deferred.** v1 covers skip-one + this-&-future + end. If/when built: materialize-on-touch (`parent_id` + `recur_override_date`), value fields default "this occurrence", schedule fields "this & future", settled occurrences use an adjustment-entry (never mutate in place).
- **D6 — Multi-currency deferred.** INR-only for now; infra kept dormant.
- **D7 — Navigation/state walkthrough** into a formal spec: deferred (current nav is fine).

---

## 5. Screen map (current — post-v1)

- **Shell** (`_layout`): font/DB gate (with retry) → providers → `LockGate` → `OnboardingGate` → `PrivacyScreen` → Stack (tabs + 4 add modals).
- **Tabs** (frosted bar): **Home · Groups · Savings · Settings.** Reports folds into Home.
- **Home** (`(tabs)/index`): greeting + name + Reports button · Today/Month/Year pills · spending hero (compact) + delta + Income/Net/Savings% · interactive **donut** ("Where it went") · Budget + Balances tiles · Savings card · Insights *(dashboardInsights)* · recent activity · group-health list · FAB.
- **Groups** (`(tabs)/groups`): balances hero + "Settle up · tap a person" (targets that person) · filter chips · shared-group cards (swipe-archive) · FAB · New-Group sheet. *(Personal lives under Savings.)*
- **Group detail** (`group/[id]`): themed header · budget bar · tabs **Expenses / Balances / Budget / Members** (personal = Expenses + Budget only, no attribution) · options sheet (Recurring/History/Edit/Members/Archive).
- **Savings** (`(tabs)/savings` + `savings/[id]`): cash-available hero (colored in·out·saved) · pool card · insights *(savingsInsights)* · goals list · goal detail (add/withdraw/lock/delete) · auto-save + opt-in sweep.
- **Reports** (`/reports`): export CSV/PDF · month nav · per-group summaries · upgraded donut · 6-mo trend · forecast *(forecast)* · year-in-review.
- **Settings** (`(tabs)/settings`): Account · Privacy & Security · Preferences (cadence) · **Features** (3 insight toggles + forecast + itemized + recurring + auto-sweep) · Manage (Categories/History) · Help · About. *(Currency row hidden.)*
- **Add modals:** Quick (amount · group · category · note · date · "Repeat this" switch · Who-paid / Split sheets) · Income (personal-only) · Transfer (multi-member) · Itemized (items → assign → payers → review; scan hidden).
- **Drill-ins:** txn detail · category detail · Budget & Insights · budget editor · Recurring (Skip/Edit/Pause/Resume/End) · members · edit group · global Settle · Categories · History · Help.
- **Data model:** `person · budget_group · group_member · txn (+txn_payment, txn_share, line_item) · recur_skip · category · category_budget · savings_goal · savings_txn · settings · audit_log`.

---

## 6. Roadmap (phased — build top to bottom)

### Phase 1 — v1 baseline & polish close-out  *(done)*
Everything in §3 is shipped. All feedback items closed:
- **1.1** ✅ Budget IA — promoted budget hero on dashboard + category-level data on group cards *(F13b/c)*
- **1.2** ✅ Settings UI — regrouped into semantic sections *(F7)*
- **1.3** ✅ Navigation flicker — donut fixed; broader flicker deferred to device *(F5)*
- **1.4** **Ship v1** — PR `feat/design-adoption-bugfixes-toggles` → `main`. *(F8, Decision D1)*

### Phase 2 — Premium pass (image-inspired)
- **2.1 Faster add-expense (2-tap):** inline **"Paid by [you ▾] · split [equally ▾]"** sentence; sheets open only when a pill changes. → `add/quick.tsx`.
- **2.2 Balance & activity clarity:** transaction rows show **"you lent / you borrowed ₹X"**; activity rows = colored thumbnail + sentence + colored amount; collapse noisy edits; group recurring-series changes. → `TransactionRow.tsx`, `group/[id].tsx`, `history.tsx`.
- **2.3 Receipts done right (offline):** wire the dead `attachment_uri` — attach on add + detail → store via FileSystem → row thumbnail + full-screen zoom. No scanning claims. → `add/*`, `txn/[id].tsx`, `TransactionRow.tsx`.
- **2.4 People reuse (D4):** type-to-create people picker (members + payers); `getFriendBalances`; **People segment on Groups** w/ one-tap settle; later friend profiles (email/mobile, merge dupes).
- **2.5 Form-row sweep:** apply the cleaner pattern to member / settle / budget-editor rows.

### Phase 3 — Depth features
- **3.1 Budget entry redesign (F12):** collapsible parent-category sections w/ icons; faster entry (smart defaults / quick-set rows).
- **3.2 Forecast redesign (F10):** on-device model (month patterns, weekday seasonality, category mix) + "needs N days" gate. Strictly offline.
- **3.3 Settle & lists:** "Settle all" + completion moment; Groups filter sheet (You owe / Owes you / Settled / Archived); skeletons on group-detail + reports; empty-state CTA audit; onboarding → one-tap "Add first expense".

### Phase 4 — Deferred / out of scope
- AI receipt itemization (D2/D3) · multi-currency (D6) · recurring single-occurrence value edits (D5) · formal nav spec (D7).

---

## 7. Acceptance scenarios

- **Split a dinner:** open Add, type ₹1200, tap Save. 2 taps (you/equally default).
- **Read a transaction:** open it → hero amount, a clean "you paid · they owe"
  avatar summary, then a quiet timeline of changes. No form-row look.
- **Settle a friend:** Groups → People → tap friend → one Settle clears them
  everywhere; completion moment.
- **Attach a receipt:** tap photo chip → take/pick → thumbnail shows, tap to zoom;
  image never lost; nothing leaves the device.
- **Activity at a glance:** each row says who/what/impact with a colored amount; a
  "this & future" recurring edit is one expandable line.
- **Settings:** scannable grouped cards with even rhythm — not a long flat toggle list.
