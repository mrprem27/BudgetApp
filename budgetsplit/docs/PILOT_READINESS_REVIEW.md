# Pilot Readiness Review — 2026-08-18

A point-in-time report, not a tracker. Every item still open is a row in
[`DEBT_TRACKER.md`](DEBT_TRACKER.md); this document explains what was found, what
was decided, and what changed. Branch: `feat/pre-pilot-consistency`.

## Why this pass happened

The app was close to the end of V2 with a small friend-group pilot imminent —
real daily use, not a demo. The complaint that started it: the app felt like a
set of stitched-together features rather than one product. The same concept
behaved differently on different screens, some displayed numbers came from
incomplete or superficial logic, and onboarding asked eight questions of which
only three changed anything the user could see.

Method: three audits (docs/trackers, a code-wide consistency + real-math sweep,
and a first-run trace) plus a benchmark pass over how Simple, YNAB, Monarch,
Splitwise, Tricount and the two validated financial-health instruments
(CFPB Well-Being Scale, Financial Health Network's FinHealth Score) actually
solve the same problems.

## The rule this pass ran on

**A number the app shows must be computed from the data the app has, or not be
shown.** Every finding below is an instance of that, and the two most common
failures were: a real engine fed incomplete inputs, and a rubric presented as a
measurement.

---

## Real-vs-fake verdicts, engine by engine

| Engine | Verdict before | What changed |
|---|---|---|
| `lib/forecast.ts` — month-end projection | **Real.** Bühlmann credibility shrinkage, correctly derived, one model shared by three screens | Kept. Now floored by committed bills it already knew about but ignored |
| `lib/savingsEngine.ts` — goal funding + overspend raid | **Real.** Calendar-difference periods, capped allocation, deliberate raid ordering | Untouched |
| `lib/cash.ts` — cash position | **Real.** Card spend as debt, baseline-delta model, JS/SQL parity locked | Extended: repayment is now modelled (below) |
| `lib/afford.ts` + `getAffordSnapshot` — "Can I afford this?" | **Real engine, starved inputs.** Four independent axes, honest reasons; but committed bills read one group and one occurrence per series | Inputs fixed; the cash gate is now Safe-to-Spend |
| `lib/financialHealth.ts` — 0-100 score | **A rubric, not a model.** Hand-picked point values, unexplained thresholds, and neutral defaults that paid an **empty database 59/100 "Fair"** | Rebuilt on the FinHealth 4-pillar structure with a minimum-data gate |
| `lib/safeToSpend.ts` — Safe-to-Spend | Did not exist | New. Home's headline |

Clean on inspection, no action: `SheetModal` adoption (52 files), the
`getMyExposure`/`settleScope` money-owed layer, the category global migration
and `Others` fold, and the `PayMethod` enum/picker layer.

---

## Findings by theme

### 1. The same question answered differently

- **Share math was re-implemented ~12 times** with two disagreeing fallbacks
  (not-in-split → `0` in analysis code, → the full amount in projection code),
  and "the transaction's total" had four implementations. Search summed
  *payments* for expenses, so it printed a different total than Reports for the
  same row. → One `splitMath`: `myShareOf` (analysis), `myShareOrTotal`
  (projection, documented as such), `myPaidOf`, `txnTotal`.
- **Two split engines disagreed on a zero.** `computeShares` treated `0 shares`
  as "excluded"; `splitByMode` coerced it to a full share — so the same saved
  split owed different amounts in Add vs Review. → One engine (`splitByMode`),
  `0` excludes, matching the Splitwise convention. `computeShares` is now an
  adapter over it.
- **Four split-label vocabularies** and three cadence-word helpers (two of which
  silently dropped `recur_interval`, so "every 3 months" read as "monthly"). →
  All derive from `constants/enums.ts`.
- **Recurring rendered four unsynchronised ways**, two of them skip-blind — and
  so were reminders, which pushed *"Rent renews tomorrow"* for an occurrence the
  user had explicitly skipped. → One skip-aware path everywhere.

### 2. Numbers computed from partial inputs

- **Afford could not see shared-group bills.** It read recurring rules from the
  personal group only, while `/plan/recurring` and Home's upcoming list looped
  every group — so my share of the flat's rent was invisible to the one screen
  whose job is "do I have money left after committed bills". It also counted one
  occurrence per series, undercounting every weekly or daily bill.
- **The forecast ignored bills it already knew about.** A straight line to
  month-end that never included the ₹22,000 rent rule due on the 28th.
- **`recurringMonthlyEquivalent` passed unknown cadences through unchanged**, so
  a one-off could be summed into a "monthly" total; `custom` rules (which repeat
  every *N days*) were counted as flat monthly.
- **Itemized bills never captured a pay method** — at the SQL layer, both insert
  and update dropped it — so a card-paid restaurant bill was booked as cash out.
  Voice capture had the same hole despite the detector existing.
- **Import guessed categories from the seed list**, defeating `smartCategory`'s
  own contract ("never guess a category they don't have") and able to assign a
  category the user had renamed or deleted.

### 3. Business-logic / entity-model gaps

- **Card debt had no way down.** `creditUsed` only ever grew between manual Plan
  edits — for a pilot of real daily use, a number that drifts monotonically away
  from reality. → Modelled (below). *Accounts as entities* remains deferred.
- Categories are still strings, not IDs; `INCOME_LANDING` still has no reader.
  Both are tracker rows, not pilot blockers.

### 4. Onboarding produced almost nothing

Of eight input-bearing steps, three had a visible effect within the first
minute. The income answer became a recurring rule that no screen displayed (the
global recurring screen filtered to expenses) and that no engine could use for
up to 30 days. The budget became a preference string read by one sentence two
screens deep. Added people became contacts but never a group, so the Groups tab
still said "No groups yet" to the user who had just listed their flatmates. The
persona card said *"All features stay available"* while the `split` persona
silently disabled five. Home then re-offered "Set a monthly budget" and "Add
people you split with" to a user who had just done both.

---

## Decisions taken

| # | Decision | Rationale |
|---|---|---|
| D1 | Recurring shows **my share** on personal surfaces; whole bill + "your share ₹X" on group surfaces | The only basis whose totals sum honestly with budgets and afford |
| D2 | Onboarding's budget stays `budget_target`, but Home's pace bar and the health engine read it when no category budgets exist | Makes the answer visible without re-introducing the phantom `Total` category that was rejected before |
| D3 | ≥1 person added → a real group, named on the step | Fixes "added people, nothing happened" |
| D4 | Feature carousel deleted | Longest stage, asked nothing, changed nothing |
| D5 | An explicit `0` share **excludes** that person | Matches Splitwise; silent coercion to a full share was the surprising reading |
| D6 | `recurringMonthlyEquivalent`: typed to `RecurFreq`, no cadence → `0`, `custom` → ×30/interval | A one-off is not a monthly commitment |
| D7 | Card repayment: **built now**, simple version | The pilot is real daily usage; a drifting credit figure was unacceptable. Full accounts model still deferred |
| D8 | Health score: **rebuilt** on FinHealth's 4 equal-weighted pillars + minimum-data gate | Validated instruments use equal weights, named tiers, and refuse to score incomplete data |
| D9 | `txnTotal` = payments, falling back to shares | Payments is the side every kind fills |
| D10 | **Safe-to-Spend is Home's headline** | Simple Bank's proven formula; the one number that answers "can I spend this?" |

---

## What Safe-to-Spend is

```
StS = liquid cash
    − my share of bills still due before month-end
    − goal contributions still due this cycle (unfunded portion)
    − what I owe people, net of settlements
```

The first three terms are Simple Bank's formula. The fourth is ours and no
benchmark app has it: in an app that also splits bills, money sitting in your
account that is really your flatmate's is not safe to spend. `getMyExposure`
already computed it; it had simply never been subtracted from anything.

It is one assembly (`db/queries/spendPower.ts`) with two readers — Home's hero
and Afford's cash gate — so the two screens cannot disagree by construction.
The figure may be negative; that is the honest answer, shown in red, with a
tap-through breakdown naming every subtraction.

## What the health score is now

Four equal-weighted pillars, each 0-100 from real ledger data: **Spend**
(90-day keep-rate, budget pace), **Save** (cash runway, goal funding),
**Borrow** (card balance + owed money against income), **Plan** (bills covered,
budget/goals defined). Tiers are FinHealth's: Vulnerable 0-39, Coping 40-79,
Healthy 80-100.

Two rules carried over from the validated instruments:

1. **Equal weights.** No published instrument justifies unequal ones.
2. **No score without data.** Below 30 days of history, one logged income, and
   10 transactions, there is no number at all — the ring shows a lock and opens
   an "add X to unlock" checklist. Factors that genuinely don't apply (no
   budget, no goals) leave the numerator *and* the denominator, so absence of
   data can never earn points.

---

## Verification

Every phase gated on `npx tsc --noEmit` + the full jest suite; the calendar
matrix (`npm run test:calendar`) ran clean after the recurrence changes. Suite
at the end of the pass: **97 files, 1517 tests, green.**

Regression tests were written to fail with their fix reverted — the standing
rule. The ones that matter: skip-blind reminders, zero-share splits (both
engines), search totals, empty-database health score, afford's multi-occurrence
and shared-group expansion, import categorising against the user's catalog,
`recurringMonthlyEquivalent('once')`, the Safe-to-Spend subtraction terms, the
card-repayment SQL/JS parity pair, and itemized pay-method persistence — that
last one caught a real gap the plan had not predicted (the SQL layer dropped the
column on both insert *and* update).

`finalizeOnboarding` has preservation-style coverage: a skipped answer removes
only its own artifact and leaves every other write intact.

### Not verified here — device only

The pilot pass is the device test. Flagged specifically:

- **Home's hero now leads with Safe-to-Spend** — the single biggest visual change.
- **Health scores change for everyone** under the 4-pillar model, and new users
  see a locked ring instead of a number.
- **Group recurring totals switched basis** (whole bill with "your share"
  beneath) and the forecast will jump for anyone with several recurring bills.
- **The onboarding flow end-to-end**, including the hero routing: the logo
  animation and its block are byte-identical, and the new "Skip intro" is a
  sibling overlay — but only a device shows how the two feel together.
- **Saved splits containing an explicit `0`** now exclude that person where
  Review previously gave them a full share.

## Still open

See [`DEBT_TRACKER.md` § Deferred by the pre-pilot consistency pass](DEBT_TRACKER.md)
— accounts as entities, the full date/currency formatter sweep, the
`category_global_v1` migration rehearsal, the `src/constants/*` shim imports,
`help.tsx` N2, the Insights empty-state CTA, pay method on `TransactionRow`,
sync-readiness columns, and the duplicate `is_me` risk (F5).

Unchanged and still governing the pilot: `V2_LAUNCH_CHECKLIST.md` (CASA and AA
are out of scope), and the demo-seed rule — `seedDemo.ts` must not ship enabled.
