# BudgetSplit — Planning Complete, Next Steps

**Date:** 2026-06-22  
**Status:** All planning docs complete. Ready to build.

---

## What Just Happened

You've completed a comprehensive **analysis → redesign → buildplan** cycle:

### 1. Analysis Phase ✓
- **COMPREHENSIVE_ANALYSIS_PROMPT.md** — 10-dimensional analysis framework for deep code review
- **ANALYSIS_FINDINGS.md** — Applied that framework to the planned app structure, identified:
  - 5 Critical blockers (Dashboard, Add flow, Settings, Tabs, Group detail)
  - 5 High issues (Feature toggles, Savings, Afford visibility, Reports, Recurring UX)
  - 20+ features trying to serve multiple user types simultaneously

### 2. Design Phase ✓
- **REVISED_ARCHITECTURE.md** — Already existed; proposes cutting scope roughly in half:
  - **From:** 19 features, 10 milestones, solo budgeter + bill-splitter confusion
  - **To:** 10 core features, 5 milestones, clear v1 user ("Me & a few people")
  - **Key cuts:** No recurring (lazy-materialization), no settle-up screen, no multi-split-types

### 3. Build Plan Phase ✓
- **BUILD_PLAN.md** — Phased 5-milestone approach to build from scratch:
  - M0 (1 week): iOS environment + SQLite spike
  - M1 (1.5 weeks): Data model, seed, money utilities
  - M2 (2 weeks): Transactions, splits, balances
  - M3 (1.5 weeks): Home, groups, navigation
  - M4 (1 week): Budget tracking
  - M5 (1 week): Polish, design, testing
  - **Total:** 8–11 weeks to v1 ship

### 4. Implementation Phase (NOW) ✓
- **M0_TASKS.md** — Detailed subtasks for the critical blocker:
  - M0-1: Xcode + Apple ID setup
  - M0-2: SQLite spike (create, persist, verify)
  - M0-3: Navigation spike (3 tabs, FAB, routing)
  - Includes troubleshooting guide

---

## What's Locked In

### Scope (Revised Architecture)
**10 core features:**
1. ✓ Groups (create, members, archive)
2. ✓ Transactions (expense, income, soft-delete, edit)
3. ✓ Split (Equal, Exact, Itemized only — no Percentage/Ratio in v1)
4. ✓ Invariant (Σ paid == Σ share, enforced on save)
5. ✓ Balances (net balance display per person)
6. ✓ Home (merged Dashboard + Groups, one clear hero)
7. ✓ Budget (one monthly limit per group, + optional global limit)
8. ✓ Categories (seeded defaults + add/rename/delete)
9. ✓ Money (integer paise throughout, no floats)
10. ✓ Dark mode (default theme, locked in)

**Deferred to v1.1+:**
- Settle-up screen + settlement transactions
- Recurring transactions
- Reports tab
- Notifications
- Receipt photos
- CSV export
- Face ID lock

**Deferred to v2:**
- Multi-user sync (Supabase)
- Shared groups with real people
- Lazy-materialized recurring (date-range virtualization)
- Global cross-group debt simplification

### Architecture (Locked)
- **3 tabs:** Home, Reports [stub], Settings
- **FAB:** Add Expense, Add Income (no Transfer in v1)
- **Database:** Person, BudgetGroup, GroupMember, Transaction, TxnShare (schema forward-compatible with v2)
- **State:** Zustand for app state
- **Routes:** expo-router file-based routing
- **Navigation:** Modal add flows, push screens for detail
- **Design system:** AGENTS.md rules (spacing, colors, typography, components)

### Tech Stack
- **React Native** (Expo 56)
- **SQLite** (expo-sqlite, local-only)
- **Zustand** (state management)
- **expo-router** (file-based navigation)
- **React Native Gesture Handler** (swipes, if needed)
- **Feather icons** (expo/vector-icons, approved set only)

### Data Model
```
person (id, name, avatar_color, is_me, remote_uid, created_at, updated_at)
budget_group (id, name, icon, monthly_limit, is_archived, created_at, updated_at)
group_member (person_id, group_id, joined_at)
transaction (id, group_id, payer_id, amount_paise, category, date, note, is_deleted, created_at, updated_at)
txn_share (transaction_id, person_id, share_paise)
```

### Hard Constraints
- **Hard invariant:** Σ paid == Σ share on every transaction. Enforced on save, live validation in UI.
- **All money:** Integer paise (₹1 = 100 paise). Never floats.
- **One user per device** in v1 (no accounts, no sync).
- **Zero network calls** (fully offline, v2 adds backend).
- **Dark mode default** (light mode deferred).

---

## Your Next Move (Action Items)

### Immediate (Do This First)
**M0: Environment & Spike (Days 1–7)**

Follow `M0_TASKS.md` exactly:

1. **M0-1: iOS Environment Setup** (1–2 days)
   - Install Xcode from App Store
   - Configure Apple ID in Xcode
   - Verify device or simulator works
   - Test with `npx create-expo-app TestApp`

2. **M0-2: Database Spike** (2–3 days)
   - `npx create-expo-app budgetsplit` (or clone repo)
   - Install `expo-sqlite`
   - Create `src/db/init.ts` with test table
   - Build and run on device/simulator
   - **Success:** App shows data from SQLite, persists after reload

3. **M0-3: Navigation Spike** (1–2 days)
   - Set up `expo-router` with 3 tabs (Home, Reports, Settings)
   - Create FAB with "Add Expense" button
   - Verify routing (tabs switch, modal appears)
   - **Success:** All navigation works, no console errors

**Do not proceed to M1 until all M0 tasks pass.**

### If Any Blocker
If M0 fails (e.g., Xcode won't install, SQLite doesn't load):
- Check troubleshooting guide in M0_TASKS.md
- Reach out on community (Expo forums, React Native docs)
- Do NOT skip M0 — it's the foundation

### Week 2+: M1–M5
Once M0 passes:
- **M1 (Days 8–14):** Database schema, seed data, money utilities
- **M2 (Days 15–28):** Add expense flow, split logic, balance calculations
- **M3 (Days 29–39):** Home screen, group detail, settings
- **M4 (Days 40–46):** Budget tracking and warnings
- **M5 (Days 47–54):** Design polish, testing, no TypeScript errors

Each milestone has its own detailed tasks (to be written when M0 passes).

---

## Documentation Structure

```
budgetsplit/
├─ ANALYSIS_FINDINGS.md           ← What we found wrong in the planned app
├─ COMPREHENSIVE_ANALYSIS_PROMPT.md ← The analysis framework used
├─ IMPLEMENTATION_ROADMAP.md       ← High-level fixes (not used; we're building fresh)
├─ BUILD_PLAN.md                   ← THE PLAN — 5 milestones, 8–11 weeks
├─ M0_TASKS.md                     ← Detailed subtasks for M0 (do this NOW)
├─ NEXT_STEPS.md                   ← You are here
└─ [After M0 passes: M1_TASKS.md, M2_TASKS.md, etc.]
```

**Read in this order:**
1. **BUILD_PLAN.md** — understand the overall strategy
2. **M0_TASKS.md** — understand what M0 requires
3. **Start M0** — get hands-on

---

## Success Criteria for v1 Ship

Once all 5 milestones (M0–M5) are complete:

- [ ] App launches, shows Home screen (no crashes)
- [ ] Can add expense → appears on home
- [ ] Can split 3-way → math is correct (Σ shares == amount)
- [ ] Balances calculated correctly (paid - share = net)
- [ ] Budget warning shows when limit exceeded (80%, 100%+)
- [ ] Can add/remove group members
- [ ] Can create multiple groups
- [ ] Dark theme applied throughout
- [ ] All screens follow AGENTS.md design system
- [ ] All 88+ tests pass
- [ ] No TypeScript errors
- [ ] No console errors (warnings OK)
- [ ] Screen load < 1s, tap response < 200ms
- [ ] Data persists after app kill/restart

**Verdict:** If all above pass, app is production-ready for v1 beta.

---

## Common Questions

### "Why 8–11 weeks?"
- M0 (environment setup) is unpredictable; Xcode/Apple ID setup can take 3–7 days
- M2 (transaction logic + split validation) is the hardest; 2 weeks for correctness
- M5 (testing, design polish) is often underestimated; aim for thorough
- Pacing: 5 days/week dev work, breaks/feedback loops

### "Can we go faster?"
Possible paths:
- **Aggressive:** 5–6 weeks if environment setup is smooth + zero scope changes
- **Realistic:** 8–11 weeks accounting for bugs, design feedback, testing
- **Conservative:** 12–14 weeks with margin for safety

### "What if we're behind?"
If a milestone takes >50% longer than estimate:
- Pause and assess before continuing
- Consider deferring a feature to v1.1
- Don't sacrifice quality (correctness > speed)

### "Do we really need M0?"
Yes. expo-sqlite only works in dev builds (not Expo Go). M0 proves the toolchain works before investing 8+ weeks.

### "Can we run tests without M0 passing?"
Not meaningfully. Tests need:
- Native SQLite running (requires M0-2 dev build)
- Full iOS build (requires M0 environment)

### "What's the exit criteria?"
Ship v1 when:
- M0–M5 all pass
- 88+ tests pass (target: 80+ initially)
- No TypeScript errors
- User can add expense, split, see balance
- Zero crashes on basic workflows

Then release to TestFlight or sideload to your iPhone.

---

## Post-v1 Roadmap

**v1.1 (2–4 weeks after v1.0 ships):**
- Settle-Up screen + settlement transactions
- Reports tab (monthly, trends, forecast)
- "Repeat transaction" button
- CSV export
- Bug fixes based on v1 feedback

**v2 (2–3 months after v1.1):**
- Supabase auth + real sync
- Shared groups (real multi-user)
- True recurring with skip/edit/pause
- Ratio split type
- Receipt photos + OCR
- Global cross-group debt simplification

**v3+ (future, if needed):**
- Multi-currency
- Widgets
- AI insights

---

## Files You'll Create (as milestones progress)

| File | Purpose | Milestone |
|------|---------|-----------|
| `src/db/schema.ts` | SQLite tables | M1 |
| `src/db/init.ts` | Initialize DB | M1 |
| `src/db/seed.ts` | First-launch seed | M1 |
| `src/db/queries/transaction.ts` | CRUD operations | M2 |
| `src/lib/money.ts` | Paise conversion, split | M1 |
| `src/lib/balance.ts` | Balance calculations | M2 |
| `src/lib/budget.ts` | Budget queries | M4 |
| `app/(tabs)/index.tsx` | Home screen | M3 |
| `app/add/expense.tsx` | Add expense form | M2 |
| `app/group/[id].tsx` | Group detail | M3 |
| `src/components/finance/[*].tsx` | Finance widgets | M2–M3 |
| `src/components/ui/[*].tsx` | UI primitives | All |
| `src/components/tokens.ts` | Design tokens | M0+ |

---

## Important Reminders

1. **Do not skip M0.** Many projects fail here; prove toolchain works first.
2. **Lock scope early.** REVISED_ARCHITECTURE.md defines what ships in v1. No feature adds without removing something else.
3. **Hard invariant is sacred.** Σ paid == Σ share must be enforced everywhere. If tempted to break it, fix the UI instead.
4. **Use Spec §3 for schema reference.** It's detailed and correct. Just implement v1 subset.
5. **Tests are not optional.** 88+ tests keep correctness high. Write tests as you build.
6. **Design system is not optional.** AGENTS.md rules prevent amateur look. Follow them rigorously.
7. **Measure twice, build once.** Each milestone has specific success criteria. Don't move to M+1 until M is done.

---

## TL;DR for Next 7 Days

```
Do M0 (follow M0_TASKS.md):
1. Install Xcode (2–4 hours, biggest variable)
2. Create expo-sqlite test (1 day)
3. Set up expo-router (1 day)
4. Build and run on device
5. Verify: "DB test passed, navigation working"

If successful: Ready for M1.
If stuck: Debug using troubleshooting guide in M0_TASKS.md.
```

---

## Questions?

Refer to:
- **"What should I build first?"** → BUILD_PLAN.md, M0_TASKS.md
- **"What's the scope?"** → REVISED_ARCHITECTURE.md
- **"Why was X cut?"** → ANALYSIS_FINDINGS.md (issues analysis)
- **"How do I design a screen?"** → AGENTS.md (design system)
- **"What's the data model?"** → Spec §3 (schema reference)
- **"Is X in v1 or v1.1?"** → REVISED_ARCHITECTURE.md (scope list)

---

**Status:** Ready to build. Start M0 whenever you're ready. 🚀

