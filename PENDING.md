# BudgetSplit — Pending Work Tracker

**Last Updated:** June 22, 2026
**App Version:** v1.0 prototype (local, feel-the-product build)
**Authority:** Scope per `REVISED_ARCHITECTURE.md` (Opus 4.8 review). This file
was rewritten from the original 10-milestone plan down to **6 milestones (M0–M5)**.

> **Context:** This is a *prototype to feel like a user*. A proper backend
> (accounts + sync) is the real destination (v2). Build lean — don't perfect
> local-only logic the backend will replace.

---

## v1 Milestone Status

| Milestone | Title | Status | Est. |
|-----------|-------|--------|------|
| **M0** | Environment & SQLite spike | 🔵 Not Started | 2–4 days |
| **M1** | DB schema + seed + Home shell + CRUD | 🔵 Not Started | 1 wk |
| **M2** | Quick expense + income + txn list | 🔵 Not Started | 1 wk |
| **M3** | Split engine (Equal + Exact) + invariant | 🔵 Not Started | 1.5 wk |
| **M4** | Itemized toggle + net balances | 🔵 Not Started | 1.5 wk |
| **M5** | Budget limit + Home metrics + polish | 🔵 Not Started | 1 wk |

**Legend:** 🔵 Not Started · 🟢 In Progress · 🟠 Blocked · ✅ Done

**Target:** usable prototype in ~7–8 weeks, then dogfood for 2 weeks before v1.1.

---

## M0 — Environment & SQLite Spike  🔴 DO THIS FIRST

**Why first:** `expo-sqlite` does **not** run in Expo Go — it needs a dev build.
The entire app sits on SQLite. If the iOS toolchain doesn't work, nothing else
matters. This is the #1 project-killing risk.

- [ ] Confirm you have a Mac (or a plan) for Xcode — **if not, stop and resolve this**
- [ ] Install Xcode + command line tools; sign in with free Apple ID
- [ ] `npx create-expo-app budgetsplit --template blank-typescript`
- [ ] Install core deps: `expo-sqlite`, `expo-router`, `zustand`
- [ ] `npx expo run:ios` — get a dev build onto a **physical iPhone**
- [ ] Spike: write one row to SQLite, read it back, render it on screen
- [ ] Confirm the build survives an app restart (data persists)

**Done when:** one row written + read back on your real iPhone.

---

## M1 — DB Schema + Seed + Home Shell + CRUD

- [ ] Implement schema from Spec §3 in `src/db/schema.ts` (**keep all tables/columns
      intact** — forward-compatible with the future backend, even if v1 ignores some)
- [ ] First-launch seed: "Me" person, "Personal" group, default categories (`src/db/seed.ts`)
- [ ] Zustand store skeleton (`src/store/index.ts`)
- [ ] **3-tab nav** (expo-router): Home · Reports(stub) · Settings
- [ ] FAB with **2 options**: Add Expense, Add Income (no third "Itemized")
- [ ] Person CRUD (name + avatar color)
- [ ] Group CRUD (name, icon, color) + add member
- [ ] Group detail shell with **3 sub-tabs**: Transactions · Balances · Settings

**Done when:** create a group, add a member, see an empty Home.

---

## M2 — Quick Expense + Income + Transaction List

- [ ] `src/lib/money.ts`: `formatRupees`, `parseToPaise`, `splitEqual` (+ tests)
- [ ] Expense form: amount, group, category, date, optional note
- [ ] Income form (kind=income, no shares)
- [ ] Transaction list grouped by date (newest first)
- [ ] Swipe-left soft-delete (`is_deleted=1`)
- [ ] Tap txn → detail → edit
- [ ] Persist + reload across app restart

**Done when:** log a solo expense, see it in the list, delete it.

**Deferred here:** photo attachment, tags → v1.1.

---

## M3 — Split Engine (Equal + Exact) + Invariant

- [ ] Equal split UI (uses `splitEqual`, remainder to earliest members)
- [ ] Exact-amount split UI (paise per person)
- [ ] Multi-payer support (`txn_payment` rows)
- [ ] **Invariant enforcement:** live signed remainder, save disabled until
      `Σ paid == Σ share`, unbalanced side highlighted red
- [ ] Freeze shares into `txn_share` at save (source of truth)
- [ ] Edit a split txn → re-open split pre-filled → rebalance → save

**Done when:** split a ₹1000 bill 3 ways (₹334/₹333/₹333), save blocked if unbalanced.

**Deferred here:** Percentage split → v1.1. Ratio split → v2.

---

## M4 — Itemized Toggle + Net Balances

- [ ] **"Itemize" toggle inside the expense form** (NOT a separate FAB entry)
- [ ] Line items: name, qty, unit price; live subtotal
- [ ] Tax / tip / discount (flat or %), applied proportionally
- [ ] Quick-assign: tap item → avatar row → assign/unassign; live per-person totals
- [ ] "Split the rest equally" button
- [ ] Collapse item assignments → per-person `txn_share` (exact path reuse)
- [ ] Payer step + invariant check + review
- [ ] **Balances tab: net balance per person** ("You owe Kavya ₹450") — display only

**Done when:** enter a restaurant bill, assign items, see who owes whom.

**Deferred here:** Settle-Up screen, "Mark as Paid", settlement txns, debt
simplification algorithm at scale → v1.1 (the `simplify()` fn can stay unused).

---

## M5 — Budget Limit + Home Metrics + Polish

- [ ] Single **monthly** budget limit per group (ignore daily/yearly + carry-over)
- [ ] Optional global monthly personal limit (Settings)
- [ ] Budget progress bar (green <80% / amber 80–100% / red >100%)
- [ ] Home metrics: **"Your share this month"** (labeled clearly), Income, Net, Savings%
- [ ] Tap the share number → show paid-vs-share breakdown (teach the concept)
- [ ] Category donut (`react-native-gifted-charts`)
- [ ] Group list on Home (icon, name, budget bar, your balance)
- [ ] Dark-mode pass per design system §16

**Done when:** set a limit; Home shows correct share-based totals; looks polished.

**Deferred here:** Today tab (Month/Year only), notifications, charts-over-time → v1.1.

---

## DEFERRED — v1.1 (after you've dogfooded the prototype)

- [ ] Settle-Up screen + settlement txns + "Mark as Paid" + debt simplification
- [ ] Percentage split
- [ ] Carry-over, daily/yearly limits
- [ ] Local notifications (80% / 100%)
- [ ] Reports tab: monthly summary, year-in-review, date filter
- [ ] CSV + PDF export + share sheet
- [ ] "Repeat transaction" button (cheap recurrence)
- [ ] Tags + cross-group tag filtering
- [ ] Receipt photo attachment
- [ ] Face ID / Touch ID lock + accessibility pass
- [ ] Today period tab + spending-over-time chart

## DEFERRED — v2 (the proper backend)

- [ ] Supabase auth (email / Apple sign-in)
- [ ] Sync engine + Realtime + offline queue + conflict resolution
- [ ] Shared groups + 6-char join codes + `remote_uid` linking
- [ ] End-to-end encryption for shared groups
- [ ] True recurring transactions (lazy materialization, edit-instance/all-future)
- [ ] Ratio split
- [ ] Global cross-group settle-up at scale

## CUT — until proven needed

- [ ] 50-member performance target (you won't have 50 people on one phone)
- [ ] Multi-currency, OCR receipts, AI insights, home-screen widget

---

## Known Issues

| Issue | Severity | Notes |
|-------|----------|-------|
| No iOS env yet | 🔴 Critical | Blocks M0; resolve before anything else |
| Schema cut risk | 🟡 Watch | Keep columns intact even if v1 ignores them (avoid migrations) |

---

**Developer:** Prem · **App:** BudgetSplit v1 prototype · **Updated:** 2026-06-22
