# BudgetSplit — Revised Architecture (Opus 4.8 Analysis)

**Date:** 2026-06-22
**Author:** Architecture review (Claude Opus 4.8)
**Status:** Proposal — supersedes scattered structure in Spec v3.0
**Verdict:** The product is salvageable and good. The *scope* and *sequencing* are wrong. Fix those two things and everything stops feeling random.

---

## 0a. Confirmed intent: this is a feel-the-product prototype; the real backend comes later

The owner has confirmed: **this local build is a testing version to "feel like a user," and a proper backend (sync, accounts) is the eventual destination (v2).** That changes nothing in the cuts below — it *reinforces* them:

- **Don't over-invest in local-only machinery the backend will replace.** Local settlement audit trails, conflict-free local recurrence, carry-over math, and global cross-group netting are all things the backend will own later. Building them perfectly in the throwaway prototype is wasted work *twice* (build now, rebuild on backend).
- **The prototype's job is to answer "does this feel right to use?"** — flows, screens, the share-vs-paid mental model, the split UX. Optimize for *learning*, not for completeness.
- **Keep the schema backend-shaped.** The Spec §3 tables already map cleanly to Postgres/Supabase. Keep UUID PKs, `updated_at`, soft-delete, and the `remote_uid` column — they're your migration bridge. (Already true in the spec; just don't remove them.)
- **So: v2 = "DEFER," not "kill."** Everything I move to v2 below is on the confirmed roadmap, just sequenced after you've felt the prototype.

---

## 0. TL;DR (read this if nothing else)

1. **You have an identity crisis.** The spec targets *solo personal use* but spends 60% of its engineering on *multi-person bill splitting*. Pick a lane for v1.
2. **The lane to pick: "Me & a few people" (1–4 humans, all on YOUR phone, no accounts).** This keeps splitting (the thing that makes the app special) but kills the parts that don't pay rent: debt-simplification optimization, global cross-group netting, recurring lazy-materialization, carry-over math.
3. **Cut v1 from 10 milestones to 5.** Ship in ~8 weeks instead of ~6 months.
4. **Fix the hidden blocker first:** you have no iOS environment, and `expo-sqlite` doesn't run in Expo Go. You cannot test the core of this app until Xcode + a dev build exist. That is M0, and it's not in the current plan.
5. **Collapse two confusing forks:** Dashboard-vs-Groups (redundant) and Quick-vs-Itemized (premature). Both are making you feel lost.

---

## 1. Top 10 Issues (ranked by severity)

### 🔴 #1 — Solo/Split identity crisis (CRITICAL, root cause of "everything feels random")
**What:** Section 0 of the Spec says *"Target: personal use on own iPhone."* But the data model, the invariant (`Σ paid == Σ share`), `txn_payment`/`txn_share` split tables, the greedy debt-simplification algorithm, settle-up, and global netting all only have meaning when **2+ real people** are in a group.
**Impact:** Every screen tries to serve both a solo budgeter and a bill-splitter. The Dashboard shows "My spending = my share" (split-thinking) next to "Income/Net/Savings" (personal-finance-thinking). A solo user has `paid == share` on every transaction, so the entire invariant engine is invisible busywork for them.
**Root cause:** The spec was written aspirationally (Splitwise + budget tracker + multi-user SaaS) but the actual near-term user is one person (you) with maybe a girlfriend.
**Fix:** Declare the v1 user explicitly: **"1–4 people, all tracked on a single device, no accounts."** This *keeps* split (it's your differentiator vs. a plain budget app) but *justifies* it — and lets you delete the parts that only matter at scale (see #3, #4).

### 🔴 #2 — The dev-environment blocker is not in the plan (CRITICAL)
**What:** Spec §0: *"no iOS environment set up yet."* Spec §14 admits `expo-sqlite` and `expo-local-authentication` **require a dev build** — they do **not** work in Expo Go. The entire app is built on SQLite.
**Impact:** M1 ("DB schema + seed") is literally untestable until Xcode is installed, an Apple ID is configured, and `npx expo run:ios` succeeds on a real device. If that setup fails (common on free Apple IDs), the project stalls at task one. This is the single most likely reason the project never ships.
**Fix:** Add **M0 — Environment & Spike** *before* any feature work. De-risk the toolchain on day one with a throwaway build that writes one row to SQLite and reads it back on a physical iPhone.

### 🔴 #3 — Debt-simplification algorithm is over-engineering for the real scale (HIGH)
**What:** Spec §8 ships a greedy min-cash-flow algorithm "correct at personal scale… up to 50 members" (NFR-3).
**Impact:** With 2 people, settlement is `net > 0 ? "they owe you" : "you owe them"` — one line. With 3–4 people it's trivial. The 50-member, sort-both-sides, two-pointer greedy solver is solving a problem you do not have. It's not *wrong*, it's *premature* — and it implies a UI (Settle-Up screen, "Mark as Paid" creating settlement txns, settlement audit history) that is a whole milestone (M4) of surface area.
**Fix:** v1 ships **net balance display only** ("You owe Kavya ₹450"). Keep the `simplify()` function (it's 20 lines, already written) but **defer the settle-up *screen* + settlement-txn machinery to v1.1.** You can settle in real life and just delete/zero the transactions, or mark a simple "settled" flag. Full settlement audit trail is a v2 (multi-user) need.

### 🔴 #4 — Recurring transactions with lazy materialization is the highest-risk/lowest-value feature in v1 (HIGH)
**What:** FR-2.4 + edge cases: recurring txns are *not* persisted; instances are computed on-the-fly for any viewed date range, with "edit this instance vs. all future" branching that writes override rows.
**Impact:** This is the single hardest thing in the spec to get right (date-range virtualization, override reconciliation, interaction with budget totals and balances which are *also* computed live). It's an entire milestone (M8). For a personal app, the value is "rent shows up automatically each month" — which a simple **"duplicate last month's txn"** button delivers at 5% of the cost.
**Fix:** **Cut lazy materialization from v1.** Replace with a "Repeat" button on a transaction that clones it to today. Real recurrence → v2.

### 🟡 #5 — Dashboard and Groups tabs overlap (MEDIUM-HIGH, UX confusion)
**What:** Dashboard shows "Group health chips (horizontal scroll)" (§16.6). Groups tab shows "Group cards with health indicator" (§12). These are the same component showing the same data in two tabs.
**Impact:** Two of your four tabs do an overlapping job. Users (and you) don't know which is the "home." This is a concrete source of the "where is what" feeling.
**Fix:** Make **Dashboard the only home for the cross-group picture**, and make **Groups a drill-down list** — or, better for v1, **merge them**: one "Home" tab = personal totals on top + tappable group list below. Drops you from 4 tabs to 3.

### 🟡 #6 — Quick vs. Itemized fork happens too early (MEDIUM-HIGH, UX)
**What:** The FAB forces a choice between "Expense," "Income," and "Itemized Bill" *before* the user has entered anything (§16.5 FAB, Flow A vs Flow B).
**Impact:** The user must classify the *entry mode* before they know the *content*. Splitwise's lesson: you add an amount, then *optionally* tap "itemize." Forking first means a user who started "Quick" and realizes they need line items has to back out and restart.
**Fix:** FAB → **"Add Expense" / "Add Income"** (two options, not three). Inside the expense form, an **"Itemize" toggle** reveals the line-item UI. One flow, progressive disclosure.

### 🟡 #7 — "My Spending = my share" is a confusing hero number for the Dashboard (MEDIUM)
**What:** FR-6.2: the dashboard's primary number is the sum of the user's *shares*, not what they *paid*.
**Impact:** It's *correct* per the model but *unintuitive*. You pay ₹30,000 in dinners this month, app says "My spending ₹12,450." For a solo user these are equal (fine). For a splitting user it's a teaching moment that needs a tooltip, not a bare number. Right now it's presented bare.
**Fix:** Keep the number, but **label it precisely** ("Your share of spending") and show paid-vs-share split on tap. Don't make the most-confusing concept the largest unexplained number on the home screen.

### 🟡 #8 — Five split types is two too many for v1 (MEDIUM)
**What:** FR-3.1: Equal, Exact, Percentage, Shares(ratio), Itemized.
**Impact:** Splitwise ships with effectively Equal + Exact + (a few). Ratio is almost never used by real people; it's a power-user feature. Each type is its own validation path, its own UI state, its own rounding test surface.
**Fix:** v1 = **Equal + Exact + Itemized** (itemized *produces* exact shares, so it reuses the exact path). **Percentage → v1.1, Ratio → v2.** Three paths, not five.

### 🟡 #9 — Budget carry-over is fiddly logic for marginal value (MEDIUM)
**What:** FR-7.4 + edge case: `remaining = limit + unused_prior_period`, capped at one period back, only if `carry_over=1`, interacting with daily/monthly/yearly limits independently.
**Impact:** Combinatorial: 3 limit periods × carry-over on/off × global-vs-group limit. A lot of branches and notification triggers for a feature most personal users will never enable.
**Fix:** v1 = **a single monthly limit per group + optional global monthly limit, no carry-over.** Carry-over and daily/yearly → v1.1.

### 🟢 #10 — Terminology leaks and inconsistency (LOW-MEDIUM, but cheap to fix)
**What:** Docs mix "Share/Paid/Split/owe/consumed"; DB names (`txn_share`) risk leaking into UI; "Settle Up" vs "Mark as Paid" vs "settlement" used loosely.
**Impact:** Reinforces the "random" feeling. Small, but pervasive.
**Fix:** Adopt the glossary in STRUCTURE_CLARITY_MAP §10 as law. One term per concept, everywhere.

---

## 2. The decision that fixes most of this: define the v1 user

> **v1 BudgetSplit is for one person managing money across a few contexts, where some contexts involve splitting with 1–3 known people (partner, roommates, trip friends) — all tracked on the owner's phone, no accounts, no sync.**

Everything below follows from that sentence. When a feature doesn't serve *that* user, it's cut or deferred. That's the "proper line" you felt was missing.

---

## 3. Revised v1 scope (the brutal cut)

### KEEP (this is v1)
| Area | What ships | Why |
|------|-----------|-----|
| Groups | Create, add members (local people), archive | Core organizing concept |
| Transactions | Income, expense, edit, soft-delete | The point of the app |
| Split | **Equal + Exact + Itemized** | The differentiator vs. a plain tracker |
| Invariant | `Σ paid == Σ share` enforcement | Keeps split data trustworthy |
| Balances | **Net balance display per person** (no settle-up screen) | Answers "who owes whom" cheaply |
| Home | Merged Dashboard+Groups: my totals + group list | One clear home |
| Budget | One monthly limit/group + global monthly limit | Useful, simple |
| Categories | Seeded defaults + add/rename/delete | Needed for any tracking |
| Money | Integer paise, `splitEqual`, rounding rule | Non-negotiable correctness |
| Polish | Dark mode (it's the default theme anyway) | Low cost, high perceived quality |

### DEFER to v1.1 (next, after v1 ships and you've used it)
- Settle-Up screen + settlement transactions + "Mark as Paid" audit trail
- Percentage split
- Daily/yearly limits + carry-over
- CSV/PDF export + reports/year-in-review
- Local notifications (80%/100%)
- "Repeat transaction" button (cheap recurrence)
- Receipt photo, tags + cross-group tag filtering
- Face ID lock

### DEFER to v2 (needs real multi-user)
- Supabase auth, sync, join codes, shared groups, E2E encryption, conflict resolution
- Greedy debt-simplification *at scale* + global cross-group settle-up
- True recurring transactions with lazy materialization + edit-instance/all-future
- Ratio split

### DELETE from the roadmap entirely (until proven needed)
- "50 members" performance target (NFR-3) — you will never have 50 people on one phone
- AI insights, multi-currency, OCR, widget (these were already v3 wishlist; keep them out of any near plan)

**Result:** Feature count for v1 drops from ~19 to ~10. Milestones from 10 to 5.

---

## 4. Revised navigation (3 tabs, not 4)

```
TAB BAR
├─ 🏠 Home        ← merges old Dashboard + Groups
│   ├─ Period toggle: Month (default) | Year      ← drop "Today" tab; low value
│   ├─ "Your share this month: ₹X"  (labeled, tappable → paid vs share)
│   ├─ Income · Net · Savings%       (one stat row)
│   ├─ Category donut (tap to expand)
│   └─ GROUPS list (each row: icon, name, budget bar, your balance)
│        └─ tap → Group Detail
├─ 📊 Reports     ← DEFERRED to v1.1 (hide tab in v1, or stub)
└─ ⚙️ Settings

FAB (center, above tab bar)
├─ Add Expense   → expense form (with "Itemize" toggle inside)
└─ Add Income    → income form
     (NO third "Itemized" option — it's a toggle, see Issue #6)

GROUP DETAIL (group/[id])  — 3 sub-tabs, not 4
├─ Transactions  (list, grouped by date, swipe-delete)
├─ Balances      (net per person — NO settle-up screen in v1)
└─ Settings      (members + the single monthly budget limit, merged)
        ← "Budget" and "Members" tabs merged; both are low-traffic config
```

**Tabs: 4 → 3. Group sub-tabs: 4 → 3. FAB options: 3 → 2.** Every one of those reductions removes a "where does this go?" decision.

---

## 5. Revised data model (what changes)

The schema in Spec §3 is **fundamentally sound** — keep it. Minor v1 simplifications:

- `txn.recur_freq / recur_interval / recur_end` → **keep the columns** (cheap, future-proof) but **don't implement materialization.** Nullable, unused in v1.
- `budget_group.limit_daily / limit_yearly` → keep columns, **only wire `limit_monthly`** in v1.
- `budget_group.carry_over` → keep column, **ignore in v1 logic** (treat as 0).
- `txn.kind = 'settlement'` → **keep in the CHECK constraint**, but no UI creates it in v1. Balances are shown, not settled-through-the-app.
- Everything else (person, group_member, txn_payment, txn_share, line_item, category) → **unchanged.**

**Principle:** Keep the schema forward-compatible (don't fight future v1.1/v2), but only *write code against* the columns v1 uses. Migrations are painful; over-cutting the schema now means a migration later. Cut *logic*, not *columns*.

---

## 6. Revised milestone plan (10 → 6, including the missing M0)

| # | Milestone | Done when | Est. |
|---|-----------|-----------|------|
| **M0** | **Environment & spike** (Xcode, Apple ID, `expo run:ios`, SQLite round-trip on real device) | One row written + read back on your physical iPhone | 2–4 days |
| **M1** | DB schema + seed + Home shell + group/person CRUD | Create group, add member, see empty home | 1 wk |
| **M2** | Quick expense + income + txn list + soft-delete + paise helpers | Log a solo expense, see it, delete it | 1 wk |
| **M3** | Split engine: Equal + Exact + invariant enforcement + rounding | Split a bill 3 ways, save blocked if unbalanced | 1.5 wk |
| **M4** | Itemized toggle (line items, tax/tip, quick-assign → exact shares) + net balance display | Enter a restaurant bill, see who owes whom | 1.5 wk |
| **M5** | Monthly budget limit + Home metrics + category donut + dark-mode polish | Set a limit, home shows correct share-based totals | 1 wk |

**~7–8 weeks of focused solo work** vs. the original 10-milestone plan that realistically runs 5–6 months. Ship M0–M5, *use the app for two weeks*, then start v1.1 with real signal about what's actually missing.

---

## 7. Screen-by-screen verdicts (condensed)

| Screen | Verdict | Action |
|--------|---------|--------|
| Dashboard | Redundant with Groups | **Merge into Home** |
| Groups list | Redundant with Dashboard | **Merge into Home** |
| add/quick | Good, but forks too early | **Make it the only add-expense flow; add Itemize toggle** |
| add/itemized | Should not be a separate entry point | **Fold into expense form as a toggle** |
| group/[id] (4 tabs) | One tab too many | **3 tabs: Txns / Balances / Settings(=members+budget)** |
| group/[id]/settle | Whole screen for a deferred feature | **Cut from v1** (show net balances inline instead) |
| reports | Whole tab for deferred features | **Stub/hide in v1** |
| settings | Fine | Trim to: profile, categories, global monthly limit, data export(v1.1) |

---

## 8. What was genuinely *good* (don't throw these away)

- **Integer-paise money model + `splitEqual` rounding rule** — this is correct and rare. Most apps get it wrong. Keep exactly as specified.
- **Storing shares explicitly at save time** (FR-3.5, "frozen amounts are source of truth") — excellent decision; prevents recompute bugs.
- **Computing balances live, never storing them** — correct.
- **The design system** (§16) — the "precision ledger" direction, monospaced amounts, single amber accent, no-shadow cards — is coherent and good. Build it as specified.
- **Soft-delete everywhere** — right call for an audit-friendly money app.

The *engineering taste* is good. The *scope discipline* is the problem.

---

## 9. Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| iOS toolchain never gets working (no Mac/Xcode issues) | High | Fatal | **M0 first.** If you don't have a Mac, this whole plan is blocked — resolve before anything. |
| Scope creep back toward "full Splitwise" | High | High | This document is the line. Anything not in §3-KEEP is v1.1+. |
| Recurring/settle-up sneak back in "because they're in the spec" | Medium | High | Explicitly marked DEFER here; Spec updated to match. |
| 7-day sideload signature expiry frustrates daily use | Medium | Medium | Accept it for personal use, or budget $99/yr Apple Developer later. Not a v1 blocker. |
| Solo-dev burnout from 6-month plan | Medium | High | The 8-week cut plan exists precisely to ship before motivation dies. |

---

## 10. Concrete next actions

1. ✅ This file (`REVISED_ARCHITECTURE.md`) is the new source of truth for scope.
2. ✅ `Spec` updated with a "v1.1 REVISED SCOPE" banner + corrected milestone table (see top of Spec).
3. ✅ `PENDING.md` rewritten to the M0–M5 plan with DEFERRED/CUT sections.
4. ✅ `ROADMAP.md` updated so v1 = the cut scope, with deferred items moved to v1.1.
5. ⏭️ **You decide:** Do you have a Mac for M0? If not, that's the only conversation that matters right now.

---

*This analysis deliberately recommends cutting ~half the spec. That is the point. A shipped app at 50% scope beats a perfect spec at 0% shipped. The cut features aren't gone — they're sequenced into v1.1 and v2 where they belong.*
