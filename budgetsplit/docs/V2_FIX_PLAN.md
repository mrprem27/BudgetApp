# V2 Fix Plan — Waves 1–4

> **What this is.** The execution worklist for [`V2_PRODUCT_REVIEW.md`](./V2_PRODUCT_REVIEW.md)'s
> Waves 1–4. The review is the *argument*; this is the *worklist*. If you want to know **why** an
> item exists, read the review. If you want to know **what to do**, read this.
>
> **Scope:** 27 items across four waves — 10 as originally planned, plus `V2-29`…`V2-36` found
> while executing (five of those by *running* the app or the suite, not by reading code). **Wave 4
> and V3 remain out of scope here** — see [Out of scope](#out-of-scope).
>
> **Conventions** (from [`DEBT_TRACKER.md`](./DEBT_TRACKER.md)):
> 1. Every row cites `file:line`. **A claim without evidence gets deleted, not debated.**
> 2. **Never delete a row** — strike it through in place with the date when it lands.
> 3. **Verify before you believe a row.** These line numbers were correct on 2026-08-05 against
>    `main` @ `1d7f256`; the review found three separate cases of stale line refs elsewhere in this
>    repo's docs, so re-check before trusting one.
>
> **Status:** `open` · `🚧 in progress` · `✅ done` · `⏸️ blocked`

---

## TLDR

| # | ID | Fix | Cx | Status |
|---|---|---|---|---|
| **Wave 1 — correctness & trust** — ✅ **complete 2026-08-05** ||||
| 1 | ~~`V2-27`~~ | ~~Inject `now` into `loadInsightsData`; kill 2 calendar-flaky tests~~ | L | ✅ done |
| 2 | ~~`V2-28`~~ | ~~Move Insights spend **and** budget to my-share, together~~ | M | ✅ done |
| 3 | ~~`V2-01`~~ | ~~Afford: real income denominator, honest label, clamp, hide~~ | L | ✅ done |
| 4 | ~~`V2-06`~~ | ~~Completeness disclosure on velocity / forecast / what-if~~ | L | ✅ done |
| 5 | ~~`V2-11`~~ | ~~Guard the last em-dash~~ | L | ✅ done |
| 6 | ~~`V2-02`~~ | ~~Backup safety net that doesn't depend on notifications~~ | M | ✅ done (partly pre-existing) |
| — | ~~`V2-29`~~ | ~~**Found during Wave 1:** `makeViewId` collides → saved views overwrite~~ | L | ✅ done |
| — | ~~`V2-30`~~ | ~~**Found during Wave 1:** two calendar-dependent test fixtures~~ | L | ✅ done |
| **Wave 2 — the moat** — ✅ **complete 2026-08-05** ||||
| 7 | ~~`V2-03`~~ | ~~**UPI settle handoff**~~ | M | ✅ done |
| 8 | ~~`V2-04`~~ | ~~Global recurring: `?focus=` + the 4 actions~~ | L→M | ✅ done |
| 9 | ~~`V2-05`~~ | ~~Household / couples persona~~ | L | ✅ done |
| 10 | ~~`V2-19`~~ | ~~Flip `smartCategory` + `recurringSuggest` defaults~~ | L | ✅ done |
| — | ~~`V2-33`~~ | ~~**Found on device:** Home paired my-share spend with all-groups budget~~ | L | ✅ done |
| **Wave 3 — scope reduction + the afford engine** — ✅ **complete 2026-08-05** ||||
| 11 | ~~`V2-32`~~ | ~~**Richer afford engine** — history stats, necessity input, projections, goal impact~~ | L | ✅ done |
| 12 | ~~`V2-14`~~ | ~~Flag-count drift guard + fix the two stale counts~~ | L | ✅ done |
| 13 | ~~`V2-21`~~ | ~~`review.tsx` LOC ceiling (stop the growth, don't re-pay the debt)~~ | L | ✅ done |
| 14 | ~~`V2-08`~~ | ~~Reports reachable from Plan, not only from a Settings export row~~ | L | ✅ done |
| — | ~~`V2-31`~~ | ~~Make the calendar check a repo script (`npm run test:calendar`)~~ | L | ✅ done |
| — | ~~`F7`~~ | ~~**Closed as a side effect:** receipt scanning had no flag, so Scan couldn't be hidden~~ | L | ✅ done |
| **Wave 3 addendum — found after the plan was written** ||||
| 15 | ~~`V2-34`~~ | ~~**iOS has no UPI app chooser**; `upi://` may resolve to nothing even with UPI apps installed~~ | M | ✅ done |
| 16 | ~~`V2-35`~~ | ~~"Insights" rendered as an always-on Core pillar **and** a live switch~~ | L | ✅ done |
| 17 | ~~`V2-36`~~ | ~~Feature Management intro claimed "off by default" after the rework made it false~~ | L | ✅ done |

**The flag cut went the other way from the plan.** Wave 3 was scoped as "14 → 7 flags". What
shipped is **14 → 15**, and that is the better answer to the same complaint. The problem was never
the *count*; it was that five keys gated chart *fragments* (`reportsDonut`, `reportsTrend`,
`dashboardInsights`, `forecast`, `savingsInsights`) while six real surfaces — itemized splitting,
UPI settle, Insights, Reports, receipt scanning, import/review — had no switch at all. Cutting to 7
would have deleted the fragments and left the real gap. So the fragments went, the six real
surfaces got keys, and the personas now compose them into four genuinely different apps, which is
what the flags were for.

| **Wave 4 — product depth** — ✅ **complete 2026-08-05** ||||
| 18 | ~~`V2-09`~~ | ~~Caption contrast below WCAG AA on the app-wide muted token~~ | M | ✅ done |
| 19 | ~~`V2-13`~~ | ~~Cloud OCR quota has no fallback~~ | M | ✅ done |
| 20 | ~~`V2-15`~~ | ~~Notification taps go nowhere~~ | L | ✅ done |
| 21 | ~~`V2-20`~~ | ~~No duplicate check on the Review commit path~~ | L | ✅ done |
| 22 | ~~`V2-10`~~ | ~~Unlocked goals silently auto-raided~~ | L | ✅ done |
| 23 | ~~`V2-12`~~ | ~~Total Money conflates cash, investments and credit~~ | M | ✅ done |
| 24 | ~~`V2-07`~~ | ~~No re-plan surface when a category blows up mid-month~~ | M | ✅ done |
| — | ~~`V2-16`~~ | ~~CSV demo-row filter drift~~ | — | ❌ **INVALID — no such filter exists** |

**`V2-16` was a false finding, and no code was written for it.** It describes a demo-row filter
matching hardcoded signatures. That filter does not exist: `is_demo` was removed from all five
tables *before* this review was written, and `schema.ts:264-269` records why. Writing the proposed
test would have asserted agreement between two things, one of which is not there. It was carried in
from a stale project note rather than read from source — the one lapse against the review's own
rule that *"a claim without evidence gets deleted, not debated."*

**Two Wave-4 decisions worth recording**, both chosen over cheaper alternatives:

- **`V2-10` asks now.** Overspend used to move money out of goals during app boot and tell you
  after. It now *proposes* and Plan asks; `runSavingsMaintenance` still funds goals unattended,
  because that moves money **in** and the user set it up. Declining leaves cash negative, which is
  the honest picture — the overspend already happened, and covering it was only ever moving the
  shortfall somewhere less visible.
- **`V2-12` demoted credit.** Unused limit is not an asset and not a debt, so it appears in neither
  Available Money nor Net Worth — it is headroom, labelled *"borrowing, not money"*. The old single
  figure made a ₹2L card limit read as ₹2L of money, in an app whose job is telling you when to stop.

**Result after four waves:** `npx tsc --noEmit` clean · **740/740 jest, 58 suites** (was 633 with
2 failing) · `npm run test:calendar` green at all seven pinned dates — month starts and ends, a
leap day, and a new-year rollover.

---

## Wave 1 — correctness & trust

### 1. `V2-27` — inject the clock · `L` · open

**Problem.** `loadInsightsData` reads the clock directly (`src/lib/insightsData.ts:24-27`), while
every comparable lib injects it — `src/lib/upcoming.ts:36` documents *"Pure and deterministic —
`nowMs` is injected, never read from the clock here"*. Consequence: 2 of 633 tests fail on days
1–14 of the month and pass on 15–31.

**Not a production bug.** `screenData.test.ts:20` (`midMonth()`) dates fixtures on the 15th;
`insightsData.ts:37` fetches `monthStart … Date.now()`; a future-dated expense is correctly
excluded. Excluding future spend from a spend-to-date pace calculation is right.

**Do.**
- `loadInsightsData(db, opts)` → `loadInsightsData(db, opts, now = new Date())`; thread `now`
  through `insightsData.ts:31` (month bounds), `:56-58` (`dayOfMonth` / `daysInMonth`) and the
  forecast block at `:70`. `app/insights.tsx` keeps calling it with no third arg.
- The two tests (`screenData.test.ts:159-177`) pass `midMonth()` explicitly, matching the *passing*
  tests in the same file (`:37`, `:50`, `:66` already do `getBudgetAnalytics(db, grp, midMonth())`).

**Don't.** Change `midMonth()` itself — other suites depend on it.
**Reuse.** The injected-`now` idiom from `upcoming.ts:36` and `getBudgetAnalytics`.
**Done when.** `npx jest` green, and green again with the clock faked to the 1st **and** the 28th.

### 2. `V2-28` — Insights my-share · `M` · open

**Problem.** `insightsData.ts:42-50` sums `t.shares` for **every** member, while `homeData.ts:100`,
`savings.ts:416` and `upcoming.ts:21` all filter to me. Home says "you spent ₹X"; Insights says
"your groups spent ₹Y". Internally consistent (its `budget` at `:106` is *also* group-total) but
inconsistent across screens, and against the app's my-share invariant.

**Do — both halves, or neither.**
- **Spend:** `insightsData.ts:43`, `:47`, `:73` → my-share. Needs `meId`, which the function
  doesn't currently load; get it the way `homeData.ts:73` does (`persons.find(p => p.is_me === 1)`).
- **Budget:** `insightsData.ts:106` sums every group's `totalAllocated` → switch to
  `getMyGlobalBudgetStatus(db, meId)` (`src/lib/budget.ts`), already the documented my-share budget
  source per `FEATURES_AND_FLOWS.md` FLOW-09 step 6.

**Reuse.** `budget.ts:77-79` already models exactly this dual behaviour via an optional `meId` param
— follow that shape.
**Don't.** Add a fifth inline share variant. There are ~30 share-computation sites with at least
three different fallback semantics; consolidating them is `V2-18` (Wave 3) and **must not** be
attempted here.
**Watch.** `forecastActual`, `projectedTotal`, `shifts` and `whatIf` all derive from `catMap`, so
five numbers move at once. Figures will **drop** for anyone in a shared group — that is the intended
correction, not a regression.
**Done when.** Insights month spend equals Home's month spend for the same period, on demo data.

### 3. `V2-01` — afford's income denominator · `L` · open

**Problem.** `app/afford.tsx:165` is labelled "Share of monthly income" but divides by
`snap.monthlyIncome`, which is a **trailing-30-day sum of my logged income transactions**
(`src/db/queries/savings.ts:428-438`), uncapped. `UX_AUDIT.md` High #2 reported 417% and blamed a
paise/rupee unit bug — **that diagnosis is wrong**, both operands are paise.

**Constraint.** The trailing-30-day derivation is *deliberate* and documented at
`src/lib/settings.ts:74-77` and `src/lib/onboarding.ts:89-95` ("the afford engine derives income
from actual income transactions"). **Do not resurrect the removed `monthlyIncome` preference.**

**Do.**
1. Prefer the monthly equivalent of **active income recurring rules** — the salary rule
   `onboarding.ts:79-88` creates, which those comments call "the record" of the income figure.
2. Fall back to the existing trailing-30-day sum when no income rule exists.
3. Relabel `afford.tsx:165` to what is actually measured in each case.
4. Clamp the displayed percentage, and **hide the row** when the denominator isn't trustworthy.

**Reuse.** `recurringMonthlyEquivalent(amount, freq)` (`src/lib/recurrence.ts`) is already the single
source for cadence→monthly conversion. `AffordContext.monthlyIncome` already accepts `undefined` to
mean "don't engage this axis" (`src/lib/afford.ts:62`, `afford.tsx:45`) — use that for the hide case;
**no engine change needed.**
**Done when.** ₹5,000 against a ₹85,000 salary rule reads ~6%; a user with no income data sees no row.

### 4. `V2-06` — completeness disclosure · `L` · open

**Problem.** The staleness work shipped for `TotalMoneyCard` (`:29-31`) and the thin-sample note for
`HealthSheet` (`:57-58`), but Insights' velocity hero, forecast chart and 10/20/30% what-if carry no
disclosure at all — confident projections on inevitably-incomplete manual data.

**Do.** Extend `HealthSheet`'s existing pattern to those three surfaces: `txnCount` prop →
`lowSample = txnCount < 5` → a `sampleNote` reading "Based on N transactions logged {period}"
(`src/components/finance/HealthSheet.tsx:16,32,57-58`).
**Don't.** Invent a second disclosure vocabulary. Same copy shape, same threshold, same muted style.
**Sequencing.** After `V2-28` — disclosing the confidence of a number whose basis is about to change
is wasted work.

### 5. `V2-11` — the last em-dash · `L` · open

**Problem.** `04fa6ad` fixed `UX_AUDIT.md` High #1 by guarding the block on `incomeNum > 0`
(`src/components/system/Onboarding.tsx:437`), but the inner expression still renders `'—'` when
`budgetNum` is 0 — so entering income and looking at the budget step before typing shows
*"Heads-up: that's — of your take-home."*
**Do.** Guard on both, so the hint appears only once it can say something.

### 6. `V2-02` — backup safety net · `M` · open

**Problem.** Backup is built and good, but the only nudge is a local notification
(`src/lib/reminders.ts:124`) behind `flags.reminders` **and** a granted OS permission **and** a dev
build. A user who skips onboarding's permissions step is never reminded — and the failure mode
(lost phone) is total, silent and permanent.

**Do.**
- **Make absence visible.** The Settings → Backup & restore row shows "Never backed up" /
  "Last backup {ago}", read from `settings.backupAnchorAt()` (`src/lib/settings.ts:97`), which
  `app/settings/backup.tsx:39` already reads. Depends on no permission and no notification.
- **Passphrase confirmation.** `PassphraseSheet` in `create` mode gains a confirm field. On a flow
  whose documented failure mode is *permanent* unrecoverability, a typo is currently both
  unrecoverable and undetectable.

**Reuse.** The staleness-badge tone logic already built in
`src/components/finance/plan/TotalMoneyCard.tsx:29-31` (`Never updated` / `Updated {ago}` /
amber-vs-neutral) — don't write a second one.
**Don't.** Add automatic or cloud backup. Local-first is a locked invariant.

---

## Wave 1 — what actually happened (2026-08-05)

Recorded because three things differed from the plan above, and rule 3 cuts both ways.

### Two new bugs, both found by the calendar check rather than by reading code

- **`V2-29` — `makeViewId` collides.** `src/lib/reviewViews.ts` generated
  `v_${Date.now()}_${random(1e6)}`. Saved views are **keyed by this id**, so a collision silently
  overwrites a view. Pinning the clock reduced it to 200 draws from 1e6 — a ~2% birthday collision,
  which showed up as a 1-in-6 flake. Now `uuid` v4 per `AGENTS.md`. Verified 0 failures in 20
  pinned-clock runs, where the old form failed ~17% of the time.
  *This is a real production bug, not a test artifact: the test was asserting a property the
  implementation never had.*
- **`V2-30` — two calendar-dependent fixtures.** The `loadReportsData` year test derived
  `earlier` via `setMonth(0)`, which **is** the selected month every January — so the year-scoped
  ₹95,000 leaked into `monthSpent` and the suite would have failed for one month a year. Now pinned
  to fixed dates (Jun/Jan 2026). The two `loadInsightsData` fixtures were the originally-reported
  failure and now pass `now` explicitly.

### One planned item was already built

`V2-02`'s second bullet asked for a passphrase confirm field. **It already exists** —
`PassphraseSheet.tsx:58-68` has a confirm input, a mismatch error and a `MIN_LENGTH` check, plus the
never-stored warning. The review and this plan both asserted it was missing; neither had read the
component. Only the Settings-row half was actually needed, and that shipped. A strength meter beyond
`MIN_LENGTH` was considered and skipped as low value.

### One planned approach was wrong and changed during execution

The plan said to reuse `budget.ts:77-79`'s optional-`meId` pattern for the whole Insights screen.
Reading `getBudgetAnalytics` showed `meId` switches **spend** to my-share but leaves `allocated` at
the *group's* budget line — so passing it would compare my share against the group's allocation and
**under-report overspend**. `drivers` and `recommendations` were therefore left group-scoped
deliberately (they are findings about a group's budget line and are labelled with the group name);
only `monthSpend`/`catMap`/forecast moved to my-share, with `budget` switched to
`getMyGlobalBudgetStatus` so the pair still agrees. Documented at the call site.

### Notes for whoever picks up Wave 2

- **`V2-31`, the calendar check should be a repo script.** It found both new bugs and currently
  exists only as a throwaway config + an ES5 `Date` stub in a scratchpad. It must be ES5 (no
  `class`/spread): the setup file sits outside `rootDir`, so babel transforms it and any runtime
  helper it emits fails to resolve. Worth an `npm run test:calendar` looping a few pinned dates.
- **A shared my-share helper now exists** — `myShareOf` in `src/lib/splitMath.ts`, with the
  fallback-to-0 semantics Home and `savings` use. It is the first shared version of a calculation
  still inlined at ~30 sites with three different fallbacks. `V2-18` (Wave 3) should migrate the
  rest onto it; `lib/upcoming` deliberately keeps its own fallback-to-total and is documented as a
  non-caller.
- **`SampleNote`** (`src/components/finance/SampleNote.tsx`) now owns the "Based on N transactions"
  disclosure, extracted from `HealthSheet`'s only copy. Insights renders **one screen-level** note
  rather than one per card — velocity, forecast and what-if all rest on the same sample, so three
  copies would have been noise. Reuse it for any future projected figure.

---

## Wave 2 — the moat

### 7. `V2-03` — UPI settle handoff · `M` · open

**Why this is first among the Wave-2 items.** It converts the app's one "Major" competitive gap
(`COMPETITIVE_ANALYSIS.md` §2 vs Splitwise: settlement execution) into an advantage, in the one
market where the rail exists — and a direct India-first competitor (Niptao) now competes exactly
here. See `V2_PRODUCT_REVIEW.md` §5.1.

**Why it is allowed.** Money moves peer-to-peer between the two users' own UPI apps; the app never
touches funds, holds no float and is not in the flow. No licence, no server, no custodial risk.
This is **not** the "financial intermediary" category `COMPETITIVE_ANALYSIS.md` §4 rules out —
that entry is about Splitwise Pay / Tink and should be narrowed to say so.

**Do.**
1. **Schema.** Nullable `upi_vpa` on `person`, appended to the `MIGRATIONS` array — precedent at
   `src/db/schema.ts:219` (`ALTER TABLE person ADD COLUMN email TEXT`). Note `person.mobile` already
   exists with **zero readers**; add a purpose-named column anyway, because a VPA is not a phone
   number.
2. **Capture.** Optional VPA field in `src/components/finance/PersonNameSheet.tsx`, which already
   owns person-field constraints so rules can't drift between screens.
3. **Build the URI.** New pure `src/lib/upiIntent.ts` —
   `buildUpiUri({ vpa, name, amountPaise, note })` → `upi://pay?pa=…&pn=…&am=…&cu=INR&tn=…`.
   Amount is rupees with 2 decimals **in the URI only**; internally money stays integer paise.
   Convert at the boundary via `src/lib/money.ts`. Pure and unit-testable, per the `src/lib`
   convention.
4. **Wire it.** A "Pay ₹X via UPI" action in `src/components/finance/TransferBody.tsx` that
   `Linking.openURL`s the URI (precedent: `app/txn/[id].tsx:182`), then on return **asks** "did that
   go through?" and records the settlement only on confirmation, via the existing `recordSettlement`
   path.

**Non-negotiable.** Never record a settlement the app did not observe. iOS returns no reliable
transaction result, so the confirm step is the design, not a stopgap.
**Degrade honestly.** No VPA on a person → no button, and settling behaves exactly as it does today.
This is purely additive; the existing flow must not regress.

### 8. `V2-04` — global recurring becomes usable · `L→M` · open

**Problem.** `app/plan/recurring.tsx` (151 L) lists every recurring rule across groups and can act
on **none** of them, while `app/group/[id]/recurring.tsx` (268 L) has all four actions. Worse,
`plan/recurring.tsx:101` pushes `/group/{id}/recurring` and **drops the `?focus={ruleId}` param**
that screen already supports and highlights for 2.6 s — so you land on a list and hunt for the row
you just tapped.

**Do — two independently shippable steps.**
- **One line first.** Pass `?focus={ruleId}` at `plan/recurring.tsx:101`.
- **Then lift the actions.** Pause / Resume / Skip / Stop exist at
  `app/group/[id]/recurring.tsx:83-117` over `pauseRecurring` / `resumeRecurring` /
  `skipNextOccurrence` / `undoNextSkip` / `endRecurring`. Extract the handler set into a shared hook
  in `src/hooks/`, following `useGroupTxnActions.ts`'s precedent, and consume it from both screens.
**Don't.** Copy the handlers into the second screen — the two lists will drift.

### 9. `V2-05` — household persona · `L` · open

**Problem.** Onboarding offers `personal` / `split` / `both` (`src/lib/personaDefaults.ts:9,11`),
with couples buried in `split`'s description text (`Onboarding.tsx:83`: *"Groups, roommates,
couples"*). A couple splitting rent monthly is the highest-retention use case in the category and is
being served by a trip-shaped mental model. `COMPETITIVE_ANALYSIS.md` §3's only still-open quick win.

**Do.** A fourth `OnboardingIntent` + its flag patch (`personaDefaults.ts`) and a fourth card
(`Onboarding.tsx:82-83`).
**Keep the patch sparse** — `personaDefaults.ts:24` explains why writing every key would freeze
flags at day-one values and make future `DEFAULTS` changes unreachable.
**Note.** Mechanically the group model already supports this. This is copy plus a patch, not new
machinery.

### 10. `V2-19` — flip two defaults · `L` · open

**Problem.** `smartCategory` (`src/lib/featureFlags.ts:46`) and `recurringSuggest` (`:52`) both
default `false`. Both are built, tested and wired. So all category automation and Monarch's ~80%
recurring-detection equivalent are conceded by a boolean most users will never find.
**Do.** Flip both to `true`; keep them switchable.
**Verify.** `featureFlags.test.ts` asserts the gating invariant and will confirm nothing else broke.

---

## Verification

Per item: the **Done when** lines above. Overall:

1. `npx tsc --noEmit` clean · `npx jest` **green** (red today: 2 of 633; item 1 fixes it).
2. **Calendar check.** Re-run `jest` with the clock faked to the **1st** and the **28th**. This is
   the exact regression item 1 exists to prevent and a normal run cannot catch it.
3. **New tests, not just fixes.** `upiIntent.ts` (URI shape, paise→rupee boundary, missing VPA);
   the afford denominator (rule present / rule absent / thin window); the my-share basis change.
   All pure `src/lib` functions — where this repo's tests already live.
4. **Device pass, iOS Simulator.** The four visible changes: Insights numbers vs Home, afford's
   percentage, the Settings backup row, the UPI button's absent/present states. `tsc` and `jest`
   cannot see a wrong number rendered confidently, which is the whole class of bug this plan is about.
5. **Doc reconciliation, last.** Strike landed rows here and in `V2_PRODUCT_REVIEW.md`; update
   `FEATURES_AND_FLOWS.md` §12 (Insights basis) and §9 (settle handoff) because behaviour changed
   and that doc is the behaviour reference; narrow `COMPETITIVE_ANALYSIS.md` §4's money-movement
   entry to name Splitwise Pay/Tink specifically. **`docCoverage.test.ts` will not catch a changed
   description** — only a new route.

---

## Wave 2 — what actually happened (2026-08-05)

### One new bug, found only by running the app

**`V2-33` — Home compared my-share spend against every group's budget.** Fixing Insights
(`V2-28`) exposed it: Home read ₹75.05K budget / "33% used" while the corrected Insights read
₹62.55K / 40% for the same month. Home's `bAlloc` (`homeData.ts:142-150`) sums every group's
allocation, including budget for money other people spend, then pairs it with my-share spend —
so it **understated** budget usage on the app's most-used screen. Now uses
`getMyGlobalBudgetStatus`; both screens read ₹62.55K / 40%.

Deliberately **not** rewired into the health engine: that pairs `bAlloc` with `bSpent`
(group-total vs group-total), which is at least internally consistent. Rebasing the score changes
it for every existing user — a product call, not a bug fix. Worth deciding separately.

### Verified on device (iOS 26.5 simulator, demo data)

| Item | Evidence |
|---|---|
| `V2-28` + `V2-33` | Home and Insights both ₹25.1K spend / ₹62.55K budget / 40% |
| `V2-06` | "Based on 7 transactions logged this month." renders on Insights |
| `V2-01` | Row reads "Share of monthly income" (the `rule` path), sane value — not 417% |
| `V2-04` | Skip next / Pause / Stop render per row; row tap navigates via the new `?focus=` |

### NOT verified on device — check before release

- **`V2-03` UPI button.** Demo data has no `upi_vpa`, and the rename sheet couldn't be reached with
  synthetic taps. `buildUpiUri`/`isValidVpa` have 8 unit tests; the render path and `Linking.openURL`
  are unexercised. **Test manually:** add a UPI ID to a contact → Add → Transfer → pick them → the
  "Pay ₹X via UPI" button should appear and open a UPI app. Confirm the button is **absent** for a
  contact without a VPA.
- **`V2-05` household persona.** Needs an onboarding reset, which wipes demo state. 17 unit tests
  cover the patch; the fourth card's layout is unseen.
- **`V2-02` Settings backup row.** Scrolling was unreliable; it is a string swap and `tsc` passes.

---

## What actually happened — `V2-32`, the afford engine

Owner request, 2026-08-05: the verdict should use far more than cash-vs-bills. Every bullet below
was the pre-build scope; the **→** lines are what shipped.

- **History stats.** Beyond the existing 30-day category norm: volatility, how often this category
  overshoots, seasonality, typical basket size. `getAffordSnapshot` already loads a 30-day window —
  decide whether a longer one is worth the read cost (`category/[name].tsx` already fetches a year,
  and that is tracked as heavy under `DEBT-06`).
- **Necessity input.** A need/want/urgency control on the screen, feeding the verdict. New input, so
  it needs a default that doesn't nag — this is the "minimum friction" constraint.
- **Current projected.** Reuse `lib/forecast`'s month-end projection rather than a second model;
  `V2-28`'s lesson is that two models on one basis diverge visibly.
- **Future goals.** "This delays *Europe Vacation* by ~3 weeks" — needs `savingsEngine`'s funding
  rank, and must not imply the raid will happen silently (see `V2-10`).
- **Sequencing note.** `V2-01` deliberately left the engine (`lib/afford.ts`) untouched and only
  fixed the denominator and labelling, so this can be designed on a correct base.
- **Open question for the owner:** does this stay a standalone screen, or fold into Add's
  `BudgetNudge`? The review's §9 argued for folding it in because the standalone screen is
  flag-gated off and nobody finds it. A richer engine is a reason to reconsider that.

**→ What shipped.**

| Scoped | Shipped |
|---|---|
| History stats | 90-day window added to `getAffordSnapshot`, yielding a per-category **typical basket** (median, min 3 samples). Volatility and seasonality were **not** built — with 3 samples a variance estimate is noise, and it would have produced confident-sounding nonsense. Measured cost at 1500 txns: **18.2 ms**, so the window stayed. |
| Necessity input | Optional `Need · Want · Can wait` chips, **nothing preselected**. Unset drops the axis entirely, exactly as the category and income axes already behaved — zero added friction. |
| Current projected | Reuses `forecastMonthEnd`. No second model, per `V2-28`. |
| Future goals | `goalPacing` = first unfinished goal by `sort_order` with a real monthly rate → "sets *X* back ~N weeks". Copy says **delays**, never "we'll take it from" — `V2-10` is still open and the raid is still silent, so claiming otherwise would be dishonest. |
| Screen or nudge? | **Both.** One engine, two depths: the screen keeps the full breakdown, and `BudgetNudge` shows the single worst reason inline in Add, silent when the verdict is comfortable. The merge argument was really about discoverability, and the inline verdict solves that without discarding the depth. |

**Axes went 4 → 7** (`MonthAlreadyOver`, `DelaysGoal`, `UnusualForCategory` joined cash, buffer,
category budget/norm, income share). The invariant held throughout: **only cash can produce a hard
`No`.** Necessity softens exactly one axis — a `Need` that strains only the buffer stays
comfortable — and cannot override the cash gate. 42 new tests.

---

## Out of scope

Deliberately excluded, with their review IDs — do not scope-creep into these:

| Area | IDs |
|---|---|
| V3 | `V2-17`, `V2-18`, `V2-22`, `V2-23`, `V2-24`, `V2-25`, `V2-26` |
| Externally blocked | `F4` GPay format · `F5` Gmail OAuth CASA · Account Aggregator partner |

Nothing in Waves 1–4 depends on any external blocker — that is deliberate, so this plan could be
finished without waiting on a third party. **All four waves are complete; only V3 remains.**
