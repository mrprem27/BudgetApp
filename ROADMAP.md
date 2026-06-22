# BudgetSplit — Product Roadmap

**Version:** 3.0 (Master Plan)  
**Last Updated:** June 22, 2026  
**Status:** v1.0 (Local Solo) — Planning Phase

---

## Vision

BudgetSplit is a ledger-first budget and split-expense app for iOS. It lets you manage unlimited budget groups, track income and expenses, split bills with precision down to the rupee, and see your global financial picture—all without ever connecting to the internet.

**Core differentiator:** Exact rupee (paise) accounting with zero-error debt simplification.

---

## Release Timeline

```
┌─────────────────────────────────────────────────────────┐
│ v1.0 (Local Solo)      Q3 2026      [CURRENT]           │
│ Offline-first, single user, unlimited groups            │
├─────────────────────────────────────────────────────────┤
│ v2.0 (Live Multi-User) Q4 2026-Q1 2027                  │
│ Supabase sync, real-time collaboration, join codes      │
├─────────────────────────────────────────────────────────┤
│ v3.0 (Smart Features)  Q2-Q3 2027                       │
│ OCR receipts, multi-currency, widgets, AI insights      │
└─────────────────────────────────────────────────────────┘
```

---

## v1.0: Local Solo (Target: August 2026)

**Tagline:** "A ledger in your pocket."

### Philosophy

v1 is fully offline. Zero network calls. Perfect for the solo user and small groups who want a private ledger without cloud lockdown.

### Feature Set

#### Core
- ✅ Unlimited budget groups (Personal, Me & GF, Trip, etc.)
- ✅ Add members to a group (real people or aliases)
- ✅ Income and expense tracking
- ✅ Four split types: equal, exact, percentage, ratio
- ✅ Itemized bill entry with per-item assignment
- ✅ Debt simplification (greedy algorithm → minimum payments)
- ✅ Settle-up flow (mark payments as paid → settlement txns)

#### Tracking & Insights
- ✅ Global dashboard: 3 tabs (Today / Month / Year)
- ✅ Spending by category (donut chart)
- ✅ Income, spending, net, savings rate metrics
- ✅ Group budget health indicators (progress bars)
- ✅ Per-group and global settle-up

#### Budget Management
- ✅ Optional daily, monthly, yearly limits (per group)
- ✅ Carry-over: unused budget rolls to next period
- ✅ Local notifications at 80% and 100% thresholds
- ✅ Budget progress bar on group cards and group detail

#### Advanced Transactions
- ✅ Recurring expenses (daily, weekly, monthly, custom interval)
- ✅ Lazy materialization (future instances appear as needed, not pre-generated)
- ✅ Edit-this-instance-only or edit-all-future flows
- ✅ Tags for cross-group filtering (e.g., #trip, #food)
- ✅ Receipt photo attachment

#### Reporting & Export
- ✅ Per-group monthly summary (income, expense, net, top categories)
- ✅ Year-in-review screen
- ✅ Export as CSV and PDF
- ✅ Date range filter for custom reports
- ✅ Share to email, AirDrop, print, more

#### Personalization & Security
- ✅ Dark mode (full theme support)
- ✅ Face ID / Touch ID lock (optional)
- ✅ Custom categories per group
- ✅ Custom colors and icons for groups
- ✅ Avatar colors for people
- ✅ Account-less (no signup, no password, no tracking)

### Milestones (see PENDING.md)

1. **M1 — Foundation** (DB + Navigation)
2. **M2 — Quick Entry** (Solo expenses)
3. **M3 — Split Engine** (Core splitting logic)
4. **M4 — Settle Up** (Debt simplification)
5. **M5 — Itemized Bills** (Multi-item bills)
6. **M6 — Dashboard** (Insights & charts)
7. **M7 — Budget** (Limits, carry-over, notifications)
8. **M8 — Recurring** (Auto-expenses)
9. **M9 — Reports** (Export, summaries)
10. **M10 — Polish** (Dark mode, Face ID, accessibility)

### Success Criteria

- [ ] App launches and shows dashboard in <1s
- [ ] Save a transaction in <200ms
- [ ] Settle-up computation for 50 people in <100ms
- [ ] All data persists across app restarts
- [ ] No floating-point errors in money calculations
- [ ] Dark mode passes WCAG AA contrast
- [ ] Face ID lock works reliably
- [ ] Able to sideload on iPhone via AltStore

### Go-Live Checklist

- [ ] All M1–M10 tasks complete
- [ ] Manual testing on device (iPhone 12+)
- [ ] No high-severity bugs
- [ ] README updated with build instructions
- [ ] Spec matches actual behavior

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

