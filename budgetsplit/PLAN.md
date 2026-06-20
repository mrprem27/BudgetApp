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

## 3.5 Feedback log — Pending / Done

> Mode: autonomous, **one item at a time, gate + commit, then move it Pending → Done**.
> Conventions: Splitwise-screenshot taste · enums for finite states · paise money,
> **compact on overviews / exact on entry** · Feather icons (no emoji) · tokens not
> hex · ≥44pt. (See `AGENTS.md`.)

### 🏗 Build phases (in order)
**A** ✅ F25 avatars · **B** ✅ F24 feature-screen + F27 money-structure · **C** ✅ F28/F29/F21
color-format sweep · **D** ✅ F18 inputs + F17 spacing + F20 friends-entry + F12 budget-entry
→ only **F8 PR** remains.

### 📋 Pending
- **F8** Ship v1 — PR branch → `main`. *(Final step — open on your go-ahead.)*

### ✅ Done
F1 income-leak balances fix · F2 txn detail (paid→owes + timeline) · F3 itemized
scan hidden · F4 dashboard Top insights · F5 donut remount/deselect · F6 zero-day
dash · F7 Settings regroup · F9 income custom interval · F10 forecast redesign
(+tests) · F11 compact decimals · F12 budget-entry redesign (collapsible parent
sections + faster inline entry) · F13 budget compact + rows + IA · F14 semantic
coloring · F15 donut deselect · F16 add-form UX · F17 budget spacing · F18 shared
focused Input across forms · F19 donut wedge return · F20 manage-friends rename ·
F21 settlement sign-color · F22 settlement directional rows · F23 Settings padding ·
F26 History spacing · F25 avatar photos (user + friends) · F24 feature-management
screen · F27 Money-tab Spending/Savings sections · F28 insights compact (savings) ·
F29 increase=coral severity.

---

## 3.6 — Next-Version Build Checklist (Phases A–E)  ← **ACTIVE**

> Build order **A → B → C → D → E**. **Phase F parked** (months out). Gate every
> item: `tsc` clean + tests green, then commit. A/B need no native modules; C/E
> need a custom dev build (expo-notifications / WidgetKit). Full strategic detail
> in root `FEATURE_ROADMAP.md` §0.

### Phase A — Edit integrity & recurring model  *(P0 · no dev build)*  ✅ DONE
- [x] **A1 — Edit itemized bills** — `updateItemizedTxn`; `add/itemized` accepts
      `editId` (loads items/assignments/payers/adjustments); persisted `adjustments`
      column so bills round-trip; itemized edit unlocked on `txn/[id]`.
- [x] **A2 — Recurring occurrences become real, editable transactions** —
      `parent_recur_id` column; `materializeDueOccurrences` catch-up on app-open +
      foreground (AppState); `getClaimedOccurrences` dedups so the virtual generator
      never double-counts; 92-day back-fill horizon; `occurrenceDatesUpTo` (+tests).
- [x] **A3 — "Added by [recurring]" provenance** — "Recurring · Added by '<rule>'"
      row on txn detail → taps to Recurring Manager and highlights the rule (`?focus=`).
- [x] **A4 — Undo for deletes (5s toast)** — root `UndoProvider`/`UndoToast` survives
      `router.back()`; `restoreTxn`; wired on detail + group-swipe deletes.
      Recurring-rule delete now **asks** before removing already-logged occurrences.

### Phase B — On-device smart wins  *(no dev build)*  ✅ mostly DONE
- [x] **B1 — Goal celebration** — confetti + haptic when a goal hits 100% (`GoalCelebration`).
- [x] **B2 — Pattern-aware "Can I afford this?"** — subtracts this month's committed bills;
      shows cash − bills = free-to-spend (`evaluateAfford`, +tests).
- [x] **B3 — Global transaction search** — `/search`: category/note/amount + kind chips.
- [x] **B4 — Duplicate detection** — same category+amount within ±24h warns on add.
- [x] **B5a — Photo size cap** — picker compresses on import (`quality 0.7`).
- [x] **B5b — Storage management** — `/storage`: size + count + delete-all.
- [ ] **B5c — Multi-photo (≤3)** — deferred (attachment-array refactor; marginal value).
- [ ] **B5d — PDF attachments** — deferred to dev-build track (`expo-document-picker`).
- [x] **B6 — Financial-health score** (0–100, opt-in dashboard gauge) · **what-if** (Reports).
- [x] **B7 — Smart categories: learn from corrections** (`smartCategoryLearn`, +tests).
- [x] **B8a — Pull-to-refresh** — reusable `AppRefreshControl` + `useRefresh` on
      Dashboard / Groups / Money / Group-detail.
- [ ] **B8b — Bulk actions** (multi-select delete / recategorize / move) — deferred;
      a dedicated selection-mode feature, P2.
- [x] **(bonus) Add friend** directly from the Friends screen + Groups-tab entry.

### Phase C — Notifications & subscriptions  *(needs dev build — expo-notifications)*
- [ ] **C1 — Local notification engine** (permission, schedule, cancel) foundation
- [ ] **C2 — Budget warnings** (80/100%) · **bill/renewal reminders** (N1, from recurring)
- [ ] **C3 — Subscription auto-detect** (N2) → dashboard · renewal calendar · cost optimization
- [ ] **C4 — Streak push nudge** · settlement nudges · daily digest
- [ ] **C5 — Data-gated unlocks** — N-day streak unlocks 60/90-day forecast + pattern search

### Phase D — Onboarding & data safety  *(no dev build)*
- [ ] **D1 — Full interactive onboarding** covering all main features
      (create group → add → split → budget → savings → settle)
- [ ] **D2 — Encrypted auto-backup** to iCloud/Drive (full export already ✅)

### Phase E — iOS widget  *(needs dev build — WidgetKit)*
- [ ] **E1 — Quick-add / dashboard widget** (N3): app-group shared JSON → SwiftUI widget

### Phase F — Bigger bets  *(⏸ PARKED — revisit after months)*
- Multi-currency · cloud sync/multi-device · UPI links · net worth · data import ·
  goal sharing · AI receipt OCR (D2). **Not in this build cycle.**

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

### Phase 2 — Premium pass (image-inspired) *(done)*
- **2.1** ✅ Faster add-expense — inline "Paid by [you ▾] · split [equally ▾]" sentence. → `add/quick.tsx`.
- **2.2** ✅ Balance & activity clarity — "you lent / you borrowed ₹X" attribution on transaction rows; paperclip indicator for attachments. → `TransactionRow.tsx`, `group/[id].tsx`.
- **2.3** ✅ Receipts done right (offline) — `attachment_uri` wired: attach on add + detail view with pinch-to-zoom; `src/lib/attachment.ts` helper using expo-file-system Paths API. → `add/quick.tsx`, `txn/[id].tsx`.
- **2.4** ✅ People reuse (D4) — `PersonPicker` component (type-to-create); `getFriendBalances` query; People section on Groups tab; PersonPicker wired into member management. → `PersonPicker.tsx`, `balances.ts`, `groups.tsx`, `members.tsx`.
- **2.5** ✅ Form-row sweep — BalanceRow overlapping avatars + sentence; budget editor single card with dividers; member rows 52pt min height + swipe-to-remove. → `BalanceRow.tsx`, `budget.tsx`, `members.tsx`.

### Phase 3 — Depth features
- **3.1** ✅ Budget entry redesign (F12) — collapsible parent-category sections w/ icons; faster inline entry (type a limit on any category, no pre-add).
- **3.2** ✅ Forecast redesign (F10) — run-rate blended with prior-month actual + "needs N days" gate. Strictly offline. *(Deeper weekday/category-mix model still possible later.)*
- **3.3 Settle & lists:** "Settle all" + completion moment; Groups filter sheet (You owe / Owes you / Settled / Archived); skeletons on group-detail + reports; empty-state CTA audit; onboarding → one-tap "Add first expense".

### Phase 3.5 — Current cycle (in progress)
- ✅ Colored insight figures + plain-English copy + 2-decimal compact (drop trailing zeros).
- ✅ Reports: clean forecast line + donut-driven category trend + current-month highlight.
- ✅ Transfer redesign (From → To card) · editable settlements/transfers.
- ✅ User/friend photos everywhere · Friends list screen + Groups-tab entry.
- ✅ Dashboard Cash-available card · section-level feature toggles (simple↔complex).
- 🔄 **Smart categories** (opt-in): type a title → category auto-fills (`smartCategory.ts`).
- 🔄 **Smart one-screen fast entry** (amount + title, you-paid/split-equally default).
- 🔄 Pop-up/sheet header (cancel/save) padding sweep.

### Phase 5 — Next version (v2 candidates)
> Most need a **custom dev build** (native modules) — they can't run in Expo Go.
> Local-only where possible to keep the offline promise (D2).

- **N1 — Subscription/renewal reminders (local notifications).** Opt-in per
  recurring item: "Remind me before renewal" → a **local** `expo-notifications`
  alert N days before the next occurrence so people can cancel unwanted
  subscriptions. On-device only (no server) → still offline-safe. Needs a dev
  build + notification permission + scheduling tied to `materializeInstances`.
- **N2 — Recurring/subscription *detection*.** Heuristic over history: same
  payee/amount/cadence repeating → surface "Looks like a subscription —
  track it / set a reminder?" Pure on-device analysis.
- **N3 — iOS quick-add widget / home-screen widget.** WidgetKit target + app
  group + dev build (deferred from this cycle — sizable native work).
- **N4 — Deeper forecast model** (weekday seasonality, category mix).
- **N5 — Tracking streak + daily nudge.** Show a gentle "🔥 N-day streak · log
  today" on the dashboard (on-device, buildable now). The *daily reminder* if you
  haven't logged needs local notifications (v2 / dev build). Keep it
  encouraging, never guilt-inducing (per §1 principle). Streak resets to day 0
  after a gap; counts consecutive days with ≥1 entry.
- **N6 — "Can I afford this?"** A quick check: enter a prospective purchase →
  compare against cash-available + budget-left + upcoming recurring, show a
  clear yes/tight/no, and offer "put it toward a goal instead" (adds to a
  savings goal). On-device, opt-in. *(Strong fit — recommended build-now
  candidate.)*
- **N7 — No-spend-days tracker (maybe).** Count consecutive no-spend days
  overall or per category. Gamified/niche — keep as a small stat at most, or
  skip; low priority.

### Phase 6 — Deferred / out of scope
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
