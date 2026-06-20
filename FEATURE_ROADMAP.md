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
| Settlement recording | 🟡 | No partial payments yet |
| Onboarding | 🟡 | Basic; no interactive tutorial |
| Transaction search/filter | 🟡 | Groups/budget filters exist; no global txn search |
| Multi-currency | 🟡 | Infra dormant, INR-only (Decision D6) |

---

## 2. Gap Analysis vs. World-Class Apps <a name="gap-analysis"></a>

### Critical Missing Features (Every top app has these)
| Feature | Splitwise | YNAB | Monarch | Tricount | BudgetSplit |
|---------|-----------|------|---------|----------|-------------|
| Multi-currency support | ✅ | ✅ | ✅ | ✅ | ❌ |
| Receipt/photo attachments | ✅ Pro | — | ✅ | ✅ | ❌ |
| Cloud sync / multi-device | ✅ | ✅ | ✅ | ✅ | ❌ |
| Push notifications & reminders | ✅ | ✅ | ✅ | ✅ | ❌ |
| Search & filter transactions | ✅ Pro | ✅ | ✅ | — | ❌ |
| Net worth tracking | — | ✅ | ✅ | — | ❌ |
| Savings goals | — | ✅ | ✅ | — | ❌ |
| Widgets (home screen) | ✅ | ✅ | ✅ | — | ❌ |
| Payment request links | ✅ | — | — | ✅ | ❌ |
| AI-powered categorization | — | — | ✅ | — | ❌ |
| Subscription tracking | — | — | ✅ | — | ❌ |
| Data import (Splitwise/CSV) | — | ✅ | ✅ | ✅ | ❌ |

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

> **✅ Shipped from this version already:** Transfer txn UI · transaction notes ·
> split methods (%/shares/exact) · receipt photos + full-screen viewer ·
> interactive onboarding · destructive confirmations · empty-state CTAs ·
> skeleton loading · keyboard avoidance · date-picker sheet · smart categories.
> **Still open:** partial settlements · transaction search/filter · bulk actions ·
> duplicate detection · multi-currency · local notifications (needs dev build) ·
> undo/redo · home-screen widgets.

### 2.0.1 — Transaction Completeness
| Feature | Description | Priority |
|---------|-------------|----------|
| **Transfer transactions** | Complete UI for money transfers between people (not counted as spend) | P0 |
| **Partial settlements** | Record partial payments against debts (₹500 of ₹2000 owed) | P0 |
| **Transaction search** | Full-text search across all txns (description, amount, category, person) | P0 |
| **Transaction filters** | Filter by: date range, amount range, category, person, group, type | P0 |
| **Bulk actions** | Multi-select → bulk delete, bulk re-categorize, bulk move to group | P1 |
| **Duplicate detection** | Warn if similar amount + date + category exists within 24h | P1 |
| **Transaction notes** | Free-text notes field on any transaction | P1 |
| **Split methods** | Add: split by percentages, split by shares, split by exact amounts | P0 |

### 2.0.2 — Multi-Currency Support
| Feature | Description | Priority |
|---------|-------------|----------|
| **Currency per group** | Each group has a base currency (INR, USD, EUR, etc.) | P0 |
| **Foreign expense entry** | Enter amount in foreign currency, auto-convert to group base | P0 |
| **Exchange rate source** | Fetch rates from free API (exchangerate.host) with offline cache | P1 |
| **Manual rate override** | User can set custom exchange rate per transaction | P1 |
| **Multi-currency reports** | Show spending in original + converted currencies | P2 |

### 2.0.3 — Media & Attachments
| Feature | Description | Priority |
|---------|-------------|----------|
| **Receipt photos** | Attach 1-3 photos per transaction (camera or gallery) | P0 |
| **Photo viewer** | Full-screen pinch-zoom photo view | P1 |
| **Storage management** | Show total storage used, option to compress/delete old photos | P2 |
| **PDF receipts** | Attach PDF documents (bills, invoices) | P2 |

### 2.0.4 — UX Polish
| Feature | Description | Priority |
|---------|-------------|----------|
| **Interactive onboarding** | 3-step tutorial: create group → add expense → see balance | P0 |
| **Undo/redo** | Toast with "Undo" button for delete actions (5s window) | P0 |
| **Destructive confirmations** | Bottom sheet confirm for: delete txn, remove member, archive group | P0 |
| **Empty state improvements** | Contextual empty states with quick-action CTAs | P1 |
| **Skeleton loading** | Shimmer placeholders for all list/chart views | P1 |
| **Pull-to-refresh** | On all list screens | P1 |
| **Keyboard avoidance** | Proper keyboard-aware scroll on all input screens | P1 |
| **Date picker upgrade** | Calendar view with marked expense days | P2 |
| **Amount input** | Calculator-style keypad with +/−/×/÷ | P2 |

### 2.0.5 — Notifications & Reminders
| Feature | Description | Priority |
|---------|-------------|----------|
| **Local notifications** | Budget limit warnings (80%, 100% thresholds) | P0 |
| **Bill reminders** | "Rent due tomorrow" based on recurring txns | P0 |
| **Settlement nudges** | Weekly reminder if someone owes you > ₹500 | P1 |
| **Daily spend digest** | Optional evening notification: "You spent ₹X today" | P2 |

---

## 4. Version 2.5 — Smart Money <a name="v25"></a>

**Theme:** Intelligent features that make users financially smarter
**Timeline:** 4-6 weeks after v2.0

> **✅ Shipped already:** full Savings Goals module (create/track/contribute,
> auto-allocation, opt-in sweep) · spending velocity/pace (forecast) · category
> trends (6-mo, donut-driven) · savings rate · cash-flow forecast (30-day pace) ·
> year-in-review · smart categorization (title→category) · EMI/loan + household-help
> categories · **"Can I afford this?"** v1 · gentle **tracking streak**.
> **Still open / next:** subscription auto-detect + renewal reminders (N1/N2),
> financial-health score, what-if simulator, debt tracker, learn-from-corrections.

### 2.5.6 — Smart "Can I afford this?" engine *(evolve the v1 checker)*
| Feature | Description | Priority |
|---------|-------------|----------|
| **Pattern-aware verdict** | Move beyond current cash → factor projected month-end pace, upcoming recurring/bills, and average category spend before saying yes/tight/no | P1 |
| **Insight-driven** | A small on-device engine over the user's own history (run-rate, recurring load, category mix) — no cloud, no AI service | P1 |
| **Save-instead nudge** | If "tight/no", one-tap create or top up a goal for the item | P1 |

### 2.5.7 — Data-gated unlocks (retention loop)
| Feature | Description | Priority |
|---------|-------------|----------|
| **Tracking-streak unlocks** | Advanced analysis (deeper forecasting, weekly/2-month projections, pattern search) "unlocks" after N continuous days of tracking (e.g. 30) — both a quality gate (enough data to be accurate) and a reason to come back | P1 |
| **Honest gating copy** | "3 more days of tracking unlocks 2-month forecasting" — never fake; the gate reflects real data sufficiency | P1 |
| **Progress visibility** | Show how close they are to the next unlock on the dashboard/streak chip | P2 |

### 2.5.1 — Savings Goals
| Feature | Description | Priority |
|---------|-------------|----------|
| **Goal creation** | Name, target amount, target date, icon, color | P0 |
| **Goal tracking** | Progress bar, days remaining, required daily/monthly savings | P0 |
| **Goal contributions** | Manually add money toward a goal | P0 |
| **Auto-allocation** | Set % of income to auto-allocate to goals | P1 |
| **Goal categories** | Emergency fund, vacation, gadget, wedding, education | P1 |
| **Goal sharing** | Share goal progress with group members | P2 |
| **Goal celebration** | Confetti + haptic when goal reached | P1 |

### 2.5.2 — Subscription Tracker
| Feature | Description | Priority |
|---------|-------------|----------|
| **Auto-detect subscriptions** | Flag recurring same-amount transactions as subscriptions | P0 |
| **Subscription dashboard** | List all active subs with monthly/yearly total | P0 |
| **Renewal calendar** | Show upcoming renewal dates | P1 |
| **Cancel reminder** | Set reminder X days before free trial/renewal | P1 |
| **Cost optimization** | "You pay ₹12,000/yr on subscriptions — 3 unused this month" | P2 |

### 2.5.3 — Advanced Analytics
| Feature | Description | Priority |
|---------|-------------|----------|
| **Spending velocity** | "Pace" indicator — spending too fast/slow vs. budget | P0 |
| **Category trends** | 3/6/12 month trend lines per category | P0 |
| **Peer comparison** | "You spend X% more on dining than avg" (anonymous benchmarks) | P2 |
| **Savings rate** | Income vs expenses ratio with monthly trend | P0 |
| **Financial health score** | Composite score (0-100) based on budget adherence, savings rate, debt | P1 |
| **Cash flow forecast** | Project next 30/60/90 days based on recurring + averages | P1 |
| **What-if simulator** | "If I cut dining by 20%, I save ₹X/month" | P2 |
| **Year-in-review** | Annual summary card: total earned, spent, saved, top categories | P1 |

### 2.5.4 — Smart Categorization
| Feature | Description | Priority |
|---------|-------------|----------|
| **Auto-suggest category** | Based on amount patterns + time of day + location | P1 |
| **Learn from corrections** | When user re-categorizes, learn for future | P1 |
| **Category rules** | "Amounts ₹100-200 at 8-9am → Breakfast" | P2 |
| **Split suggestions** | Remember frequent split patterns per group | P1 |

### 2.5.5 — Debt Management
| Feature | Description | Priority |
|---------|-------------|----------|
| **Debt tracker** | Track loans given/taken outside of bill splits | P0 |
| **Interest calculator** | Simple/compound interest on debts over time | P1 |
| **Payoff planner** | Snowball vs avalanche debt payoff strategies | P2 |
| **Payment schedule** | EMI-style scheduled payments with reminders | P1 |

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

> **✅ Resolved since this list was written:** #1 transfer UI · #5 destructive
> confirmations · #6 budget cadence picker (now a sheet) · #7 date picker (sheet) ·
> #8 transaction notes · #9 onboarding (interactive gate) · #14 receipt capture.
> Also fixed: income-leak in balances, donut deselect, settlement direction.
> **Still open:** #2 partial settlements · #3 search · #4 undo · #10 backup ·
> #11 multi-currency · #12 multi-device · #13 notifications · #15 widgets.

| # | Issue | Severity | Category |
|---|-------|----------|----------|
| 1 | **Transfer txn UI incomplete** — schema supports it but no proper flow | High | Feature Gap |
| 2 | **No partial settlements** — can only settle full debt | High | Feature Gap |
| 3 | **No transaction search** — impossible to find old expenses | High | UX |
| 4 | **No undo for deletes** — accidental delete is permanent | High | UX |
| 5 | **No destructive action confirmations** — can delete txn with single tap | High | UX Safety |
| 6 | **Budget cadence picker UX** — needs dropdown instead of cycling | Medium | UX |
| 7 | **Date picker limitations** — no calendar view, hard to pick past dates | Medium | UX |
| 8 | **No transaction notes** — can't add context to expenses | Medium | Feature Gap |
| 9 | **Onboarding is too basic** — doesn't explain key concepts | Medium | UX |
| 10 | **No data backup** — phone loss = all data lost | Critical | Data Safety |
| 11 | **No multi-currency** — unusable for international trips | High | Feature Gap |
| 12 | **Single-device only** — no way to access data elsewhere | High | Architecture |
| 13 | **No push notifications** — miss budget warnings | Medium | Engagement |
| 14 | **No receipt capture** — can't attach proof of payment | Medium | Feature Gap |
| 15 | **No widgets** — must open app to check budget | Low | Convenience |

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
