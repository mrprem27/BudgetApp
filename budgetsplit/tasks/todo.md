# Tasks — Merge, UPI redesign, and the open asks

`Plan: ./plan.md · Spec: docs/TRACKER.md + docs/FINDINGS.md · Predecessor: docs/history/TASKS-2026-09-SERVER-SYNC.md`

Standing gates, run for every task and not repeated below:

```
cd budgetsplit && npx jest            # all suites, including the doc and source guards
cd budgetsplit && npx tsc --noEmit    # app code; src/__tests__ is NOT typechecked
cd server/api && npx tsc --noEmit -p . # when the server changes
```

Every regression test is proven by reverting its fix and watching it fail (`AGENTS.md`). "DEVICE"
means your pass on the phone. I report the gates and flag risks, and I don't wait for you before
continuing.

---

## MASTER LIST — close-out, 2026-09-30 (this is the one to work from)

Everything asked in the last sessions, in one place. Status is honest: `[x]` is built, tested and pushed
or committed; `[ ]` is not.

### Done
- [x] Bug scan passes: server, import, UPI, voice, engine (`docs/SPEC-BUGSCAN.md`, ids SV/IM/UP/VP/EG/TP/TR/HB/FC/IR/UX)
- [x] Card due day held to month length, due-today, reference numbers not amounts (EG-2, IM-3)
- [x] "Safe to spend until <next year>": nearest payday, 60-day cap, year shown when not this year (EG-3)
- [x] Time picker: wheels no longer pull the sheet, minute snapped, tap-to-select (TP-1)
- [x] Help as bullets (HB-1) · Voice entry off Settings · Import button on Review (IR-1)
- [x] Forecast chart draws once measured (FC-1) · month-end forecast on the engine for Home/Plan/Insights
- [x] Plan in **Now / This month** zones
- [x] Asset moves read "Moved to / from …" everywhere; Reports says "Asset moves"
- [x] Afford's "How we got this" states the engine's real rules (TR-1)
- [x] Over-budget shows as a multiple (`1.01×`), percent up to 100 (UX-1)
- [x] Friends: payment rows say "You owe Aarav" / "Aarav owes you" (FR-1) · Group picker: most-used first (GR-1)
- [x] Backend deployed 2026-09-30 (D1 `magic_links.ip` applied first; live schema = repo) · demo data made consistent (one salary/rent a month, a real "you owe")
- [x] Demo **personas** on the dev screen: Salaried renter · 1 year (high confidence) · New user · 2 weeks (verdict held back) · Freelancer (irregular, 60-day horizon) · Student (owes friends, over budget) — `db/demoPersonas.ts`, states asserted in `demoPersonas.test.ts`
- [x] Navigation: **Home · Groups · [+] · Money · Insights**; Settings opens from the avatar on every tab

### Open — in this order (plan, 2026-09-30)

**A. Money tab restructure** (decided: three tabs, forecast moves to Insights)
- [x] **A1** `Overview | Assets | Goals` pills under the Money header. Assets = `AssetsSection` (extracted, shared with `/assets`). Goals = the goal list and its sheets. Each with an empty state and one main action
- [x] **A2** Month-end forecast card leaves Money (Insights owns it); Overview keeps Available money, Afford/Recurring rows, overspend prompt, Coming up
- [x] **A3** Guard: Money has the three sections; no ForecastCard on Money; `/assets` and the tab render the same component

**B. Forms and notes** (`docs/SPEC-FORMS-GROUP.md`)
- [x] **B1** Goal Add funds / Withdraw and the new-goal sheet on `AmountRow` in a `Card`
- [x] **B2** `GroupForm` (Edit group) to the card-grouped shape, one hint line
- [x] **B3** Notes: a transfer shows its note as the second line; `oneLine` trims and collapses; trimmed on save
- [x] **B4** Long-press for the full name on `ListRow` / `Chip` rows (`fullTextOnHold` exists)

**C. Backend**
- [ ] **C1** Card due day: a field on the card sheet + `money_profiles.card_due_day` (schema, sync map, server column) + live D1 ALTER first, then deploy

**D. Close out**
- [ ] **D1** SCREENS / SYSTEM docs for the new navigation, Money tabs, filters, headers
- [ ] **D2** Independent code review of the whole branch, then fixes
- [ ] **D3** Squash to a few commits, gates, push
- [ ] **D4** DEVICE (yours): headers on all four tabs, Money tabs, filters, group header, Scan & Pay with icons, Settings from Home avatar, time picker, demo personas

### Decisions taken (so they are not re-litigated)
- Asset ↔ liquid moves are internal movements, never expense or income; word is "Moved". Budget keeps a "moved to assets" line.
- Month-end spend = spent + engine everyday rate × days left + bills still due. Group analytics keeps its own model (a group has no personal rate).
- Plan: two labelled zones. Navigation: Money + Insights tabs, Settings under the avatar.
- Deferred on purpose: Android package targeting (U5), Phase 6 AI narration, cash-last-confirmed input (B-103).

---

## §0 · Device checks carried over from server sync — yours

From the onboarding / feedback pass:
- [ ] Fresh install → no flicker → the keyboard behaves → Name is required
- [ ] "Replay welcome tour" → relaunch behaves the same *(the row may go in `DQ-101`)*
- [ ] The focused field is never covered on the smallest supported phone
- [ ] The full onboarding; Plan and Recurring show exactly what was entered
- [ ] The New path and the Existing path (email → code → onboarding) both work
- [ ] An investment logged from Expense; Plan net worth unchanged
- [ ] Groups → Friends; create a group adding a new friend inline
- [ ] Home, Plan, a group and Settings all say Recurring / Upcoming / Reminders the same way *(see `DQ-99`)*

Sync, one phone:
- [ ] Sign in → reinstall → sign in → Home shows the same numbers, including Plan, Reports and a goal's balance
- [ ] Airplane mode: add an expense, turn the network back on, and it uploads
- [ ] Sign out → the app is empty **but skips onboarding** (changed by `DQ-97`, 2026-09-26) → sign in → everything is back
- [ ] Airplane mode: add an expense, sign out → the warning names 1 change; Cancel keeps it
- [ ] Offline, syncing, up to date and failed states all read right
- [ ] The restore screen shows real progress

Sync, two phones, two accounts, one group:
- [ ] An expense on A appears on B
- [ ] "I paid you" waits on B
- [ ] B's rejection shows on A
- [ ] Removing B stops B's syncing
- [ ] B cannot edit A's transaction

---

## Phase 1 · Merge into my account (`DQ-94`)

- [x] **M1 · `mergeIntoAccount` + tests (M)**
  - Files: `src/lib/sync/firstSignIn.ts`, `src/db/queries/mergeLedger.ts` (exists, uncommitted), `src/db/queries/identity.ts` (`backfillQueue` exported), new `src/__tests__/mergeSignIn.test.ts`
  - Accept: 0 rejections · one Personal group on the server · same-email friend → one person, same-name friend → two · every phone transaction beside the account's · a clashing budget line keeps the account's · a third phone restores X ∪ Y exactly · failure mid-way → the phone byte-identical and unlinked
  - Verify: revert each fold (Personal, email, queue-what's-new) and watch its case fail
- [x] **M2 · Wiring and the third button (S)**
  - Files: `src/lib/sync/run.ts`, `src/lib/sync/index.ts`, `src/hooks/useEmailSignIn.ts`, `src/components/system/FirstSignInStep.tsx`, `src/components/system/onboarding/SignInStage.tsx`, `app/auth.tsx`, `app/settings/account.tsx`
  - Accept: three call sites, identical, each passing `onMerge`; Merge hidden when the phone is joined to a different account; the copy no longer says "can't be merged"
  - Verify: a source guard counts the call sites; `tsc`
- [x] **M3 · Group-column guard (XS)**
  - Files: new `src/__tests__/groupRemapCoverage.test.ts`
  - Accept: every `schema.ts` column naming `budget_group` is either in `GROUP_REMAP_COLUMNS` or special-cased in `foldPersonalGroup`
  - Verify: a fake extra column in a schema copy fails it
- [x] **M4 · Possible-duplicates review (S)** — decided 2026-09-26
  - Merge adds everything, then lists phone expenses that match an account expense by the app's existing duplicate rule (`findRecentDuplicate`: same group, category, amount, ±24 h, expenses only) — one list, each pair side by side: **Keep both** / **Remove this phone's copy**, plus **Remove all**
  - Files: a pure matcher reusing the rule (one place for it), `mergeLedger.ts` records the candidate pairs, a review sheet shown after Merge
  - Accept: an identical expense on both sides is listed, not dropped · two identical expenses on the *same* side are never flagged · removing a copy deletes the phone's row before it uploads (or soft-deletes it after) · the rule itself is not duplicated — a guard that there is one implementation
  - Verify: tests for all three; revert → the pair isn't found
- [x] **CP1** — done (bookkeeping catch-up, 2026-09-27): gates green (`countClaims.test.ts` confirms the query-module count already matches), committed and pushed as part of `a9863f2` — this row was just never checked off
- [ ] **CP1 DEVICE (yours)** — sign out → add two expenses + a friend whose email the account knows → sign in → **Merge** → both expenses present, the friend is one person → fresh install restores it all

## Phase 2 · "Same person as…" (`DQ-94` part 2)

- [x] **P1 · Server: placeholder → placeholder (M)**
  - Files: `server/api/sync/entities/merges.ts`, `src/__tests__/server/merges.test.ts` (new)
  - Accept: folding my own two placeholders works; a stranger's placeholder is refused (either side); `into_user` unchanged
  - Verify: the server suite (7 new cases); revert → 5 of 7 fail; deployed (`02fce28e-a4f2-4c91-8f92-ac1fe4b56787`)
- [x] **P2 · `combinePeople` (S)** — done 2026-09-25
  - Files: `src/db/queries/personRemap.ts` (`combinePeople`, `foldPerson`, `adoptPulledMerge`), new `src/__tests__/combinePeople.test.ts`
  - Accept: entries, splits, item assignments and trust move; the dropped person is gone on both phones; balances unchanged; refused for "me" and for two different accounts
  - Verify: 9 tests incl. a two-phone test on the real Worker; the money-sum fold, the group/trust dedupe and the pulled-side adoption are each revert-proven (temporarily removed → the expected case fails → restored, suite green)
- [x] **P3 · Person screen action (S)** — done 2026-09-26
  - Files: `app/person/[id].tsx` (a "Same person as…" row, shown only when `canCombine`), `src/components/finance/CombineSameSheet.tsx` (picker → confirm), `src/hooks/usePersonScreen.ts` (`canCombine`), `src/db/queries/persons.ts` (`combinableWith`, `countCombinableEntries`), new `src/__tests__/combinableWith.test.ts`
  - Accept: only eligible pairs are offered (excludes "me", itself, and anyone linked to a different account — the same check `combinePeople` enforces); the confirm names both people and the number of entries that move
  - Verify: `tsc` (app + server) clean; full suite 205/205 suites, 2630/2630 tests
- [x] **CP2** — done 2026-09-26 — gates green (above); no server change in P3, so nothing new to deploy (P1's deploy already covers `into_person`); commit · push done together with P3

## Phase 3 · The money engine (`docs/SPEC-ENGINE.md`)

Old F1 (cushion patch) dropped: the engine removes the threshold it would have fixed.

- [x] **EN1 · Snapshot + personas (M)** — done 2026-09-26
  - Files: `src/lib/engine/types.ts` (`FinanceSnapshot`), `src/db/queries/engineSnapshot.ts` (`getFinanceSnapshot`), `src/db/enginePersonas.ts` (5 personas via real write paths: `insertTxn`, `insertGroup`-equivalent personal-group write, `setCategoryBudgets`, `insertGoal`, `setMoneyProfile`), new `src/__tests__/engineSnapshot.test.ts`
  - Accept: parts equal today's `getSafeToSpend` on demo + all 5 personas (cash, exposure, goal funding, budgets each checked against a direct call to the exact function `engineSnapshot.ts` names as its source); each field pinned to its source in code comments and in the test
  - Verify: 12 tests; the income-vs-shares read, the recurring-linked marker and the personal-group write are each revert-proven (temporarily broken → the matching test fails → restored); determinism test (same persona twice → byte-identical history)
  - Gates: `tsc` clean (app + server); full suite 206/206 suites, 2642/2642 tests; `docs/SYSTEM.md`'s query-module count updated 26 → 27
- [x] **EN2 · First slice → dev screen (M)** — done 2026-09-26
  - Files: `src/lib/engine/behaviour.ts` (`everydayRate`, reusing `dailySpendTotals`/`typicalDailySpend` unchanged), `src/lib/engine/projection.ts` (`knownEvents`, `projectKnown`), `src/lib/engine/assess.ts` (`safeToSpendV2`), `src/lib/engine/types.ts` (+`Behaviour`, `KnownEvent`, `ProjectedDay`, `Projection`), `src/db/queries/engineSnapshot.ts` (+`futureOneOffs`), `src/db/engineDevDb.ts` (throwaway in-memory db per persona), `src/hooks/useEngineDevComparison.ts`, `app/dev/engine.tsx` (behind `DEV_TOOLS_ENABLED`, linked from `/storage`), new `src/__tests__/engineProjection.test.ts`
  - Decided during the build: income stays OUT of this slice's known events (deferred whole to EN5) — every persona has a payday inside 30 days, so crediting it here made "equals today's figure when no bill is in the horizon" unsatisfiable; without it, a dated walk and the old flat sum are provably identical at the horizon's end (commutative), so parity holds with or without a bill, and what's new is that the walk can name the exact day a bill lands, which the flat figure never could
  - Accept: equals today's figure on all 4 personas with no bill in the horizon, and (as it turns out) on the 5th too, which has one; the day a bill lands is named in the projection, verified precisely (not just "some day has it")
  - Verify: 23 tests across `engineSnapshot`+`engineProjection`; the day-bucketing, the income/shares read and the everyday-rate reuse are each revert-proven
  - Gates: `tsc` clean (app + server); full suite 207/207 suites, 2654/2654 tests; docs updated for the new route (`docs/SYSTEM.md` `SC-47`, `docs/SCREENS.md`, route count 45 → 46 in 6 files, `scripts/build-system-map.js`'s partition)
- [x] **EN3 · Uncertainty band (M)** — done 2026-09-26, **reverted 2026-09-26**
  - Files: `src/lib/engine/rng.ts` (`mulberry32`, `hashSnapshot` — new, §6 project structure), `src/lib/engine/behaviour.ts` (+`dailySample`, `NEED_CATEGORY_SEED`, `isNeedCategory`, `essentialFloor`), `src/lib/engine/projection.ts` (+`projectBand`), `src/lib/engine/types.ts` (+`PercentileDay`, `UncertaintyBand`, `Behaviour.essentialFloorPaise`), new `src/__tests__/engineUncertainty.test.ts`
  - Decided during the build: the Need/Want category seed (§5's defaults table) doesn't exist yet as stored data — nothing writes it until `EN4` — so `essentialFloor` uses a hardcoded name-matching seed (`NEED_CATEGORY_SEED`) against `constants/categories.ts`'s real catalog plus the generic "Food"/"Medical" synonyms free-text categories use; unlisted categories default to Want, matching the spec's own worked examples. `EN4` should reuse this same set rather than inventing a second one.
  - Accept: deterministic (same snapshot ⇒ `toEqual` across two calls); an empty sample and a real thin-data persona (`thinData`, < 30 qualifying days) both collapse the band onto `projectKnown`'s own path exactly (`paths: 0`, every day's P10/P50/P90 equal to that day's deterministic balance); 500 paths × a full year (365 days) well under budget; the P20 cautious low point falls as everyday-spend variance rises (same mean, only the day-to-day spread differs)
  - Verify: 5 new tests; the seeded-PRNG determinism, the thin-data collapse gate, and the P20 (not P50/P80) percentile choice are each revert-proven (temporarily broken → the matching test fails → restored, suite green)
  - Gates: `tsc` clean (app + server); full suite 208/208 suites, 2659/2659 tests; no doc-guard failures (no new query module or route)
  - **Reverted 2026-09-26** — `EN8`'s back-test found the band miscalibrated on every seed tried; see `docs/SPEC-ENGINE.md` §12b L7 and `project_engine_deterministic_only` memory. `rng.ts` and `engineUncertainty.test.ts` deleted; `projection.ts`/`types.ts`/`assess.ts`/`explain.ts` and the four dependent test files reverted to deterministic-only (`projectKnown` + the essential floor as the cushion). Row kept for history, per the doc's own rule.
- [x] **EN4 · `afford()` (M)** — done 2026-09-26
  - Files: `src/lib/engine/types.ts` (+`Purchase`, `AffordReason`, `AffordVerdict`, `AffordResult`), `src/lib/engine/assess.ts` (+`afford`, `purchaseEvents`, `overBudgetReason`, `evaluate`, `largestComfortableAmount`, `findEarliestComfortableDate`, `headlineFor`), `src/lib/engine/projection.ts` (`projectKnown`/`projectBand` +`extraEvents` param, `SIMULATION_PATHS` exported), `src/lib/engine/behaviour.ts` (+`defaultNecessity`), new `src/__tests__/engineAfford.test.ts`. Not a dev-screen task — `afford()` itself, tested directly; wiring a screen is `EN10`/`EN11`.
  - Scope decided during the build, each documented in code rather than silently dropped: no goal-delay Tight trigger and no 12-month-unfundable Not-affordable trigger yet (`goalForecast`/`EN6`, not built); the budget check only covers explicit **monthly** category budgets (daily/yearly needs `lib/budget.ts`'s `budgetEquivalent` wired in too — straightforward follow-up, not exercised by any accept criterion here); "more income never worse" isn't testable at all yet — there is no income lever in the projection until `EN5`. A `yearly` recurrence lands once inside the 30-day safety horizon, same as one-time — only `weekly`/`monthly` repeat inside it, so the "recurring is judged more heavily" test uses `weekly`.
  - A real limitation surfaced and documented, not fixed: for a **one-time** purchase, `earliestComfortableDate` (the `when: 'can-wait'` output) can never differ from today's answer in this income-less slice — every day's balance is non-increasing (`EN2`'s own file header), so the purchase's effect on the path's low point is the same flat amount wherever it lands. Only a **recurring** purchase's earliest-date search is meaningful right now (delaying it fits fewer occurrences before the horizon ends) — `EN5`'s income model is what actually unlocks it for one-time purchases.
  - Accept: verdict never improves as the amount grows; Comfortable ⟺ amount ≤ `largestComfortableAmount` whenever no budget line applies; "not affordable" tracks the after-purchase cautious low point exactly (< 0 ⟺ not-affordable); a weekly ₹2,000 habit is judged worse than a one-time ₹2,000; a ₹10,000 phone is Comfortable for the salaried persona, Tight/No for the stretched student persona; an explicit monthly budget overage is a standalone Tight reason even with ample cash; `defaultNecessity` matches `EN3`'s seed; a recurring can-wait purchase does find a later Comfortable date, a one-time one never does
  - Verify: 10 new tests; the cash-short gate, the monthly-budget-over check, and weekly recurrence actually repeating are each revert-proven (temporarily broken → the matching test fails → restored, suite green)
  - Gates: `tsc` clean (app + server); full suite 209/209 suites, 2669/2669 tests; no doc-guard failures (no new query module or route)
- [x] **EN5 · Income + receivables (M)** — done 2026-09-26
  - Files: `src/lib/engine/behaviour.ts` (+`incomeModel`, `repaymentModel`, `IRREGULAR_MIN_HORIZON_DAYS`), `src/lib/engine/projection.ts` (+`horizonDaysFor`, `incomeEvents`, `receivableDraws`; `knownEvents`/`projectKnown`/`projectBand` +`withIncome` param), `src/lib/engine/assess.ts` (`afford` +`withIncome` param, +`tippingReceivables`), `src/lib/engine/types.ts` (+`IncomeModel`, `RepaymentModel`, `TippingReceivable`; `FinanceSnapshot.receivables` now carries settlement amounts, not just dates), `src/db/queries/engineSnapshot.ts` (receivables extraction reads `settlementView(...).kind === 'transfer'`, not `asset_id` directly — `settlementSurfaces.test.ts` caught the first draft reading it raw), new `src/__tests__/engineIncome.test.ts`, new `src/__tests__/repaymentNeverSyncs.test.ts`
  - **`withIncome` is opt-in, defaulting `false`, everywhere** (`knownEvents`, `projectKnown`, `projectBand`, `afford`) — a deliberate scoping decision, not an oversight: `EN2`'s/`EN4`'s existing tests are locked to the income-less numbers (every persona has a payday inside 30 days, which is exactly why EN2 excluded income to begin with), and defaulting income "on" would have silently changed what they compute. `EN10`/`EN11` ("switch Safe-to-Spend"/"switch Afford") is where a real screen starts passing `withIncome: true`.
  - Two real limitations documented, not silently assumed away: (1) `FinanceSnapshot.receivables` has settlement dates+amounts but no paired *debt*-creation date, so `repaymentModel`'s Beta-binomial has no representable "failure" case (no forgiven/written-off state exists in this app) — every past settlement counts as a success, "always eventually settles, slowly" and "reliably settles fast" read identically today, and `delayDays` is the median gap between a person's own past settlements (a cycle-length proxy), not a true days-to-settle measurement; (2) variable (no-rule) income's inferred next date comes from the median gap between recent income rows — a real interpretation of an underspecified spec line ("Variable: the 20th percentile of recent amounts" names no date), not a literal reading.
  - Accept: `horizonDaysFor` extends past 30 to cover a further-out payday, and floors at 60 for `irregular` income (freelancer persona); `repaymentModel` gives exactly the Beta(1,2) prior (1/3) with no settlement history; a receivable that would close the gap to the floor is named in `afford()`'s `tippingReceivables`; `repaymentModel`/`RepaymentModel` are guarded from ever being referenced under `db/queries/`, `lib/sync/` or `server/api` (planted-and-removed canary proves the guard itself isn't vacuous)
  - Verify: 11 + 2 new tests; the Beta-binomial prior formula, the 60-day irregular floor, and the tipping-receivable detection are each revert-proven (temporarily broken → the matching test fails → restored, suite green)
  - Gates: `tsc` clean (app + server); full suite 211/211 suites, 2682/2682 tests; no doc-guard failures (no new query module or route)
- [x] **EN6 · True expenses, 12-month horizon (M)** — done 2026-09-26
  - Files: `behaviour.ts` (+`trueExpenses`, `monthlyAffordability`), `assess.ts` (`evaluate` +unfundable-commitment check, gated on `withIncome`), `types.ts` (+`TrueExpense`, `MonthlyAffordability`, `AffordReason.code` +`unfundable_commitment`), new `engineTrueExpenses.test.ts`
  - Scoped to yearly recurring rules + dated goals only (no `'quarterly'` value in `RecurFreq` to tell it from a plain custom rule — cut, not guessed at)
  - Accept: a ₹60k yearly fee accrues only 60k/months-until-due, never the lump sum; an unfundable future month makes `afford()` say No today for an unrelated small purchase; the unfundable reason and a cash-short reason never share one rupee figure
  - Verify: 4 new tests; the accrual math and the unfundable→No wiring are each revert-proven
  - Gates: `tsc` clean (app + server); full suite 212/212 suites, 2686/2686 tests
- [x] **EN7 · Confidence + explanation (S)** — done 2026-09-26
  - Files: `explain.ts` (new, E6), `assess.ts` (`afford` wires it in — `verdict: AffordVerdict | null`, `null` when thin data), `types.ts` (+`Confidence`, `Explanation`), new `engineExplain.test.ts`
  - Accept: thin-data persona (`thinData`) gets `verdict: null` + `explanation.missing`; every reason label across 4 personas × several amounts (incl. one swept to the exact Comfortable/Tight boundary, so `below_floor` is actually exercised) has no digit in it
  - Verify: 3 new tests; the null-out-on-thin-data wiring and the no-raw-numbers invariant are each revert-proven
  - Gates: `tsc` clean (app + server) for engine files — a **different, in-progress session's** Phase 4 (UPI) work is mid-edit in the same working tree and currently fails `tsc`/`deadComponents`/`coverage`; confirmed unrelated by diffing only engine files. Full suite otherwise 211/211, 2683/2683
- [x] **EN8 · Back-test + ship gates (M)** — closed 2026-09-29 via `npm run engine:backtest` (two hard gates, revert-proven: everyday spend ±25%, zero false "Not affordable"; both pass on 14 windows). The band it was written to gate was reverted (`EN3`), so the original coverage gates no longer apply
  - Ran 2026-09-26 against `EN3`'s band: miscalibrated on every seed tried, synthetic fixtures can't validate one honestly (real pilot data needed, §8). Response was reverting the band outright rather than patching it — see the `EN3` row and `docs/SPEC-ENGINE.md` §12b L7. Row stays open: the back-test itself did its job, but "gates pass" hasn't been satisfied by anything yet, since there's no band left to gate.
  - **Formalized as a command 2026-09-27**: `npm run engine:backtest` (`src/__tests__/engineBacktest.test.ts`) — stands at past dates per persona, projects with `projectKnown`, compares against the real low point that actually happened (`getCashPosition`'s `asOfMs`). Found `docs/SPEC-ENGINE.md` §12b L8 (the deterministic path carries a smaller version of L7's same bias — 1 false "Not affordable" in 6 sampled windows). Not hard-failing on it — same "6 synthetic samples can't validate this" reasoning as L7 — but it's real, printed, and tracked. **Your call recorded below (CP3 DEVICE).**
- [x] **CP3 DEVICE (yours)** — done 2026-09-27: dev screen checked on your real ledger, Old/New matched everywhere (expected — `withIncome` is off in this comparison, which makes the walk monotonic and Old/New provably identical; see the chat explanation). `engine:backtest` above found a small residual bias on synthetic personas (`§12b` L8) — not yet weighed against switching the live screens; see the question in chat.
- [x] **EN9 · Behaviour, the rest — reshaped 2026-09-26, not built as one task**
  - Decided 2026-09-26 (per [[feedback_avoid_overengineering]]): none of category model / seasonality /
    exceptional days / recency blend / fixed-variable / Need-Want-learning have a screen consumer until
    `EN12` — building all five now would be exactly the kind of unconsumed statistical machinery EN3's
    band turned out to be. Each sub-model gets built inside the specific `EN12` commit that actually
    needs it, not before. **Fixed vs variable** additionally needs a `description` field added to
    `FinanceSnapshot` (E1) that doesn't exist yet — parked until a signal actually asks for it, not built
    speculatively. **Need/Want learning** stays parked too — no per-category override storage exists yet
    (already `§12b` L1), and this doesn't change that. Row kept, checked off as "resolved by reshaping,"
    not by building the thing as originally scoped.
- [x] **EN10 · Switch Safe-to-Spend (S)** — done 2026-09-27 (backend swap only; the tap-through/O-103 redesign is separate, still open)
  - `getSafeToSpendV2` (`db/queries/spendPower.ts`) — `getFinanceSnapshot` + `safeToSpendV2`, breakdown parts re-derived from the projection's own known events by label instead of queried a second time. `homeData.ts`'s Home loader now calls it instead of `getSafeToSpend`. `getSafeToSpend` itself is untouched on purpose — still `useEngineDevComparison`'s independent "Old" column, and still what `afford.ts`/the Add-screen hint read until `EN11`
  - Accept: `spendPowerV2.test.ts` — every field (`amount`, `available`, `upcomingBills`, `cardRepayment`, `goalRemaining`, `netIOwe`, `everydaySpend`, `dailyRate`) matches `getSafeToSpend` exactly across all 5 personas + the no-user case; revert-proven (a planted label bug fails 3 of 6 cases)
  - Gates: `tsc` clean app+server; full suite 215/215, 2700/2700
- [x] **EN13 · Horizon to payday, salary counted (S)** — done 2026-09-27
  - `safeToSpendV2`/`afford` default to `horizonDaysFor` + `withIncome: true` (spec §2). `KnownEvent` +`kind`/`ref` (`bill|card|goals|owe|income|purchase|receivable`) so the breakdown files by kind, never by label. `getSafeToSpendV2` reads parts **up to the low point** — cash + income − bills − card − goals − owe − everyday, exactly, not close. `billsWithin` keeps the health score/month-end forecast on their own month-scoped meaning (the StS window no longer is one). `StsStrip`/`StsSheet`/the Add toast say "until <date>"; the sheet gains a Salary row when one lands before the low point
  - EN2's old-formula parity tests re-pinned to the old policy explicitly (`STS_HORIZON_DAYS`, `withIncome: false`) — they're still checking the engine reproduces EN2, not that EN2 is still the default
  - Accept: `spendPowerV2.test.ts` — parts sum to `amount` exactly (not approximately) on all 5 personas, revert-proven; card/goal/owe never fall through to `upcomingBills`
  - Gates: `tsc` clean app+server; full suite 215/215, 2703/2703
- [x] **EN11 · Afford on the engine, "number first" (M)** — done 2026-09-27
  - Earlier attempt 2026-09-27 stopped because the old layout was built on fields the engine doesn't have — resolved by the "number first" pick
  - `app/afford.tsx` rebuilt on `afford()`: amount → frequency chips (`ui/Chip`, not hand-rolled) → category chips → a single "Can wait" checkbox (replaces the Need/Want + Now/Can-wait pair — nothing in v1 reads Need/Want, spec §5) → verdict card (icon/title/headline with the low-point date, ≤ 2 reasons already phrased by the engine, "most you can spend comfortably", the can-wait date, a confidence line when not high) → "How we got this" disclosure (low point before/after, the floor) → Log it / Dismiss / Save toward a goal
  - Add screen's inline hint (`useAddTxnForm.ts`) and `BudgetNudge` switched to the same `afford()` — `BudgetNudge`'s reason line is now just `reasons[0].label`, no second copy of the sentence to keep in sync
  - `lib/afford.ts` + its test deleted; `HISTORY_DAYS` (its only export `getAffordSnapshot` still needed) moved into `db/queries/savings.ts` as `AFFORD_HISTORY_DAYS`
  - Accept: `engineAffordProperty.test.ts` — a source-scan guard that nothing imports `lib/afford`/`evaluateAfford` (revert-proven), and the Afford ⟺ Safe-to-Spend property swept across the boundary on all 5 personas (revert-proven)
  - Gates: `tsc` clean app+server; full suite 216/216, 2685/2685; fixed two guard failures along the way (`docs/SYSTEM.md`'s stale `src/lib` module count; a hand-rolled frequency-chip stylesheet replaced with `ui/Chip`, per AGENTS.md §9)
- [x] **EN12 · Low-point warning (S)** — done 2026-09-27 (the only signal kept, spec §2 cuts the rest)
  - `lib/engine/signals.ts` (new): `lowPointWarning` — a dip below the essential floor within 14 days, naming the day and the single biggest event that day (not the cumulative path). `null` below the floor's own cold-start minimum, silent past 14 days. Wired into `getSafeToSpendV2`'s `warning` field (same snapshot, no extra query) and rendered as one `Banner` on Home, above `StsStrip`, opening the sheet on tap
  - Accept: `engineSignals.test.ts` — silent cold-start, silent when comfortably above floor, fires with the right date/label/sign on a real dip, silent past the 14-day window, runs clean on all 5 personas; revert-proven
  - Gates: `tsc` clean app+server; full suite 216/216, 2712/2712
- [x] **B-103 · StS sheet tap-through (M)** — done 2026-09-29 (scope cut, see `tasks/plan.md`'s spec: "Cash last confirmed · Update" needs a new stored input, asked first, deferred)
  - `StsSheet.tsx`: every row with a positive claim opens the existing screen that shows its rows — Bills→`/upcoming`, Card→`/savings`, Goals→`/savings`, Owed→`/friends`, Salary→`/plan/recurring`. No new screens. A ₹0 row stays flat (no chevron)
  - Found and fixed a real demo-data bug along the way: `seedDemo.ts` logged salary as one-off transactions only, never a recurring rule — the engine (by design, EN5) never infers a payday without one, so "Salary before then" and goal-contribution-remaining both always read 0/absent on demo data. Added a recurring Salary rule; bumped one goal's rate above its funded-this-cycle amount so "Goal contributions" has real data to show
  - Gates: `tsc` clean app+server; full suite 216/216, 2685/2685 (including `demoRoundTrip.test.ts`)
- [ ] **CP3b** — gates, commit, push after each switch; device look at Home, Afford and Insights after EN11

## Phase 4 · UPI payment redesign (`DQ-98`)

Independent of Phase 3 (money engine) — zero file overlap (`finance/pay/*`, `ScanPaySheet` vs
`lib/engine/*`). Safe to run in a parallel session/branch.

- [x] **U1 · Logos (S)** — done 2026-09-26, scope adjusted
  - Files: `src/lib/upiIntent.ts` (+`UpiAppSpec.logo`, +`monogramFor`), `src/components/finance/pay/UpiAppIcon.tsx` (new)
  - **Shipped monogram-only, no real artwork** — decided with the user 2026-09-26. Every app's icon is a trademarked asset; neither downloading one from an unverified source nor fabricating a brand color to stand in for it belongs in this codebase (`feedback_stop_dont_fake_it`). `logo?: number` is the seam (`require('.../assets/upi/x.png')`), unset on every entry today. The "guard fails on a spec pointing at a missing file" half of the original accept criterion is dropped — with zero specs ever setting `logo`, that guard would be permanently vacuous, and the bundler already refuses a `require()` of a file that doesn't exist. Revisit both when real artwork is sourced.
  - Accept (revised): `monogramFor` is unique across all 13 apps + the generic entry (tested); `UpiAppIcon` renders the logo when set, the monogram otherwise
  - Verify: `monogramFor` unit tests in `upiIntent.test.ts`
- [x] **U2 · Default app (S)** — done 2026-09-26
  - Files: `src/lib/upiIntent.ts` (+`pickDefaultApp`), `src/hooks/useUpiHandoff.ts` (`target` now computed by it, replacing the old "preferred, else the sole installed app" fallback)
  - Real behaviour change: previously, 2+ installed apps with nothing remembered forced the `ActionSheetIOS` picker on *every* payment. Now `target` resolves to popularity order (the existing `UPI_APPS` order — restating it as a second ranking would be the derived-data mistake `AGENTS.md` calls out for `money_profile.investments`) without asking; the destination line + Change affordance (now inside `UpiPayButton`, see U3) is what lets the user correct it before tapping Pay.
  - Accept: last-used → popularity order → none; an uninstalled last-used app falls back — all four cases tested
  - Verify: 4 new tests in `upiIntent.test.ts`, revert-proven (temporarily hard-coded to skip the last-used check → the matching test failed → restored, suite green)
- [x] **U3 · Button + grid on Scan & pay (M)** — done 2026-09-26, folded U4's settle-up half in with it (see below)
  - Files: `src/components/finance/pay/UpiAppGrid.tsx` (new), `src/components/finance/pay/UpiPayButton.tsx` (new), `src/hooks/useUpiHandoff.ts` (`pay`/`choose`/`ask`/`ActionSheetIOS` removed, replaced by one `payWith(app, req, hooks, opts)`), `src/components/finance/ScanPaySheet.tsx` (rebuilt onto `UpiPayButton`)
  - `UpiPayButton` owns the destination line, the "Change" affordance and the app-grid sheet that replaced `ActionSheetIOS` — previously hand-rolled once in `ScanPaySheet` and copied into `TransferBody` with a comment reading "mirrors ScanPaySheet's destination row", exactly the duplication `AGENTS.md` §9 calls out for hand-rolled pills
  - Accept: blocked apps shown with their subtitle (via `UpiAppGrid`'s `handoffVerb` caption); VPA-first / unverified-name labelling untouched (pre-existing, not part of this rebuild); UPI invariants hold (no payload/URI logic changed, only who calls `upiLaunchUrl`)
  - Verify: `tsc` clean; full suite green; new `upiPayButtonUsage.test.ts` (see U4)
- [x] **U4 · Settle-up + Request QR; delete the old picker (S)** — done 2026-09-26, scope adjusted
  - Files: `src/components/finance/add/TransferBody.tsx` (settle-up rebuilt onto `UpiPayButton`, its own destination row deleted; the hand-rolled "Pay via UPI" `TouchableOpacity` replaced too — it was itself a plain-tinted-background CTA, the exact pattern `AGENTS.md` §5 forbids), new `src/__tests__/upiPayButtonUsage.test.ts`
  - **"Exactly three `UpiPayButton` call sites" revised to two.** `RequestQrSheet` is the other direction — a QR *we* display for someone else's camera — and has no UPI-app picker at all to unify; it isn't a third call site, it's a non-participant. The real payer-side surfaces are `ScanPaySheet` and `TransferBody`, and the guard test counts exactly those two.
  - Accept: a guard finds no `ActionSheetIOS` import/call in the pay code (`useUpiHandoff.ts` + the three `pay/` files + both screens) and exactly two `UpiPayButton` call sites · Android keeps handing off to the OS chooser (U5 deferred), so the button shows no app logo there (unaffected — `apps === null` on Android, so `UpiPayButton`'s destination row and grid never render)
  - Verify: `upiPayButtonUsage.test.ts`, revert-proven (temporarily reintroduced an `ActionSheetIOS` import → test failed → restored, suite green)
  - Gates: `tsc` clean; full suite 214/214 suites, 2698/2698 tests
- [ ] ~~**U5 · Android package targeting (M)**~~ — **DEFERRED 2026-09-26 (user).** Android keeps the OS chooser for now; revisit with the Android port — package names on specs, `expo-intent-launcher` (**new dependency**), `<queries>` in `app.json`, the "Other UPI app" tile · Accept: `tsc`; the suite; the prebuild config holds · **needs a rebuild**
- [x] **CP4** — done 2026-09-29 (committed together with the review-pass fixes to it, `eb08436`) — gates green, committed, pushed to `origin/claude/branch-selection-gi7lyy`
- [ ] **CP4 DEVICE (yours, iOS)** — pay with the default app · Change → another app · relaunch → new default kept · Request QR scanned from a second phone

## Phase 5 · Your decisions (`DQ-99`, `DQ-101`, `DQ-102`, and the engine's two screens)

Options tasks come first; each build task is sized once you've picked.

- [x] **O-99 / O-100 / O-101 / O-102 / O-103** — answered 2026-09-27: build the proposals recorded in `FINDINGS.md`; `DQ-99` decided from the Recurring rule
- [x] **B-101 · Settings consolidation (M)** — done 2026-09-29, scope per `tasks/plan.md`'s spec
  - Dropped the standalone **Sync** and **Backup & restore** rows — both already one tap from `/settings/account` (`SyncStatus` + an existing backup link); dropped the untappable **Currency** row (INR only, `onPress={undefined}`)
  - Left Import/Review inbox/Reports & export/Export all data as four separate rows on purpose — flagged, not merged, since collapsing four different actions into fewer taps is a bigger IA call than removing a repeated link
  - Cleaned up now-dead state (`backupAt`, `onAccount`) and imports (`linkedUser`, `formatAgoCompact`) that only existed for the removed rows
  - Gates: `tsc` clean app+server; full suite 216/216, 2685/2685; `entryPointCount`/`screenIdMap`/`deadComponents` guards pass; both dropped destinations confirmed still reachable via Account
- [x] **B-102 · Copy rule + pass (M)** — done 2026-09-29
  - `AGENTS.md` §14 added: at most one caption line of supporting copy per control; the "why" goes to Help or nowhere; never cut copy that states a constraint a decision depends on
  - `settings/sync.tsx`: the 4-Fact "What this does" card + a trailing footnote collapsed to two lines that state real constraints (server can read your data; entries wait for approval); the sign-out-behavior half of the footnote cut as redundant — it already fires contextually as an Alert at sign-out (`DQ-97`, `useSignOut.ts`)
  - `settings/account.tsx`: the two stacked signed-in footnotes collapsed to one (phone-privacy fact kept, sign-out restatement cut for the same reason); the sign-in hero's two paragraphs (`note`+`noteWarn`) each cut to one line, keeping both real facts (what's stored; no auto-backup)
  - `FirstSignInStep.tsx`: `restore`/`merge` sentences trimmed to one each. `ask`'s two sentences deliberately kept — they're the only place stating what three buttons do to your data, on a screen whose action is hard to reverse (the rule's own exception, not restated context)
  - Gates: `tsc` clean app+server; full suite 216/216, 2685/2685; no test pinned the old copy
- [x] **B-99 · Recurring placement (S)** — done 2026-09-29, no code change
  - Decision: Recurring stays on Plan's header rail; the Home bell still opens `/upcoming`. A recurring rule can span groups or be personal-only, so a per-person home would put a shared bill's rule on an arbitrary member — Plan (money-wide) is the correct scope
  - The "something felt off at the bottom of Plan" half of the original `DQ-99` complaint stays explicitly open — not enough signal in the ticket to act on
  - `docs/TRACKER.md`/`FINDINGS.md` updated: `DQ-99` closed with this reasoning. Also caught up `DQ-100`/`DQ-101`/`DQ-102`/`DQ-103` — all four were still marked `DECIDE` with pre-session text despite being fully built this session (`EN11`, `B-101`, `B-102`, `B-103`); moved to Closed with what actually shipped. Tracker's own open-count (`194 items, N open`) corrected 110→105
  - Gates: `tsc` clean app+server; full suite 216/216, 2685/2685; `trackerIntegrity`/`docCoverage`/`docIdGraph` guards pass

When each Phase 5 item closes, its tracker row moves to `DONE` and its `FINDINGS.md` entry records the answer.

## Phase 5b · Feedback, 2026-09-29

Short and ordered: quick fixes first, the one design question last.

- [x] **F1 · Pay-with app picker inline.** Collapsible app icons above the Pay button (Scan & Pay, settle-up); picking only selects. *(done, `206cc9f`)*
- [x] **F2 · Afford: full engine working.** "How we got this" shows inputs, events, the sum, low points, each check and the verdict rule, all with numbers (`lib/engine/trace.ts`). *(done)*
- [x] **F3 · Settings.** A colour per row, Notifications folded into Preferences, Data & Help split. *(done)*
- [x] **F4 · Drop the engine comparison dev screen.** *(done)*
- [x] **F5 · Dropdown chevron at the far right.** A `Chip` with `chevron` that fills its row puts the ⌄ at the right edge, not after the text. Fix once in `ui/Chip` (label takes the free width), so category, date and every other dropdown chip follows.
- [x] **F6 · Edit shows no advice.** Budget nudge ("₹0 left this month"), afford hint and the "switch to Invest" banner only on Add, never on Edit (`app/add/quick.tsx`).
- [x] **F7 · Transfer = money moved, nothing else.** Remove `Rent` and `Investment` from the Transfer picker. `Investment` stays as the hidden category the Invest kind writes (`db/queries/assets.ts`); existing `Rent` transfer rows keep their label, the category just stops being offered. One-time fix for already-seeded groups.
- [x] **F8 · "Spent with X, Y" — not a group.** Decided: it is never shown as a group and never appears in the Groups list. Add's "Where does this go?" becomes two parts: **Group** (pick one) and **With people** (tick one or more). The header reads "With Aarav, Meera · equal", not a group name.
  - Under the hood it reuses the hidden pair group that one-person splits already use (`getOrCreatePairGroup`, kept out of the list by `listableGroups`): ticking people finds or creates the hidden group for exactly that set. That is what keeps splitting, balances and sync working, since `txn.group_id` is NOT NULL and only groups sync.
  - **No schema or server change.** The server's `groups.kind` is a CHECK of `personal | shared | pair` (a pair is exactly two people), so a new kind would mean rebuilding that table. The hidden group is an ordinary `shared` group on the wire, marked by `icon = 'link-2'` (`PEOPLE_SET_ICON`), which already syncs, so every member's phone hides it the same way. Looked up by its exact member set, never by name.
  - Balances stay correct with no extra work: friend balances already sum across every group a person shares with you.

- [x] **F9 · Filters.** Review's amount is Min/Max (empty = none, one = at least/at most, both = between); category is one chip → searchable multi-select sheet; the AND/OR switch is gone (filters only narrow). Saved views from the old shape are migrated (`normalizeFilters`).
- [x] **F10 · Date range.** One calendar, tap first then last day (`ui/DateRangeSheet`). Root cause of the bug: the picker's `onClose` cleared the state its `onChange` had just set, so "To" never opened. Review's filter sheet no longer nests its pickers (they are siblings, `ReviewFilterSheet`).
- [x] **F11 · Settle direction.** Opening Settle with someone now points the way the money goes (they owe you → them → you) and pre-fills what is owed (`settleDirection`, seeded once in `useAddTxnForm`).
- [x] **F12 · Upcoming + WhatsApp.** Upcoming loses the leftover "nudges" line and settings row; settle rows say who owes whom with Remind / Record payment / Pay. `useReminder` is shared by Person, Upcoming and Friends.

Done, with tests (`peopleSetGroup`, `transferCategories`). Gates: `npx jest`, `npx tsc --noEmit`. DEVICE: F5 on Add (expense, income, transfer), F6 editing an expense, F7 the transfer picker, F8 splitting with 2 friends and no group.

---

## Phase 5c · Money movement, forms, group screen (2026-09-29)

Ordered by value; each item ends with its gate. Design decisions are stated so they can be
overruled, not assumed.

### M · One way to move money (assets, buckets, everything)
Today: `Add`, `Take out`, `Worth now`, `Edit` are four buttons under every asset row; Plan has a
separate "Moved to investments" sheet; Add has its own Invest kind; buckets (Bank/Cash/Wallet)
can't be moved between at all. All are the same act — *money goes from one place to another*.

- [x] **M1 · `moveMoney(db, from, to, amount)`** in `db/queries/assets.ts`. An endpoint is a bucket
  (`bank|cash|wallet`) or an asset. Four cases, **no schema change**, one DB transaction each:
  bucket→asset = `transferToAsset`; asset→bucket = `transferFromAsset`;
  asset→asset = redeem A into a bucket + invest B from the same bucket (cash net zero, both asset
  pages show it); bucket→bucket = a payments-only row out of one, a shares-only row into the other
  (net cash zero, bucket flows move). Assets never overdraw (same SQL guard). Net worth is flat in all four.
- [x] **M2 · `MoveMoneySheet`** — From / To chip rows (Bank, Cash, Wallet + every asset, dynamic,
  truncating), a swap ⇅ button, amount, one hint line. `to === from` disabled. Replaces
  `MoveToInvestmentsSheet` and the Add/Take-out modes of `AssetSheet`.
- [x] **M3 · Assets screen: frequent out, rare in.** A row = icon, name, balance; tap opens the
  asset. **One** inline action per row: `Move`. Header keeps `Add` (new asset); the duplicate
  bottom "Add an asset" goes. **Rare actions move inside the asset page**: `Update worth`, and a
  `⋯` menu (Edit, Stop counting, Delete). Asset page gets `Move money` (primary) + `Update worth`.
- [x] **M4 · Plan's "moved to investments" entry** opens `MoveMoneySheet` pre-set to Bank → asset.
- Left alone on purpose: Add's Invest kind (a full entry with date/note, not a quick move) and
  `PayCardBillSheet` (a card repayment is a debt, not a holding). Both keep working unchanged.
- Gate: data tests for all four cases (cash net zero, net worth flat, overdraw refused, sync queued).
- **M done** in `e798ada`: `moveMoney` + `src/__tests__/moveMoney.test.ts` (7 tests), `MoveMoneySheet`, Assets rows show one `Move`, asset page has Move money / Update worth / ⋯ edit, `MoveToInvestmentsSheet` deleted. `spendPower.moveToInvestments` is now unused by the app (still tested) — delete it or keep for the no-assets path.

Spec: `docs/SPEC-FORMS-GROUP.md` · Plan: `plan.md` Phase 5c. Gates every task: `npx tsc --noEmit`,
`npx jest --silent`; every regression test revert-checked; doc-count guards updated in the same commit.

### Phase A · Amount row
- [ ] **1 · (M) `ui/AmountRow` + "Your money" sheet** — `AmountRow` (IconCircle 32, label, right-aligned
  ₹ input, no inner border, 52pt) + pure `bucketTotal`. `MoneyEditorSheet`: card 1 Bank/Cash/Wallet +
  total row; card 2 credit limit/used + available line; hints behind `InfoLabel`.
  *Accept:* `bucketTotal` tests (empty, `0`, decimals).
- [ ] **2 · (S) Same row in `AssetSheet` + `PayCardBillSheet`**; delete `spendPower.moveToInvestments` + its test.
  *Accept:* guard — no amount `Input`/`TextInput` in the three sheets (revert-checked).
- [ ] **CP-A** — commit + push; DEVICE: Plan → Your money.

### Phase B · Small wins
- [ ] **3 · (XS) N3** — `+ Add member` first in `MembersTab` and `group/[id]/members.tsx` (admins only
  there); bottom buttons removed. *Accept:* source-order guard.
- [ ] **4 · (S) N1** — `lib/noteText.oneLine`; pure `rowText(txn)` out of `TransactionRow`, so a
  transfer's note is its second line. *Accept:* `oneLine` + `rowText` tests, revert-checked.
- [ ] **CP-B** — commit + push.

### Phase C · Group screen
- [ ] **5 · (S) T1** — `hooks/useFullTextOnHold` (native `Alert`), wired into `ListRow` and `Chip`.
  *Accept:* hook test with mocked `Alert`; guard that both use it.
- [ ] **6 · (M) G1** — `GroupHeaderCard` in `group/[id].tsx`; `GroupHero` + `GroupBalanceCard` deleted.
  Balance top right, `Settle up` only when someone to settle with, group-colour gradient
  (`expo-linear-gradient`, already a dependency), name on hold. *Accept:* pure `headerBalance(net)` tested.
- [ ] **7 · (M) G2 layout** — `FilterBar`, same props: search always visible, `Filters` button + count
  badge, sheet (Type / When / Who), removable active chips. Callers: Search, Personal, group
  Transactions tab. *Accept:* `activeFilterCount` tested; callers unchanged.
- [ ] **8 · (S) G2 tags** — `TxnFilters.tags` (any-of via `tagKey`), Tags section from row tags, passed by
  all three callers. *Accept:* tag-match tests, revert-checked; `filtersActive` counts tags.
- [ ] **CP-C** — commit + push; DEVICE: group screen, Search and Personal filters.

### Phase D · Forms (N2, named sheets only)
- [ ] **9 · (S) Goal amounts** — Add funds / Withdraw (`app/(money)/savings/[id].tsx`) and the
  `(tabs)/savings.tsx` input on `AmountRow` in a `Card`.
- [ ] **10 · (S) `finance/GroupForm`** — card-grouped `ListRow`/`Input`, one hint line max (fixes Edit group).
  *Accept (9–10):* task 2's guard extended — no bare `TextInput`, no `type.body` paragraph under a control.
- [ ] **CP-D** — commit + push; DEVICE: the forms.

### Decisions (overrule if wrong)
- Bucket↔bucket moves are included (Bank→Cash is the ATM case) — that is what "even money is one of
  the ways" reads as.
- Asset→asset settles through a bucket internally (Bank); the user never sees that.
- Tags are filtered *any-of* and are additional to free-text search (which still matches tags).

## Phase 6 · AI context & narration — deferred, not yet broken into tasks

Decided 2026-09-26; see `plan.md`'s Phase 6 for the three-stage design (guardrailed structured
extraction → unchanged deterministic `afford()` → optional grounded narration) and why it waits
until after EN12/CP3. No tasks filed yet — needs an options pass and a spec addendum first.
