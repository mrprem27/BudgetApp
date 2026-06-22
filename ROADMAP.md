# BudgetSplit — Product Roadmap

**Version:** 3.1 (Master Plan — v1 scope cut per Opus 4.8 review)
**Last Updated:** June 22, 2026
**Status:** v1.0 **prototype** (local, feel-the-product build) — Planning Phase

> **⚠️ Scope cut:** After architecture review (`REVISED_ARCHITECTURE.md`), v1
> was reduced from ~19 features / 10 milestones to **~10 features / 6 milestones
> (M0–M5)** to ship in ~8 weeks. This local build is a **prototype to feel the
> product**; a **proper backend (accounts + sync) is the real destination (v2)**.
> Deferred features are sequenced into v1.1 and v2 — not abandoned.

---

## Vision

BudgetSplit is a ledger-first budget and split-expense app for iOS. It lets you manage budget groups, track income and expenses, split bills with precision down to the rupee, and see your financial picture. The v1 prototype is local-only to validate the *feel*; the production version runs on a real backend with multi-user sync.

**Core differentiator:** Exact rupee (paise) accounting + frictionless bill splitting for small, known groups.

---

## Release Timeline

```
┌─────────────────────────────────────────────────────────┐
│ v1.0 PROTOTYPE (local)   ~8 weeks    [CURRENT]          │
│ Feel-the-product build: groups, split, balances, budget │
├─────────────────────────────────────────────────────────┤
│ v1.1 (local, polish)     +4-6 weeks                     │
│ Settle-up, reports/export, notifications, recurrence    │
├─────────────────────────────────────────────────────────┤
│ v2.0 (REAL BACKEND)      Q4 2026-Q1 2027                │
│ Accounts + sync (Supabase), shared groups, join codes   │
├─────────────────────────────────────────────────────────┤
│ v3.0 (Smart Features)    Q2-Q3 2027                     │
│ OCR receipts, multi-currency, widgets, AI insights      │
└─────────────────────────────────────────────────────────┘
```

---

## v1.0: Prototype (Target: ~8 weeks from M0 start)

**Tagline:** "Feel the product before building the backend."

### Philosophy

v1 is a **local-only prototype to validate the feel** — flows, the share-vs-paid
mental model, the split UX. It is **not** the final product; the production app
runs on a real backend (v2). So build lean: don't perfect local-only machinery
the backend will own. **v1 user = 1–4 known people, all on one device, no accounts.**

### v1 Feature Set (the cut — authoritative in `REVISED_ARCHITECTURE.md` §3)

**SHIPS in v1:**
- ✅ Budget groups + members (local people)
- ✅ Income + expense tracking, edit, soft-delete
- ✅ Split: **Equal + Exact + Itemized** (itemized → exact shares)
- ✅ Invariant enforcement (`Σ paid == Σ share`)
- ✅ **Net balance display** per person ("You owe Kavya ₹450")
- ✅ One **monthly** budget limit/group + optional global monthly limit
- ✅ Home (merged dashboard+groups): share-based metrics + category donut
- ✅ Custom categories per group
- ✅ Dark mode (it's the default theme)
- ✅ Integer-paise money + deterministic rounding

**DEFERRED to v1.1:** Settle-Up screen + settlement txns + debt simplification,
Percentage split, carry-over + daily/yearly limits, notifications, Reports +
CSV/PDF, "Repeat" button, tags, receipt photos, Face ID, Today tab.

**DEFERRED to v2 (the real backend):** accounts/sync/join-codes/E2E, true
recurring (lazy materialization), Ratio split, global cross-group settle-up.

### Milestones (see PENDING.md for tasks)

0. **M0 — Environment spike** (Xcode + dev build + SQLite round-trip) 🔴 first
1. **M1 — Foundation** (schema + seed + 3-tab Home shell + CRUD)
2. **M2 — Quick Entry** (expense + income + list + soft-delete)
3. **M3 — Split Engine** (Equal + Exact + invariant)
4. **M4 — Itemized + Balances** (line items → exact shares; net balances)
5. **M5 — Budget + Home + Polish** (monthly limit, metrics, donut, dark mode)

### Success Criteria

- [ ] M0 proves the toolchain: SQLite round-trip on a real iPhone
- [ ] App launches to Home in <1s; save txn <200ms
- [ ] Split a bill 3 ways with exact paise (no float errors); save blocked if unbalanced
- [ ] Net balances correct for a 2–4 person group
- [ ] Data persists across restarts; dark mode looks good
- [ ] **You've used it for 2 weeks and know what v1.1 actually needs**

### Go-Live Checklist (prototype)

- [ ] M0–M5 complete
- [ ] Manual testing on your own device (iPhone 12+)
- [ ] No high-severity bugs in the core add→split→balance loop
- [ ] Sideloaded via AltStore and surviving daily use
- [ ] Notes captured on what felt wrong → feeds v1.1 + backend design

---

## v2.0: Live Multi-User (Target: Q4 2026–Q1 2027)

**Tagline:** "Share your ledger in real-time."

### Key Insight

v1 data stays on the device. But what if you want to split a bill with your girlfriend, coworkers, or travel friends *while* they're there? v2 adds optional Supabase sync.

### Feature Set

#### Authentication & Sharing
- 🔄 Email login OR Apple sign-in (Supabase Auth)
- 🔄 Personal groups (is_shared=0) stay local, never synced
- 🔄 Shared groups (is_shared=1) upload to Supabase on creation
- 🔄 Invite via 6-character join code (maps to group id)
- 🔄 Members linked by remote_uid (their Supabase account)

#### Real-Time Sync
- 🔄 Supabase Realtime channel per shared group
- 🔄 Inbound changes merged into SQLite (last-write-wins by updated_at)
- 🔄 Soft-deletes always win over edits
- 🔄 Conflict resolution: deterministic merge, no dialogs
- 🔄 Offline edits enqueue locally; flush on reconnect

#### Persistence & Privacy
- 🔄 Personal groups locked to your device (encrypted in transit if synced for backup)
- 🔄 Shared groups encrypted end-to-end (you hold the key, server can't read)
- 🔄 Each group has its own encryption key, derived from group_id + your secret
- 🔄 Supabase Database Policies enforce access (only members can read/write their group)
- 🔄 Optional: backup personal groups to Supabase (encrypted)

#### UI Additions
- 🔄 "Share Group" button → toggle is_shared, show join code
- 🔄 "Members Online" indicator (Realtime presence)
- 🔄 Conflict notification: "X edited this txn while you were offline" → review & resolve
- 🔄 Sync status indicator (cloud icon with animation)

#### No Breaking Changes
- 🔄 All v1 features work identically for personal groups
- 🔄 Shared group UX is identical to personal group UX (transparent sync)
- 🔄 Can switch a group from personal → shared (one-way)

### Milestones

1. **S1 — Supabase Setup** (Auth, DB schema, policies)
2. **S2 — Sync Engine** (Realtime, conflict resolution)
3. **S3 — Sharing UI** (Join code, member invites)
4. **S4 — End-to-End Encrypt** (Local key derivation, send/recv)
5. **S5 — Offline Queue** (Enqueue edits, flush on reconnect)
6. **S6 — Member Presence** (Online status, notifications)

### Success Criteria

- [ ] Can create a shared group and invite friend via join code
- [ ] Friend sees transaction in <2s after sync
- [ ] Works reliably when connection drops (edits queue, sync on reconnect)
- [ ] Personal groups never touch the network
- [ ] No unencrypted data leaves the device
- [ ] Invite code is 6 characters, human-readable

### Go-Live Checklist

- [ ] S1–S6 complete
- [ ] Tested on two real devices (WiFi, cellular, offline)
- [ ] Supabase project created (free tier sufficient)
- [ ] E2E crypto verified by security review
- [ ] Migration from v1 → v2 tested (personal groups work unchanged)

---

## v3.0: Smart Features (Target: Q2–Q3 2027)

**Tagline:** "Smart receipts, global budgets, widget insights."

### Feature Set

#### OCR Receipt Scanning
- 📸 Tap camera → photo of receipt
- 📸 ML Kit or AWS Rekognition extracts text (local parsing first)
- 📸 Suggests items, amounts, date from receipt
- 📸 User confirms and assigns members
- 📸 One-tap bill creation from photo

#### Multi-Currency
- 💱 Add transactions in INR, USD, GBP, EUR, JPY, etc.
- 💱 Exchange rates updated daily (free tier)
- 💱 Dashboard option: "Show all in INR" or "Show in original"
- 💱 Settlement respects currency (no auto-conversion)

#### App Widget
- 🏠 Home screen widget: "You owe ₹450 · Owed ₹1,200"
- 🏠 Tap widget → Settle Up screen
- 🏠 Optional: 2×2 widget showing "Today's Spending: ₹1,250"

#### AI Insights
- 🤖 **Spend patterns:** "You spend 30% more on weekends"
- 🤖 **Predictions:** "If you keep this pace, you'll hit ₹10k by month-end"
- 🤖 **Smart categories:** Suggest categories based on merchant (optional, v3.1)
- 🤖 **Group insights:** "You and X usually split 60/40, not 50/50"

#### Analytics Dashboard
- 📊 Spending trends (12-month view)
- 📊 Category deep-dives (where's the money really going?)
- 📊 Year-over-year comparison
- 📊 Savings goal tracking

#### Automation
- 🔄 Auto-categorize based on merchant (fuzzy matching from txn note)
- 🔄 Smart recurring detection ("You always pay rent on the 1st")
- 🔄 Bill reminders: "Electricity usually comes on the 15th"

### Why v3?

- **v1 must be solid and private.** v2 adds sync (complexity). v3 can add intelligence on top of a stable foundation.
- **OCR + ML** require device compute (and possibly cloud), which adds complexity and privacy implications. Keep v1 pure local, then add as opt-in feature in v3.
- **Multi-currency** is rarely needed in v1 (solo or friend groups in one region). Valuable as the app scales globally.

### Milestones

1. **A1 — OCR Pipeline** (Photo → text extraction → item parsing)
2. **A2 — Currency Layer** (Exchange rates, multi-currency txns)
3. **A3 — Widget** (Home screen, tap-through, refresh)
4. **A4 — Analytics** (Trends, deep-dives, year-over-year)
5. **A5 — AI Insights** (Patterns, predictions, smart categorization)

---

## Beyond v3: Ideas (Post-Release)

- **Bank sync:** Connect to HDFC, ICICI, etc. Import txns automatically (requires paid APIs, privacy concerns)
- **AI receipts:** Screenshot → extract transaction (not full OCR, simpler)
- **Subscriptions:** Track recurring Netflix, Spotify charges, bulk bill with friends
- **Budgeting coach:** "You're trending toward ₹X this month; here's where you can cut"
- **Investment sync:** Link to investment accounts, show net worth (complexity)
- **Team workspaces:** Expense management for small teams or businesses
- **Android port:** (Low priority; iOS is the focus)

---

## Out of Scope (Forever)

- ❌ Actual money transfers (this is a ledger, not a payment processor)
- ❌ Bank account linking (requires compliance, security, paid APIs)
- ❌ Business accounting (P&L, GST, invoices → separate product)
- ❌ Group chat or comments (notes field is enough)
- ❌ Ads or subscriptions (no revenue model; user-funded)

---

## Design Principles (All Versions)

1. **Precision over beauty.** Numbers are the hero, not UI chrome.
2. **Local first.** v1 offline, v2 sync is optional, personal groups always private.
3. **Rupee exactness.** Integer paise only. No floating-point ever.
4. **No network overhead.** v1 = zero calls. v2 syncs only what changed.
5. **One simple flow.** Add → Split → Settle. No hidden settings or modes.
6. **Dark by default.** Ledger aesthetic: near-black bg, warm text, amber accents.

---

## Success Metrics (By Version)

### v1.0
- ✅ 100+ active users in closed beta
- ✅ App rating ≥4.5 stars
- ✅ Average session: 3+ min
- ✅ Repeat usage: 70%+ weekly active

### v2.0
- 🔄 Add 50+ groups with 2+ members each (collaborative use)
- 🔄 Sync reliability: 99.9% uptime
- 🔄 Retention: 80% of v1 users upgrade, stay active

### v3.0
- 📊 OCR adoption: 40%+ of bill entries via photo
- 📊 Multi-currency groups: 20%+ of shared groups
- 📊 Widget install rate: 60%+ of MAU

---

## Team & Resources

| Role | Owner | Notes |
|------|-------|-------|
| **Development** | Prem | 3+ years RN/MERN; no iOS env yet (using Expo) |
| **Design** | — | Spec provided; use system design tokens |
| **QA** | — | Manual on device; no external test labs |
| **Backend (v2)** | — | Supabase free tier sufficient for launch |

---

## Budget & Cost

| Item | v1 | v2 | v3 | Notes |
|------|----|----|----|----|
| **Development** | Solo | Solo + 1 backend dev | Solo + ML ops | Estimated hours, not paid hours |
| **Infrastructure** | ₹0 | ₹500/mo (Supabase) | ₹1,000/mo (Supabase + ML) | Free tier covers MVP |
| **Distribution** | ₹0 | ₹0 | ₹0 | AltStore sideload, no App Store fees |
| **Total** | **₹0** | **₹500/mo** | **₹1,000/mo** | Sustainable for personal project |

---

## GitHub Milestones

- [ ] v1.0 Release (10 tasks, 10 milestones)
- [ ] v2.0 Release (6 tasks, 6 milestones)
- [ ] v3.0 Release (5 tasks, 5 milestones)

*(Tasks tracked in PENDING.md and GitHub Issues)*

---

## Glossary

| Term | Definition |
|------|-----------|
| **Paise** | 1 rupee = 100 paise (smallest unit tracked) |
| **Ledger** | Record of all transactions (income, expense, settlement) |
| **Settlement** | Marker txn when a debt is paid off |
| **Debt Simplification** | Greedy algorithm to minimize number of payments |
| **Group** | Container for people and transactions (e.g., "Me & GF") |
| **Share vs. Paid** | Share = what you consumed; Paid = what you fronted. Can differ. |
| **Invariant** | Rule that must always hold: Σ paid == Σ share |
| **Recurring** | Expense that repeats on a schedule (lazy materialization) |
| **End-to-End Encrypt** | Data encrypted with user's key; server can't read it |

---

## Contact

**Project Lead:** Prem  
**Email:** helloworldlife27@gmail.com  
**GitHub:** mrprem27/budgetapp  
**Last Updated:** 2026-06-22

---

## Revision History

| Date | Version | Change |
|------|---------|--------|
| 2026-06-22 | 1.0 | Initial roadmap created; v1 feature set locked |

