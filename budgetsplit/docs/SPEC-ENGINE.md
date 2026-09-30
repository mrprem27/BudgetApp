# SPEC-ENGINE — the money engine, v1

`Status: LIVE, v1 — rewritten 2026-09-27 to match what is built and what's left. The original draft (bootstrap band, full E2/E5 table) is frozen at docs/history/SPEC-ENGINE-DRAFT-2026-09-26.md. Answers DQ-100 (Afford) and DQ-103 (Safe-to-Spend credibility).`

---

## 1 · Objective

One on-device engine that projects *this person's* cash day by day, and answers every
forward-looking question from that one projection: **Safe to spend** (Home) and **Can I afford
this?** (Afford, and the Add screen's hint).

**Success means:**
- **"No" only when the projection shows a real shortfall.** Never because a percentage was crossed.
- **Afford and Safe-to-Spend cannot disagree.** `afford(x)` is Not affordable ⟺ `x > safeToSpend`
  (absent an unfundable 12-month commitment). Property-tested.
- **Every answer explains itself** with its own numbers, and says what's missing when data is thin.
- **Deterministic, on-device, explainable.** No randomness, no network, no model.

## 2 · Decisions (v1)

| Decision | Why |
|---|---|
| **Deterministic only.** No Monte Carlo band (`EN3`, built and reverted) | Synthetic fixtures can't validate a band; real pilot data can. Until then the floor is the cushion |
| **Horizon = to the next payday, at least 30 days** (60 when income is irregular), **salary counted** | Decided by the user 2026-09-27. A flat 30 days without income read negative just before payday — it took next month's rent but not next month's pay. The low point now usually sits just before payday: "can I get to my next salary" |
| **Reservations are claims, not predictions** — card balance, goal contributions still due, what I owe: all set aside at the start | Cautious by design. The back-test excludes them (§8) because there's nothing to calibrate |
| **Receivables never count as money** | Named only when one would tip the verdict ("Comfortable if Aarav pays") |
| **Floor = one week of essential spend** (median Need-category day × 7; 0 below 30 days) | Derived, not a percentage. Below it → Tight, never No |
| **Cut from v1** | Budget/goal/cash-flow bands; `goalForecast` (so no goal-delay verdict trigger); the old engine's category-norm, income-share and unusual-basket-size tripwires (§4.1's verdict reads only cash/floor/explicit-budget/12-month-unfundable — the DQ-100 simplification); Need/Want learning; fixed vs variable; seasonality, exceptional days, recency blend; migrating surfaces that already work (forecast card, Insights, health score, savings suggestion) — none would change what the user sees |

## 3 · Horizons

| Horizon | Length | Answers |
|---|---|---|
| **Safety** | `horizonDaysFor`: to the next income date, ≥ 30 days; 60 if irregular | "Can I get to my next salary?" — the day-by-day projection |
| **Commitment** | 12 months | "Is a big known cost coming that I can't fund?" — yearly rules and dated goals as a monthly set-aside, checked against monthly surplus |

## 4 · Modules

| | Module | File | What it does |
|---|---|---|---|
| E1 | Snapshot | `db/queries/engineSnapshot.ts` | Every input in one plain object, as of any date. The only engine module that touches the db |
| E2 | Behaviour | `lib/engine/behaviour.ts` | Everyday rate (trimmed mean, unchanged from `typicalDailySpend`), essential floor, income model (regular / variable / irregular), repayment likelihood (Beta(1,2), never synced), true expenses + monthly affordability |
| E3 | Projection | `lib/engine/projection.ts` | `knownEvents` (bills, future one-offs, card, goals, what I owe, income) + the rate, walked day by day; `lowPoint` = the minimum seen |
| E4 | Assess | `lib/engine/assess.ts` | `safeToSpendV2`, `afford` |
| E5 | Signals | `lib/engine/signals.ts` | **Low-point warning** only (§4.2) |
| E6 | Explain | `lib/engine/explain.ts` | Confidence; suppresses the verdict below 30 days of history |

### 4.1 · `afford(purchase)`

`purchase = { amount, category?, when: 'now' | 'can-wait', recurrence?: weekly | monthly | yearly }`,
added as events (recurring ones repeat inside the horizon) and re-projected.

| Verdict | Exactly when |
|---|---|
| **Not affordable** | Low point after purchase < 0 · or a commitment within 12 months becomes unfundable |
| **Tight** | Low point after purchase < floor · or it takes a category over a monthly budget the person set |
| **Comfortable** | Neither |

Returns: verdict (or `null` + what's missing when history is thin), headline, low point before and
after (amount, date), ≤ 2 reasons ranked by rupee effect, the largest comfortable amount, the earliest
comfortable date for `can-wait`, and any receivable that would tip it.

**`safeToSpend`** = the projection's own low point: the most you can spend today and never go below
zero before the horizon. Its breakdown — cash, bills, card, goals, what I owe, everyday spend,
income — is read back off the same projection's events, never queried twice.

### 4.2 · Low-point warning

One warning when the projected balance drops below the floor within 14 days: its date and the
biggest event before it ("Below a week of essentials on 3 Oct — rent ₹25,000"). Nothing below the
rate's own minimum.

## 5 · Afford inputs

Amount; **How often** (one-time / weekly / monthly / yearly); **What's it for** (category — only the
budget check reads it); **Can wait** (a toggle — finds the earliest Comfortable date). The Need/Want
chip is removed: nothing in v1 reads it (its only effect was the goal-delay trigger, cut in §2).

## 6 · Structure

```
src/db/queries/engineSnapshot.ts   E1
src/db/queries/spendPower.ts       getSafeToSpendV2 — Home, StsSheet, the Add screen toast
src/lib/engine/{types,behaviour,projection,assess,signals,explain}.ts
```

`lib/afford.ts` (six tripwires) is deleted once Afford and the Add hint read `afford()`. The old
`getSafeToSpend` stays only as the dev comparison screen's independent reference.

## 7 · Testing

Fixture personas built through the real write paths (`db/enginePersonas.ts`): salaried renter with a
yearly school fee, freelancer (irregular), student, thin data (2 months), Diwali spike (14 months).
Unit tests per module; the Afford ⟺ Safe-to-Spend property; parity tests for every switched screen,
with each deliberate difference written down; regression tests revert-proven (house rule).

## 8 · Evaluation — `npm run engine:backtest`

Stand at past dates per persona, project, compare with what happened. Two hard gates:

| Gate | Today |
|---|---|
| Everyday spend (the engine's only estimate) within ±25% of real spend, every window | worst 13%, 14 windows |
| False "Not affordable" (projected < 0, reality never was) = 0 | 0 |

The stand-point snapshot drops future-dated rows (the db can't tell when a row was *entered*, so
they'd leak the real future in) and the reservations (§2). A surface that fails its gate shows facts
only. Swap the persona loader for a real exported ledger to run it on real data.

## 9 · Commands

```
cd budgetsplit && npx jest src/__tests__/engine   # engine suites
cd budgetsplit && npm run engine:backtest         # the §8 gates, with a readable table
cd budgetsplit && npx jest && npx tsc --noEmit     # everything
```

## 10 · Boundaries

- **Always:** integer paise; `lib/engine` pure (no React, db or network); every number shown traces
  to a field of the result; `null` rather than a guess below a model's minimum.
- **Ask first:** a new stored input; changing Home's figure beyond what §2 records.
- **Never:** a receivable counted as money; a repayment likelihood synced or shown as a score.

## 10b · Your money settings (`U-33`, built 2026-09-30)

Everything the engine assumes about *how you are paid* is inferred today: the next payday comes from
recurring income rules, the horizon runs to it (≥ 30 days, ≤ 60; 60 when income is irregular). That is
right for a salaried user who logged their salary as a rule, and invisible to everyone else — a daily
earner with no income rule gets a 30-day month-shaped answer they cannot relate to. Apps built for
irregular or weekly income (PocketGuard's "In My Pocket", pay-schedule planners) let you **say** your
cycle and show the answer per day or per pay period.

**Settings** (Settings → Preferences, three rows, each one question in a sheet; the defaults are today's inference, so an untouched install is unchanged — tested). Your picks, 2026-09-30: these three; no per-day display; the month keeps calendar dates:

| Setting | Choices | What it changes |
|---|---|---|
| How you're paid | Automatic · Monthly on day N · Twice a month · Weekly on a weekday · Daily · Irregular | The next-payday date the horizon runs to; overrides inference when set |
| Safe to spend looks ahead | Until next payday · 7 days · 30 days · End of month | `horizonDaysFor` |
| Keep aside | A week of essentials (today's floor) · A month of essentials · An amount · Nothing | The floor the low-point warning and Afford's "tight" use |

Stored on the phone (`lib/moneySettingsStore.ts`, AsyncStorage) — about you, not a ledger, and syncing
them would need a server column; worth it once they are used. `getFinanceSnapshot` puts them on the
snapshot, so the engine stays pure (`lib/engine/moneySettings.ts`, `engineMoneySettings.test.ts`). A
stated daily cycle means "until tomorrow" — a daily earner's answer, not a month-shaped one.

**Not in this cut:** a budget month that starts on payday (e.g. 25th → 24th). It moves every "this
month" figure in the app, not only the engine's; its own spec if you want it.

## 11 · Remaining work

Tracked in `docs/TRACKER.md`; the build history is `docs/history/TASKS-2026-09-CLOSEOUT.md`. Nothing here is a task list.

## 12 · Open questions

1. **Card due day:** unset → the whole balance is due at the start (cautious). Ask for it once, optional?
2. **Floor = one week of essentials:** right for the pilot?
3. **Real-ledger back-test:** run §8 on the first pilot exports before any band is reconsidered.

## 12b · Known limitations

| # | Limitation | Status |
|---|---|---|
| L1 | Need/Want is a hardcoded seed; no per-category override | Parked — nothing in v1 reads it (§5) |
| L2 | No goal-delay trigger (needs `goalForecast`) | Cut from v1 |
| L3 | Budget check covers explicit monthly budgets only | Minor follow-up |
| L4 | One-time `can-wait` only moves when income lands in the horizon | Resolved by the §2 horizon decision — salary is now in the path |
| L5 | Repayment model has no failure case (no "written off" state exists) | Open, harmless — only names a receivable, never counts it |
| L6 | Variable income with no rule contributes no event | Deliberate — a guessed date would silently relieve a real warning |
| L7 / L8 | "Projection predicts less cash than reality" | **Withdrawn 2026-09-27: a back-test flaw, not an engine bias.** The stand-point snapshot saw real future rows as pre-logged bills (everyday spend counted twice) and treated reservations as forecasts. Fixed in `engineBacktest.test.ts`; §8 gates pass. L7's original evidence very likely had the same flaw; the band stays reverted on §2's own grounds |
| L9 | Cash rests on an opening balance typed once | Open — "cash last confirmed · Update" was scoped out of `B-103` (needs a new stored input, asked first per §10's own boundary); tap-through shipped instead |
| L10 | `getSafeToSpendV2`'s breakdown read ₹0 on every line when the low point lands at `asOf` (the balance never dips below today's cash) | **Fixed 2026-09-29.** The parts still sum to `amount` (nothing is claimed yet at the low point) so the sum test is untouched; `SafeToSpendBreakdown.noDip` is set, `untilMs` becomes the horizon's end instead of today, and the sheet says "your balance doesn't drop below today's cash before <date>, so nothing is held back yet" instead of showing a wall of zeros |
| L11 | `useAddTxnForm.ts` fired both `getAffordSnapshot` and `getFinanceSnapshot` on every Add-screen open | **Fixed 2026-09-29.** The nudge only ever read one category's budget and this-month spend, so `lib/categoryNudge.ts` derives both from the engine snapshot; `getAffordSnapshot` (and its ~270 lines of tests) had no other caller and is deleted |
