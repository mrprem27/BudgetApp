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

## 3.5 Live feedback queue (active — newest user feedback)

> Standing rule: **take inspiration from the provided Splitwise reference
> screenshots** (add-expense inline sentence, owes-tree, "you lent/you borrowed",
> colored activity, clean detail). Apply that taste to everything below.

| # | Item | Status |
|---|---|---|
| F1 | **Balances wrong on dashboard** — income leaked into net (payer rows counted) | ✅ Fixed (`balances.ts`: exclude `kind='income'`) |
| F2 | **Transaction detail** felt like a stacked from/to form + clunky history | ✅ Fixed (paid→owes summary + history timeline) |
| F3 | **Itemized scan** only read a total (no AI/offline) | ✅ Hidden (Decision D2/D3) |
| F4 | **Top Insights on the dashboard instead of Recents** | ⏳ In progress |
| F5 | **Flicker on navigation** — content pops in/out when focusing/navigating (chart-defer + focus reload) | ⏳ Pending |
| F6 | **Zero/empty states** — for a 0/empty day show a clean dash/line, not a number with icon-animation/emoji | ⏳ Pending |
| F7 | **Settings UI** — sparse Preferences card + long flat Features list; regroup, fix rhythm, 44pt rows | ⏳ Pending |
| F8 | **v1 release** — PR this branch to `main` (Decision D1) | ⏳ Pending |

(These feed the v2-P0 "premium pass" workstreams in §6.)

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

## 6. Roadmap

### v2 — "Premium pass" (P0, do all — image-inspired)

**A. Faster add-expense (2-tap).** Inline **"Paid by [you ▾] · split [equally ▾]"**
sentence under the amount (Splitwise pattern). Defaults you/equally → a simple
split is 0 extra taps; sheets open only when a pill changes. → `add/quick.tsx`.

**B. Balance & activity clarity.**
- Transaction rows get a right-side **"you lent ₹X / you borrowed ₹X"** label
  (we already compute share-vs-paid). → `TransactionRow.tsx`, `group/[id].tsx`.
- Activity/History rows: colored category thumbnail + one-line sentence + colored
  amount; collapse noisy consecutive edits; group recurring-series changes.
  → `history.tsx`.

**C. Modernize dated / form-like screens.** *(Your direct feedback.)*
- **Transaction detail (`txn/[id].tsx`)** — the **Paid by / Split** section reads
  like an old stacked "from → to" form, and the **audit history** block at the
  bottom looks clunky. Redesign: a compact **avatar-stacked split summary**
  (who paid · who owes, as chips/rows with avatars + amounts, not label-form
  rows), and the history as a **subtle vertical timeline** (dot + line + quiet
  text), de-emphasized. One clean hero → split → details → history rhythm.
- **Settings (`settings.tsx`)** — audit & tidy: the **Preferences** card is now a
  lonely single row (post currency-removal), the **Features** list is long and
  flat (7 toggles + captions). Regroup, fix row rhythm/spacing, give sections
  breathing room, ensure 44pt rows. Make it feel premium, not a checklist.
- Sweep for the same "form-row" smell on other detail/secondary screens (member
  rows, settle rows, budget editor rows) and apply the cleaner pattern.

**D. Receipts done right (no AI, offline-safe).** Wire the **dead `attachment_uri`**:
attach a photo on add + detail → store via FileSystem → **thumbnail** on the row +
**full-screen zoom**. Never discard the image. (This is the honest, offline
"modern attachment experience" — no scanning claims.) → `add/*`, `txn/[id].tsx`,
`TransactionRow.tsx`.

**E. People reuse (Decision D4).** Type-to-create reusable people picker in
members + payers (one sheet, "Create '<name>'" as first result); `getFriendBalances`
(net per person across all shared groups); a **People segment on Groups** with
one-tap settle; later friend profiles (expose stored email/mobile, merge dupes).

### v2 — P1 (after the premium pass)
- Settle: "Settle all" + a tasteful completion moment.
- Groups list: filter sheet (You owe / Owes you / Settled / Archived); balance-first rows.
- Empty-state CTA audit; onboarding ends with a one-tap "Add your first expense".
- Skeletons on group-detail + reports loads.

### Deferred / out of scope
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
