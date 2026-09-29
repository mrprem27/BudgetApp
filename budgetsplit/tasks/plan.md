# Implementation Plan — Merge, UPI redesign, and the open asks

`Spec: docs/TRACKER.md + docs/FINDINGS.md (DQ-94, DQ-97–DQ-103) + docs/SPEC-ENGINE.md (the money engine) · Tasks: ./todo.md · Written 2026-09-26 · Predecessor: docs/history/PLAN-2026-09-SERVER-SYNC.md`

## Overview

There's no separate spec file. By the user's choice, the spec is the tracker rows plus their
`FINDINGS.md` entries. This plan turns them into work:

| Id | What | State | Here as |
|---|---|---|---|
| `DQ-94` | Merge into my account at first sign-in | Decided | Phase 1 (build) |
| `DQ-94` part 2 | "Same person as…" — combine two people by hand | Decided | Phase 2 (build) |
| `DQ-100`, `DQ-103` | The money engine behind Afford and Safe-to-Spend (`SPEC-ENGINE.md`, v1) | Spec rewritten to v1 2026-09-27 | Phase 3 (build) |
| `DQ-98` | UPI app picker: logo button + Change grid | Decided | Phase 4 (build) |
| `DQ-99`, `DQ-101`, `DQ-102` + the Afford / Safe-to-Spend screens | Recurring placement, Settings, wordiness, and how the engine's answers look | Answered 2026-09-27 | Phase 5 (builds the recorded proposals) |

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

**EN9 · Behaviour, the rest — reshaped 2026-09-26, not a standalone task.** Category model,
seasonality (13 months), exceptional days (modified z), fixed vs variable, Need/Want learning: none
of these have a screen consumer until `EN12`, so none get built ahead of it (see
`feedback_avoid_overengineering` memory) — building all five now, unconsumed, is the same shape of
mistake `EN3`'s reverted band was. Each `EN12` commit builds only the E2 sub-model it needs, at the
point it needs it. Fixed vs variable additionally needs a `description` field on `FinanceSnapshot`
that doesn't exist yet — parked until something asks for it.

**Engine tail — decided 2026-09-27** (spec rewritten to v1: `docs/SPEC-ENGINE.md` §2 has every call).

| Task | What | Accept |
|---|---|---|
| **EN10** ✅ | Home reads `getSafeToSpendV2` | Parity with the old formula on every field, 5 personas |
| **EN13 · Horizon to payday, salary counted (S)** | `safeToSpendV2` uses `horizonDaysFor` + income. The breakdown is read up to the **low point** (cash − claims − everyday spend to that day + income before it), so the lines always add up to the figure; the strip says "until 5 Oct" instead of "over 30 days". Add-screen toast reads the same | Parts sum to `amount` exactly on every persona; each difference from the old figure named |
| **EN11 · Afford on the engine, "number first" (M)** | `app/afford.tsx` rebuilt on `afford()`: headline + verdict, ≤ 2 reasons, "most you can spend comfortably", can-wait date, breakdown folded behind "How we got this". Need/Want chip removed. Add-screen hint reads `afford()`. `lib/afford.ts` deleted | Guard: no `evaluateAfford` caller; property: Not affordable ⟺ amount > Safe to spend |
| **EN12 · Low-point warning (S)** | `lib/engine/signals.ts`: below the floor within 14 days → one line on Home with the date and the biggest event before it | Fires on a persona that dips, silent on one that doesn't, silent below the rate's minimum |
| **B-103 · StS sheet you can check (M)** | Every line taps through to its rows; "Cash last confirmed <date> · Update"; thin history said plainly | Each line's rows sum to the line |

**CP3b** — gates, commit after each; device look at Home and Afford (yours).

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

## Phase 5 — Your decisions (`DQ-99`–`DQ-103`) — answered 2026-09-27

Options were skipped by agreement: each item builds the proposal already recorded in `FINDINGS.md`,
and `DQ-99` (left unscoped by the user) is decided from the existing Recurring rule.

| Order | Task | Builds |
|---|---|---|
| 1 | `DQ-100` | EN11 (done) |
| 2 | `DQ-103` | **B-103** below |
| 3 | **B-101 · Settings (M)** | One **Account & sync** row, one **Data** row, Currency dropped |
| 4 | **B-102 · Copy rule + pass (M)** | The rule into `AGENTS.md`, then one pass screen by screen |
| 5 | **B-99 · Recurring placement (S)** | Decided from the rule "two lists + one rule screen; a list opens the thing" |

### B-103 · Safe-to-Spend sheet you can check — spec, 2026-09-29

Scoped 2026-09-29: **tap-through only.** "Cash last confirmed · Update" is cut from this task — it
needs a new stored balance-confirmation and a new write path, which `SPEC-ENGINE.md` §10's own
boundary says to ask about before adding. Asked; deferred to a later, separately-scoped task.

**Objective.** Every `StsSheet` row that names a claim opens the real rows behind it, so "Bills still
due ₹4,200" is a receipt, not a number to trust blind (`DQ-103`).

**Behaviour.**

| Row | Opens | Existing screen reused |
|---|---|---|
| Bills still due | The bills counted, in date order | `/upcoming` |
| Card to repay | Where a card payment gets made | `/savings` (Plan tab, `TotalMoneyCard`'s existing `PayCardBillSheet`) |
| Goal contributions | This cycle's goal funding | `/savings` (Plan tab, `GoalCard`s) |
| You owe people | Per-person breakdown | `/friends` |
| Salary before then | The income rule | `/recurring` |
| Cash available, Everyday spending | No tap — not a list of rows, nothing to open | — |

No new screens. Each row becomes pressable (`chevron-right`, matching `ListRow`'s own tappable
affordance) only when its amount is > 0 — a ₹0 claim has nothing behind it to check.

**Thin history, said plainly.** When `sts.dailyRate == null` (as today), the everyday-spending row's
existing hint already says so ("Needs a few weeks of history…") — `DQ-103`'s "say plainly when the
estimate is thin" is already met; no change needed there.

**Accept:** every row with a positive amount navigates on tap; a ₹0 row does not render as tappable;
existing `StsSheet`/`StsStrip` tests still pass; no new database column, no new write path.

**Boundaries:** always route to an existing screen (never build a new one for this); ask first before
reviving the cash-confirmation idea, since it needs a stored input `SPEC-ENGINE.md` doesn't have yet.

### B-101 · Settings consolidation — spec, 2026-09-29

**Objective.** Fewer rows for the same reach, per `DQ-101`'s finding: three separate rows (Account,
Sync, Backup & restore) already collapse to one, because `/settings/account` already surfaces sync
status (`SyncStatus`) and a link to Backup on its own screen — nothing is lost by not repeating both
as their own top-level rows.

**Behaviour.**
- Remove the standalone **Sync** row and **Backup & restore** row from `(system)/settings/index.tsx`'s "Data
  & Help" section. Both stay one tap away, from Account (`SyncStatus` for sync, its existing link for
  backup) — nobody loses reach, the list just stops repeating what Account already shows.
- **Currency** row (`Preferences`): dropped. It has always been untappable (`onPress={undefined}`,
  INR only) — a row that cannot be tapped reads as broken, not as "there's only one option."
- Import / Review inbox / Reports & export / Export all data are **left as four rows**, not forced
  into one — they're four genuinely different actions (upload, confirm-queue, generate a document,
  raw export), and merging distinct flows behind one tap risks hiding one behind the other rather than
  consolidating. `DQ-101`'s literal "one Data row" is scoped down to this; flagged here rather than
  silently reinterpreted.

**Accept:** Settings' row count drops by 3 (Sync, Backup & restore, Currency); Account, sync status
and backup are each still reachable in ≤ 2 taps from Settings; no screen becomes unreachable
(`entryPointCount.test.ts` / `screenIdMap.test.ts` still pass).

**Boundaries:** never remove a row whose destination has no other path to it; ask before merging
Import/Review or Reports/Export-all into one screen — that is a bigger IA change than dropping a
repeated link.

### B-102 · Copy rule + pass — spec, 2026-09-29

**Objective.** `DQ-102`: stop screens explaining themselves in paragraphs.

**The rule (for `AGENTS.md`).** At most one short line of supporting copy under any control (a
`caption`-styled hint, not a `body` paragraph). Anything longer — what a feature is for, why it
exists, multi-sentence context — moves to Help (`/help`) or is cut outright. Applies to new screens
immediately; existing screens are trimmed by the pass below.

**The pass — the three cases `DQ-102` names, plus the pattern they're an instance of:**
- `app/settings/sync.tsx`'s explainer block
- `app/settings/account.tsx`'s footnotes (`.note`, `.footnote`, `.noteWarn` — 5 blocks)
- The first-sign-in step's two-sentence body
- Any other screen matching the same shape found while trimming these three (same rule, not a second
  audit)

**Accept:** each trimmed screen keeps at most one caption-line of copy per control; nothing a user
needs to complete a flow is deleted — only restated context and "why this exists" prose; `AGENTS.md`
carries the rule so a new screen doesn't reintroduce it.

**Boundaries:** never cut copy that is the only place a constraint is stated (e.g., a warning before
a destructive action) — the rule is about explanation, not about removing information the user needs
to decide.

### B-99 · Recurring placement — spec, 2026-09-29

Decided from the existing rule (`AGENTS.md`, "Recurring flow"): two lists + one rule screen, a list
never opens another list. `DQ-99` raised two separate things — where Recurring sits, and "something
felt off at the bottom of Plan" — only the first is scoped; the second stays open (not enough signal
to act on, per the ticket's own note).

**Behaviour.** No move. Recurring stays on Plan's header rail; the Home bell still opens `/upcoming`.
Reasoning: the existing rule already gives Recurring a home that isn't a person or group screen — a
recurring rule can span groups or be personal-only, so anchoring it to one person would put a
household bill's rule on an arbitrary member. Plan (money-wide) is the correct scope; a per-person
"recurring with them" view is a filter ON that list, not a new location for the rule, and isn't
scoped here.

**Accept:** no code change; `docs/FINDINGS.md`'s `DQ-99` row updated to record the decision and why,
with the "bottom of Plan" half left explicitly open.

**Boundaries:** don't move Recurring off Plan without a concrete per-person use case written down
first — moving it back later costs more than leaving it.

## Phase 5c — Forms, group screen, truncation (`SPEC-FORMS-GROUP.md`) — planned 2026-09-30

Tasks and checkboxes: `todo.md` Phase 5c. Order A → B → C → D, a checkpoint (commit, push, device look) after each.

```
AmountRow ─► MoneyEditorSheet ─► AssetSheet / PayCardBill ─► goal sheets, GroupForm (N2)
useFullTextOnHold ─► ListRow / Chip ─► GroupHeaderCard (G1)
FilterBar layout (G2) ─► Tags filter
oneLine (N1), members add-first (N3): independent
```

- Each task is a vertical slice: primitive + its first real consumer, never a primitive alone.
- Every rule of the "use X, not Y" kind gets a source guard; every piece of logic a pure tested helper — no render tests exist.
- Biggest risk: task 7 (`FilterBar`) changes three screens at once. Props stay identical so callers don't move.
- Edit group's inputs are `finance/GroupForm.tsx`; fixing that fixes Edit group.

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
