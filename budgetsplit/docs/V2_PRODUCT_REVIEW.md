# BudgetSplit — V2 Product Analysis & Final Feature Closeout

> **Reviewed:** 2026-08-05 against `main` @ `1d7f256` (+ the uncommitted working tree).
> **Produced by:** [`prompts/V2_PRODUCT_REVIEW_PROMPT.md`](./prompts/V2_PRODUCT_REVIEW_PROMPT.md) — re-runnable.
> **Method:** [`FEATURES_AND_FLOWS.md`](./FEATURES_AND_FLOWS.md) as the spec, then the real screens
> under `app/` and libs under `src/lib/` read to verify every judgement. Competitive section
> anchored on [`COMPETITIVE_ANALYSIS.md`](./COMPETITIVE_ANALYSIS.md) plus a web pass for what has
> changed since it was written (2026-07-28).
>
> **What this doc is NOT.** Five docs already exist and this one deliberately does not repeat them:
>
> | Doc | Owns | This doc's relationship |
> |---|---|---|
> | `FEATURES_AND_FLOWS.md` | *What the app does* — behaviour, no opinion | assumed open next to this one; behaviour is not re-described |
> | `AUDIT.md` + `TAGS.md` | code correctness, per-ID `KEEP/KILL/DEFER` triage | cited by ID; settled calls are not re-litigated silently |
> | `COMPETITIVE_ANALYSIS.md` | competitor landscape, business-logic critique | §5 reorganises it *by our feature* and adds only what is new |
> | `ux-audit/UX_AUDIT.md` | rendered interaction polish across ~30 screens | referenced, never copied; §7 is systemic only |
> | `DEBT_TRACKER.md` | open debt with `file:line` evidence | cited by ID |
>
> The axis nothing else covers, and the only axis this doc argues on: **does each feature earn its
> place, who is it for, what is missing, and should it exist at all?**
>
> **Scope note.** §3 groups the 34 route files into **20 feature areas** for readability. §3.21's
> coverage table maps every `S-01…S-34` ID and all 14 `FeatureKey`s to exactly one area, so
> "nothing skipped" is provable rather than asserted.

---

## Contents

1. [Executive Summary](#1-executive-summary)
2. [First-Time User Review](#2-first-time-user-review)
3. [Feature-by-Feature Review](#3-feature-by-feature-review)
4. [Complete User Flow Review](#4-complete-user-flow-review)
5. [Competitor Comparison](#5-competitor-comparison)
6. [Missing Features](#6-missing-features)
7. [Systemic UI/UX Improvements](#7-systemic-uiux-improvements)
8. [Technical Product Review](#8-technical-product-review)
9. [The Cut List](#9-the-cut-list)
10. [V2 Closeout Checklist](#10-v2-closeout-checklist)
11. [Prioritised Action Plan](#11-prioritised-action-plan)

---

## 1. Executive Summary

**The product is in far better shape than a review like this usually finds.** 633 tests, zero
`tsc` errors, one colour palette, zero raw hex, every load error surfaced, a real staging table
for imports, a true inverse for every destructive action, and a doc-coverage test that fails if a
screen ships undocumented. The engineering discipline is genuinely unusual for a solo project.
That is the context for everything below: these are the problems of a product that is nearly done,
not one that is broken.

**One immediate caveat: `main` is not green.** `npx jest` on `1d7f256` fails **2 of 633**, both in
`loadInsightsData`. `DEBT_TRACKER.md` records 541/541, so the suite has grown 92 tests and gone red
since.

> **Correction (2026-08-05, after first publication).** This review originally called those two
> failures "real bugs rather than stale tests" and ranked `V2-27` the top Critical item. **That was
> wrong.** They are **calendar-flaky**: `screenData.test.ts:20` dates fixtures on the 15th
> (`midMonth()`), the review ran on the 5th, and `insightsData.ts:37` fetches
> `monthStart … Date.now()` — so a future-dated expense is correctly excluded and `monthSpend` is 0.
> They pass on the 15th–31st. Excluding future spend from a pace calculation is right, so production
> behaviour is fine. The real defect is narrower and still worth fixing — see `V2-27` in §3.17 and
> §10. Re-ranked from Critical to **Medium**, and the "four things most likely to lose a first user"
> below is back to three.

**What is genuinely strong, and should be protected:**

- **The splitting engine is the moat and it is complete.** Equal/Exact/%/Shares, itemized
  per-item split modes, four adjustment types, multi-group partial-settlement allocation
  (`settleScope.ts`), simplify-debts toggle. `COMPETITIVE_ANALYSIS.md` §2 finds functional parity
  or better against Splitwise on every axis except real money movement — and §5 below shows that
  last gap is now closeable without a backend.
- **The Review inbox is the best-designed screen in the app** and has no competitor equivalent.
  A real staging table, in-place editing, draft auto-save, per-row and bulk commit, snapshot-based
  undo on every path, saved views with a default payer. Nothing in the 46-app landscape has this.
- **Reversibility as a design principle.** Every commit path in `reviewCommit.ts` has a true
  inverse. Member removal is blocked on a non-zero balance. Turning `splitting` off names the
  balances that would disappear before doing it. `afford.tsx:27-34` refuses to swallow a load
  error because "₹0 available" would be a confident wrong answer. That instinct is the app's real
  quality signature.
- **Honest privacy scoping.** When cloud OCR shipped and made the absolute claim false, three
  in-app strings were narrowed rather than left to rot (§19). Most products would have left them.

**The three things most likely to lose a real first user:**

1. **`afford.tsx` still reports a wrong number, and the previously-recorded diagnosis is wrong.**
   `UX_AUDIT.md` High #2 called the 417% "Share of monthly income" a paise/rupee unit bug. It
   isn't — both operands are paise. The real cause is that `monthlyIncome` is a **trailing-30-day
   sum of logged income transactions** (`src/db/queries/savings.ts:428-438`) presented under the
   label "Share of monthly income" (`app/afford.tsx:165`), uncapped and undisclosed. A user who
   logged one ₹1,200 reimbursement and no salary gets 417% for a ₹5,000 purchase. This is the one
   place the app states a wrong number with confidence — the exact failure the same file's own
   comment forbids. **`V2-01`, Critical.**
2. **Nothing survives a lost phone unless the user performed a manual ritual.** Backup is built
   and good, but it is opt-in, manual, and gated behind a passphrase that is unrecoverable by
   design. The nudge notification exists — but it lives behind `flags.reminders`, needs a dev
   build for OS notifications, and a user who skipped the notification permission in onboarding
   never hears it. The failure mode is total, silent, and permanent. **`V2-02`, Critical.**
3. **Manual entry fatigue, unchanged and correctly diagnosed a week ago.** Still the #1 churn
   driver for the budgeting half. The honest V2 answer is not to close it (both real fixes are
   externally blocked) but to *stop the app quietly overstating what it knows* — see the
   completeness-disclosure item, `V2-06`.

**The single biggest scope problem — and the reason this review recommends cutting:**

**14 feature flags are a second, undocumented navigation model.** `src/lib/featureFlags.ts` defines
14 keys, which is 16,384 possible app shapes, none of which are tested in combination, and
**five of them exist only to hide one card** (`dashboardInsights`, `reportsDonut`, `reportsTrend`,
`forecast`, `savingsInsights`). The invariant test proves each key gates *something*; it cannot
prove that any user wants to gate it. This grew from a good instinct — "let a user make the app as
minimal or as rich as they want" — into configuration for its own sake. Meanwhile the one flag that
genuinely changes the app's shape (`splitting`) is buried in the same undifferentiated list as
"show the donut". §9 proposes cutting 6 of the 14.

**A closing observation on the docs themselves.** The flag count has now drifted **three times**:
`ARCHITECTURE.md:304` says 12, `TAGS.md` F-33 says "✓ 12 keys, all gating, invariant tested",
`AUDIT.md` §4.6 / `DRIFT-14` say 13, and the code says **14**. `review.tsx` is tracked at 977 LOC
in `DEBT_TRACKER.md` C1 and is now **1029**. `docCoverage.test.ts` guards that every *route* is
documented; nothing guards the *numbers*. See `V2-14`.

---

## 2. First-Time User Review

Walked cold, as someone who installed this from the App Store with no context.

### 2.1 Onboarding — genuinely good, with one wrong default

**What works.** 9 stages, every one skippable, a sensible prefilled default on each, no signup, no
OTP, no KYC. "Takes 20 seconds · no sign-up" is an honest promise. The privacy story is repeated
at exactly the moments a user would be wary (persona picker, permissions step). The intent picker
actually does something now — `personaDefaults.ts` writes a *sparse* flag patch, so only deviating
keys persist and future `DEFAULTS` changes stay reachable. That sparseness is a subtle, correct call.

**Friction and gaps:**

- **The persona picker is missing its highest-retention option.** Three choices —
  `personal` / `split` / `both` (`src/lib/personaDefaults.ts:11`) — with couples buried inside
  `split`'s description text: *"Groups, roommates, couples — shared tabs, settle up"*
  (`Onboarding.tsx:83`). A couple splitting rent every month is the most habitual, daily-checked
  use case this category has, and it is being served by a generic "Split with people" bucket whose
  mental model is a trip. This is `COMPETITIVE_ANALYSIS.md` §3's only still-open quick win, and it
  is genuinely still open. **`V2-05`.**
- **`Onboarding.tsx:443` can still show a bare em-dash.** The `04fa6ad` fix guarded the block on
  `incomeNum > 0` but the inner expression still renders `'—'` when `budgetNum` is 0 — so a user
  who enters income and then looks at the budget step before typing sees *"Heads-up: that's — of
  your take-home."* The `UX_AUDIT.md` High #1 finding is 90% fixed, not 100%. **`V2-11`, Low.**
- **Stage 5 asks four numbers with no explanation of what they do.** Cash on hand, investments,
  credit limit, credit used — at stage 5 of 9, before the user has seen the Plan tab that consumes
  them. No copy explains that these drive Total Money, the health score, and the auto-funding
  engine. Most users will skip it, and skipping it silently degrades three downstream features.
- **The permissions step primes notifications, and a skip there quietly disables the backup
  nudge** — the mitigation for the app's single sharpest risk. The two are causally linked and
  nothing says so.

### 2.2 Discoverability — the weakest dimension

The app has 34 screens and a 5-slot tab bar. Several genuinely useful features are effectively
undiscoverable:

| Feature | How you find it | Verdict |
|---|---|---|
| **Reports** | Settings → *Export & reports*. Not on Plan, not on Insights, not on Home. | Filed under the wrong verb. A user looking for "reports" will not look under a data-management section. **`V2-08`** |
| **Afford check** | flag `affordCheck`, **off by default** → Plan header icon | A genuinely nice feature that ~nobody will ever see |
| **Recurring (global)** | Plan header icon, no label until tapped | Better, still icon-only |
| **Audit log** | Settings, *or* Home's catch-up banner, *or* a group's ⋯ sheet | Three entry points, none obvious |
| **Itemized split** | Quick Add → *More options* → *Split by items* | Two levels deep for the app's most differentiated feature |
| **Saved views** in Review | ⋯ overflow on the largest screen in the app | Power feature, correctly placed, but no first-use hint |

The pattern: **strong features hidden behind icons, weak features given tab-bar real estate.**
Plan's three header icons (`Insights · Recurring · Can I afford?`) are doing navigation work that
the tab bar should do, while the FAB — one tap, prime position — hardcodes to
`?kind=expense` (`app/(tabs)/_layout.tsx:99`).

### 2.3 States — the most consistent part of the app

§20's matrix is genuinely well-reasoned, and the stated principle is the right one: *screens that
answer a question surface their errors; screens that decorate self-hide.* Loading states are
deliberately absent where a flash would be worse than a delay (Home, Groups), and present with a
450 ms floor where a skeleton would flicker (`reports.tsx:64`). Distinct empty states for
"nothing" vs "nothing matching your filter" appear in both `/review` and `/search`. This is better
than most shipped apps.

Two gaps: `/features` has **no error state at all** (§20) — acceptable while flags are in context,
but `toggleSaveLocation` and `toggleCloudOcr` both perform async work that can fail on that screen.
And a fully-settled group **omits** its balance hero rather than confirming "all settled up"
(`UX_AUDIT.md` Medium #12) — against the app's own §2 empty-state philosophy.

### 2.4 Accessibility

Real work has been done: 6 genuinely silent controls labelled, 14 selection controls reporting
`{ selected }`, disclosures reporting `{ expanded }`. Two things remain:

- **`colors.textMuted` is 2.98:1 on `bgCard`** — below WCAG AA's 4.5:1, on the app-wide caption
  token (`DEBT_TRACKER.md` N1). Deferred as a design decision, and it is one — but it is also the
  single largest accessibility defect in the app and it has been deferred once already. **`V2-09`.**
- **No Dynamic Type / font-scaling story is documented anywhere.** With `adjustsFontSizeToFit
  minimumFontScale={0.6}` on money fields (`itemized.tsx:70`) and a documented truncation pattern
  in 4 places, large accessibility text sizes are very likely to break layouts. Untested territory.

---

## 3. Feature-by-Feature Review

Verdicts: **KEEP** (earns its place as-is) · **FIX** (right feature, wrong execution) ·
**MERGE** (should not be its own thing) · **CUT** (should not exist) · **ADD** (missing).

### 3.1 Onboarding & first-run — `S-01`, `S-02`

**Purpose:** get to first value in under a minute with no account. **Value:** high — the friction
advantage over every KYC-gated Indian competitor is real and structural.
**Implementation:** `useOnboardingForm.ts` owns the stage machine; one DB commit in
`finalizeOnboarding` (`src/lib/onboarding.ts:42-88`), each step individually try/caught.
**Missing:** household persona; no explanation of why stage 5's four numbers matter; no link
between the notification skip and the backup nudge it disables.
**Edge cases:** handled well — `onDone()` in a `try/finally` so the gate opens even if the write
fails; `paydayAnchor` clamped to month length so a salary rule never back-fills.
**Debt:** `Onboarding.tsx` is 691 LOC, over the ~300 bar, correctly tracked as standing policy.
**Perf:** one commit, no concern. **Verdict: FIX** (persona + em-dash + stage-5 copy). **High.**

### 3.2 Home / Dashboard — `S-03`

**Purpose:** answer "how am I doing right now" in one glance. **Value:** high — this is the
daily-open screen and the reason a budgeter beats a splitter on retention.
**Implementation:** `loadHomeData(db, groups, tab, flags)`; `groups` read from the store rather
than re-queried — correct. Budget scaled to the active period (÷days for Today, ×12 for Year).
**Missing:** the over-budget bar has no action on it. A fully-red bar reading "2 over" gives a user
alarm with no next step; the fix lives two navigations away in a group's Budget tab.
**Edge cases:** good — `everHadCats` keeps the category card mounted across period switches so it
never collapses; the first-run hero is bespoke and intentional (`U9`, won't-fix).
**UX:** four of nine slots are flag-gated, so two users' Home screens can share almost nothing.
**Perf:** re-runs the full load on every period pill tap — acceptable, but it is a full re-query to
change a date window.
**Verdict: FIX** — add an action to the overspend state. **Medium.**

### 3.3 Groups list & group hub — `S-04`, `S-09`

**Purpose:** who I split with, and where balances stand. **Value:** high, core to the moat.
**Implementation:** `S-09` correctly `router.replace`s a personal id to `/personal`, so old deep
links resolve instead of breaking — the right way to retire a screen.
**Missing:** no group search or sort at all. Fine at 8 groups, poor at 30. No "archive after N
months inactive" so trip groups accumulate forever.
**Edge cases:** the in-hub Budget tab's **"Who paid what" fairness breakdown** is the documented
reason both budget surfaces exist — a real distinction, not duplication.
**UX:** `UX_AUDIT.md` Medium #6 (inconsistent chevrons) and #7 (same red for over-budget and
you-owe) — both addressed in `04fa6ad`; #12 (settled group hides its hero) still open.
**Verdict: KEEP.** **Low.**

### 3.4 Personal — `S-14`

**Purpose:** everything involving me, across personal and group activity.
**Implementation:** canonical after Pass 4; gained swipe/FAB/audit-log/overflow from the retired
group variant. **Value:** high — for a `personal`-persona user this *is* the app.
**Missing:** its Activity filter (`Personal · Groups · All · {each group}`) is a fourth distinct
transaction-list filter model (see §8.2).
**Verdict: KEEP.** **Low.**

### 3.5 Quick Add — `S-07`

**Purpose:** log one expense / income / settlement. **Value:** highest-frequency action in the app.
**Implementation:** `useAddTxnForm` owns all state; the screen is render-only. Amount capped live
by `sanitizeAmountInput`, parsed by `parseToPaise`. Duplicate check at ±24 h. Save wrapped with
haptic + Alert on every path.
**Missing / friction:**
- **The FAB hardcodes `kind=expense`** (`app/(tabs)/_layout.tsx:99`). Income and Transfer both
  require entering via expense and switching a pill. The FAB *has* a multi-action mode
  (`ui/FAB.tsx` with `actions`), used elsewhere but not here.
- **Split-by-items is buried under *More options*** — the app's most differentiated feature, two
  taps deep, inside a collapsed section.
- `smartCategory` is **off by default**, so the category is manual on every single add for a new
  user. Defensible (it is false-positive-prone) but it means the highest-frequency flow ships with
  its own automation disabled.
**Edge cases:** excellent — attachment copy failure still saves the expense; a transfer with no
shared group raises an explicit Alert rather than failing silently.
**Verdict: FIX** — promote itemized, give the FAB its actions. **High.**

### 3.6 Itemized bills & receipt OCR — `S-08`

**Purpose:** split a real restaurant bill line by line. **Value:** high and differentiating —
per-item split modes exceed Splitwise's split-each-item-equally.
**Implementation:** 4 steps, all state in `useItemizedForm`, pure math in `src/lib/itemized.ts`
with the adjustment ratio scaled and the rounding remainder nudged so shares sum exactly.
Two OCR providers behind `getReceiptExtractor()`; a pre-flight `waitForFileReady` poll that
diagnoses a mid-flush camera file as a copy-step failure rather than blaming the OCR — a genuinely
thoughtful touch.
**Missing:** **no on/off switch** (`DEBT_TRACKER.md` F7, still open) — the Scan button cannot be
hidden. Mistral fallback documented but not implemented (§19). Free-tier Gemini quota is
app-wide, not per-user, and was cut 50-80% in late 2025.
**Debt:** 614 LOC. **Perf:** `ScanningOverlay` blocks all interaction during a scan — correct.
**Verdict: KEEP**, but the quota is a launch risk, not a feature risk (`V2-13`). **Medium.**

### 3.7 Settle up — flow only, no route

**Purpose:** clear a balance. **Implementation:** the Transfer pill in Quick Add + `settleScope.ts`;
`app/settle.tsx` correctly deleted. Six entry points, all deep-linking with pre-filled params.
`planAllGroupsSettlement` allocates largest-first with the remainder on the last group.
**Missing — the biggest single opportunity in this review:** the app records that a settlement
happened but cannot help it happen. `pay_method` is descriptive metadata only. In an India-first,
UPI-shaped product this is a **UPI intent handoff away** from being real — see §5.1 and `V2-03`.
**Verdict: KEEP the math, ADD the handoff.** **High.**

### 3.8 Budgets — `S-10`

**Purpose:** cap per-category spend on my share. **Value:** high; `my-share` is validated
(`COMPETITIVE_ANALYSIS.md` §5.2 — the dead `budget_group.limit_*` columns are evidence
group-total budgeting was tried and abandoned).
**Implementation:** `setCategoryBudgets` writes only amounts > 0; `refetchOnDataChange:false` so a
mid-edit refresh cannot wipe unsaved input — a subtle, correct call. Categories ordered by
frequency of use. Empty catalog self-heals.
**Missing:** **no re-plan surface and no rollover.** `COMPETITIVE_ANALYSIS.md` §5.2 makes the
sharp version of this point: my-share budgeting makes a category blowing up *more* unpredictable,
not less, because an itemized bill can assign you a much larger share than expected — and there is
no "rebalance the rest of the month" affordance, just a category going red. **`V2-07`.**
**Also missing:** no reconciliation between what you paid and what your share was. For a feature
whose whole value proposition is trustworthy attribution, "you paid ₹2,000, your share was ₹650"
never appears on a budget surface.
**Verdict: FIX** (re-plan). **High.**

### 3.9 People & members — `S-11`, `S-26`

**Purpose:** name-only contacts, no accounts. **Value:** medium-high, correctly scoped.
**Implementation:** `PersonNameSheet` owns the name constraints so rules cannot drift between the
three former copies. Member removal blocked while net ≠ 0 → "Settle up first" — exactly right.
**Missing:** `person.mobile` exists in the schema (`src/db/schema.ts:220`) with **zero readers** —
the only reader anywhere is `me.email` in `friends.tsx:126`. That unused column is where a UPI VPA
would live (`V2-03`).
**UX:** `friends.tsx` uses a top-right "+ Add" plus a dashed bottom card instead of a FAB, and
`UX_AUDIT.md` explicitly calls this the better pattern the FAB screens should learn from.
**Verdict: KEEP.** **Low.**

### 3.10 Recurring — `S-12`, `S-32`

**Purpose:** tracked recurring rules, and the app's stand-in for subscriptions.
**Implementation:** full lifecycle — pause/resume/end/skip-next with undo-skip, materialised
occurrences, `splitRecurringSeries` capping the old rule and starting a new one atomically. §2
of the competitive doc calls this a genuine strength: more complete primitives than Splitwise,
free where Settle Up paywalls it.
**The defect — two screens, one of them inert:**

| | `S-12` `group/[id]/recurring.tsx` (268 L) | `S-32` `plan/recurring.tsx` (151 L) |
|---|---|---|
| Scope | one group | all groups |
| Pause / Resume / Skip / Stop | ✅ all four | ❌ **none** |
| Row tap | — | `→ /group/{id}/recurring` **without `?focus=`** |

The global list is the natural place to manage recurring bills and can do nothing. Tapping a rule
sends you to the group list *and drops the `?focus={ruleId}` param `S-12` supports* — so the
2.6 s highlight never fires and you have to find the rule again by eye. Two clicks and a visual
search to do what the row you already tapped should have done. **`V2-04`.**
**Verdict: MERGE** — `S-32` should own the actions, or at minimum pass `?focus=`. **High.**

### 3.11 Group admin — `S-13`

**Purpose:** rename / re-icon / re-colour / default split / membership diff / archive / delete.
**Implementation:** shares `GroupForm` with the create sheet — correct, one source for the fields.
Personal can never be deleted. `handleSave` has try/catch + Alert + finally.
**Verdict: KEEP.** **Low.**

### 3.12 Plan & savings goals — `S-05`, `S-17`

**Purpose:** what am I saving toward, and what will this month look like.
**Value:** medium. Ranked drag-priority funding is ahead of YNAB/Monarch/Copilot, none of which
auto-transfer between goals at all.
**Implementation:** `runSavingsMaintenance` on boot and foreground: leftover-sweep → scheduled
allocations → overspend raid → reconcile. The raid takes from the lowest-ranked **unlocked** goals
and surfaces an undoable notice persisted across restarts (`lib/overspendNotice.ts`).
**The unresolved risk, still unresolved.** `COMPETITIVE_ANALYSIS.md` §7 asked the sharp question
and it was never answered: *does an unlocked goal still get silently auto-raided?* It does. The
notice is after-the-fact. As that doc puts it, "unlocked" becomes a trap default that still does
the risky thing — and no competitor auto-claws-back at all, so there is zero external evidence
users read this as reassuring. The undo makes it recoverable, not expected. **`V2-10`.**
**Missing:** goals are trackers, not real money. The Protect/explainer work handled the wording
honestly. `COMPETITIVE_ANALYSIS.md` §7's *Available Money vs Net Worth* reclassification is
agreed, needs no server, and has not shipped. **`V2-12`.**
**Verdict: FIX** (raid consent + money reclassification). **High.**

### 3.13 Detail surfaces — `S-15`, `S-16`

**Purpose:** everything about one transaction / one category.
**Implementation:** `txn/[id]` is thorough — hero, meta, receipt with full-screen viewer, split
summary, read-only line items, audit timeline, delete-with-undo, and Edit correctly routed to
whichever add screen owns the shape.
**Perf — the one real problem:** `category/[name].tsx:73` fetches **the whole year across every
category** and filters client-side so the period pills switch without a re-query. Correct today,
and honestly documented as the heaviest single read in the app (`S-16` / `DEBT-06`, both DEFER).
It degrades linearly with history and there is no windowing design yet. Not a V2 blocker; will be
a V3 one.
**Verdict: KEEP** (the deferral is the right call). **Low.**

### 3.14 Import — `S-18`

**Purpose:** get transactions in without typing them. **Value:** high — the only lever against
manual-entry fatigue that is not externally blocked.
**Implementation:** PDF via an off-screen pdf.js WebView, xlsx via `readXlsx`, else text;
`parseAnyText` tries parsers most-specific-first (Paytm → GPay → email alert → generic CSV).
Every row enriched with a category guess and a detected pay method on the way in.
**The best thing on this screen:** five *distinguishable* failure Alerts. "pdf.js read the PDF but
got 0 characters (it may be a scanned/image PDF)" and "extracted N characters but no transactions
matched a known layout" **plus the first 200 characters** — that last one lets a user or a
maintainer actually diagnose an unknown statement format. Most apps ship "Import failed."
**Missing:** no import history, so re-importing an overlapping statement re-stages every row and
the ±24 h duplicate check only runs on Quick Add's manual path, not on commit from Review.
**Verdict: KEEP.** **Low.**

### 3.15 Review inbox — `S-19`

**Purpose:** the staging gate — nothing touches balances until confirmed.
**Value:** highest-leverage screen in the app and the one with no competitor analogue.
**Implementation:** in-place editing on every field, drafts flushed on blur not per keystroke,
selection mode with Focus/Group/Save, ephemeral filters, persisted saved views carrying a target
group *and* a default payer for the "someone else always pays for this group" case. Category
learning fans out via `isSimilarMerchant` with an explicit "Apply to N" vs "Just this one" —
never silent, never automatic. Every commit path has a true inverse.
**Debt:** **1029 LOC and growing** — `DEBT_TRACKER.md` C1 records 977 after the last paydown and
`F-18`/`S-19`/`DEBT-11` all DEFER further decomposition for want of a safe incremental split.
It is now the largest screen again and has grown 52 lines since the number was recorded.
**UX:** `UX_AUDIT.md` Low #13 flagged that Confirm produced no visible state change and was not
confident whether that is correct. It is worth resolving — a per-row commit with no visual
acknowledgement is indistinguishable from a no-op.
**Verdict: KEEP the design, FIX the growth** — put a LOC ceiling test on it rather than another
manual paydown. **Medium.**

### 3.16 Reports & drill-down — `S-20`, `S-21`

**Purpose:** factual monthly history. **Value:** medium.
**Implementation:** the three-way synced breakdown (labels ↔ donut ↔ 6-month trend, all driven by
`selectedCat`) is well built and verified working. Month selector cannot advance past the current
month (`reports.tsx:81`) — a small, correct guard. Un-adopted names fold into one "Others" slice.
**Missing:** discoverability (§2.2) — filed under Settings → *Export & reports*.
**Debt:** `report-transactions.tsx` is the fifth filtered-transaction-list implementation (§8.2).
**Verdict: FIX the entry point** (`V2-08`), **MERGE** `S-21` toward `search` long-term. **Medium.**

### 3.17 Insights — `S-22`

**Purpose:** the single narrative-insight home. **Value:** medium-high — the velocity framing
(₹/day pace vs budget-allowed ₹/day → month-end overspend estimate) is genuinely sharper than a
static bar, and `COMPETITIVE_ANALYSIS.md` §2 notes the free what-if matches Monarch's *paid* tier.
**Two red tests on `main` — calendar-flaky, not broken production code. `V2-27`, Medium.**
`npx jest` on `1d7f256` fails 2 of 633: `loadInsightsData` returns `monthSpend: 0` where
`screenData.test.ts:167` and `:175` expect 25000 and 100000.

*This review's first published version got this wrong* — it called them real bugs and ranked the
item Critical. The actual cause: the fixture dates transactions on the **15th**
(`screenData.test.ts:20`, `midMonth()`), this review ran on the **5th**, and `insightsData.ts:37`
fetches `getTransactionsInRange(db, null, monthStart, Date.now())` — so a future-dated expense is
correctly excluded. The tests pass on the 15th–31st and fail on the 1st–14th. Excluding future spend
from a spend-to-date pace calculation is correct, so production behaviour is fine. (Proof the txn
exists: the same test's `drivers` assertion passes on a different query path.)

**The genuine defect is narrower.** `loadInsightsData` reads the clock directly
(`insightsData.ts:24-27`) while every comparable lib injects it — `upcoming.ts:36` documents
*"Pure and deterministic — `nowMs` is injected, never read from the clock here"*, and the
*passing* tests in this very file inject via `getBudgetAnalytics(db, grp, midMonth())`. That
asymmetry is precisely why these two tests, and only these two, depend on the calendar. Fix: inject
`now`. **Cheap, and it makes the screen testable at all.**

**A separate, real inconsistency — `V2-28`.** `catMap` sums `t.shares` for *every* member; there is
no `meId` comparison in the file, while `homeData.ts:100`, `savings.ts:416` and `upcoming.ts:21` all
filter to me. But `insightsData.ts:106`'s `budget` is *also* group-total (a sum of every group's
`totalAllocated`), so spend and budget are **internally consistent** — this is a cross-screen
inconsistency with Home, not broken arithmetic. Home says "you spent ₹X"; Insights says "the groups
you're in spent ₹Y". Both defensible; showing both to the same user is not. Per the app's own
my-share invariant, Insights should move — and the `budget` half must move with it
(`getMyGlobalBudgetStatus`) or the velocity comparison breaks.

**The structural weakness, already correctly identified and only half-fixed.** The
`TotalMoneyCard` staleness badge shipped (`Updated Xd ago` / `Never updated`,
`TotalMoneyCard.tsx:29-31`) and `HealthSheet` discloses a thin sample. But the **forecast, the
velocity hero, and the 10/20/30% what-if carry no completeness disclosure at all** — they are
computed from manually-logged history that is inevitably incomplete, and presented with the
confidence of a live feed. This is the app's most reputationally risky surface: a wrong number
stated well. **`V2-06`.**
**Verdict: FIX.** **High.**

### 3.18 Search — `S-23`

**Purpose:** free-text search over 3 years. **Implementation:** 150 ms debounce, month-sectioned,
6 rows per section with an expander, deliberately no pull-to-refresh because the list *is* the
query. `THREE_YEARS_MS` at `app/search.tsx:24`.
**Missing:** no amount-range or date-range filter, though `reviewFilter.ts` already implements
both for Review. The most capable filter model in the app is locked inside the staging screen.
**Verdict: KEEP**, and reuse `reviewFilter.ts` here rather than writing a third one. **Low.**

### 3.19 Settings, features & categories — `S-06`, `S-24`, `S-25`

**Implementation:** every row shows its current value inline — good. `categories.tsx` is a single
global catalog with an **Uncategorized** adopt path per kind, which is the right answer to the
messy-real-world-data problem. `features.tsx` gives every toggle a one-line description of exactly
what it affects.
**The problem is `features.tsx`'s content, not its design.** 14 flags + 2 non-flag prefs
(`save_location`, `ocr_provider`) in one undifferentiated list, where "hide the Reports donut" sits
at the same visual weight as "remove the Groups tab and the owe/owed strip". The two non-flag rows
behave differently for good, documented reasons (async OS refusal; implementation choice, not
surface) — that split is correct and well-commented. The flag *count* is the issue. See §9.
**UX:** `UX_AUDIT.md` High #4 (status-bar overlap) and Medium #5 (truncation) — both addressed in
`04fa6ad`.
**Verdict: CUT flags** (§9), **KEEP** the screens. **High.**

### 3.20 Utilities & safety nets — `S-27`, `S-28`, `S-29`, `S-30`, `S-31`, `S-33`, `S-34`

| ID | Screen | Verdict | Note |
|---|---|---|---|
| `S-34` | Backup & restore | **FIX** | Built well; the failure mode is that it is opt-in and passphrase-gated. `V2-02` |
| `S-33` | Afford check | **FIX, then MERGE** | Wrong number (`V2-01`); the concept belongs in Add's `BudgetNudge`, not a flag-gated screen nobody finds |
| `S-31` | Notifications | **FIX** | Permission is re-read not cached, and distinguishes `granted`/`undetermined`/`denied` correctly. But a notification tap has **no deep-link routing** — verified: no `addNotificationResponseReceivedListener` anywhere. `V2-15` |
| `S-30` | Reminders | **KEEP** | Read-only "what's coming" with per-item "Log payment" right where you'd act |
| `S-28` | Audit log | **KEEP** | Genuinely useful; paged 30/page; correctly logged every action during the UX audit |
| `S-29` | Help | **KEEP** | Static; `N2` (third divergent collapsible) is cosmetic |
| `S-27` | Storage (dev) | **KEEP** | 7-tap gated. `loadDemoData`'s coverage is exceptional — 7 goal states, every cadence, an empty group and an archived group purely to exercise empty states |

### 3.21 Coverage table

Every route ID and every feature flag, mapped to exactly one area above.

| ID | Route | Area |
|---|---|---|
| S-01 | `_layout.tsx` | 3.1 |
| S-02 | `(tabs)/_layout.tsx` | 3.1 |
| S-03 | `(tabs)/index.tsx` | 3.2 |
| S-04 | `(tabs)/groups.tsx` | 3.3 |
| S-05 | `(tabs)/savings.tsx` | 3.12 |
| S-06 | `(tabs)/settings.tsx` | 3.19 |
| S-07 | `add/quick.tsx` | 3.5 |
| S-08 | `add/itemized.tsx` | 3.6 |
| S-09 | `group/[id].tsx` | 3.3 |
| S-10 | `group/[id]/budget.tsx` | 3.8 |
| S-11 | `group/[id]/members.tsx` | 3.9 |
| S-12 | `group/[id]/recurring.tsx` | 3.10 |
| S-13 | `group/[id]/edit.tsx` | 3.11 |
| S-14 | `personal.tsx` | 3.4 |
| S-15 | `txn/[id].tsx` | 3.13 |
| S-16 | `category/[name].tsx` | 3.13 |
| S-17 | `savings/[id].tsx` | 3.12 |
| S-18 | `import.tsx` | 3.14 |
| S-19 | `review.tsx` | 3.15 |
| S-20 | `reports.tsx` | 3.16 |
| S-21 | `report-transactions.tsx` | 3.16 |
| S-22 | `insights.tsx` | 3.17 |
| S-23 | `search.tsx` | 3.18 |
| S-24 | `features.tsx` | 3.19 |
| S-25 | `categories.tsx` | 3.19 |
| S-26 | `friends.tsx` | 3.9 |
| S-27 | `storage.tsx` | 3.20 |
| S-28 | `history.tsx` | 3.20 |
| S-29 | `help.tsx` | 3.20 |
| S-30 | `reminders.tsx` | 3.20 |
| S-31 | `settings/notifications.tsx` | 3.20 |
| S-32 | `plan/recurring.tsx` | 3.10 |
| S-33 | `afford.tsx` | 3.20 |
| S-34 | `settings/backup.tsx` | 3.20 |

**34 of 34 routes covered.** Settle-up (§3.7) has no route by design — `app/settle.tsx` is deleted.

| Flag | Area | Verdict (§9) |
|---|---|---|
| `splitting` | 3.3 | KEEP — the one structural flag |
| `savingsGoals` | 3.12 | KEEP |
| `recurring` | 3.10 | KEEP |
| `reminders` | 3.20 | KEEP |
| `healthScore` | 3.2 | KEEP |
| `smartCategory` | 3.5 | KEEP — flip default after §9 |
| `recurringSuggest` | 3.15 | KEEP — flip default after §9 |
| `affordCheck` | 3.20 | CUT (merge feature into Add) |
| `streak` | 3.2 | CUT |
| `forecast` | 3.2 | CUT the flag, keep the card |
| `dashboardInsights` | 3.2 | CUT the flag, keep the teaser |
| `reportsDonut` | 3.16 | CUT the flag, keep the donut |
| `reportsTrend` | 3.16 | CUT the flag, keep the bars |
| `savingsInsights` | 3.12 | CUT the flag, keep the nudges |

**14 of 14 flags covered.**

---

## 4. Complete User Flow Review

Covering all 11 `FLOW-XX` plus three flows the doc does not number.

### FLOW-01 — First run
Entry: install. Expectation: "20 seconds, no signup." Reality: met.
**Failure/recovery:** best-in-class — every step individually try/caught, `onDone()` in
`try/finally` so a failed write cannot trap the user behind the gate.
**Reduce effort:** stage 5's four numbers could be one "set this up later" card on Plan instead of
a mid-onboarding wall. **Missing feedback:** nothing tells the user that skipping notifications
disables the backup nudge.

### FLOW-02 — Feature toggle
Optimistic local state, best-effort `AsyncStorage`. Two deliberate exceptions (location awaits an
OS grant and can refuse; `splitting` names the balances that would disappear). Both are correct.
**Missing:** `features.tsx` has no error state, yet two of its rows do async work that can fail.

### FLOW-03 — Premium upgrade
Does not exist, deliberately, recorded so the absence is explicit. `TAGS.md` FLOW-03 defers it to a
later phase. **Correctly out of scope for V2** — and §5.3 argues the *shape* should be decided now
even though the code should not be written.

### FLOW-04 — Add an expense
The core flow, and mechanically sound: 12 steps, duplicate check, one `withTransactionAsync`,
haptic → `refresh()` → `back()`, with `refresh()` coalescing at 32 ms so the focused screen
reloads and background tabs mark dirty.
**Reduce clicks:** the FAB's hardcoded `kind=expense`, and itemized buried under *More options*.
**Automate:** `smartCategory` off by default means step 4 is manual for every new user forever.
**Missing validation:** the ±24 h duplicate check does **not** run on the Review commit path — so
importing a statement that overlaps a manually-logged expense produces a silent duplicate.

### FLOW-05 — Split by items
4 steps, real-time guardrails that block Next until resolved (unassigned amount, unbalanced
payers) — error *prevention* over error *messages*, which is the better pattern. The `04fa6ad` fix
resolved the "Must f.total" string; `itemized.tsx:380` now reads correctly.
**Recovery:** an unassigned amount offers a one-tap "Split ₹X equally" fix. Good.

### FLOW-06 — Settle up
Six entry points all converge on one screen with pre-filled params — the right architecture.
`computeTransferScopes` reuses the same `simplify` as every other balance surface, so no third
balance definition exists.
**Completion is where it ends too early.** The flow completes by *recording* that money moved. The
user must then leave, open a UPI app, retype the amount, find the person, and pay. **`V2-03`.**

### FLOW-07 — View the dashboard
Covered in §3.2.

### FLOW-08 — Import → Review → commit
The longest flow and the best-instrumented. 13 steps, a genuine staging table, five distinguishable
failure messages, snapshot-based undo on every commit path, category learning that always asks.
**Missing validation:** as in FLOW-04, no duplicate detection at commit.
**Missing feedback:** per-row Confirm has no clear visual acknowledgement (`UX_AUDIT.md` Low #13).

### FLOW-09 — Set and track a budget
Clean. Four entry points, `?category=` deep-link with auto-scroll, one query per distinct cadence,
one `budgetHealth` threshold source (≥100 red, ≥80 amber).
**Missing:** the re-plan surface (`V2-07`) and the paid-vs-share reconciliation (§3.8).

### FLOW-10 — Fund a savings goal
Manual funding is explicit and clear (the sheet states where the money comes from *before* you
commit — good). Scheduled funding advances the anchor only for periods actually funded, which is
the correct way to avoid double-funding after a gap.
**Decision point that is not offered:** the overspend raid. It happens, then tells you. `V2-10`.

### FLOW-11 — Back up and restore
Highest-consequence flow, handled with real care: a destructive-style confirm naming the backup's
date, a standing warning under the rows, typed error classes, and wrong-passphrase deliberately
indistinguishable from corrupt so an attacker learns nothing.
**The unrecoverable-by-design passphrase is the right call** (a Keychain-derived key dies with the
phone). But nothing in the create flow tests that the user can actually reproduce the passphrase,
and nothing warns that a backup made with a forgotten passphrase is indistinguishable from no
backup at all. **`V2-02`.**

### Unnumbered flows

- **Review commit** — genuinely the strongest flow in the app; see §3.15.
- **CSV round-trip** — per-group export re-imports through the same pipeline. The demo-row filter
  matches on **hardcoded signatures**, which will drift against `seedDemo.ts` the first time the
  demo data changes. A test asserting the two agree costs almost nothing. **`V2-16`.**
- **Recurring catch-up** — `materializeDueOccurrences` on boot and foreground, surfacing an amber
  Home banner after 30+ days closed. A well-handled edge case most apps get wrong.

---

## 5. Competitor Comparison

Anchored on `COMPETITIVE_ANALYSIS.md` (46 apps, 2026-07-28) and reorganised **by our feature**.
Only new or changed findings appear here; that doc's landscape tables are not reproduced.

### 5.1 What changed since 2026-07-28 — and one adoptable win

**Splitwise tightened its free tier hard.** As of 2026, free users are capped at **3 transactions
per day** (a global cap across all groups), see ads, and lose receipt scanning, currency
conversion, charts, and transaction search to Pro at **$4.99/mo or ~$49.99/yr — ₹2,499/yr in
India**. That is a material shift in BudgetSplit's favour and it is not in the existing analysis.

*Why it matters:* the "we give away more than rivals, uncapped" story is now dramatically stronger
than when it was written. BudgetSplit's free, unlimited transaction logging plus receipt scanning
plus charts plus search directly answers a paywall a user hits on **day one, at three
transactions**. **Adopt:** nothing. **Do:** use it in positioning. A ₹2,499/yr comparison point in
INR is a far sharper marketing line than "$40-50/yr".

**A direct India-first splitting competitor now exists that the 46-app sweep missed.**
Niptao is purpose-built around **UPI deeplinks and Indian group dynamics** — explicitly positioned
against Splitwise on the grounds that Splitwise has no UPI support. Coupl is doing the same for
Indian couples. The India-focused-splitter lane the strategy section calls the moat is no longer
empty.

**And this is the adoptable win — `V2-03`.** `COMPETITIVE_ANALYSIS.md` §4's don't-build list rules
out "Splitwise Pay-by-Bank/Tink or in-app real money movement" because it *"requires becoming a
financial intermediary with licensing/custodial risk."* **That reasoning is correct for Splitwise's
mechanism and wrong for the one that matters here.** A **UPI intent handoff** is categorically
different:

- The app constructs a `upi://pay?pa=<vpa>&pn=<name>&am=<amount>&cu=INR&tn=<note>` URI and calls
  `Linking.openURL`. The OS opens the user's own UPI app with the payment pre-filled; the user
  confirms with their own PIN.
- **Money moves peer-to-peer between two users' own bank accounts.** BudgetSplit never touches
  funds, holds no float, and is not in the flow. No licence, no PA/PG registration, no server, no
  custodial risk — and no contradiction with local-first, because nothing leaves the device except
  a URI the OS consumes locally.
- Payer-side deeplinking is the well-documented standard mechanism, with app-specific variants
  (`gpay://upi/pay`, `paytm://upi/pay`, `bhim://upi/pay`) if a chooser is undesirable.

**Cost to build:** one nullable `upi_vpa` column on `person` — and note `person.mobile` already
exists with **zero readers** (`src/db/schema.ts:220`), so even the migration is arguably already
paid for. Then an optional field in `PersonNameSheet`, and a "Pay ₹X via UPI" button on the settle
screen that deep-links, returns, and pre-fills the settlement the app already knows how to record.

**Why this is the highest-leverage item in the review:** it converts the app's single "Major"
competitive gap (`COMPETITIVE_ANALYSIS.md` §2 vs Splitwise: settlement execution) into an
advantage, in the one market where the rail exists and Splitwise's own feedback board has an
**open, unresolved** UPI request. It closes the loop on the moat feature, for roughly a week of
work, with zero recurring cost and zero architectural compromise. Everything else on the
competitive wishlist needs a backend, a licence, or a platform Apple blocks.

**One caveat to verify before scoping:** confirm the reference/response-handling behaviour on iOS
specifically — the richest documented `UpiTransactionResponse` handling is Android-side. If iOS
returns nothing, degrade honestly: hand off, return, and *ask* "did that go through?" rather than
assuming success. Never record a settlement the app did not observe.

### 5.2 Our features vs the field

| Our feature | Best-in-class | Our position | Adopt? |
|---|---|---|---|
| Splitting math | Splitwise (parity) | **Parity or ahead** — multi-group partial allocation is a Splitwise open request | No — we're ahead |
| Itemized splitting | Splitwise Pro (OCR, **now paywalled**) | **Ahead** — per-item split modes + free OCR | No |
| Settlement execution | Splitwise Pay / Niptao (UPI) | **Behind, and now closeable** | **Yes — `V2-03`** |
| Recurring lifecycle | Ours | **Ahead** — Settle Up paywalls this | No |
| Debt simplification | Splitwise (same greedy heuristic) | Parity | No |
| Bank/UPI ingestion | Money View (SMS), INDmoney (AA) | **Behind** — externally blocked | Not choosable |
| Auto-categorisation | Copilot (~30 corrections to near-perfect) | **Behind** — no merchant strings to learn from | Partially — see §6 |
| Recurring detection | Monarch (~80% from history) | **Behind by default** — detector built, `recurringSuggest` off | **Yes — flip the default** |
| Forecast / what-if | Monarch (**paid** Plus tier) | **Ahead** — ours is free | No |
| Health score | Jupiter (on complete data) | **Design ahead, data behind** | Disclose — `V2-06` |
| Savings automation | None auto-transfer | **Ahead, and risky** | Add consent — `V2-10` |
| Budget re-plan | YNAB "Edit Plan" | **Missing** | **Yes — `V2-07`** |
| Couples / household | Honeydue (3 visibility tiers) | **Structurally impossible** | Framing only — `V2-05` |
| Data durability | Everyone (institutional) | **Behind** — manual, opt-in | **Yes — `V2-02`** |
| Multi-currency | Tricount, Splid (free, 150+) | Deliberately absent | No — INR-first is the position |
| Privacy | Nobody can match "no bank login ever leaves your phone" | **Ahead** | Market it |

### 5.3 Do not copy

Everything on `COMPETITIVE_ANALYSIS.md` §4's don't-build list still holds, **with the one
correction in §5.1** (UPI *intent handoff* is not the same category as Splitwise Pay, and should be
moved off that list). Reaffirming the two most tempting:

- **Do not paywall recurring or categories**, however well it worked for Settle Up (+30% YoY).
  Those are currently free and load-bearing in our story, and Splitwise's 3-per-day cap has just
  made "uncapped and free" worth more, not less.
- **Do not build lending/insurance cross-sell.** Zero conflict-of-interest in the insights is the
  app's only structural moral high ground, and every Indian competitor has traded theirs away.

**On monetisation:** V3 per `TAGS.md` FLOW-03 — correct. But decide the *shape* now, because §5.1
just changed the answer. A one-time IAP unlock (Splid's model) remains the architecturally clean
fit; and with Splitwise Pro at ₹2,499/yr in India, a one-time ₹499-799 unlock is an unusually
strong position to hold. Do not write the code. Do write the price down.

---

## 6. Missing Features

Every item checked against the invariants in the prompt's §E; nothing here requires a backend
unless explicitly flagged.

**Must-have before V2**

| Gap | Why | ID |
|---|---|---|
| Correct + honest "share of income" | The app states one wrong number confidently | `V2-01` |
| Backup that survives an inattentive user | Total, silent, permanent data loss | `V2-02` |
| UPI settle handoff | Closes the moat feature's loop; no licence needed | `V2-03` |
| Actionable global recurring | The management surface can't manage | `V2-04` |
| Completeness disclosure on Insights | Confident numbers on incomplete data | `V2-06` |

**Nice-to-have**

- **Household / couples persona** at onboarding (`V2-05`) — copy-level, mechanically already works.
- **Budget re-plan surface** (`V2-07`) — the YNAB "Edit Plan" moment; my-share makes it *more*
  needed, not less.
- **Paid-vs-share reconciliation** on budget screens — "you paid ₹2,000, your share was ₹650".
- **Explicit "all settled up"** on a settled group (`UX_AUDIT.md` #12).
- **Import history** so an overlapping re-import is detectable.

**Power-user**

- Amount/date filters in Search, reusing `reviewFilter.ts` rather than a third filter model.
- Group search/sort once group counts grow past ~15.
- Bulk edit on committed transactions (Review has bulk; the ledger doesn't).
- CSV *scheduled* export, not just on-demand.

**Automation** (all local, all invariant-safe)

- Flip `recurringSuggest` to on — the detector is built, tested, and wired; it is off by default,
  which means Monarch's ~80% recurring-detection advantage is being conceded by a boolean.
- Merchant-level learning from *imported* descriptions. `smartCategoryLearn` currently learns from
  typed titles; import rows carry real merchant strings and `recordCorrection` already runs on
  Review. The signal is there and mostly unused.
- Auto-archive dormant groups after N months.

**AI** — bounded by the existing egress decision, not expanded

- The Gemini proxy already exists. The honest next use is **not** a chatbot (§4's don't-build) but
  extending receipt extraction to merchant + date + total, which the founder already scoped as V3.
- Implement the documented-but-missing **Mistral fallback** (§19) before the free-tier quota bites.

**Reporting / search / filtering / bulk** — see power-user above; the theme is that **the best
filter, the best bulk actions, and the best undo all live inside `/review`** and nothing else in
the app can reach them.

**Collaboration** — structurally blocked. Do not partially build it. `COMPETITIVE_ANALYSIS.md`
§5.1's verdict stands: a bolted-on sync layer without an account/consent model is worse than none.

**Settings**

- A "what's this for?" affordance on onboarding stage 5's four numbers.
- Currency row is a hardcoded `INR` no-op — either label it as fixed or remove the row.

**Security**

- `person.email` / `person.mobile` / `person.remote_uid` are dead columns on the one table holding
  identity-adjacent data. `mobile` is the natural home for a UPI VPA (`V2-03`); the other two
  should be documented as reserved or dropped.
- Backup passphrase has no strength hint and no confirm-you-remember-it step, on a flow whose
  failure mode is permanent.

---

## 7. Systemic UI/UX Improvements

Per-screen rendered friction lives in `UX_AUDIT.md` and is not repeated. This section covers only
system-wide issues, judged against `AGENTS.md` §1-§12.

**Already fixed in `04fa6ad`** — FAB overlap (6 instances), Settings status-bar overlap, both
broken template strings, the over-budget/you-owe colour collision. Those were the four High items
and they are done, with the one residue noted in `V2-11`.

**Systemic issues that remain:**

1. **The design system is documented better than it is enforced.** `AGENTS.md` prescribes
   `IconCircle`, `SheetModal`, `PrimaryButton`, `SectionCard`, one token path. Adoption is partial
   by explicit policy ("extract opportunistically"): 43 `IconCircle`-shaped sites, **39 files still
   importing the `src/constants/*` back-compat shims**, three structurally different collapsibles.
   Opportunistic migration is a defensible policy but it has no convergence signal — nothing tells
   you whether the gap is closing or widening. A lint rule that *fails on new* legacy imports while
   tolerating existing ones would make the policy self-enforcing. **`V2-17`.**
2. **Colour semantics carry more meaning than the palette has slots.** `expense`, `coral`,
   `healthRed`, `expenseTintDeep` and `settle` encode overlapping ideas (money out, danger, over
   budget, debt direction, settlement). The Groups-card collision was fixed by using
   `healthRed` for budget health, which is right — but the underlying rule ("red means what,
   exactly?") is nowhere written down, so the next screen re-decides it.
3. **`colors.textMuted` at 2.98:1** — below WCAG AA on the app-wide caption token (`N1`).
   **`V2-09`.**
4. **Truncation is a pattern, not four bugs.** Four confirmed instances plus
   `adjustsFontSizeToFit` on money fields. The root cause is fixed-width value text in
   settings-style rows. One `Row` primitive that wraps the label and truncates the *value* would
   close the class.
5. **No documented Dynamic Type behaviour.** Given #4, large accessibility text sizes are very
   likely to break rows. Untested.
6. **Empty-state philosophy applied inconsistently to *absence*.** §2 says never render bare
   absence — but a settled group renders *nothing* where a confirmation belongs, and decorative
   cards self-hide (correct) using the same mechanism as informative ones (not correct).
7. **Sheets are well consolidated.** Every sheet routes through `SheetModal`; the three remaining
   raw `<Modal>`s are correct. `review.tsx` declaring **8** inline sheets is a symptom of its size,
   not of sheet architecture.

---

## 8. Technical Product Review

### 8.1 Duplicate functionality

| # | Duplication | Reality | Call |
|---|---|---|---|
| 1 | Two recurring screens | `S-32` global (read-only, 151 L) vs `S-12` per-group (all actions, 268 L) | **MERGE** — `V2-04` |
| 2 | Two budget surfaces | *Not* duplication — the in-hub tab adds the "who paid what" fairness breakdown the standalone route never shows, and this is documented | KEEP both |
| 3 | Two OCR providers | Deliberate: accuracy vs privacy, user-selectable | KEEP |
| 4 | Two ForecastCards | `home/ForecastCard` vs `plan/ForecastCard`, distinct components | Verify they share the one `forecast` model; the doc says one model exists |
| 5 | Two token import paths | 39 files on the shims | `V2-17` |

### 8.2 Feature overlap — five filtered transaction lists

`search` · `report-transactions` · `history` · `personal` Activity · group Expenses. Five
implementations of "a filtered list of transactions", each with its own filter vocabulary:

| Surface | Filter model |
|---|---|
| `search` | text + kind + source |
| `report-transactions` | category + type + group + sort |
| `personal` Activity | scope (Personal / Groups / All / each group) |
| group Expenses | kind (All / Expense / Income / Settlement) |
| `review` | text + category + **amount range** + **date range** (`reviewFilter.ts`) |

Only `review`'s is genuinely capable, and it is the one users reach least. This is the clearest
consolidation opportunity in the codebase: one `TransactionList` + one filter model, configured
per surface. It is also a large refactor and **should not be attempted for V2** — but it should be
recorded as the intended direction before a sixth one gets written. **`V2-18`.**

### 8.3 Inconsistent behaviour

- **Duplicate detection runs on one of two write paths** — Quick Add yes, Review commit no.
- **Four preference stores**: AsyncStorage flags, `lib/settings.ts`, the `settings` table, and
  `ReminderPrefs` as a JSON blob. Each has a documented reason; together they mean "where is this
  setting?" has four answers.
- **`?focus=` is supported by `S-12` and not passed by `S-32`** — capability present, unused.

### 8.4 Scalability

| Risk | Evidence | Horizon |
|---|---|---|
| Whole-year all-category read | `category/[name].tsx:73` (`DEBT-06`, `S-16`) | degrades with history; V3 |
| 3-year search scan | `search.tsx:24`, debounced 150 ms | fine now |
| `review.tsx` at 1029 LOC | grew 52 lines past the tracked 977 | now |
| Gemini free tier is app-wide | §19; cut 50-80% in late 2025 | breaks on growth — `V2-13` |
| `PRAGMA foreign_keys` OFF, hand-rolled cascades | won't-fix, documented | each new delete path |

### 8.5 Maintainability — and the one meta-problem

The engineering practices here are strong: pure logic in `src/lib` with real tests, `useScreenData`
owning every loader, one `simplify`, one `budgetHealth`, one `forecast`, `docCoverage.test.ts`
failing on an undocumented route, `featureFlags.test.ts` failing on a flag that gates nothing.
Guard tests instead of vigilance is exactly the right instinct.

**Which is why the remaining gap is specifically about numbers.** The flag count has drifted three
times (12 → 13 → actual 14, with `ARCHITECTURE.md:304` and `TAGS.md` F-33 both still wrong) and the
largest-screen LOC is stale by 52 lines. The existing guards assert *existence* and *coverage*;
nothing asserts *counts*. Given this repo's own history — `AUDIT_DOC_DRIFT.md` has 26 entries and
`DEBT_TRACKER.md`'s rule 4 exists because four docs rotted from exactly this — the fix should be
mechanical, matching how `DRIFT-26` was closed. **`V2-14`.**

---

## 9. The Cut List

The review's mandate was to name things to delete. Here they are, with what is lost.

> ⚠️ **Both §9.1 and §9.2 were deliberately NOT followed. Do not implement them as written.**
> They were argued from a correct diagnosis to the wrong remedy, and the record of that is more
> useful than a quiet edit. What shipped instead, and why, is in
> [`V2_FIX_PLAN.md`](./V2_FIX_PLAN.md) — see the Wave 3 notes.
>
> - **§9.1 (cut 14 flags → 7):** the count was never the problem. Five keys gated chart *fragments*
>   while six real surfaces had no switch at all. Cutting to 7 would have removed the fragments and
>   left the real gap. Shipped: **14 → 15**, fragments deleted, real surfaces gated, personas
>   composing them.
> - **§9.2 (delete `afford.tsx`):** the argument was really about *discoverability*, and an inline
>   verdict solves that without discarding the depth. Shipped: the screen **stays** and `BudgetNudge`
>   gained a one-line verdict from the same engine — one engine, two depths.

### 9.1 Cut 6 of 14 feature flags

**The argument.** 14 flags is 16,384 app configurations, none tested in combination. Five exist
only to hide a single card. Every flag is a permanent branch in a screen, a row in `features.tsx`,
a line in the invariant test, and a support question. The instinct — let users make the app as
minimal as they like — is good, but the implementation charges a permanent complexity tax for
configurability nobody asked for, and it flattens the one flag that genuinely matters
(`splitting`) into the same list as "show the donut".

| Cut | What's lost | Why it's worth it |
|---|---|---|
| `reportsDonut` | Hiding one chart on Reports | Reports *is* charts. A user who doesn't want the donut doesn't open Reports. |
| `reportsTrend` | Hiding the 6-month bars | Same. |
| `dashboardInsights` | Hiding the shift teaser inside ForecastCard | A flag gating a *fragment of a card* that another flag already gates. Two flags, one card. |
| `savingsInsights` | Hiding nudges on Plan + Insights | Decorative surfaces already self-hide when they have nothing to say. That is the correct mechanism; a flag on top is redundant. |
| `forecast` | Hiding Home's ForecastCard | Keep the card, cut the switch. It self-hides on `!forecast.ready` already. |
| `streak` | The streak card | Opt-in, **off** by default, and self-hides under 3 days — so it is invisible unless a user finds a switch to enable a card that then hides itself. Near-zero reach for a permanent branch. |

**Keep** `splitting` (structural — changes the tab bar), `savingsGoals`, `recurring`, `reminders`,
`healthScore` (all gate whole surfaces a persona legitimately doesn't want), and `smartCategory` /
`recurringSuggest` (genuine accuracy trade-offs the user should own — though both defaults should
flip, see `V2-19`).

**Result: 14 → 8 flags**, 256 configurations, and `features.tsx` becomes a list of real choices.
This contradicts nothing in `TAGS.md` — F-33's KEEP asserted every key *gates* something, which
stays true; it never asserted every key *earns* its place.

### 9.2 Merge `afford.tsx` into the Add flow

`S-33` is flag-gated **off**, reached only from a Plan header icon, and currently reports a wrong
number. Its actual job — "can I afford this?" — is answered at the moment of spending, and
`BudgetNudge` already occupies exactly that position in Quick Add with the same data source
(`getAffordSnapshot`). Fix the maths (`V2-01`), fold the verdict into the nudge, delete the screen
and the flag. **Lost:** a standalone what-if for a purchase you haven't started logging. **Gained:**
the feature reaches 100% of users instead of the fraction who find the switch.

### 9.3 Do not build (reaffirmed, with one exception)

Everything on `COMPETITIVE_ANALYSIS.md` §4 stands, **except** that UPI intent handoff should be
removed from the "real money movement" prohibition — see §5.1. It is not the prohibited category.

### 9.4 Explicitly NOT cut

Recorded so these stop being re-raised: the second budget surface (adds fairness data), the two
OCR providers (accuracy vs privacy), the bespoke Home hero (`U9`), the itemized wizard header
(`U10`), `search`'s missing pull-to-refresh (the list *is* the query), `storage.tsx` (dev tool,
7-tap gated), and the unrecoverable backup passphrase (the tradeoff that makes the feature work).

---

## 10. V2 Closeout Checklist

### Critical before V2 release

| ID | Problem | Impact | Solution | Cx |
|---|---|---|---|---|
| **V2-01** | "Share of monthly income" divides by a trailing-30-day sum of logged income (`savings.ts:428-438`) but is labelled as monthly income (`afford.tsx:165`); uncapped, so it renders >100%. **`UX_AUDIT.md` High #2's paise/rupee diagnosis is wrong** — both operands are paise | The one place the app states a wrong number with confidence, on a money decision — the exact failure `afford.tsx:27-34` forbids | Use the onboarding income figure (or the salary recurring rule) as the denominator; relabel to what is actually measured; clamp the display; hide the row when the denominator is not trustworthy | **L** |
| **V2-02** | Backup is opt-in, manual, and passphrase-gated; the nudge needs `flags.reminders` + a granted notification permission + a dev build. A user who skips onboarding permissions is never reminded | Total, silent, permanent loss of the data users trust the app with most — `COMPETITIVE_ANALYSIS.md`'s #1 flagged risk, mitigated but not closed | In-app (not notification-dependent) backup prompt after N transactions or D days; passphrase-confirm step at create; make "you have never backed up" visible on Settings rather than only absent | **M** |
| **V2-03** | Settle-up records that money moved but cannot help move it, in a UPI-first market where Niptao now competes exactly here | Closes the moat feature's loop; the single "Major" competitive gap becomes an advantage. No licence, no server, no custodial risk — the app never touches funds | Nullable `upi_vpa` on `person` (note `mobile` is already dead — `schema.ts:220`); optional field in `PersonNameSheet`; "Pay ₹X via UPI" on the settle screen → `Linking.openURL('upi://pay?…')` → return → pre-fill the settlement. **Never record a settlement the app did not observe** — ask, don't assume | **M** |
| **V2-28** | Insights sums **every** member's shares (`insightsData.ts:42-50`) while `homeData.ts:100` / `savings.ts:416` / `upcoming.ts:21` all filter to me. Internally consistent — `insightsData.ts:106`'s budget is *also* group-total — but inconsistent across screens | Home says "you spent ₹X", Insights says "your groups spent ₹Y". Both defensible; showing both to one user is not. Violates the app's my-share invariant | Move spend **and** budget together: my-share for `catMap`, `getMyGlobalBudgetStatus` for the budget. Follow `budget.ts:77-79`'s optional-`meId` pattern; don't add a fifth inline variant | **M** |
| **V2-06** | Insights' forecast, velocity hero and 10/20/30% what-if carry no completeness disclosure, though `TotalMoneyCard` and `HealthSheet` now do | A confident projection on inevitably-incomplete manual data is the app's most reputationally risky surface | Extend the existing `HealthSheet` "based on N transactions" pattern to the forecast and what-if; degrade the framing when the sample is thin. Do this *after* `V2-28` — no point disclosing the confidence of a number about to change basis | **L** |

### High priority

| ID | Problem | Impact | Solution | Cx |
|---|---|---|---|---|
| **V2-04** | `plan/recurring.tsx` (151 L) has no pause/resume/skip/stop and drops `?focus=` when navigating to the screen that does | The natural management surface can't manage; two clicks + a visual search to act on a row you already tapped | Pass `?focus={ruleId}` (one line), then lift the four actions up from `S-12` | **L→M** |
| **V2-05** | No household/couples persona; couples are buried in `split`'s description (`Onboarding.tsx:83`) | Highest-retention segment in the category, served by a trip-shaped mental model. `COMPETITIVE_ANALYSIS.md` §3's only still-open quick win | Fourth intent + copy + a `personaDefaults` patch. Mechanically already works | **L** |
| **V2-07** | No re-plan surface and no rollover when a category blows up mid-month | My-share makes overruns *less* predictable (an itemized bill can assign an unexpectedly large share); the only feedback is a red bar with no action | A "rebalance the rest of this month" affordance from the over-budget state on Home and the group Budget tab | **M** |
| **V2-10** | An **unlocked** goal is still silently auto-raided; the notice is after the fact. `COMPETITIVE_ANALYSIS.md` §7 asked this and it was never answered | No competitor auto-transfers between goals, so there is zero evidence users read this as reassuring. "Unlocked" is a trap default | Either confirm before raiding, or make the post-hoc notice unmissable and default new goals to protected | **L** |
| **V2-08** | Reports is reachable only via Settings → *Export & reports* | A whole analytics surface filed under data management | Surface it from Plan or Insights alongside the existing header icons | **L** |
| **V2-19** | `recurringSuggest` and `smartCategory` both default **off**, conceding Monarch's ~80% recurring detection and all category automation by a boolean | Two built, tested, wired automations that most users will never enable | Flip both defaults after §9's flag cut; keep them switchable | **L** |

### Medium priority

| ID | Problem | Solution | Cx |
|---|---|---|---|
| **V2-27** | `loadInsightsData` reads the clock directly (`insightsData.ts:24-27`) while every comparable lib injects it (`upcoming.ts:36`: *"`nowMs` is injected, never read from the clock here"*). Result: 2 of 633 tests are **calendar-flaky** — they fail on days 1–14, pass 15–31 | `main` is red for half of every month, and the screen can't be tested deterministically at all. Not a production bug: excluding future-dated spend from a pace calculation is correct | Add a `now = new Date()` param and thread it through `insightsData.ts:31,56-58,70`; have the two tests pass `midMonth()` the way the passing tests already do. Don't change `midMonth()` — other suites use it | **L** |
| **V2-09** | `colors.textMuted` 2.98:1 on `bgCard`, below WCAG AA, on the app-wide caption token (`N1`) | A design decision that has been deferred once; make the call | **M** |
| **V2-13** | Gemini free tier is app-wide not per-user, cut 50-80% in late 2025; the documented Mistral fallback is not implemented (§19) | Implement the fallback, or default to `device` before any user growth | **M** |
| **V2-14** | Flag count has drifted three times (`ARCHITECTURE.md:304` and `TAGS.md` F-33 say 12; code says 14); `review.tsx` tracked at 977, actually 1029; and `FEATURES_AND_FLOWS.md:749` cites the FAB at `_layout.tsx:79` where it now sits at `:99` — found while verifying this review's own citations | A guard test asserting documented counts match source — the `DRIFT-26` pattern. Line-number citations are the harder case: either drop them in favour of symbol names, or accept them as approximate | **L** |
| **V2-15** | No notification deep-link routing; verified no `addNotificationResponseReceivedListener` anywhere. §18 already says "worth adding" | Route a reminder tap to `/reminders` or the specific rule | **L** |
| **V2-16** | The CSV demo-row filter matches hardcoded signatures that will drift against `seedDemo.ts` | A test asserting the two agree | **L** |
| **V2-20** | ±24 h duplicate detection runs on Quick Add but not on the Review commit path | Reuse `findRecentDuplicate` in `planCommit` | **L** |
| **V2-21** | `review.tsx` at 1029 LOC and growing; `F-18`/`S-19`/`DEBT-11` all DEFER decomposition for want of a safe split | A LOC ceiling test to stop the growth, rather than a fourth manual paydown | **L** |
| **V2-11** | `Onboarding.tsx:443` still renders `that's — of your take-home` when income is set and budget is empty | Guard the block on `budgetNum > 0` too | **L** |
| **V2-12** | Total Money conflates spendable cash, investments and credit; the Available-Money vs Net-Worth split is agreed (`COMPETITIVE_ANALYSIS.md` §7) and needs no server | Reclassify — cheaper before users build muscle memory | **M** |

### Future (V3+)

| ID | Item | Note |
|---|---|---|
| **V2-17** | Lint rule failing on *new* legacy token imports while tolerating the 39 existing | Makes "opportunistic migration" self-enforcing |
| **V2-18** | Consolidate five filtered transaction lists onto one `TransactionList` + `reviewFilter.ts` | Large; record the direction before a sixth is written |
| **V2-22** | Windowing for `category/[name].tsx`'s whole-year read (`DEBT-06`, `S-16`) | Degrades with history |
| **V2-23** | Merchant-level category learning from imported descriptions | The signal exists and is mostly unused |
| **V2-24** | Decide the monetisation *shape* (one-time IAP, ₹499-799) without writing code | §5.3 — Splitwise Pro at ₹2,499/yr in India changes the framing |
| **V2-25** | `person.email` / `remote_uid` — document as reserved or drop | Dead columns on the identity table |
| **V2-26** | Multi-currency, if ever — store amount + currency + **historical** rate | `COMPETITIVE_ANALYSIS.md` §7's design is correct; get it right on day one |

**Externally blocked — not prioritisable:** `F4` GPay export format · `F5` Gmail OAuth CASA ·
Account Aggregator partner. Per project notes the sequence is: finish UI/UX → free Testing-mode
OAuth pilot → CASA/AA later. Nothing in this plan depends on them, which is deliberate.

### Found after publication (`V2-29` … `V2-36`)

> **Why this section exists.** These IDs were assigned *while executing* the plan, not during the
> review sweep, and for a while they were cited in `V2_FIX_PLAN.md` while being **defined nowhere** —
> the exact drift this document keeps catching in others. `docIds.test.ts` now fails the suite if any
> cited `V2-nn` has no definition here, so it cannot recur.
>
> None of these came from reading code in the abstract. Five came from **running the app or the
> suite**, which is the honest argument for doing both: the review sweep did not find one of them.

| ID | Problem | How it surfaced | Status |
|---|---|---|---|
| **V2-29** | `makeViewId` derived an id from the view's name, so two saved views named alike **overwrote each other** — saved views are keyed by that id | Wave 1's fake-clock sweep | ✅ fixed — `v_${uuid()}` |
| **V2-30** | Two test fixtures were calendar-dependent: `setMonth(0)` **is** the selected month in January, so the fixture only failed in one month of twelve | Wave 1's fake-clock sweep | ✅ fixed |
| **V2-31** | The fake-clock harness that found `V2-29`/`V2-30` existed only as a scratchpad config — a bug-finding mechanism nobody could re-run | Noticed while writing up Wave 1 | ✅ fixed — `npm run test:calendar`, 7 pinned dates |
| **V2-32** | The afford engine judged only cash, buffer, category and income share — no history, no necessity, no month projection, no goal cost | Owner request, 2026-08-05 | ✅ fixed — 4 → 7 axes |
| **V2-33** | Home paired **my-share** spend with the **all-groups** budget, showing 33% where the true figure was 40% — the same class of bug as `V2-28`, one screen over | Running the app on device | ✅ fixed |
| **V2-34** | The UPI handoff fired `upi://pay` on both platforms. Android is right (the OS chooser resolves it); **iOS has no chooser for custom schemes at all**, and its UPI apps mostly register their own scheme, so the button could dead-end on a phone with four UPI apps — then blame the user with *"No UPI app found"* | Owner asked "what if there are multiple UPI apps?" | ✅ fixed — per-app probe + picker on iOS |
| **V2-35** | "Insights" rendered as an always-on **Core** pillar *and* as a live switch further down the same screen — a straight contradiction, introduced by the Wave 3 flag rework | Simulator pass | ✅ fixed — Core badge removed |
| **V2-36** | Feature Management's intro still read *"Off by default keeps the app clean"* after the rework made 14 of 15 flags default **on** | Simulator pass | ✅ fixed |

**`V2-34` is the one worth remembering.** It was not found by reading the code, the tests, or this
review — it was found because someone asked what happens with more than one UPI app installed. The
unit tests passed throughout, and still do; they assert URI construction, which was never wrong. The
wrong assumption was that one platform's behaviour was every platform's.

---

## 11. Prioritised Action Plan

Sequenced into waves. Every item is independent of the three external blockers.

### Wave 1 — Correctness & trust (the actual V2 gate)

Ship nothing else until these are done. All four are about the app not telling users things that
aren't true.

| # | ID | Item | Cx |
|---|---|---|---|
| 1 | `V2-27` | Inject `now` into `loadInsightsData`; make the 2 flaky tests deterministic → `main` green | L |
| 2 | `V2-28` | Move Insights spend **and** budget to my-share, together | M |
| 3 | `V2-01` | Fix + relabel share-of-income; clamp; hide when untrustworthy | L |
| 4 | `V2-06` | Completeness disclosure on forecast / velocity / what-if | L |
| 5 | `V2-11` | The last em-dash | L |
| 6 | `V2-02` | Backup that survives an inattentive user | M |

*Rationale: 1 first, because `main` is red half of every month and nothing else can be verified
against a flaky suite. Then 2 before 4 — there is no point disclosing the confidence of a number
that is about to change basis. 3 and 5 are the remaining cases of the app stating something false.
6 is the only unbounded-consequence risk left.*

*Execution detail for all of Waves 1–2 lives in [`V2_FIX_PLAN.md`](./V2_FIX_PLAN.md); this section
is the ranking, not the worklist.*

### Wave 2 — The moat

| # | ID | Item | Cx |
|---|---|---|---|
| 5 | `V2-03` | UPI settle handoff | M |
| 6 | `V2-04` | Actionable global recurring (`?focus=` first — one line) | L→M |
| 7 | `V2-05` | Household persona | L |
| 8 | `V2-19` | Flip `recurringSuggest` + `smartCategory` defaults | L |

*Rationale: `V2-03` is the highest-leverage item in the review — it converts the one "Major"
competitive gap into an advantage for about a week of work, no licence, no server. 6-8 are cheap
wins that make already-built things reachable.*

### Wave 3 — Scope reduction

| # | ID | Item | Cx |
|---|---|---|---|
| 9 | §9.1 | Cut 6 flags (14 → 8) | M |
| 10 | §9.2 | Merge `afford` into `BudgetNudge`, delete screen + flag | M |
| 11 | `V2-14` | Guard test on documented counts | L |
| 12 | `V2-21` | LOC ceiling on `review.tsx` | L |
| 13 | `V2-08` | Reports discoverability | L |

*Do this **after** Wave 2, not before: cutting flags touches many screens and would collide with
`V2-03`/`V2-04`. Note 9 and 10 together delete code — the only wave that makes the app smaller.*

### Wave 4 — Product depth

| # | ID | Item | Cx |
|---|---|---|---|
| 14 | `V2-07` | Budget re-plan surface | M |
| 15 | `V2-10` | Overspend-raid consent | L |
| 16 | `V2-12` | Available Money vs Net Worth | M |
| 17 | `V2-09` | The `textMuted` contrast decision | M |
| 18 | `V2-13` | OCR quota fallback | M |
| 19 | `V2-15`, `V2-16`, `V2-20` | Notification routing · CSV signature test · duplicate check at commit | L |

### Deferred to V3

`V2-17` · `V2-18` · `V2-22` · `V2-23` · `V2-24` · `V2-25` · `V2-26`, plus the three external
blockers when they unblock.

---

### What this review deliberately did not do

- **Re-open settled calls.** `TAGS.md`'s DEFERs on `review.tsx` decomposition (`F-18`, `S-19`,
  `DEBT-11`), the whole-year category read (`S-16`, `DEBT-06`), and premium tier (`FLOW-03`) are
  accepted. `V2-21` and `V2-22` work *with* those deferrals rather than against them.
- **Re-litigate the invariants.** Local-first, no paywall today, per-group budgets, INR-only,
  no-bank-feed subscriptions, protected animations — all treated as decisions, not gaps. The one
  place this review pushes back on a recorded conclusion is `COMPETITIVE_ANALYSIS.md` §4's
  don't-build reasoning about real money movement, and §5.1 argues that explicitly rather than
  quietly.
- **Copy the sibling docs.** No `UX_AUDIT.md` friction bullet, `COMPETITIVE_ANALYSIS.md` §3 row,
  or `DEBT_TRACKER.md` open row is reproduced. They are cited by ID.

**Sources for §5's web pass:**
[Splitwise pricing 2026](https://usefairsplit.com/blog/splitwise-pricing/) ·
[Splitwise free vs Pro 2026](https://www.areweeven.com/blog/splitwise-free-vs-pro-2026) ·
[Splitwise Pro price India 2026](https://niptao.app/en/blog/splitwise-pro-price-india-2026) ·
[Best UPI bill-splitting apps India](https://niptao.app/en/blog/best-upi-bill-splitting-apps-india-2025) ·
[UPI budgeting for Indian couples](https://coupl.money/blog/upi-budgeting-couples-india) ·
[UPI native intent integration guide](https://ems-ltd.global/upi-native-intent-integration/) ·
[upi_pay deep-link scheme reference](https://github.com/drenther/upi_pay/blob/master/README.md) ·
[UPI payment flow: URI construction to result verification](https://dev.to/vaibhav_shakya_e6b352bfc4/upi-payment-flow-on-android-from-uri-construction-to-result-verification-1mc7)
