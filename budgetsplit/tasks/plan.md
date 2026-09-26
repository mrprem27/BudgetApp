# Implementation Plan — Merge, UPI redesign, and the open asks

`Spec: docs/TRACKER.md + docs/FINDINGS.md (DQ-94, DQ-97–DQ-103) + docs/SPEC-ENGINE.md (the money engine) · Tasks: ./todo.md · Written 2026-09-26 · Predecessor: docs/history/PLAN-2026-09-SERVER-SYNC.md`

## Overview

There's no separate spec file. By the user's choice, the spec is the tracker rows plus their
`FINDINGS.md` entries. This plan turns them into work:

| Id | What | State | Here as |
|---|---|---|---|
| `DQ-94` | Merge into my account at first sign-in | Decided | Phase 1 (build) |
| `DQ-94` part 2 | "Same person as…" — combine two people by hand | Decided | Phase 2 (build) |
| `DQ-100`, `DQ-103` | The money engine behind Afford, Safe-to-Spend and every forecast (`SPEC-ENGINE.md`) | Spec written 2026-09-26 | Phase 3 (build) |
| `DQ-98` | UPI app picker: logo button + Change grid | Decided | Phase 4 (build) |
| `DQ-99`, `DQ-101`, `DQ-102` + the Afford / Safe-to-Spend screens | Recurring placement, Settings, wordiness, and how the engine's answers look | **Your call** | Phase 5 (options first, build after you pick) |

**32 tasks across 5 phases** (Merge 4 · Same person 3 · Engine 12 · UPI 5, one deferred · decisions: 5 options + 3 builds; the Afford and Safe-to-Spend screens are built as EN10/EN11). None is bigger than M. Each phase ends at a checkpoint. Checkpoints
marked DEVICE are yours; the rest are mine (gates green, committed).

## Architecture decisions

- **Merge = pull first, fold, then upload only what's new.** The account's data comes down before
  anything goes up. Then the phone's Personal group and same-email people fold into the account's.
  Then only rows the account has no version of get queued. This ordering is what stops the phone's
  own Personal group reaching the server and being refused (`ux_groups_one_personal`). Already
  partly written: `db/queries/mergeLedger.ts`.
- **Merge never matches by name.** Only "me", Personal and the same email fold. Anything else stays
  two rows until combined by hand (Phase 2). That's the user's rule, and it's why Phase 2 exists.
- **The engine replaces the six Afford checks rather than patching them** (`SPEC-ENGINE.md`). It
  is built behind a dev comparison screen, and nothing users see switches until you've read the
  old-versus-new answers on your own ledger (CP3). Predictions ship only past their back-test gates.
- **One UPI picker on both platforms.** Android stops using the OS chooser and targets the package
  (`expo-intent-launcher`, a **new native dependency**, so this needs a rebuild), keeping generic
  `upi://` as "Other UPI app". That's the consistency rule. Brand logos are bundled assets; a
  missing one falls back to a monogram tile.
- **Every layout decision is drawn as options first** (house rule), which is why each Phase 5 item
  starts with an "options" task that blocks its build task.

## Dependency graph

```
Phase 1  M1 mergeIntoAccount (lib+tests) ──► M2 wiring+UI ──► M3 remap guard ──► M4 duplicates review ──► CP1 (DEVICE)
                                                                                    │
Phase 2  P1 server into_person (+deploy) ──► P2 combinePeople (local) ──► P3 "Same person as…" UI ──► CP2
                                                                                    
Phase 3  EN1 snapshot ─► EN2 first slice (dev screen) ─► EN3 band ─► EN4 afford v2 ─► EN5 income+receivables
         ─► EN6 true expenses ─► EN7 explain ─► EN8 back-test gates ─► CP3 (DEVICE) ─► EN9 behaviour rest
         ─► EN10 switch StS (+O-103) ─► EN11 switch Afford (+O-100) ─► EN12 signals, one surface at a time

Phase 4  U1 logos ─┐
         U2 default-app logic ─┼─► U3 UpiPayButton+grid, Scan&pay (iOS slice) ──► U4 Settle-up + Request QR, delete ActionSheet
                   │                                                                     │
                   └──────────────────────────► U5 Android package targeting ◄───────────┘ ──► CP4 (DEVICE, both platforms)

Phase 5  O-103 / O-100 screen options (feed EN10 / EN11, after CP3)
         O-101 Settings options ─► B-101 build ─► O-102 copy rule ─► B-102 copy pass   (trim after the rows settle)
         O-99  Recurring options ─► B-99 build
```

Phases 1–4 don't depend on each other except where drawn, so they could interleave. I'd still do
them in order: Merge finishes the sync branch, and Phase 2 is only needed once people start merging.

## Phase 1 — Merge into my account (`DQ-94`)

**M1 · `mergeIntoAccount` + tests (M).** In `lib/sync/firstSignIn.ts`: snapshot and export, capture
the phone's people and Personal group, clear the queue and versions, `linkLedger(backfill:false)`,
pull until nothing is new, then `mergeLedger` (fold Personal, fold same-email people, queue what's
new). Any failure restores the snapshot and unlinks. Also `canMerge(db)` = not joined to a
*different* account.
*Accept:* the new `mergeSignIn.test.ts` on the real Worker, on the free-plan budget:
- the account holds X, the phone holds Y → **0 rejections**;
- **one** Personal group on the server;
- a same-email friend becomes **one** person, a same-name friend stays **two**;
- every Y transaction exists alongside X;
- a clashing budget line keeps the account's;
- a fresh third phone restores exactly **X ∪ Y**;
- a transport failure mid-way leaves the phone byte-identical and unlinked.

Each fold is revert-proven.

**M2 · Wiring and the third button (S).** `mergeNow` in `run.ts` (inside `exclusive`, then
`runSync` like `uploadNow`); a `'merge'` choice in `useEmailSignIn`; `FirstSignInStep` gets
**Merge into my account** (primary) / **Use my account** / **Not now** plus a merge progress
state; the copy loses "can't be merged". All three call sites (`SignInStage`, `app/auth.tsx`,
`settings/account.tsx`) change identically.
*Accept:* a source guard counts three call sites, each passing `onMerge`; the button is hidden when
`canMerge` is false; `tsc`.

**M3 · Group-column guard (XS).** A test that `GROUP_REMAP_COLUMNS` plus the special-cased
columns cover every column in `schema.ts` that names a `budget_group`.
*Accept:* adding a fake `group_id` column to a copy of the schema fails the test.

**M4 · Possible-duplicates review (S).** Merge still adds everything, then lists phone expenses that
match an account expense by the app's existing rule (`findRecentDuplicate`: same group, category,
amount, ±24 h). One list, pairs side by side: *Keep both* / *Remove this phone's copy* / *Remove all*.
*Accept:* identical expenses across the two sides are listed, never dropped silently; two identical
expenses on the same side are never flagged; one implementation of the rule (a guard).

**CP1** — gates, commit, push. **DEVICE:** sign out → add two expenses and a friend with an email
the account knows → sign in → Merge → both expenses are there, the friend is one person, a fresh
install restores everything.

## Phase 2 — "Same person as…" (`DQ-94` part 2)

**P1 · Server folds placeholder → placeholder (M).** `entities/merges.ts` accepts `into_person`
under the existing authority rule (I created both, or can read a group each is in), reusing
today's effects (memberships, summed payer/split rows, item assignments, trust, budgets,
friends). Deploy.
*Accept:* new cases in the server suite: I can fold my own two placeholders; a stranger's
placeholder is refused; folding into an account still goes through `into_user` unchanged.

**P2 · `combinePeople(db, keepId, dropId)` (S).** In `personRemap.ts`: `remapPersonRows`, copy
fields the kept row lacks, delete the dropped row, requeue, queue `person_merge {into_person}`.
Refused for "me", and for two people linked to different accounts.
*Accept:* a two-phone test where entries, splits, item assignments and trust move, the dropped
person is gone on both phones, and balances are unchanged.

**P3 · The screen action (S).** Person screen → **Same person as…** → a picker sheet → a confirm
naming both people and how many entries move.
*Accept:* shows only for eligible pairs; `tsc`; the full suite.

**CP2** — gates, deploy, commit, push.

## Phase 3 — The money engine (`SPEC-ENGINE.md`)

Replaces the old F1 cushion patch, which would have fixed a threshold the spec removes. Every slice
runs end to end (snapshot → model → answer → a screen). Until the switch (EN10–EN12), that screen is
a **dev-only comparison screen** showing the old and new answers side by side, so nothing users see
changes before you've reviewed it.

**EN1 · Snapshot + personas (M).** `db/queries/engineSnapshot.ts` (E1) plus the five fixture personas
from spec §7, built through the real write paths.
*Accept:* the snapshot's parts equal today's `getSafeToSpend` parts on the demo ledger and on every
persona; a test pins each field to its source.

**EN2 · First slice: known events → Safe-to-Spend v2 → dev screen (M).** E2 everyday rate (the
trimmed mean moved as-is), E3 deterministic path only (known events + the rate, rolling 30 days),
E4 `safeToSpend` as "largest spend keeping the low point ≥ 0", and `app/dev/engine.tsx` behind
`DEV_TOOLS_ENABLED`, showing old versus new per persona.
*Accept:* on a ledger with no bills dated inside the horizon, v2 equals today's figure exactly; where
they differ, it's because of timing (a bill after a payday), and the screen names the event.

**EN3 · Uncertainty band (M).** A seeded PRNG, 7-day block bootstrap, 500 paths, P10/P50/P90, the
cautious (P20) low point, and a floor of one week of essentials.
*Accept:* deterministic across runs; paths equal the known path when the everyday sample is empty;
under 100 ms for a year of history; the P20 low point falls as spending variance rises.

**EN4 · Afford v2 on the dev screen (M).** The E4 verdict rules, ranked reasons with rupee effects,
the largest comfortable amount, and Need/Want + Now/Can wait (with the earliest Comfortable date).
*Accept:* the spec's property tests (Comfortable ⟺ ≤ Safe-to-Spend; monotonic in amount; more
income never worse; No only on a real shortfall); golden scenarios per persona; a ₹2,000 monthly
charge weighs more than a one-time ₹2,000.

**EN5 · Income and receivables (M).** The income model (next date, amount, consistency class),
safety horizon = until the next reliable income (min 30, irregular 60), and per-friend Beta-binomial
repayment in the simulation.
*Accept:* salaried persona → horizon ends at payday; freelancer → 60 days; a friend with no history
gets exactly the prior; a receivable that tips the verdict is named in the reasons; the repayment
rating never enters the sync queue (a guard).

**EN6 · True expenses — the 12-month horizon (M).** Sinking funds for yearly and quarterly rules and
dated goals; "unfundable commitment" → Not affordable.
*Accept:* the ₹60k school fee claims today only its accrued share; a purchase making March unfundable
is No now; a test proves the lump isn't subtracted twice (accrual plus due date).

**EN7 · Confidence and explanation (S).** E6: confidence levels, thin-data mode (facts only below the
minimums), reasons `{code, rupeeEffect, sentence}`.
*Accept:* every reason code renders against fixtures with only numbers from the result; the thin-data
persona gets no verdict and a "what's missing" line.

**EN8 · Back-test and ship gates (M).** Spec §8: stand at past dates, project, compare. The gates
from §8 run as tests on every persona, plus a local back-test on the dev screen for your own
ledger.
*Accept:* the gates pass on the personas, or the failing surface is marked facts-only and the
reason is recorded.

**CP3 · DEVICE, yours:** open the dev screen on your real ledger. Read the old-versus-new list
for Safe-to-Spend and a few Afford questions, and say whether the new answers make sense. **No switch
happens before this.**

**EN9 · Behaviour, the rest (M).** Category model, seasonality (13 months), exceptional days
(modified z), fixed vs variable, Need/Want learning.
*Accept:* the spec's E2 acceptance (one ₹40k day moves the everyday rate ≤ 2%; seasonality is
exactly 1.0 below 13 months; a `null` below every minimum).

**EN10 · Switch Safe-to-Spend (S).** Home hero and `StsSheet` read the engine; the sheet's lines
tap through to their rows (`DQ-103`). Layout follows O-103 (Phase 5).
*Accept:* parity notes committed; old `computeSafeToSpend` reduced to an adapter, with no screen
calling it.

**EN11 · Switch Afford (S).** `app/afford.tsx` and the Add screen's inline hint read `afford()`;
`lib/afford.ts`'s six checks are deleted. Layout follows O-100.
*Accept:* no caller of `evaluateAfford` remains (a guard); the gates from EN8 still pass.

**EN12 · Signals, one surface per commit (S each).** The forecast card and budget bar → E4 budget
forecast with a band; the low-point warning; unusual spend; recurring analysis; the savings
suggestion; Insights; the health score's Spend and Save pillars.
*Accept:* per surface, the same number as before or a written, justified difference; nothing fires
below its model's minimum.

**CP3b** — gates, commit, push after each switch; a device look at Home, Afford and Insights after
EN11.

## Phase 4 — UPI payment redesign (`DQ-98`)

**U1 · Logos (S).** A `logo` on `UpiAppSpec` and the assets in `assets/upi/`, taken from each
brand's official artwork, plus an `UpiAppIcon` with a monogram fallback.
*Accept:* a guard fails if any `UPI_APPS` entry lacks a logo or points at a missing file.

**U2 · Default app (S).** `settings.upiLastApp`, and a pure `pickDefaultApp(installed, last)`: the
last-used app, else a fixed popularity order, else none.
*Accept:* unit tests for all three branches, plus an uninstalled last-used app falling back.

**U3 · The button and the grid, on Scan & pay (M).** `finance/pay/UpiPayButton` (logo +
"Pay ₹X with <app>" + "Change app ›") and `finance/pay/UpiAppGrid` (a `SheetModal`, 4 per row,
with `blocked` apps kept and their subtitle shown); `useUpiHandoff` exposes `payWith(app)` and
`defaultApp`. `ScanPaySheet` is rebuilt around it: payee card with the VPA first and the name
marked unverified, then amount, then the button.
*Accept:* `tsc`; the suite; the UPI invariants (no collect request, `pn` never trusted) still hold.

**U4 · Settle-up and Request QR, delete the old picker (S).** Transfer pay uses the same button.
`RequestQrSheet` gets an amount hero, the white QR card and a row of app logos. The
`ActionSheetIOS` picker is deleted.
*Accept:* a guard finds no `ActionSheetIOS` in the pay code and exactly three `UpiPayButton` call
sites.

**U5 · Android package targeting (M) — DEFERRED 2026-09-26 by the user.** Android keeps the OS chooser until the Android port. Package names on each spec,
`expo-intent-launcher` (new dependency), and `<queries>` in `app.json` so installed apps can be
detected; the generic `upi://` becomes the "Other UPI app" tile.
*Accept:* `tsc`; the suite; an expo prebuild config check. **Needs a rebuild.**

**CP4** — **DEVICE, iOS** (Android deferred with U5): pay with the default app; Change → pick another; relaunch →
the new default stuck; Request QR scanned from a second phone.

## Phase 5 — Your decisions (`DQ-99`–`DQ-103`)

Each item is one **options** task (I draw two or three layouts; you pick) followed by one **build**
task, sized after you pick. Nothing here is coded before its options task closes.

| Order | Options task | Build task (after you pick) | Why this order |
|---|---|---|---|
| 1 | O-103 Safe-to-Spend screen: tap-through lines, the band, "cash last confirmed" | built as EN10 | After CP3: the numbers first, then the look |
| 2 | O-100 Afford screen: headline, ≤ 2 reasons, the Need/Want and Now/Can wait chips | built as EN11 | Same |
| 3 | O-101 Settings: consolidated rows | B-101 | Rows must settle before copy is trimmed |
| 4 | O-102 Copy rule (a line into `AGENTS.md`) | B-102 copy pass, screen by screen | Last: touches every screen |
| 5 | O-99 Recurring / Upcoming placement | B-99 | Independent; slot anywhere |

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Merge duplicates history when both sides hold the same expenses | High for anyone who used two phones before signing in | That's the user's accepted rule ("add as new"); Phase 2 cleans up people, and `DQ-94`'s revisit trigger watches for it |
| A pulled row and a phone row share an id (a phone restored from this account's backup file) | The account's version silently wins | Rare; the export file taken before merging is the recovery path |
| Brand logos in the store listing | Review friction | Official artwork only; `DQ-98`'s revisit trigger; the monogram fallback means they can be pulled without code changes |
| `expo-intent-launcher` needs a rebuild and is untested on your phone | Android pay could break | U5 is last in its phase; the generic `upi://` tile stays as the fallback |
| The engine's predictions are wrong for real people | The feature loses trust, which is the user's standing worry | Back-test ship gates (EN8); facts-only fallback; nothing switches before your CP3 review of your own ledger |
| Merge runs through the free-plan query budget | Slow on a big account | Same multi-request push as Upload, now 1.7 s per request with placement |

## Phase 6 — AI context & narration (deferred, not specced yet)

Decided 2026-09-26, in conversation, not yet turned into tracker rows: an optional AI layer on top
of the finished money engine (after EN12), in three stages that keep the deterministic core
deterministic:

- **Stage A (optional, user-initiated).** Free text ("it's for my sister's wedding") parsed by
  Gemini into a small, **guardrailed structured schema** — Need/Want, Now/Can-wait, which goal it
  touches, a one-line note. Not new inputs the math doesn't already understand (§5) — a second,
  lower-friction way to fill the same fields the manual chips fill today.
- **Stage B (unchanged).** `afford()` runs on real numbers plus whatever structured fields it got,
  from Stage A or the manual chips. No AI touches the money math.
- **Stage C (optional).** A sentence narrating the deterministic verdict, incorporating Stage A's
  context. Same rule as E6's own reasons: no number in the sentence that isn't already in the
  result object.

Provider: Gemini, via a new thin proxy alongside `server/receipt-ocr-proxy/` (same shape: stateless,
holds the key, one narrow job) — reuses existing infra rather than a new provider/key.

Why deferred: this narrates and contextualises numbers the engine doesn't produce correctly yet
(Afford's real verdict is EN4; the whole engine is unproven until EN8's back-test gates and your
CP3 review). It also crosses two of `SPEC-ENGINE.md` §10's "ask first" lines at once (adding ML,
adding a stored input) and needs its own privacy disclosure (financial context leaving the device
for the first time) — worth doing once, deliberately, not threaded through the engine build.

Not yet done: an options task (screen layout, how Stage A is invited, what a refused/failed AI call
falls back to), a spec doc or `SPEC-ENGINE.md` addendum before it gets tracker rows, and the proxy
build itself.

## Open questions

None block Phases 1–4. Phase 5 is made of questions by design. Phase 6 is a recorded decision,
not yet broken into tasks — see above.
