# BudgetSplit — Multi-Version Feature Roadmap

**World-Class Budget & Expense Splitting App**
**Document Version:** 2.0 | **Last Updated:** 2026-06-20
**Benchmark:** Splitwise · YNAB · Monarch Money · Tricount · Copilot Money · PocketGuard · Honeydue

> **Status note (2026-06-20):** v1 shipped to `main`; a large polish + smart-money
> cycle is on `feat/design-adoption-bugfixes-toggles`. Many features once planned
> for v2.0 / v2.5 below are **already built** — see §1 for the live inventory.
> Day-to-day working log lives in `budgetsplit/PLAN.md`; this doc is the
> strategic multi-version view.

---

## 0. Next Version — Phased Build Plan (the "what's next", nothing missed)

> Everything **not yet done** (fixes + features), ordered by dependency and
> value. Phases A–B need **no native modules** (work in Expo Go). Phases C & E
> need a **custom dev build**. Each item links to its detailed row above.
> Legend: ✅ done · 🟡 partial · 📋 planned · ❌ open.

### Phase A — Edit integrity & recurring model *(P0 · no native deps)*
- [ ] **Edit itemized bills** — reopen an itemized txn in the itemized editor (no orphaned line items) *(2.0.6)*
- [ ] **Recurring → real editable txns** — materialize a due rule into an actual transaction at midnight + app-open catch-up; add `parent_recur_id` *(2.0.6)*
- [ ] **"Added by [recurring]" provenance** on each occurrence → tap jumps to the rule and **highlights** it *(2.0.6)*
- [ ] **Undo for deletes** — 5s "Undo" toast on every delete *(2.0.4)*
- ✅ Already done: editable settlements/transfers · partial settlements · transaction notes.

### Phase B — On-device smart wins *(no native deps)*
- [ ] **Goal celebration** — confetti + haptic when a goal is reached *(2.5.1)*
- [ ] **Pattern-aware "Can I afford this?"** — factor projected month-end pace + upcoming recurring + category averages *(2.5.6)*
- [ ] **Global transaction search** + richer filters (date / amount / person range) *(2.0.1)*
- [ ] **Duplicate detection** — warn on same amount+date+category within 24h *(2.0.1)*
- [ ] **Photos:** up to 3 per txn · per-photo size cap (compress) · storage management · PDF receipts *(2.0.3)*
- [ ] **Financial-health score** (0–100) · **what-if simulator** *(2.5.3)*
- [ ] **Smart categories — learn from corrections** *(2.5.4)*
- [ ] **Pull-to-refresh** on list screens *(2.0.4)*
- [ ] **Bulk actions** — multi-select delete / re-categorize / move *(2.0.1)*

### Phase C — Notifications & subscriptions *(needs dev build — expo-notifications)*
- [ ] **Local notification engine** (on-device scheduling foundation) *(2.0.5)*
- [ ] **Budget warnings** (80% / 100%) · **bill/renewal reminders** (N1) *(2.0.5)*
- [ ] **Subscription auto-detect** (N2) → dashboard · renewal calendar · cost optimization *(2.5.2)*
- [ ] **Streak daily push nudge** (in-app chip already ✅) · settlement nudges · daily digest *(2.0.5)*
- [ ] **Data-gated unlocks** — N-day streak unlocks 60/90-day forecasting & pattern search *(2.5.7)*

### Phase D — Onboarding & data safety
- [ ] **Full interactive onboarding** covering all main features (groups → add → split → budget → savings → settle) *(2.0.4)*
- [ ] **Data backup** — encrypted auto-backup to iCloud/Drive (full export already ✅) *(Known Issues #10)*

### Phase E — iOS widget *(needs dev build — WidgetKit)*
- [ ] **Quick-add / dashboard widget** (N3)

### Phase F — Bigger bets (v3.0+)
- [ ] Multi-currency (D6) · cloud sync / multi-device · real-time collaboration · UPI payment links
- [ ] Net worth (assets/liabilities) · data import (Splitwise/CSV/bank) · goal sharing
- [ ] AI receipt OCR / NL entry — **deferred** (breaks offline promise, D2)

**Suggested order:** A → B → C → D → E → F. A and B can ship in the current
(no-dev-build) track; C and E start a dev-build track in parallel when you're ready.

---

## Table of Contents

1. [Current State Assessment](#current-state-assessment)
2. [Gap Analysis vs. World-Class Apps](#gap-analysis)
3. [Version 2.0 — Foundation & Polish](#v2)
4. [Version 2.5 — Smart Money](#v25)
5. [Version 3.0 — Social & Sync](#v3)
6. [Version 3.5 — Intelligence Layer](#v35)
7. [Version 4.0 — Financial Ecosystem](#v4)
8. [Version 5.0 — Platform & Scale](#v5)
9. [Priority Matrix](#priority-matrix)
10. [Known Issues & Fixes Required](#known-issues)

---

## 1. Current State Assessment <a name="current-state-assessment"></a>

### Core (shipped in v1)
| Feature | Status |
|---------|--------|
| Multi-group expense tracking | ✅ |
| Quick & itemized bill splitting (equal / %, shares, exact) | ✅ |
| Income tracking (with custom recurrence intervals) | ✅ |
| Category budgets — 4 cadences (once/daily/monthly/yearly, resets each period) | ✅ |
| Budget health analytics + plain-English recommendations | ✅ |
| Recurring transactions — skip-one · this-&-future · pause/resume/end | ✅ |
| Debt simplification + global "Settle up" (targets the tapped person) | ✅ |
| Audit log / per-transaction timeline | ✅ |
| CSV + solid-theme PDF export | ✅ |
| Biometric lock + privacy screen | ✅ |
| Dark theme design system (tokens, palette, Feather icons) | ✅ |
| INR paise-precision money; compact K/L/Cr (2-dec, no trailing zeros) | ✅ |
| Robustness: ErrorState+Retry on every screen, guards, atomic writes | ✅ |

### Shipped this cycle (post-v1, branch `feat/design-adoption-bugfixes-toggles`)
| Feature | Status |
|---------|--------|
| **Savings module** — pool, goals, cash-available, auto-save, opt-in budget sweep | ✅ |
| **Receipt photo attachments** — attach on add + pinch-zoom on detail (offline) | ✅ |
| **Transfer transactions** — clear From → To card UI | ✅ |
| **Editable transactions incl. settlements/transfers** (itemized excepted) | ✅ |
| **Reports** — interactive donut, 6-mo trend (donut-driven per-category), forecast | ✅ |
| **Month-end forecast** — run-rate blended w/ prior month, "needs N days" gate, clean line | ✅ |
| **Insights everywhere** — colored figures by meaning, plain English, per-surface toggles | ✅ |
| **Smart categories** (opt-in) — type a title → category auto-fills | ✅ |
| **Smart one-screen fast entry** (amount + title, you-paid/split-equally default) | ✅ |
| **"Can I afford this?"** (opt-in) — verdict vs spendable cash + save-to-goal | ✅ |
| **Tracking streak** (opt-in) — gentle daily-logging streak chip (in-app) | ✅ |
| **Dashboard Cash-available** card (liquid money after savings) | ✅ |
| **Avatars/photos** for user + friends, shown app-wide | ✅ |
| **Friends list** screen (balances, rename, photo, settle) + Groups-tab entry | ✅ |
| **Feature management** — section-level toggles (make the app simple↔complex) | ✅ |
| **Manage-members** icon in group header; collapsible budget-entry editor | ✅ |
| Settle/balance directional rows; History/Settings/Budget spacing & padding sweep | ✅ |

### Partially done / still open
| Feature | Status | Gap |
|---------|--------|-----|
| Onboarding | 🟡 | Welcome gate only; no full interactive tutorial |
| Transaction search/filter | 🟡 | Group/budget filters exist; no global txn search |
| Universal edit | 🟡 | Goal: **edit every txn except recurring templates.** Itemized edit is the last gap (planned). |

> **Notes:** Settlements **do** support partial payments — the record-payment
> sheet pre-fills the outstanding amount but it's editable (caps at outstanding). ✅
> Multi-currency is a deliberate deferral (INR-only, Decision D6), not in-progress —
> tracked under §3 / v2.0.2.

---

## 2. Gap Analysis vs. World-Class Apps <a name="gap-analysis"></a>

### Critical Missing Features (Every top app has these)

> **Legend:** ✅ Done · 🟡 Partial · 📋 Planned (in roadmap) · ❌ Not yet

| Feature | Splitwise | YNAB | Monarch | Tricount | BudgetSplit |
|---------|-----------|------|---------|----------|-------------|
| Receipt/photo attachments | ✅ Pro | — | ✅ | ✅ | ✅ Done |
| Savings goals | — | ✅ | ✅ | — | ✅ Done |
| Smart categorization (rule-based, on-device) | — | — | ✅ | — | ✅ Done (Smart categories) |
| AI-powered categorization | — | — | ✅ | — | ❌ Deferred (breaks offline promise, D2) |
| Transaction **filters** (group / budget status) | ✅ Pro | ✅ | ✅ | — | ✅ Done |
| Transaction **global search** (find any past txn) | ✅ Pro | ✅ | ✅ | — | 📋 Planned |
| Money position — cash-available + savings | — | ✅ | ✅ | — | ✅ Done |
| Net worth — assets/liabilities (FD/MF/property/loans) | — | ✅ | ✅ | — | ❌ Not started (v4.0) |
| Data **export** (CSV / PDF) | — | ✅ | ✅ | ✅ | ✅ Done |
| Data **import** (Splitwise / CSV / bank) | — | ✅ | ✅ | ✅ | ❌ Not started (v4.0) |
| Subscription **detection** | — | — | ✅ | — | 📋 Planned (N2) |
| Subscription **renewal reminders** | — | — | ✅ | — | 📋 Planned (N1, local notif) |
| Push notifications & reminders (engine) | ✅ | ✅ | ✅ | ✅ | 📋 Planned (needs dev build) |
| Multi-currency support | ✅ | ✅ | ✅ | ✅ | 🟡 Infra dormant, INR-only (D6) |
| Cloud sync / multi-device | ✅ | ✅ | ✅ | ✅ | ❌ Not started (v3.0) |
| Widgets (home screen) | ✅ | ✅ | ✅ | — | 📋 Planned (N3 — needs dev build) |
| Payment request links (UPI) | ✅ | — | — | ✅ | ❌ Not started (v3.0) |

### Differentiators BudgetSplit Could Own
| Opportunity | Why It Matters |
|-------------|----------------|
| India-first UPI/payments | No global app handles UPI well |
| Offline-first with eventual sync | Works in poor connectivity (India) |
| ₹ paise-level precision | Built-in, not an afterthought |
| Group budget health scoring | Unique — no competitor does this |
| Smart recommendations engine | Already built, can expand with ML |
| Zero-cost self-hosted | Privacy-first, no subscription |

---

## 3. Version 2.0 — Foundation & Polish <a name="v2"></a>

**Theme:** Complete the core, fix UX gaps, world-class polish
**Timeline:** 4-6 weeks

> Legend: ✅ done · 🟡 partial · 📋 planned · ❌ not started. Status is the **last
> column** of each table; half-built items are split into separate rows.

### 2.0.1 — Transaction Completeness
| Feature | Description | Priority | Status |
|---------|-------------|----------|--------|
| **Transfer transactions** | Money transfer UI between people (not counted as spend) | P0 | ✅ done |
| **Editable transactions** | Edit settlements/transfers/expense/income | P0 | ✅ done |
| **Partial settlements** | Record partial payments (editable amount, caps at outstanding) | P0 | ✅ done |
| **Transaction notes** | Free-text note on any transaction | P1 | ✅ done |
| **Split methods** | Split by %, shares, exact amounts | P0 | ✅ done |
| **Transaction filters** — group / budget status | Filter group list & budget categories | P0 | ✅ done |
| **Edit itemized bills** | Open an itemized txn back into the itemized editor (re-load items, no orphans) | P1 | 📋 planned (approved) |
| **Transaction filters** — date / amount / person range | Richer filtering across all txns | P1 | 📋 planned |
| **Transaction global search** | Full-text search across all txns | P1 | 📋 planned |
| **Duplicate detection** | Warn if similar amount + date + category within 24h | P2 | 📋 planned |
| **Bulk actions** | Multi-select → delete / re-categorize / move | P2 | 📋 planned |

### 2.0.2 — Multi-Currency Support  *(🟡 infra dormant — INR-only for now, Decision D6)*
| Feature | Description | Priority | Status |
|---------|-------------|----------|--------|
| **Currency per group** | Each group has a base currency (INR, USD, EUR, etc.) | P0 | 🟡 infra only |
| **Foreign expense entry** | Enter in foreign currency, auto-convert to group base | P0 | ❌ not started |
| **Exchange rate source** | Free API (exchangerate.host) + offline cache | P1 | ❌ not started |
| **Manual rate override** | Custom exchange rate per transaction | P1 | ❌ not started |
| **Multi-currency reports** | Spending in original + converted currencies | P2 | ❌ not started |

### 2.0.3 — Media & Attachments
| Feature | Description | Priority | Status |
|---------|-------------|----------|--------|
| **Receipt photos** | Attach a photo per transaction (camera or gallery) | P0 | ✅ done |
| **Photo viewer** | Full-screen pinch-zoom photo view | P1 | ✅ done |
| **Multi-photo (max 3)** | Up to 3 photos per transaction | P2 | 📋 planned |
| **Per-photo size limit** | Cap each attachment's file size (compress on import) | P2 | 📋 planned |
| **Storage management** | Total storage used + compress/delete old photos | P2 | 📋 planned |
| **PDF receipts** | Attach PDF documents (bills, invoices) | P2 | 📋 planned |

### 2.0.4 — UX Polish
| Feature | Description | Priority | Status |
|---------|-------------|----------|--------|
| **Interactive onboarding** | Welcome gate / intro tour | P0 | ✅ done |
| **Destructive confirmations** | Confirm delete txn / remove member / archive group | P0 | ✅ done |
| **Empty state improvements** | Contextual empty states with quick-action CTAs | P1 | ✅ done |
| **Skeleton loading** | Shimmer placeholders for list/chart views | P1 | ✅ done |
| **Keyboard avoidance** | Keyboard-aware scroll on all input screens | P1 | ✅ done |
| **Date picker** | Date-picker sheet | P2 | ✅ done |
| **Undo for deletes** | Toast with "Undo" (5s window) on delete actions | P0 | 📋 planned (approved) |
| **Onboarding — full tutorial** | Interactive walkthrough covering **all main features** (groups, add, split, budget, savings, settle) | P1 | 📋 planned (approved) |
| **Pull-to-refresh** | On all list screens | P1 | 📋 planned |
| **Amount input calculator** | Keypad with +/−/×/÷ | P2 | ❌ not started |

### 2.0.5 — Notifications & Reminders  *(📋 all need a custom dev build — expo-notifications, can't run in Expo Go)*
| Feature | Description | Priority | Status |
|---------|-------------|----------|--------|
| **Local notifications engine** | On-device scheduling foundation | P0 | 📋 planned |
| **Budget limit warnings** | 80% / 100% threshold alerts | P0 | 📋 planned |
| **Bill / renewal reminders** | "Rent due tomorrow" from recurring txns (N1) | P0 | 📋 planned |
| **Streak daily nudge** | "Log today to keep your streak" (in-app chip ✅; push 📋) | P1 | 🟡 in-app done |
| **Settlement nudges** | Weekly reminder if someone owes you > ₹500 | P1 | 📋 planned |
| **Daily spend digest** | Optional evening "You spent ₹X today" | P2 | 📋 planned |

### 2.0.6 — Recurring model & universal edit
> Direction: **everything is editable except recurring *templates*.** Recurring
> rules live in the Recurring Manager; occurrences become **real, editable
> transactions** the moment they're due — and each one points back to the rule
> that created it.

| Feature | Description | Priority | Status |
|---------|-------------|----------|--------|
| **Recurring occurrences = real txns** | At midnight (and on app-open catch-up) a due rule **materializes** an actual transaction, instead of being computed on the fly | P0 | 📋 planned |
| **Edit a materialized occurrence** | The created transaction is fully editable like any other (amount, split, note, date) | P0 | 📋 planned |
| **"Added by [recurring]" provenance** | Each occurrence shows which rule created it | P1 | 📋 planned |
| **Tap → jump to the rule** | Tapping the provenance opens the Recurring Manager and **highlights that exact rule** | P1 | 📋 planned |
| **Edit itemized bills** | Re-open itemized txns in the itemized editor (no orphaned line items) | P1 | 📋 planned (approved) |
| **Recurring templates stay edit-locked** | Only the *rule* is managed in the Recurring Manager (skip/pause/end/this-&-future) — already shipped | — | ✅ done |

> ⚠️ Architecture note: today occurrences are computed on the fly (`materializeInstances`)
> and **not** stored (see Decision D5). Making them real rows is a meaningful
> change — needs a dedup/catch-up job, a `parent_recur_id` link, and care that
> editing one occurrence never mutates the rule. Sequence after v2.0 polish.

---

## 4. Version 2.5 — Smart Money <a name="v25"></a>

**Theme:** Intelligent features that make users financially smarter
**Timeline:** 4-6 weeks after v2.0

> Legend: ✅ done · 🟡 partial · 📋 planned · ❌ not started.

### 2.5.1 — Savings Goals
| Feature | Description | Priority | Status |
|---------|-------------|----------|--------|
| **Goal creation** | Name, target, icon, color | P0 | ✅ done |
| **Goal tracking** | Progress bar, est. completion, required savings | P0 | ✅ done |
| **Goal contributions** | Add / withdraw money toward a goal | P0 | ✅ done |
| **Auto-allocation** | Fixed allocation per period to goals | P1 | ✅ done |
| **Opt-in budget sweep** | Move leftover budget into savings | P1 | ✅ done |
| **Goal target date** | Deadline + days-remaining | P1 | 🟡 est. completion only |
| **Goal celebration** | Confetti + haptic when reached | P1 | 📋 planned (approved) |
| **Goal sharing** | Share progress with group members | P2 | 📋 planned (needs sync, v3.0) |

### 2.5.2 — Subscription Tracker
| Feature | Description | Priority | Status |
|---------|-------------|----------|--------|
| **Recurring transactions** | Repeat schedules for expenses/income | P0 | ✅ done |
| **Auto-detect subscriptions** | Flag recurring same-amount txns (N2) | P0 | 📋 planned |
| **Subscription dashboard** | All active subs + monthly/yearly total | P0 | 📋 planned |
| **Renewal calendar** | Upcoming renewal dates | P1 | 📋 planned |
| **Cancel/renewal reminder** | Alert X days before renewal (N1, local notif) | P1 | 📋 planned |
| **Cost optimization** | "₹12,000/yr on subs — 3 unused this month" | P2 | 📋 planned |

### 2.5.3 — Advanced Analytics
| Feature | Description | Priority | Status |
|---------|-------------|----------|--------|
| **Spending velocity / pace** | Spending too fast/slow vs budget | P0 | ✅ done (forecast) |
| **Category trends** | Multi-month trend per category (donut-driven) | P0 | ✅ done |
| **Savings rate** | Income vs expense ratio + trend | P0 | ✅ done |
| **Cash-flow forecast** | Project month-end from run-rate + prior month | P1 | ✅ done |
| **Year-in-review** | Annual summary card | P1 | ✅ done |
| **Cash-flow forecast — 60/90-day** | Deeper multi-month projection (gated by streak) | P1 | 📋 planned (N4/2.5.7) |
| **Financial health score** | Composite 0–100 (adherence, savings, debt) | P1 | 📋 planned |
| **What-if simulator** | "Cut dining 20% → save ₹X/mo" | P2 | 📋 planned |
| **Peer comparison** | Anonymous benchmarks | P2 | ❌ not started |

### 2.5.4 — Smart Categorization
| Feature | Description | Priority | Status |
|---------|-------------|----------|--------|
| **Auto-suggest category** | Title → category (rule-based, on-device) | P1 | ✅ done (Smart categories) |
| **Learn from corrections** | Adapt when user re-categorizes | P1 | ❌ not started |
| **Category rules** | "₹100–200 at 8–9am → Breakfast" | P2 | ❌ not started |
| **Split suggestions** | Remember frequent split patterns per group | P1 | ❌ not started |

### 2.5.5 — Debt Management
| Feature | Description | Priority | Status |
|---------|-------------|----------|--------|
| **EMI/loan category + budget** | Track EMIs as a budgeted category | P0 | ✅ done (category) |
| **Debt tracker** | Loans given/taken outside bill splits | P0 | ❌ not started |
| **Interest calculator** | Simple/compound interest over time | P1 | ❌ not started |
| **Payment schedule** | EMI-style scheduled payments + reminders | P1 | ❌ not started |
| **Payoff planner** | Snowball vs avalanche strategies | P2 | ❌ not started |

### 2.5.6 — Smart "Can I afford this?" engine *(evolve the v1 checker)*
| Feature | Description | Priority | Status |
|---------|-------------|----------|--------|
| **Basic verdict vs cash** | Yes/tight/no against spendable cash + save-to-goal | P1 | ✅ done (v1) |
| **Pattern-aware verdict** | Factor projected month-end pace, upcoming recurring/bills, avg category spend | P1 | 📋 planned |
| **Insight engine** | Small on-device engine over own history (run-rate, recurring load, mix) — no cloud/AI | P1 | 📋 planned |

### 2.5.7 — Data-gated unlocks (retention loop)
| Feature | Description | Priority | Status |
|---------|-------------|----------|--------|
| **Tracking streak (in-app)** | Gentle daily-logging streak chip | P1 | ✅ done |
| **Streak-gated analysis** | Deeper forecasting / 2-month / pattern search unlocks after N continuous days (e.g. 30) — quality gate + reason to return | P1 | 📋 planned |
| **Honest gating copy** | "3 more days unlocks 2-month forecasting" — reflects real data sufficiency | P1 | 📋 planned |
| **Unlock progress** | Show distance to next unlock on the streak chip | P2 | 📋 planned |

---

## 5. Version 3.0 — Social & Sync <a name="v3"></a>

**Theme:** Multi-user real-time collaboration
**Timeline:** 8-10 weeks after v2.5

### 3.0.1 — Cloud Sync Infrastructure
| Feature | Description | Priority |
|---------|-------------|----------|
| **User accounts** | Email/phone sign-up with OTP verification | P0 |
| **Conflict-free sync** | CRDT-based or last-writer-wins with conflict UI | P0 |
| **Offline-first guarantee** | Full functionality offline, sync when connected | P0 |
| **Selective sync** | Choose which groups to sync (keep some purely local) | P1 |
| **Sync status indicator** | Show last sync time, pending changes count | P1 |
| **Data encryption** | E2E encryption for financial data in transit + at rest | P0 |
| **Multi-device** | Same account on phone + tablet + web | P1 |

### 3.0.2 — Real-Time Collaboration
| Feature | Description | Priority |
|---------|-------------|----------|
| **Invite members** | Share link / QR code to join group | P0 |
| **Live updates** | See other members' additions in real-time | P0 |
| **Activity feed** | "Prem added ₹500 Dinner" in group timeline | P0 |
| **Member roles** | Admin (full control) vs Member (add/edit own) vs Viewer | P1 |
| **Expense approval** | Optional: admin approves expenses before they count | P2 |
| **Comments on transactions** | Thread-style comments on any expense | P1 |
| **@mentions** | Tag specific people in comments | P2 |

### 3.0.3 — Payment Integration
| Feature | Description | Priority |
|---------|-------------|----------|
| **UPI deep links** | "Pay ₹500 to Prem" → opens Google Pay/PhonePe/Paytm | P0 |
| **Payment confirmation** | Mark debt as settled with UPI transaction ID | P0 |
| **Payment request** | Send payment request via WhatsApp/SMS with deep link | P1 |
| **Split via UPI** | Generate UPI collect request to group members | P2 |
| **Auto-reconcile** | Match incoming UPI payments to outstanding debts | P2 |

### 3.0.4 — Social Features
| Feature | Description | Priority |
|---------|-------------|----------|
| **Expense reactions** | 😱💸👍 react to expenses | P2 |
| **Group chat** | Basic messaging within a group (optional) | P2 |
| **Shared lists** | Shopping lists / wishlists tied to a group | P2 |
| **Bill photo sharing** | Share receipt photo with all group members | P1 |
| **Settlement celebration** | Animation when all debts in group are cleared | P1 |

---

## 6. Version 3.5 — Intelligence Layer <a name="v35"></a>

**Theme:** AI/ML-powered personal finance assistant
**Timeline:** 6-8 weeks after v3.0

### 3.5.1 — AI Assistant
| Feature | Description | Priority |
|---------|-------------|----------|
| **Natural language entry** | "Split ₹2000 dinner with Rahul and Priya equally" | P0 |
| **Voice expense** | Speak to add expense (speech-to-text → parse → create) | P1 |
| **Smart insights** | Weekly AI-generated summary: "Your dining spending is up 30%..." | P0 |
| **Anomaly detection** | Flag unusual transactions: "₹15,000 at Electronics — is this correct?" | P1 |
| **Budget suggestions** | AI suggests budget amounts based on spending history | P1 |
| **Receipt OCR** | Scan receipt photo → extract merchant, items, amounts | P0 |
| **Bill scanner** | Photograph restaurant bill → auto-itemize for splitting | P0 |

### 3.5.2 — Predictive Features
| Feature | Description | Priority |
|---------|-------------|----------|
| **Spend prediction** | "At this pace, you'll exceed Dining budget by ₹2,000" | P0 |
| **Bill prediction** | Predict upcoming bills based on history | P1 |
| **Savings opportunity** | "Switch from daily ₹200 Swiggy to weekly meal prep: save ₹4,000/mo" | P2 |
| **Seasonal awareness** | Adjust budgets for festivals (Diwali), seasons, events | P2 |

### 3.5.3 — Automation
| Feature | Description | Priority |
|---------|-------------|----------|
| **Auto-split rules** | "All expenses at home → split 50-50 with partner" | P0 |
| **Geo-fencing** | Auto-suggest category when at known locations | P1 |
| **Scheduled reports** | Email weekly/monthly PDF report automatically | P1 |
| **Smart reminders** | Context-aware: "You usually buy groceries on Sunday" | P2 |
| **IFTTT/Shortcuts integration** | iOS Shortcuts: "Log ₹50 chai" from Siri | P1 |

---

## 7. Version 4.0 — Financial Ecosystem <a name="v4"></a>

**Theme:** Complete personal finance platform
**Timeline:** 10-12 weeks after v3.5

### 4.0.1 — Net Worth Tracking
| Feature | Description | Priority |
|---------|-------------|----------|
| **Asset tracking** | Bank accounts, FDs, mutual funds, stocks, property, gold | P0 |
| **Liability tracking** | Credit cards, loans, EMIs | P0 |
| **Net worth dashboard** | Single number + trend chart + breakdown pie | P0 |
| **Manual + linked** | Manual entry for most, API for mutual funds (optional) | P1 |
| **Net worth milestones** | Celebrate crossing ₹1L, ₹5L, ₹10L, etc. | P2 |

### 4.0.2 — Investment Snapshot
| Feature | Description | Priority |
|---------|-------------|----------|
| **Portfolio overview** | Show MF + stocks with current value + returns | P1 |
| **SIP tracker** | Track monthly SIP amounts and growth | P1 |
| **Goal-linked investments** | "₹2L of your MF is allocated to Vacation goal" | P2 |
| **Tax-saving tracker** | 80C, 80D deductions used vs limit | P1 |

### 4.0.3 — Bills & Commitments
| Feature | Description | Priority |
|---------|-------------|----------|
| **Bill calendar** | Visual calendar of all upcoming payments | P0 |
| **EMI tracker** | Track all EMIs with remaining tenure + total paid | P0 |
| **Prepayment calculator** | "Pay ₹50K extra → save ₹2L interest, 18 months less" | P1 |
| **Credit card tracker** | Due dates, minimum due, total outstanding per card | P1 |
| **Warranty tracker** | Track product warranties with expiry alerts | P2 |

### 4.0.4 — Tax & Compliance (India-Specific)
| Feature | Description | Priority |
|---------|-------------|----------|
| **Section-wise deduction tracker** | 80C/80D/HRA/LTA usage | P1 |
| **Tax estimate** | Rough annual tax liability based on income + deductions | P2 |
| **Form 16 helper** | Pre-fill data for tax filing | P2 |
| **GST on expenses** | Track GST paid on business expenses | P2 |

### 4.0.5 — Data Portability
| Feature | Description | Priority |
|---------|-------------|----------|
| **Splitwise import** | Import full history from Splitwise CSV/API | P0 |
| **Bank statement import** | Parse PDF/CSV bank statements → transactions | P0 |
| **YNAB/Monarch import** | Import from other budget apps | P2 |
| **Full data export** | Complete JSON/CSV export of all data | P0 |
| **Backup to iCloud/Google Drive** | Encrypted automatic backups | P1 |

---

## 8. Version 5.0 — Platform & Scale <a name="v5"></a>

**Theme:** Platform play — extensibility, API, web, wearables
**Timeline:** 12-16 weeks after v4.0

### 5.0.1 — Multi-Platform
| Feature | Description | Priority |
|---------|-------------|----------|
| **Web app** | Full-featured responsive web interface | P0 |
| **iPad optimization** | Multi-column layout, keyboard shortcuts | P1 |
| **Apple Watch** | Quick expense entry + today's spend glance | P1 |
| **Home screen widgets** | Today's budget, group balances, goal progress | P0 |
| **Lock screen widgets** | Quick daily spend counter | P1 |
| **Live Activities** | Show trip spending on Dynamic Island | P2 |

### 5.0.2 — Extensibility
| Feature | Description | Priority |
|---------|-------------|----------|
| **Plugin system** | Community-built category packs, report templates | P2 |
| **API access** | REST API for personal automation | P1 |
| **Webhook support** | Notify external services on events | P2 |
| **Zapier/Make integration** | Connect to 1000+ services | P2 |
| **Custom reports builder** | Drag-and-drop report creator | P2 |

### 5.0.3 — Advanced Sharing
| Feature | Description | Priority |
|---------|-------------|----------|
| **Family plan** | Up to 6 family members, shared + personal budgets | P0 |
| **Business mode** | Separate business expenses, generate invoices | P1 |
| **Accountant access** | Read-only link for CA/tax consultant | P2 |
| **Shared goals** | Family saving together for vacation/house | P1 |
| **Allowance management** | Parent sets child's budget, gets notifications | P2 |

### 5.0.4 — Gamification & Engagement
| Feature | Description | Priority |
|---------|-------------|----------|
| **Streaks** | "30-day tracking streak" with visual flame | ✅ v1 shipped (in-app chip; push reminder still v2) |
| **Achievements** | Badges: "First ₹10K saved", "Zero debt month" | P1 |
| **Monthly challenges** | "No-spend weekend", "₹500 dining budget this week" | P2 |
| **Leaderboard** | Optional: rank savings rate among friends | P2 |
| **Financial tips** | Daily bite-sized money tips (contextual) | P1 |

### 5.0.5 — Enterprise/Team Features
| Feature | Description | Priority |
|---------|-------------|----------|
| **Team expenses** | Office team expense tracking with approvals | P2 |
| **Reimbursement flow** | Submit → approve → reimburse workflow | P2 |
| **Corporate card tracking** | Assign cards, track spending, set per-person limits | P2 |
| **Expense policies** | Auto-flag violations: "Dinner > ₹1500 needs approval" | P2 |

---

## 9. Priority Matrix <a name="priority-matrix"></a>

### Impact vs Effort Quadrant

```
HIGH IMPACT
    │
    │  ┌─────────────────────┐  ┌─────────────────────┐
    │  │ QUICK WINS (v2.0)   │  │ BIG BETS (v3.0+)   │
    │  │                     │  │                     │
    │  │ • Transaction search │  │ • Cloud sync        │
    │  │ • Multi-currency    │  │ • AI receipt scan   │
    │  │ • Receipt photos    │  │ • UPI integration   │
    │  │ • Notifications     │  │ • Voice entry       │
    │  │ • Transfer txn UI   │  │ • Web app           │
    │  │ • Partial settle    │  │ • Family plan       │
    │  └─────────────────────┘  └─────────────────────┘
    │
    │  ┌─────────────────────┐  ┌─────────────────────┐
    │  │ FILL-INS (v2.5)    │  │ FUTURE (v4-5)       │
    │  │                     │  │                     │
    │  │ • Savings goals     │  │ • Net worth         │
    │  │ • Subscription track│  │ • Investment dash   │
    │  │ • Spending velocity │  │ • Tax tracker       │
    │  │ • Debt tracker      │  │ • Plugin system     │
    │  │ • Year-in-review    │  │ • Business mode     │
    │  └─────────────────────┘  └─────────────────────┘
    │
    └─────────────────────────────────────────────────── EFFORT →
  LOW EFFORT                                    HIGH EFFORT
```

### Release Cadence Recommendation
| Version | Focus | Est. Scope |
|---------|-------|-----------|
| v2.0 | Core completeness + UX polish | ~40 features |
| v2.5 | Smart money features | ~25 features |
| v3.0 | Social & sync (major) | ~30 features |
| v3.5 | AI & intelligence | ~20 features |
| v4.0 | Financial ecosystem | ~25 features |
| v5.0 | Platform & scale | ~25 features |

---

## 10. Known Issues & Fixes Required <a name="known-issues"></a>

### Critical Bugs / UX Issues to Fix in v2.0

> Legend: ✅ fixed · 🟡 partial · 📋 planned · ❌ open. Status is the last column.

| # | Issue | Severity | Category | Status |
|---|-------|----------|----------|--------|
| 1 | **Transfer txn UI** — needed a proper flow | High | Feature Gap | ✅ fixed |
| 5 | **Destructive action confirmations** — single-tap delete | High | UX Safety | ✅ fixed |
| 6 | **Budget cadence picker** — cycling instead of a picker | Medium | UX | ✅ fixed (sheet) |
| 7 | **Date picker** — no easy past-date pick | Medium | UX | ✅ fixed (sheet) |
| 8 | **Transaction notes** — no context on expenses | Medium | Feature Gap | ✅ fixed |
| 14 | **Receipt capture** — no proof of payment | Medium | Feature Gap | ✅ fixed |
| 9 | **Onboarding too basic** — doesn't explain concepts | Medium | UX | 🟡 gate done; interactive tutorial open |
| 2 | **Partial settlements** — can only settle full debt | High | Feature Gap | ❌ open |
| 3 | **Transaction search** — can't find old expenses | High | UX | 📋 planned |
| 4 | **Undo for deletes** — accidental delete is permanent | High | UX | ❌ open |
| 10 | **Data backup** — phone loss = all data lost | Critical | Data Safety | ❌ open (export exists; auto-backup 📋) |
| 11 | **Multi-currency** — unusable for international trips | High | Feature Gap | 🟡 infra dormant (D6) |
| 12 | **Single-device only** — no access elsewhere | High | Architecture | ❌ open (v3.0) |
| 13 | **Push notifications** — miss budget warnings | Medium | Engagement | 📋 planned (needs dev build) |
| 15 | **Widgets** — must open app to check budget | Low | Convenience | 📋 planned (N3) |

> Also fixed this cycle (not in the original list): income-leak in balances,
> donut wedge deselect, settlement direction + sign-coloring, settings/budget
> padding, insight number coloring, forecast chart readability.

### Architecture Concerns
| # | Issue | Impact |
|---|-------|--------|
| 1 | **No backup/export of SQLite DB** — single point of failure | Data loss risk |
| 2 | **No migration strategy documented** — schema changes may break | Upgrade risk |
| 3 | **Analytics computed on-demand** — may lag on large datasets | Performance |
| 4 | **No error boundary** — crash = lost input | UX |
| 5 | **Store minimal** — most logic in DB queries, good but needs cache invalidation | Stale data risk |

### Design System Gaps
| # | Issue | Fix |
|---|-------|-----|
| 1 | Light mode not supported | Add light theme tokens |
| 2 | No accessibility audit | VoiceOver labels, contrast ratios |
| 3 | No RTL support | Mirror layouts for Arabic/Hebrew |
| 4 | Font scaling not tested | Dynamic Type support |

---

## Appendix A: Competitive Feature Matrix (Detailed)

| Feature | Splitwise | YNAB | Monarch | Tricount | Copilot | **BudgetSplit (Target)** |
|---------|-----------|------|---------|----------|---------|--------------------------|
| Group expense splitting | ✅ | — | — | ✅ | — | ✅ |
| Budget management | — | ✅ | ✅ | — | ✅ | ✅ |
| Itemized bill splitting | ✅ Pro | — | — | — | — | ✅ |
| Debt simplification | ✅ | — | — | ✅ | — | ✅ |
| Budget health scoring | — | — | — | — | — | ✅ ★ |
| Smart recommendations | — | — | ✅ | — | ✅ | ✅ ★ |
| Multi-currency | ✅ | ✅ | ✅ | ✅ | ✅ | v2.0 |
| Receipt OCR | ✅ Pro | — | ✅ | — | — | v3.5 |
| Cloud sync | ✅ | ✅ | ✅ | ✅ | ✅ | v3.0 |
| Bank connection | — | ✅ | ✅ | — | ✅ | v4.0 |
| Net worth tracking | — | ✅ | ✅ | — | ✅ | v4.0 |
| AI assistant | — | — | ✅ | — | ✅ | v3.5 |
| Payment links (UPI) | — | — | — | — | — | v3.0 ★ |
| Savings goals | — | ✅ | ✅ | — | ✅ | v2.5 |
| Subscription tracker | — | — | ✅ | — | ✅ | v2.5 |
| Offline-first | ✅ | — | — | ✅ | — | ✅ ★ |
| ₹0 cost / self-hosted | — | — | — | — | — | ✅ ★ |
| India tax integration | — | — | — | — | — | v4.0 ★ |
| Family budget sharing | — | ✅ | ✅ | — | — | v5.0 |
| Apple Watch | — | ✅ | — | — | ✅ | v5.0 |
| Widgets | ✅ | ✅ | ✅ | — | ✅ | v2.0 |

★ = Unique differentiator

---

## Appendix B: India-Specific Features (Unique Moat)

These features are poorly served by global apps and represent BudgetSplit's competitive advantage:

| Feature | Description | Version |
|---------|-------------|---------|
| **UPI payment integration** | Deep link to GPay/PhonePe/Paytm for settlements | v3.0 |
| **₹ paise-level accounting** | Already built — all amounts in paise | ✅ |
| **Indian category defaults** | Rent, Maintenance, Maid, Driver, Groceries (Indian context) | ✅ |
| **Festival budgeting** | Diwali, Holi, Eid special budget templates | v3.5 |
| **Gold/FD tracking** | Common Indian investments not in global apps | v4.0 |
| **Section 80C/80D tracker** | Tax-saving investment tracking | v4.0 |
| **Hindi/regional language** | UI localization for Hindi, Tamil, etc. | v5.0 |
| **Indian bank statement parsing** | Support HDFC, SBI, ICICI, Kotak PDF formats | v4.0 |
| **Split with household help** | Maid/cook/driver salary tracking & sharing | v2.5 |
| **EMI/loan tracker** | Track home loan, car loan, personal loan EMIs | v4.0 |
| **Chit fund tracker** | Common informal savings mechanism in India | v4.0 |

---

## Appendix C: Monetization Strategy (If Applicable)

| Tier | Price | Features |
|------|-------|----------|
| **Free** | ₹0 | Full offline app, unlimited groups, basic analytics |
| **Pro** | ₹149/mo | Cloud sync, receipt OCR, AI insights, multi-device |
| **Family** | ₹249/mo | Up to 6 members, shared goals, family dashboard |

> Note: Current strategy is ₹0 personal use via AltStore. Monetization is optional future path.

---

## Appendix D: Technical Architecture for Key Features

### Cloud Sync Architecture (v3.0)
```
┌──────────┐     ┌─────────────┐     ┌──────────┐
│  Device  │────▶│   Sync API  │◀────│  Device  │
│  SQLite  │     │  (Supabase/ │     │  SQLite  │
│  + CRDT  │◀────│  Firebase)  │────▶│  + CRDT  │
└──────────┘     └─────────────┘     └──────────┘
       │                                     │
       ▼                                     ▼
  Offline Queue                         Offline Queue
  (write-ahead)                         (write-ahead)
```

### AI Pipeline (v3.5)
```
┌─────────┐     ┌──────────┐     ┌──────────────┐
│ Receipt │────▶│   OCR    │────▶│ Parse Items  │
│  Photo  │     │ (Vision) │     │ + Amounts    │
└─────────┘     └──────────┘     └──────────────┘
                                        │
                                        ▼
┌─────────┐     ┌──────────┐     ┌──────────────┐
│  Voice  │────▶│  Speech  │────▶│ NLP Parse    │
│  Input  │     │  to Text │     │ → Txn Object │
└─────────┘     └──────────┘     └──────────────┘
```

### Widget Architecture (v2.0)
```
App Group (shared container)
├── Main App → writes summary JSON
├── Widget Extension → reads JSON, renders SwiftUI
└── Shared:
    ├── today_spend.json
    ├── budget_health.json
    └── group_balances.json
```

---

*This document is a living spec. Features will be reprioritized based on user feedback and technical feasibility.*
