# V2 Launch Checklist

> **The single list to read before shipping.** Open work was scattered across
> `DEBT_TRACKER.md`, four other planning docs and ~20 memory files, so "are we ready?"
> could not be answered. This file answers it.
>
> **Rules.** Every claim cites `file:line` — a claim without evidence gets deleted, not
> debated. This file **links to** `DEBT_TRACKER.md` rather than restating it; the tracker
> stays the record of *why* something is owed, this is the record of *what blocks launch*.
> Re-verify before believing any row: rows rot faster than code.

**Target: limited pilot** (TestFlight / friends). Decided 2026-08-11.

---

## Do it in this order — smallest first

Sizes are rough and relative, not estimates. ⛔ = a **§1 launch blocker**: it breaks for real
pilot users, so it jumps its size bucket if you are short on time.

### First — the correctness bugs (§0)

Not all large, but all *wrong money*. **All nine are done.**

| Status | Task | Size | Needs a decision? |
|---|---|---|---|
| ✅ `99601c7` | 0.1 personal settlement leaking into the global net | S | — |
| ✅ `99601c7` | 0.2 `recur_freq IS NULL` on all four balance aggregates | XS | — |
| ✅ `14c5fa4` | 0.5 card baseline split from the "last edited" stamp | XS | — |
| ✅ `e0fdd32` | 0.3 pause/resume preserves `recur_end`; the dormant gap is written to `recur_skip` instead of back-posted | S | — |
| ✅ `4491769` | 0.4 materialization now copies `pay_method`, `currency`, `source`, `tz`, `lat`, `lng`, `place_label`; the test asserts on the **column set**, not named fields | S | — |
| ✅ `0880152`+`ced6264` | 0.9 one forecast model (`forecast.ts` everywhere); goals engine — ties, reorder permutation, completed raids. `priority` remove-or-revive — **decided: revive** (#15) | M | — |
| ✅ `e0fdd32`+`a522d77`+`0e2aa6e` | Tier 1 — **all 11**. Backup photos are opt-in with URIs rewritten on restore; the app-lock failure path speaks; the residue (turning the lock *off* needed no auth) is closed too — `toggleLock` now requires biometric/passcode auth to disable, with a stranding guard when no hardware/enrollment exists | M | — |
| ✅ `0880152` | 0.6 one `rollUpBudgets`, keyed by target period. **Decided:** a budget rolls *up* only — `daily × real days`, `monthly × 12` into a year; `yearly`/`once` are **pools**, never ÷12 | M | — |
| ✅ `0880152` | 0.7 / 0.8. **Decided:** "spent" is what happened — every window ends at `now`; Reports is **my-share**, like every other surface | M | — |

**§0 is closed** (2026-08-12). The two decisions that were blocking 0.6 and 0.7/0.8 were made
and the work shipped with them.

**0.6 turned out to be bigger than this list said.** Not five functions but **nine**, and the
worst was on no list: `analytics.ts` summed raw allocations across cadences *and* summed each
line's spend from its **own** window (daily → today, yearly → this year), then divided one by
the other. That quotient was not a wrong percentage, it was not a percentage — and it fed the
group Budget tab, Reports, the Groups list, Home's health engine and the Plan forecast, where
a ₹24k/yr budget made a *monthly* forecast look comfortably funded. `rebalance.ts:46` was the
one module that already had the rule right ("a yearly budget's headroom is not spendable this
month"); the rest now agrees with it.

**The suite was one root cause, and that one is fixed.** `jest.config.js` mapped `expo-sqlite`
to an **empty stub**, which made every module in `src/db/queries/` *unexecutable* — no assertion
about `balances.ts`, `recurring.ts` or `moneyProfile.ts` could ever have failed, whatever the
SQL said. It is now a real in-memory implementation over `node:sqlite`
(`__mocks__/expoSqlite.js`), exactly as AsyncStorage already was.

⚠️ **"Now fixed" was too strong, and this is the correction.** A *second*, unrelated blindness
survived it: nothing in the suite asserted what **survives** a scoped destructive write. That
let `f9d0e9c` — a save path that silently deleted budget lines the editor could not render —
pass **1335 green tests**. Executable modules were necessary and not sufficient.

Two consequences, both now standing rules:

- **A regression test is verified by reverting its fix and watching it fail.** Green is not
  evidence unless something was capable of turning red. Every fix since `f9d0e9c` has been
  checked this way.
- **A destructive replace needs a preservation assertion**, not just a replacement one.
  `updateTxn` and `updateItemizedTxn` — the two paths that rewrite money rows in place — had
  **no tests at all** until `5fd3173`; see `txnUpdate.test.ts` for the shape to copy.

Use **`openTestDb()`** from `src/__tests__/dbHarness.ts` — it applies `SCHEMA` *and*
`COLUMN_MIGRATIONS`, because `SCHEMA` alone is months out of date (the first attempt died on
`table txn has no column named currency`).

Worked examples: `recurringMaterialize.test.ts` (real query module, real schema),
`balancesSql.test.ts` (real SQL, in-process), `moneyProfile.test.ts` (fake only the methods
the module calls).

### XS — an hour or less

| | Task | Detail |
|---|---|---|
| 1 | **Buy the Apple Developer Program** | Gate 0. Smallest task here, unlocks the most |
| 2 | ⛔ Confirm demo/seed data is off for release builds | §1 |
| 3 | Insights month pill | **DONE** — ✅ Deleted. Neither option was right: the eyebrow one line below already prints the month, so a plain label would duplicate it |
| 4 | Review footer CTA wraps and breaks the 52pt button height | **DONE** — ✅ `PrimaryButton` truncates at one line (fixes every caller, not just Review) |
| 5 | Filter chips hard-capped at `maxWidth: 160` | **DONE** — ✅ Cap removed; the row already wraps |
| 6 | Goals — FAB covers the last card (use `useContentInset`) | **DONE** — ✅ `useContentInset({ fab: true, tabBar: true })` |
| 7 | Goals — raid prompt lists names but not ₹ | **DONE** — ✅ Per-goal ₹ in the prompt |

### S — a few hours

| | Task | Detail |
|---|---|---|
| 8 | ⛔ Deploy the OCR proxy, set `EXPO_PUBLIC_RECEIPT_OCR_PROXY_URL` | §1 |
| 9 | Device-check `expo-file-system/legacy` | **NOT A BLOCKER** — ⛔ dropped. The legacy API is fully implemented in `expo-file-system@56.0.8` and the shim does not throw; our own comment claiming otherwise was false and is corrected. One device smoke test still closes it |
| 10 | Review tab labels | **DONE** — ✅ `TabPills` takes a per-tab `badge`; `TXN_SOURCE_LABEL_SHORT` for the strip. The label shrinks, the count never does |
| 11 | Insights x-axis | **DONE** — ✅ **Both were needed.** Measuring moved 9.7px → 10.5px against the ~12px two digits require, so the series is also bucketed weekly (~58px). Forecast maths unchanged |
| 12 | Insights — one forecast model, not two | **DONE** — ✅ Hero + chart both read `forecastMonthEnd` |
| 13 | Savings insights — make deterministic | **DONE** — ✅ Seeded on candidate text + day; rotates daily, stable within a day |
| 14 | Goals — exclude completed from the raid; fix the reorder permutation | **DONE** — ✅ Both, plus the pre-drag tie now mirrors funding |
| 15 | Goals — `priority` is dead code | **DECIDED: revive, not remove** (superseding the earlier "remove" call — see below). ✅ Repurposed as a real, user-set **Emergency / Need / Want** protect-from-raid tag: `CHECK(priority IN ('emergency','need','want'))` (one-time table rebuild, `medium→need`/`high→emergency`/`low→want`), a picker in both the New Goal and Adjust Goal sheets, and `planOverspendRaid` now excludes `emergency` outright and raids `want` before `need`. `planAutoAllocations` funds in the same tag order, `sort_order` (drag) breaking ties within a tag. This also closes #23 below: the Goals list now renders three sections by tag, which *is* the fund/protect split — drag reorders within a section, the section is the protect order. |
| 16 | QR from a photo (`scanFromURLAsync`, no new dependency) | **DONE** — ✅ `src/lib/qrFromImage.ts`, wired into both scanners |
| 17 | Group budget — relabel to "my share" | **DONE** — ✅ Label-only, as predicted: the engine already passes `meRow?.id`. **Resolves D1**; ~~D3 (health engine) stays open~~ — D3 closed too, see §2 |
| 18 | WhatsApp reminder — composer + share sheet | §3.4 |
| 18b | **Deploy the account/backup Worker** — `server/api/README.md`: D1 + R2 + a domain onboarded to Email Sending, then `EXPO_PUBLIC_API_URL` and a native rebuild. Optional: skip it and the app ships exactly as it does today, with no account UI | §6b |

### M — a day to a few days

| | Task | Detail |
|---|---|---|
| 19 | ⛔ Test `category_global_v1` against a populated DB | §1 |
| 20 | ⛔ Privacy policy, store listing, icon, splash, screenshots | §1 |
| 21 | Money model — per-method baselines | §3.2 |
| 22 | Insights — restructure into three tiers | §4.3 |
| ~~23~~ ✅ | ~~Goals — list redesign; split fund order from protect order~~ | Done via #15's Emergency/Need/Want tag — see §4.4 |
| 24 | Import — restructure *(~~bundle pdf.js locally~~ ✅ done 2026-08-17)* | §3.3 |
| 25 | Push notifications (needs Gate 0) | §3.3 |
| 26 | Device verification sweep — UPI on Android, Google Pay, Pass 4 | §5 |

### L — a week or more

| | Task | Detail |
|---|---|---|
| 27 | Widget | §3.3 |
| 28 | In-app mic — needs a native module | §3.1 |
| 29 | App Intents | §3.1 |
| 30 | Goals — surplus sweep | §4.4 |
| 31 | Scheduled reminder nudge (after the pilot) | §3.4 |

### XL — months, and not V2

| | Task | Detail |
|---|---|---|
| 32 | ~~Server, login and sync — **S1 done 2026-08-17**~~ → S2 → S3 | §6b |


---

## Gate 0 — the paid Apple Developer Program ($99/yr)

Not one item among many. **Three of the four newly-scoped features sit behind it**, and so
does the distribution channel itself.

| Blocked thing | Why |
|---|---|
| Push notifications | `plugins/withoutPushEntitlement.js:19` exists *only* to strip `aps-environment`, which a personal team cannot sign. Deleting the plugin is the small part. |
| App Intents | Native Swift target + entitlements. |
| Widget | A widget extension is a second signed target. |
| TestFlight external testing | Needs App Store Connect. |

- [ ] **Buy it.** Everything below assumes it. Without it, the voice rework degrades to
      in-app mic only — which still works, and still removes the Shortcuts round trip.

---

## 0. Correctness bugs — found 2026-08-11, verified against source

**These were on no list.** The suite is green *with every one of them present*, which is the
fact to design against: each fix needs a **failing test written first**. Ordered by damage.

| # | Bug | Evidence |
|---|---|---|
| ~~**0.1**~~ ✅ | ~~**A personal transfer invents debts to people you never transacted with.** `reviewCommit.ts:163-165` writes a personal settlement one-sided — correctly, because `computeCash` does `− settledOut + settledIn` and booking both sides would net to zero. But `getGlobalNet` has **no `is_personal` filter** (only the roster query does, `:76`), so that lone share row enters the global net and `simplify()` pairs you as a debtor against whoever has a positive balance. **Reachable on a fresh install:** import a Paytm statement → "Money received from Rahul ₹10,000" is classified `settlement`/`credit` (`paytmParse.ts:158`) → Review defaults to Personal → commit → Home reads *"You owe Priya ₹10,000"*. ~~ **Fixed `99601c7`** — all four aggregates now come from one template; `balancesSql.test.ts` runs the real SQL against in-process SQLite. | `balances.ts` |
| ~~**0.2**~~ ✅ | ~~**Every owe/owed figure is inflated by recurring templates.** All four aggregates omit `recur_freq IS NULL`. A rule is a `txn` row carrying its own payment/share rows, so the template is counted *and* every occurrence it spawns is counted. Every other read path has this filter. ~~ **Fixed `99601c7`** — same template. The pre-fix SQL returned `{me: -8700, priya: -1300}`, both negative; a cross-group net summing to zero is now an assertion. | `balances.ts` |
| ~~**0.3**~~ ✅ | ~~**Resuming a paused rule destroys its end date and back-posts the gap.** `pause` sets `recur_end = now` — overwriting the user's own end date, of which there is no other copy — and `resume` sets it to `NULL`, so a rule set to "end 31 Dec" recurs **forever**. Nothing is claimed during the pause, so the next foreground materializes the whole window: pause a daily ₹300 rule for 60 days and resuming silently posts **60 rows, ₹18,000**.~~ **Fixed `e0fdd32`** — new `txn.recur_paused_at`; resume writes the dormant window into `recur_skip` instead of back-posting it. | `recurring.ts:40-41,57` |
| ~~**0.4**~~ ✅ | ~~**Recurring card spend is booked as cash.** The materializing INSERT drops `pay_method`, `currency`, `source`, `tz`, `lat`, `lng`, `place_label`. A card bill materializes as `pay_method = NULL` and counts as cash out, not debt — and since `computeCash` reads the same bad data, **the SQL/TS parity test cannot see it**.~~ **Fixed `4491769`** — materialization now copies the full column set; the test asserts on the column set itself, not named fields, so a future column can't reopen this silently. | `recurring.ts:213-221` |
| ~~**0.5**~~ ✅ | ~~**Editing investments wipes accumulated card debt.** `setMoneyProfile` stamps `updated_at` whenever *any* field changes, and that timestamp is `cardBaselineMs`. Update investments only and all prior card spend drops below the new baseline — net worth jumps overnight. `cash.ts:132-137` assumes the baseline moves only on card re-confirmation; the write path does not honour it. ~~ **Fixed `14c5fa4`** — split into `money.card_baseline_at`, moved only by a write that restates `creditUsed`. Old profiles fall back to `updated_at`, which *is* the old behaviour, so no migration. Also fixed: the editor pre-filled the **stored** `creditUsed` while the card behind it showed the **derived** one. | `moneyProfile.ts` |
| ~~**0.6**~~ ✅ | ~~**Five functions answer "what is my monthly budget."** A daily ₹500 line is ₹15,000/mo on one screen and ₹15,500 on another.~~ **Nine, not five** — and the worst (`analytics.ts`) was on no list; see the §0 note above. Fixed by one `rollUpBudgets(lines, target, on)`: a line at or finer than the target rolls **up** (`daily × real days`, `monthly × 12`), anything coarser is a **pool** reported separately and never divided down. `budgetEquivalent` returns `null`, not `0`, so a pool cannot be silently summed away. `budgetRollup.test.ts` covers the full target × cadence matrix. | `budget.ts`, `analytics.ts` |
| ~~**0.7**~~ ✅ | ~~**Reports contradicts Home.** `reportsData.ts:128` sums every member's share; `homeData.ts:100` sums mine.~~ Reports is **my-share** now — all six sites, via the shared `myShareOf` / new `myIncomeOf` (`lib/splitMath.ts`). Per-group budget *utilisation* stays group-scoped, which is **D1**, still open and deliberately untouched. | `reportsData.ts` |
| ~~**0.8**~~ ✅ | ~~**Future-dated spend gets four different answers.** A ₹50,000 fee dated the 28th, logged on the 2nd, makes Home read ₹50,000 spent and project **₹7.75 lakh** month-end; Insights reads ₹0.~~ Every spend window now ends at `now`: "spent" is what happened. Future commitments already had a home — `upcomingBills` in `getAffordSnapshot` — so nothing was lost, it moved to the surface that means it. This also exposed a latent test flake: `homeData.test.ts` seeded fixtures at **midday**, so the suite passed after lunch and failed before it. | `homeData.ts`, `budget.ts`, `analytics.ts` |

### Tier 1 — silent data loss and discarded writes

- ~~**Category rename/delete is kind-blind**, and `Rent`/`Other` are seeded as **both** expense
  and transfer. Renaming transfer-`Rent` relabels every *expense* Rent txn to a name the
  expense catalog lacks — they fold into Others and **the Rent budget reads ₹0 spent
  forever**. The UI guard only checks within the current tab. (`categories.ts:125-126,142`)~~ ✅ Both scoped by kind via `TXN_KIND_FOR_CATEGORY`; budgets are expense-only. `categoryKind.test.ts`.
- ~~**Deleting a seeded category resurrects it but not its budget** — `schema.ts:557` reseeds on
  every launch. The delete is undone; only the collateral damage persists.~~ ✅ `category_tombstone` (name, kind); the reseed skips tombstoned names, re-creating clears it.
- ~~**Editing an itemized bill moves it to today** — `useItemizedForm.ts:355` hardcodes
  `date: Date.now()` on update. A July bill fixed in August leaves July's totals and charges
  August. No date field is shown, so nothing hints at it.~~ ✅ `useItemizedForm` now carries `txnDate`, loaded from the row on edit.
- ~~**"Save" on a recurring edit can write nothing and report success** —
  `splitRecurringSeries` returns `null`, `useAddTxnForm.ts:467-478` discards it and fires
  `haptic.success(); router.back()`. Reachable through 0.3. It also drops the series' tags and
  receipt when it *does* succeed.~~ ✅ The `null` return is handled with an alert; the split now carries `tags` and `attachmentUri`.
- ~~**"All groups" settlement is direction-blind** — `settleScope.ts:76-91` ranks by amount
  without reading `from`/`to`, so a settlement can land in the one group where they owed
  **you**. The global net ends correct, so nothing surfaces it.~~ ✅ Ranks only groups running `from → to`; prepayments fall back to the largest live balance.
- ~~**`deleteGroup` leaves `pending_txn` dangling** — the row becomes permanently
  un-committable and sits in Review forever. (`groups.ts:172-195`)~~ ✅ Resets `dest_group_id`/`split_draft`/`counterparty_id` so the row stays reviewable.
- ~~**Monthly recurrence on the 29th–31st walks backward permanently** — 31 Jan → 28 Feb →
  **28 Mar** → forever, because `advance()` steps from the previous cursor and `addMonths`
  clamps. A yearly 29 Feb rule collapses after one leap year. (`recurrence.ts:169-182`)~~ ✅ `occurrenceAt` computes from the series start; all four steppers share it.
- ~~**A recurrence end date on or before the start silently means "never ends"** —
  `useAddTxnForm.ts:485` falls through to `undefined`.~~ ✅ Refused with an alert instead of falling through to `undefined`.
- ~~**The backup indicator lies** — enabling the backup *reminder* sets the same key the
  Settings row reads, so it shows "Backed up just now" to someone who never has.
  (`notifications.tsx:58-60` vs `settings.tsx:332`)~~ ✅ Split into `last_backup_at`; only a completed export or restore writes it.
- ~~**Backups exclude every photo**, and a missing receipt renders as **"Receipt attached"**
  with no `onError`. That is the state every restore lands in.~~ ✅ Photos are now an **opt-in**
  toggle on the create sheet (they dwarf the rows, so it is a choice, not a default). Restore
  writes them into *this* install's directories and rewrites every URI — the stored paths are
  absolute container paths and iOS reissues the container on every install, which is the only
  situation a restore happens in, so carrying them over would have left the same broken state.
  A photo the backup did not carry has its column **nulled** rather than left dangling, and both
  receipt surfaces now have `onError`.
- ~~**App lock has no failure path** — `LockGate.tsx:86` has no `else`; cancel or biometric
  lockout changes nothing on screen.~~ ✅ Cancelling and failing now say so, and are worded
  differently because one is a choice and the other is the OS refusing you. **Still open:** no
  auth is required to turn the lock *off* — a separate fix, in Settings rather than the gate.

### What is genuinely solid — do not "fix" these

- **Split rounding is exact**, fuzzed over ~18M cases: zero disagreements between the pairwise
  view and the ledger net, every share fully allocated (`settle.ts:67-86`).
- **Unbalanced splits cannot be written** — three independent gates.
- **Person deletion is clean** — no hard-delete path; member removal is gated on a zero
  balance, with Undo.
- **`cashSql.test.ts`** locks the SQL/TS pair with a seeded fuzz. That is the bar for the rest.

---

## 1. Ship blockers — fix before anyone else installs

- [ ] **`EXPO_PUBLIC_RECEIPT_OCR_PROXY_URL` — ~~no `.env.example`~~; confirm it is set in the build.**
      `server/receipt-ocr-proxy/` *is* in this repo (a sibling of `budgetsplit/`, tracked
      in git) and the deployed Worker is live and healthy — verified directly: correct
      Gemini key, correct model, ~4s response. The real gap is narrower than "not
      deployed": `EXPO_PUBLIC_*` bakes into the JS bundle at build time, and any build
      made without `.env` present at that moment (a stale Metro cache, a clean checkout,
      a TestFlight/EAS build) gets `undefined` and **Scan degrades silently**. An
      `.env.example` now documents the var (added 2026-08-17, alongside `EXPO_PUBLIC_API_URL`);
      what is left is **not** a code task — confirm the same value is set wherever a
      release/EAS build actually runs.
- [ ] **`expo-file-system/legacy` may already throw at runtime in SDK 56.**
      `src/lib/avatar.ts` and `ocrProviders/gemini.ts` still call it, while
      `src/lib/pdfjsCache.ts` states the legacy API throws. Jest stubs the module, so the
      green suite proves nothing. **Device check.**
- [ ] **`category_global_v1` has never run against a real existing DB**
      (`src/db/schema.ts:523`). It drops and rebuilds the `category` table. Test against a
      copy of a populated database before it runs on anyone's phone.
- [ ] **Demo/seed data must not ship enabled.** `seedDemo.ts` plus the CSV export's
      hardcoded demo-row signatures drift apart by design.
- [ ] **Privacy policy + App Store listing** — required even for external TestFlight.
- [ ] **App icon, splash, screenshots** — never audited.
- [ ] **Pass 4 was never device-tested**, and the `splitting` flag
      (`src/lib/featureFlags.ts:47`) changes the tab bar.

---

## 2. Open decisions — these need your call, not more analysis

**Two of the four are closed.** D1 (2026-08-12) and D3 (2026-08-17) are kept below with their
evidence rather than deleted, because both were decided *by shipping* and the reasoning is what
stops them being reopened. Genuinely open: **D2** (pay method for investments/crypto) and **D4**
(monetisation) — neither blocks the pilot.

### D1. What does a group budget mean? *(CLOSED 2026-08-12)*

**The evidence.** `category_budget` is stored **group-wide** — no `person_id` column
(`src/db/schema.ts:128-135`). But it is measured **against your share only**:
`getCategorySpending` picks `t.shares.find(sh => sh.personId === meId)?.amount`
(`src/lib/budget.ts:107-109`), and the group screen always passes you
(`app/group/[id].tsx:79`).

So a **₹10,000 Groceries limit on a 4-person flat is silently compared against your
quarter.** Whatever you intended, that is what ships today.

| Option | Cost | Consequence |
|---|---|---|
| **Relabel as "my share"** | Label only — the engine already does this | Consistent with Home + Insights, which moved to my-share. Cannot express "₹10k for the flat". |
| Make it group-whole | Stop filtering to `meId` | Matches how most people read the number. Changes every group budget figure now on screen. |
| Store both | New per-person dimension on `category_budget` | Most informative, most work, most schema. |

**DECIDED 2026-08-12 — relabelled, and the semantics pinned.** The line belongs to the
*group*; the **amount is one person's allowance, not a pot to divide**. ₹10,000 Groceries on a
4-person flat means ₹10,000 *each*, and you are measured against yours.

That is what the engine already did (`app/group/[id].tsx` passes `meRow?.id` into both
`getCategoryBudgetStatus` and `getBudgetAnalytics`), so this was label-only — but the first
wording shipped said "my share", which is wrong in an informative way: *share* implies your
slice of a ₹10,000 group total, i.e. ₹2,500. The labels now read "per person" and the budget
editor says so at the point of entry.

Group-whole remains a possible future mode, not a correction — revisit when multi-user is real.

**Extended 2026-08-12 — two levels, and roles.** A group now carries a **default** every member
inherits (`category_budget.person_id IS NULL`) and any member can set their own **override**
(`person_id` set), which wins for them alone. Only an admin edits the default; nobody may write
another person's override, not even an admin — with no sync yet they could not see it, so it
would silently drive their over-budget warnings from someone else's opinion.

Roles came with it, because none existed: `budget_group.created_by` (immutable) plus
`group_member.role` of `admin` | `member`. There is no `owner` role on purpose — creator-ness
lives in a column that is never updated, so "nobody can remove the creator" is a property of the
data model rather than a rule someone can edit around. Rules are pure in `src/lib/permissions.ts`
and enforced in `db/queries`, not in screens.

Two SQLite traps this hit, both found by tests rather than by reading: a four-column `UNIQUE`
including `person_id` enforces nothing at the default level (NULLs are distinct), and the
table's original `UNIQUE(group_id, category, period)` made an override impossible outright.
Fixed with two partial unique indexes and a one-time table rebuild.

**Completed 2026-08-12 — the catalog half** (`050c65c` · `f9d0e9c` · `5fd3173`).
`category_budget.category` is a **name, not a foreign key**, so a budget can name a category
your catalog lacks. Three things followed from that, in the order they were found:

1. **Budget lines now fold like spend does** (`foldBudgetStatuses`). Spend on an unknown name
   already folded into `Others`; its *budget* did not, and sat in the list as a category you do
   not have. Presentation only — no amount moves, pinned by a total-unchanged assertion.
2. **Saving no longer destroys what the editor cannot show.** `setCategoryBudgets` is a
   whole-level replace built from your catalog, so it erased exactly those folded lines. An
   admin pressing Save silently dropped a default they had never seen.
3. **Outside names are adoptable.** `getUncategorizedNames` scanned transactions only, so a
   budget-only name appeared nowhere and could be resolved from nowhere; it now unions both
   sources, and the editor lists them in a "Not in your categories" section.

Mostly forward-looking: without sync the catalog is device-wide, so divergence is hard to reach
on purpose today. It becomes ordinary with V3, and is defensive now for restores and imports.

### D2. Do investments/crypto get a pay method? *(CLOSED 2026-08-17)*

**There is no crypto concept anywhere** — grep finds nothing. `investments` is a single
manually-entered figure, read once and clamped (`src/lib/cash.ts:127`); no transaction
ever touches it.

**Decided: "move money to investments" becomes a Transfer destination — and crypto does not.**
Same mechanism as the card-repayment decision (§3.2), on purpose: one path for "cash left my
pocket and became a holding", not two. Crypto would be a new concept with its own valuation
problem, which a flat figure avoids; investments stays a flat figure that transactions can now
move.

### D3. Health engine basis *(CLOSED 2026-08-17 — resolved by `7b597e1`, ahead of this section)*

**It was decided by being built: health is rebased onto my-share.** The choice this section
framed — rebase and accept that every score moves, or keep group-total and label the card — was
taken in favour of rebasing, as a side effect of the "three concepts, two storage levels, one
reading each" budget pass, and this text simply went stale. Verified against source
2026-08-17:

- `homeData.ts` no longer calls `getBudgetAnalytics(db, g)` at all. The per-group loop is gone,
  replaced by one `getMyGlobalBudgetSummary(db, me.id)` — which by construction shares one
  window and one basis between numerator and denominator (`src/lib/budget.ts:435`).
- **Every** remaining `getBudgetAnalytics` call site passes `meId`: `groups.tsx:80`,
  `group/[id].tsx:84`, `insightsData.ts:155`, `reportsData.ts:92`. There is no identity-less
  caller left.
- Every other `HealthInputs` field was already my-share and still is: `spendPaise` /
  `prevSpendPaise` read `txn.shares` for me, `incomePaise` reads my `txn_payment` rows, and
  `netOwedPaise` comes from `getMyExposure`.

So there is no longer a place in the app measuring on a different basis, which is what made this
a product call. **Consequence, recorded rather than fixed:** anyone who had used the app before
that commit saw their health score move once, with no notice. A derived score has nothing to
migrate, so there was nothing to do about it beyond saying so here.

The second half of the option ("label the card") was **not** done and is no longer needed — the
factor strings in `financialHealth.ts` name no basis because there is only one.

### D4. Monetisation shape *(PARKED 2026-08-17 — deliberately, not forgotten)*

No paywall, entitlement or purchase SDK exists, and none of it is reusable from what does.
The decision is *when*, not *whether* — and nothing in the pilot depends on it.

**Decided: park it until there are users.** Not "decide the shape on paper" and not "build the
entitlement plumbing now" — a tier boundary drawn before anyone has used the app is a guess, and
the plumbing needs Gate 0 plus configured App Store products before a single line of it can be
tested. The feature flags stay **preferences, not entitlements** meanwhile
(see the `project_premium_tier_later` note). Revisit after the pilot.

---

## 3. Newly scoped for V2

### 3.1 Voice — mic, not a text field filled by speech

**The current design is the problem, not a bug in it.** Siri's `Ask for Input` *is* a text
field; that is exactly why it feels like a second input.

**Only the capture layer changes.** `parseVoice` (`src/lib/voiceParse.ts`),
`detectVoiceKind`, `routeVoiceDraft` (`src/lib/voiceInbox.ts`) and the auto-save path
(`app/add/quick.tsx`) all take a plain string. Every bit of it is reused.

- [ ] **In-app mic button** — on-device recognition, live partial transcript, insert on
      silence. Needs a native module: **there is no first-party Expo speech-to-text**
      (`expo-speech` is text-to-*speech*, and is not even installed). Precedent for a local
      module exists — `modules/expo-ocr`.
- [ ] **App Intents** — true hands-free, no app launch, Siri reads the result back. This is
      what `DEBT_TRACKER.md:307` has been deferring all along.
- [ ] **Retire on landing:** `voiceDrain.ts` (already marked legacy), `voiceShortcut.ts`,
      `voiceShortcutFile.ts`, `scripts/build-shortcuts.ts`, and the import→share→paste round
      trip that has now cost **six** passes.

### 3.2 Money — pay method moves the right balance *(decided: per-method baselines)*

**The enum mixes rails with accounts.** `PayMethod` (`src/constants/enums.ts:59`) lists
`upi` beside `cash` and `bank` — but UPI is a *way to move money out of a bank account*,
not a place money sits. Giving it its own pot would double-count.

| Pot | Fed by | Baseline |
|---|---|---|
| Cash | `cash` | `money.opening_cash` *(exists)* |
| Bank | `bank`, `upi`, `autopay`, `other` | `money.opening_bank` *(new)* |
| Wallet | `wallet` | `money.opening_wallet` *(new)* |
| Credit | `card` | `money.credit_used` *(exists — already works exactly this way)* |

**The pattern is already proven in production.** `card` stores a baseline and derives the
delta since `money.updated_at` (`src/lib/cash.ts:129-139`,
`src/db/queries/cashQuery.ts:32-48`), so edits and deletes self-correct and there is no
second ledger. This is that same shape, three more times.

- [ ] **It also makes `INCOME_LANDING` real.** Income already asks "Landed in ___"
      (`src/constants/enums.ts:85`) and **nothing reads the answer** —
      `src/lib/cash.ts:81` treats every income identically.
- [ ] Touches `moneyProfile.ts`, `cashQuery.ts`, `cash.ts`, `MoneyEditorSheet.tsx`,
      `TotalMoneyCard.tsx`, and the Onboarding money step.
- [x] **Card repayment — DECIDED 2026-08-17: a Transfer whose destination is a card.**
      `creditUsed` currently only grows between Plan edits (`DEBT_TRACKER.md:71`); paying the
      bill becomes an ordinary Transfer that moves cash **down** and used credit **down** in
      one recorded transaction. Chosen over both alternatives on purpose: shipping the gap
      leaves Total Money drifting pessimistically and relies on the user knowing to re-enter
      a balance, and full accounts-as-entities reopens Total Money, the settlement engine and
      the transfer flow. This needs **no new entity** — `pay_method` and the Transfer kind
      already exist, so it is a destination and a cash-side rule, not a new model.
- [x] **Investments (D2) — DECIDED 2026-08-17: the same mechanism**, a Transfer destination.
      Deliberately one implementation with the card decision above rather than two ways to say
      "money moved into a holding". Crypto stays out of scope — it would be new, not an
      extension, and a flat manually-entered figure is exactly what lets investments dodge a
      valuation story.

### 3.3 Push, widget, proper import structure

- [ ] **Push** — delete `plugins/withoutPushEntitlement.js` once Gate 0 clears. Only local
      notifications exist today.
- [ ] **Widget** — new signed target. Scope it: balance? today's spend? quick-add?
- [x] ~~**pdf.js from a CDN on first use**~~ — done 2026-08-17: both files are vendored at
      `src/assets/pdfjs/` (pdf.js 3.11.174, matching the SHA-256s already pinned in
      `pdfjsCache.ts`, still verified at load). Import works offline and depends on nobody's
      uptime; the download path, its cache directory and the storage-screen row for it are gone.
- [ ] **Import structure** — what's left of the item: `app/import.tsx` + `paytmParse.ts` are still
      one long screen and one long parser.

### 3.4 WhatsApp payment reminders — feasible, but not the automatic version

**Wanted:** keep people's numbers and nudge everyone who owes you, on WhatsApp, free.

**Half of it already exists.** `person.mobile` is a real column (`src/db/schema.ts:21`,
migration `:224`) that **nothing reads or writes** — `insertPerson` hard-codes `null`
(`src/db/queries/persons.ts:52`). It is dead schema today, like `remote_uid`. And
`getMyExposure` (`src/db/queries/balances.ts:136`) already returns the per-person netted
balance, so "who owes what" needs no new maths.

**The free path — `wa.me`, and it is genuinely free.** `https://wa.me/<number>?text=<encoded>`
opens WhatsApp on a chat with the message pre-filled. It is *your* WhatsApp account sending
your own message; there is no API, no account, no cost, and no backend. Needs no new
dependency — `expo-linking` is installed.

**⚠️ What is not possible: silent send-to-all.** Two independent walls, and the second is
the one that matters:

1. A deep link opens **one chat** and always needs a manual tap to send. WhatsApp prevents
   third-party apps from sending on your behalf, deliberately.
2. The programmatic route is the **WhatsApp Business Cloud API**, which needs a Meta
   Business account, a *separate business phone number* (not your personal one),
   pre-approved message templates, and **a backend server** — this app is local-first and
   has none. It is also **not free**: since 1 Jul 2025 Meta charges per *delivered template
   message*, ~₹0.115–0.145 for utility messages in India. Free only inside an already-open
   customer-service window, which a debt reminder is not. Meta's policy also prohibits
   unsolicited bulk messaging.

**Bulk — one send, private 1:1 delivery, no group — is a WhatsApp Broadcast List.** One
message goes out as **separate one-to-one chats**; each person sees a private message and
replies only to you. Free, up to **256 per list**, unlimited lists.

Two constraints, and the first is a silent failure:

1. **Recipients must have your number saved in their contacts.** If they haven't, they
   simply never receive it, with no error on either side. Usually true of flatmates; not
   guaranteed of a one-off trip group.
2. **Every recipient gets identical text.** A broadcast cannot say "you owe ₹450" to one
   person and "₹1,200" to another.

**That second point is the crux: personalisation is the thing that costs money.** Free bulk
means one message for everyone; per-person amounts mean either N sends or the paid Cloud
API. There is no free, one-tap, personalised route — that combination does not exist.

| Route | One send? | Private 1:1? | Personalised? | Cost |
|---|---|---|---|---|
| **WhatsApp Broadcast List** | ✅ | ✅ | ❌ same text | **Free** |
| `mailto:?bcc=` | ✅ | ✅ | ❌ same text | Free — but nobody reads email for ₹450 |
| Per-person `wa.me` | ❌ N sends | ✅ | ✅ | Free |
| Multi-recipient SMS | ✅ | ⚠️ usually becomes a **group MMS** thread | ❌ | Carrier rates |
| WhatsApp Cloud API | ✅ | ✅ | ✅ | ~₹0.115–0.145/msg + backend — rejected |

*Recommendation: a generic broadcast nudge carrying your VPA — "Settle up on BudgetSplit,
pay me at prem@okhdfc" — with the amounts staying in the app.* It is free, private, and one
action; the amounts were never the part that needed to travel.

- [ ] ⚠️ **Device-check first: can the system share sheet target a Broadcast List?**
      WhatsApp's picker shows chats and groups; whether broadcast lists appear there is
      **unverified**, and the whole recommendation rests on it. If not, the user composes in
      WhatsApp and we only supply the text via copy-to-clipboard.
- [ ] **Compose the nudge** from `getMyExposure` (`src/db/queries/balances.ts:136`) and hand
      it to `Share.share`. Needs no stored numbers and no permissions — a reason to build
      this before the phone field.
- [ ] Add a phone field beside the UPI ID in the Friends rename sheet
      (`app/friends.tsx:81`) — makes the dead `mobile` column live. Only needed for the
      **per-person** path.
- [ ] Per-person **Remind on WhatsApp** as the secondary path, pre-filled with that person's
      amount and your VPA as payable text. (A `upi://` link is **not** tappable inside
      WhatsApp — send the handle as text.)
- [ ] Multi-recipient SMS needs **platform-specific syntax**: iOS
      `sms://open?addresses=a,b&body=…`, Android `sms:a,b?body=…`. Apple does not implement
      RFC 5724's comma list, so the obvious form silently fails on iPhone. Note it usually
      lands as a **group** thread, so it does not satisfy "bulk, not group".
- [ ] **A cooldown, and never auto-send.** A reminder feature with no floor becomes a way
      to annoy your friends daily. Record `last_nudged_at`; grey the button inside it.

#### The framing that makes this work — decided 2026-08-11

The stated problem is not typing, it is **that some people are bad at asking for money**.
Automation was never the fix, and true automation is not available for free anyway (the
manual tap *is* WhatsApp's anti-spam mechanism). Two cheap moves address it directly:

1. **The app initiates, the user confirms.** *"Rohan has owed ₹450 for 12 days. Remind?"* →
   one tap → pre-filled. You never decide to chase anyone; you agree with the app. That
   moves the social burden off the user, which is the actual ask.
2. **The app is the author, not the user.** *"Sent from BudgetSplit — ₹450 from the Goa
   trip"* reads as a receipt; *"hey can you send me 450"* reads as a demand. Identical
   information, completely different social act. Costs nothing.

**Build order — the two halves are not the same size:**

- [ ] **In V2 · the composer + manual tap.** Depersonalised line from `getMyExposure` →
      `Share.share`, from any balance row. No schema, no numbers, no permission, no new
      dependency. Small.
- [ ] **After the pilot · the scheduled nudge.** Needs an overdue scan, a per-person
      cooldown store, notification routing, and a cadence that nudges without nagging —
      **and that cadence cannot be guessed from an empty pilot.** Get it wrong and users
      disable notifications, which loses the channel permanently. The manual composer is a
      strict prerequisite, so nothing is wasted by waiting.

⚠️ **In V2, but not ahead of §1.** This blocks nobody; the three §1 items break things for
real pilot users.
- [ ] `sms:` fallback for people without WhatsApp, and the system share sheet for everyone
      else — same pre-filled string, three transports.

**Who pays what — the whole point is that we never do.** Every transport below is a *deep
link*: we hand a pre-filled message to an app the user already has, and they send it as
themselves. There is no server in the path, so there is no per-message bill to us, ever.

**WhatsApp is free in every shape** — broadcast or per-person — because it is their own
account sending. `sms:` is the only transport that costs the *user* anything (their
carrier's rate, usually inside a bundled Indian plan), so it should be labelled "standard
SMS rates" rather than implied free. The comparison of routes is in the table above.
- [ ] **Say the privacy line out loud.** Nothing leaves the device: the text is handed to
      WhatsApp, and there is no server in the path. That is worth stating given the app's
      standing promise.
- [x] **DECIDED 2026-08-17: typed by hand.** A phone field beside the UPI ID in the Friends
      rename sheet — no `expo-contacts`, no native rebuild, and **no address-book permission
      prompt at all**. Asking a pilot user for their entire contact list to send one reminder is
      a bad trade when most people split with a handful of others. A "pick from Contacts"
      shortcut stays possible later if typing proves to be the friction; it is not the default
      and not in scope now.

---

## 4. UI/UX rework — with the cause, not just the symptom

### 4.1 Review header truncation *(measured)*

`ReviewSourceTabs.tsx:40` builds `` `${TXN_SOURCE_LABEL[src]} ${countOf(src)}` `` — e.g.
`"Said out loud 12"` — and hands it to `TabPills`, a **fixed equal-flex, non-scrolling**
segmented control (`TabPills.tsx:83`: `pillW = track / tabs.length`).

On a 393pt screen with 4 pills that is **~89pt per pill**; the label needs **~108pt** at
13px SemiBold. And because the count is **last in the string, the count is what gets cut** —
the one thing being scanned.

- ~~Short-form labels + count as a separate badge, or a scrollable `TabPills` variant.~~ **Done** — `TabPills` takes a per-tab `badge`; `TXN_SOURCE_LABEL_SHORT` for the strip. The label shrinks, the count never does.
- ~~Saved-view banner one-line clips the count *and* payer (`review.tsx:513`).~~ **Done 2026-08-17** — same fix shape as the tabs above, one level up: `Banner` takes a non-truncating trailing `badge`, and `review.tsx` splits the one concatenated string into `text` (the view name, which may shrink) + `badge` (`"{n} of {m} · paid by X"`, which may not).
- ~~Footer CTA wraps and breaks the 52pt button height (`review.tsx:629`).~~ **Done** — `PrimaryButton` truncates at one line (`numberOfLines={1}`), fixing every caller.
- ~~Filter chips hard-capped at `maxWidth: 160` (`FChip.tsx:18`) — the "Househol…" pattern.~~ **Done** — cap removed; the row already wraps (`FChip.tsx:24`).

### 4.2 Insights x-axis truncation *(cause found)*

`app/insights.tsx:148` sets `spacing={Math.max(8, 300 / len)}`. One point per day means a
31-day month gives **9.68px per label container**, and the chart library renders each label
in a `View` exactly `spacing` wide at `numberOfLines={1}`. One digit fits; two do not —
hence `"1…"`, `"2…"`, `"3…"`.

- ~~Measure the container via `onLayout` — `300` is a hardcoded magic width and the chart
      never measures anything.~~ **Done** — `onChartLayout` + `plotWidth()` (`lib/chartAxis.ts`).
- ~~Or bucket weekly: 4–5 fat points instead of 31 hairlines.~~ **Done, both were needed** —
      measuring alone moved 9.7px → 10.5px against the ~12px two digits require, so the
      series is also bucketed weekly.

### 4.3 Insights — ten equal cards, and two real bugs inside them

Everything is a card in one `ScrollView` with an 8px gap (`insights.tsx:327`), so nothing
is more important than anything else.

- ~~🐞 **Two different forecast models print different numbers ~100px apart.** The hero
      uses a naive run-rate — `Math.round((monthSpend / dayOfMonth) * daysInMonth)`
      (`insightsData.ts:69`) — while the chart badge uses the credibility-weighted model
      (`src/lib/forecast.ts:43`).~~ **Done** — both now read `forecastMonthEnd`, computed once.
- ~~🐞 **The savings nudges are random** — `generateInsights(ctx, maxN = 3, rng =
      Math.random)` (`savingsInsights.ts:28`) reshuffles on every pull-to-refresh. An
      insight you cannot return to is not an insight.~~ **Done** — seeded on the candidate's
      own text + the day number; rotates daily, stable within a day.
- ~~**The month pill is a fake control** — `insights.tsx:79` renders a pill-shaped muted
      `View` with **no `onPress`**. Wire it or make it a plain label.~~ **Done — deleted.**
      Neither option was right: the eyebrow one line below already prints the month.

**Proposed structure — three tiers instead of ten peers:**

1. **One headline, always present.** Today it renders *only* when overspending
   (`insights.tsx:99`), so a good month opens on a chart with no verdict. One sentence, one
   number, one action.
2. **Fact** — what happened: drivers, shifts vs last month.
3. **Forecast** — visually distinct (reuse the dashed treatment), **one model only**. Fold
   "What if…" in here; it is the same kind of claim.

Rows 6/7/8/10 are four hand-written variants of one row — collapse them.

### 4.4 Goals — cluttered list, and a sweep with real defects

Ten pieces of information per card (`GoalCard.tsx:42-96`), two of which are **the same
number twice** (`p.pct` in the bar and again in the meta).

The engine is worse. In `src/lib/savingsEngine.ts`:

- ~~🐞 **`priority` is dead code.**~~ **Fixed — revived, not removed** (#15). Now
  a real Emergency/Need/Want protect-from-raid tag with a picker in both goal
  sheets; the list is grouped into three sections by it.
- ~~🐞 **Before anyone drags, every goal has `sort_order = 0`**, so ties break on list
      order and **the newest goal is both funded first and raided first**. Funding and
      raiding are meant to be mirror images; they only become so after a manual drag.~~
      **Done** — ties now break in reverse for the raid, restoring the mirror.
- ~~🐞 **Reorder writes an incomplete permutation.** `savings.tsx:181` passes only
      *active* goals to the drag list, and `reorderGoals` writes `sort_order = i` for just
      those ids (`savings.ts:106-110`) — completed goals keep stale values and interleave.~~
      **Done** — untouched ids are appended after the ranked block, ordered by their prior
      `sort_order`/`created_at`, so every goal gets a value: a total permutation.
- ~~🐞 **A completed goal can be raided.** The filter checks `locked` and `saved > 0`,
      never `saved >= target` (`savingsEngine.ts:104`).~~ **Done** — `planOverspendRaid`
      now excludes any goal where `saved >= target`.
- ~~🐞 **The raid prompt hides the amounts** — `savings.tsx:127` lists goal names only,
      though `withdrawals` carries `amount`. You approve a raid without seeing ₹.~~ **Done**
      — the prompt reads `{name} {amount}` per goal.
- [ ] **There is no surplus sweep at all.** Nothing pushes an underspent month into goals;
      the only automatic inflow is the fixed per-goal allocation.

**Proposal:** one number per row (progress), detail on tap; ~~separate "fund first" from
"protect from raid" instead of overloading one drag axis~~ **done** — the
Emergency/Need/Want tag is the protect axis, drag stays the fund axis within a
tag (#15); ~~show ₹ per goal in the raid prompt~~ **done**; add the surplus sweep
as an explicit opt-in — still open.

### 4.5 Scan & Pay

- ~~**QR from a photo needs no new dependency.** `expo-camera` ships `scanFromURLAsync`
      (**called nowhere** — grep returns 0) and `expo-image-picker` is already installed for
      receipts. Both scanners are live-camera only (`ScanPaySheet.tsx:210`,
      `UpiQrScanner.tsx:56`). Cheap win.~~ **Done** — `src/lib/qrFromImage.ts`, wired into
      both scanners.
- [ ] **Why the UPI ID is kept:** it is a *settlement identity* — theirs to pay, yours to be
      paid (`person.upi_vpa`, read by `useAddTxnForm.ts:244-264` and the request-QR flow —
      moved out of `TransferBody.tsx` when it relocated into `finance/add/` and stopped
      computing its own payee/hand-off). Scan & Pay does **not** use it; that payee VPA is
      never persisted.
- ~~**Say the quiet part on screen.** PhonePe, Paytm, Amazon Pay and WhatsApp reject
      externally-built intents (`⛔ F8`), so for those the "payment option" is cosmetic —
      the app opens bare and you re-enter the amount.~~ **Done** — `useUpiHandoff.ts:98-100`'s
      `handoffVerb()` + `ScanPaySheet.tsx:328-334`'s *"Opens {app} — enter it there"* copy.

---

## 5. Device verification — nothing here is provable from a green test suite

- [ ] **Android has never run the UPI path at all** (`F9`). `useUpiApps` returns `null`, so
      no per-app finding on record applies to it.
- [ ] **Google Pay — the largest UPI app — has never been tested** on iOS
      (`gpay://` vs `tez://`).
- [ ] 5 iOS schemes are `provenance: 'unverified'` (`upiIntent.ts:235-282`) — a wrong path
      drops the payee.
- [ ] `emvQr.ts` was written from the EMVCo spec, **never validated against a real QR**.
- [ ] `detectVoiceKind` has never seen real `en-IN` dictation.
- [ ] Review's saved views / filters / bulk actions — built, never device-tested.
- [ ] The three release-gated items in `V2_FIX_PLAN.md:387` (UPI button, household persona
      card, backup row).

---

## 6. Known-and-accepted for the pilot

Not blockers. Listed so nobody re-discovers them as bugs.

- Attachment and avatar files **orphan forever** on delete (`DEBT_TRACKER.md:291`); only a
  manual "Delete all receipt photos" exists.
- `openDB()` re-runs ~40 `ALTER`s every launch (`DEBT-01`).
- `PRAGMA foreign_keys` is **OFF**; cascades are hand-rolled.
- Voice auto-save has no off switch — the guard is Undo plus the duplicate prompt.
- Files over the ~300-line rule: `review.tsx` 749, `Onboarding.tsx` 793, `itemized.tsx` 614.
- 45 files still import the `src/constants/*` shims instead of `src/theme`.

---

## 6b. Server, login and sync — requirements *(raised 2026-08-11; **S1 built 2026-08-17**)*

**This is not a feature. It changes what the app is** — from local-first with no server, to
client–server with accounts. ~~Financial data leaves the device, so the "nothing leaves your
device" copy becomes false wherever it appears.~~

**Status: S1 is built and in the repo, undeployed.** `server/api/` (Cloudflare Worker: D1 + R2 +
Email Sending) plus the client side — `src/lib/serverApi.ts`, `app/settings/account.tsx`,
`app/auth.tsx`, and server backup/restore rows in `app/settings/backup.tsx`. Two things kept the
change from redefining the app:

- **It is opt-in twice.** No `EXPO_PUBLIC_API_URL` in the build ⇒ no account UI, no requests at
  all. With it set, still nothing leaves until the user signs in *and* taps a backup action.
- **Financial data still does not leave in readable form.** What goes up is the same
  passphrase-encrypted envelope `lib/backup.ts` already built for the share sheet. The server
  holds email + name + avatar + opaque blobs. There is no sync — the ledger is still local.

Remaining before it can be used by anyone: a domain onboarded to Email Sending, `wrangler deploy`,
`EXPO_PUBLIC_API_URL` set, and a native rebuild (new dep: `expo-secure-store`, where the session
token lives). S2/S3 are untouched.

### What was asked, restated precisely

| | Requirement |
|---|---|
| **R1** | Real login + setup against a server |
| **R2** | A backup restorable **only by its owner** — *stated as the base reason for login* |
| **R3** | Server-stored user config |
| **R4** | **Selective** sync — the user picks what goes up (transactions, person details, …) |
| **R5** | Manual **pull**, or auto-receive when switched on |
| **R6** | A group syncs only when **all its members are properly synced** |

### Encryption is out of scope at every level — decided 2026-08-11

**R2 does not need it.** "Only I can restore my backup" is an **authorisation** rule, not a
cryptographic one: the server checks you are logged in as the owner and refuses everyone
else. That is ordinary access control and it is what almost every app does.

This also removes what would have been the hardest part of group sync — per-group keys
wrapped per member, with rotation on every membership change. **Without encryption, S3 gets
substantially cheaper.**

Two consequences, recorded as fact rather than as an argument to revisit:

- Whoever operates the server can read every user's financial data. That is a normal
  posture; it just has to be a *stated* one.
- Adding encryption later is expensive — re-keying cannot run server-side, since the server
  will not hold keys. Not a reason to do it now; a reason not to promise it.

**What S1 actually shipped is stronger than that bar, for free** *(2026-08-17)*: backups are the
existing `encryptPayload` envelope, so the server stores ciphertext it cannot open and the
passphrase never leaves the phone. No new crypto was written — the client-side encryption already
existed for the share-sheet flow, and the server just never learned how to read it. The decision
above still stands for **S2/S3**, where per-record sync genuinely would need server-readable data;
this note records only that S1 did not have to pay that price.

### Finding 1 — two different products are conflated here

| | Needs | Size |
|---|---|---|
| **Backup & restore** (one user) | Auth + a blob store | Small |
| **Multi-user group sync** | Conflict resolution, invitations, identity merging, membership | **Large** |

They share only the login. Backup delivers most of the immediate value — *"I lost my
phone"* is the real pain today — for a fraction of the work.

### Finding 2 — ~~the schema is already well positioned~~ **only `txn` is** ⚠️ *(corrected 2026-08-17)*

The original claim was that "the schema is already well positioned… `created_at`,
`updated_at` and `is_deleted` — the three fields last-write-wins sync needs." **That is true
of `txn` and of no other table.** Audited column-by-column against `src/db/schema.ts`:

| Table | Has | Missing |
|---|---|---|
| `txn` | `created_at`, `updated_at`, `is_deleted` | — ✅ |
| `budget_group`, `recur_skip`, `savings_goal`, `savings_txn` | `created_at` | `updated_at`, `is_deleted` |
| `person`, `group_member`, `category`, `category_budget`, `settings` | — | **both** |

Why it matters, in the two ways it goes wrong:

- **No `updated_at` → no last-write-wins.** There is nothing to compare, so "newest wins"
  has no meaning for a renamed person, an edited budget line or a moved goal.
- **No `is_deleted` → deletes cannot propagate.** Device B does not learn a row was
  removed; it still holds it, and pushes it back. Delete a friend on your phone, and your
  tablet quietly restores them.

So S2 does **not** start with network code. It starts with a migration across ~9 tables plus
every write path that touches them, using the guarded one-time rebuild pattern
`applyCategoryGlobalMigration` / `applyGoalPriorityRevival` already establish — and a
scanning test in the shape of `txnInvariant.test.ts` so it cannot rot afterwards.

`txn_payment` / `txn_share` / `line_item` are exempt on purpose: they sync **inside** the
txn document (Finding 3), never as rows of their own.

What the original finding got right, and still stands:

- `person.remote_uid` (`src/db/schema.ts:22`) was reserved for exactly this and is still
  unused (`persons.ts:54` writes `null`). It stops being dead schema.

### Finding 3 — sync a transaction as one document, never row-by-row ⚠️

A txn plus its `txn_payment` and `txn_share` rows is **one atomic fact**. Merging payments
from one device with shares from another yields a split that does not balance — i.e.
**silently wrong money**, the worst possible failure for this app. Last-write-wins on the
whole document; never per row.

### Recommendation — a ladder

| Phase | What | Status |
|---|---|---|
| **S1** | Login + backup & restore | **Built 2026-08-17**, undeployed — `server/api/README.md` |
| **S2** | Multi-device sync for **one** user | Not started |
| **S3** | Multi-user group sync | Not started |

### Answering "can we just do the group part for V2?" — no, and here is why

The premise was *"without sync a user cannot connect with other people for groups."*
**Groups already work today, entirely locally** — add people, split, track who owes what,
settle up. What is missing is narrower: *the other person seeing it on their own phone.*

And **the group part is the hardest rung, not a shortcut past the others**:

- **Accounts must exist first.** You cannot share a group with someone who has no identity,
  so S1 is not skippable.
- **Identity merging.** Your `person` row named "Rohan" must be bound to Rohan's actual
  account. Today `person` rows are arbitrary local records. This is why every real split app
  is accounts-first — it is not an accident.
- **Multi-writer money.** Two people editing one split concurrently is exactly where
  wrong-money bugs live. See Finding 3.

**A cheaper bridge already exists in the codebase.** A group exports to CSV and
`src/lib/importParse.ts:148` re-imports its own export — a manual device-to-device
round-trip. Paired with the §3.4 nudge, one-sided tracking works: you keep the book, you
remind, they pay. That is how most people use a split app regardless.

### Identity model — decided 2026-08-17

Asked and answered in one pass, after the observation that **this is a personal-finance app
first and a splitting app second** — which is what killed the username.

| Decision | Answer | Why this one |
|---|---|---|
| **Phone number** | On the account, **unverified** | Verification means an SMS provider, India's DLT registration and per-message cost, plus a second auth path to maintain — before the pilot has a user. The magic link stays the only proof of identity. A `phone_verified` flag can be added later without a migration. |
| **Finding friends** | **No username.** Invite link / QR | A handle is a namespace to allocate, moderate and defend, for a social gesture most users make once. Nothing is searchable, so nobody can check whether a number they hold uses a finance app. Reuses the QR machinery already built for UPI (`RequestQrSheet`, `UpiQrScanner`, `qrFromImage.ts`). |
| **A friend's number** | The **local value always wins** | What the account holds is a default offered once, not a binding. You may know a different number for someone than the one they signed up with, and the app must not "correct" you. |
| **Adding a friend** | Stays **local, offline, no account** | Linking is additive. The app's real advantage — tracking a split with someone who will never install it — is not traded away for identity tidiness. |
| **Sharing your number** | Per link, each side controls their own | This is what "share it with *some* friends" means concretely: a flag on the link row, not a global profile setting. |

### Pre-mortem — nine ways this goes wrong *(2026-08-17)*

Found by auditing the code against the design, before any of it was written. Each cites what
it was found in. Recorded here because a pre-mortem is worth far more before the code exists
than after.

| # | Fault | Wall |
|---|---|---|
| **F1** | An invite link is **made to be forwarded** — first stranger to tap gets linked, and gets your number if that flag is on | **Sender approves the claim.** Tapping creates a pending request naming who claimed it; nothing binds until approval |
| **F2** | "Stop sharing my number" **cannot take it back** — it is already on their device | Word it as a disclosure ("Shared with Rohan on 12 Aug"), never as a revocable permission |
| **F3** | Document-level LWW **silently discards a co-editor's edit**, and the shares-sum-to-payments invariant still passes | **Compare-and-set** on `updated_at`; the server rejects a stale write and the app raises a conflict. Never silent LWW on money |
| **F4** | `attachment_uri` is a `file://` path from **another device** — "Receipt attached" over nothing | Rows only; photos never sync, and the receiving device nulls the URI through the helper `restorePhotoFiles` already uses |
| **F5** | `seed.ts` writes `is_me = 1` with a fresh `uuid()` per install, so **one account gets two "me" rows** — and every my-share figure silently reads one of them | Bind the local `is_me` row to the account (`person.remote_uid`) at sign-in; sync maps the remote me onto it rather than inserting |
| **F6** | `category` has `UNIQUE(name, kind)` **and** an existing `category_tombstone`; adding `is_deleted` means delete-then-re-add "Groceries" fails | No `is_deleted` on `category` — sync it through the tombstone table that exists for this |
| **F7** | `settings` holds the money profile **and one-time migration flags** (`schema.ts:771-786`); syncing it wholesale makes a device **skip a migration and record it as done** | Sync an explicit key allowlist. Migration flags are device state and never in it |
| **F8** | Email is the only identity and **cannot be changed or merged** — a typo at sign-in is a second account with none of your backups | A change-email flow, or at minimum show the signed-in email wherever a restore is offered |
| **F9** | Restore replaces everything **and, with sync on, propagates** — today's Alert says "this device", which stops being true | Restore is refused while sync is on; turn sync off first |

### Decisions still open

- [x] **Identity — decided 2026-08-17: email magic link only, no password, no Sign in with
      Apple.** One code path on both platforms, nothing gated behind Gate 0, and no SMS/DLT
      cost. The link is delivered by Cloudflare Email Sending from the same account the Worker
      runs on, and lands via `https://…/auth/open` → `budgetsplit:///auth?token=…` (mail clients
      won't render a custom scheme). Sign in with Apple stays possible later — it would add a
      second way to reach the same `users` row, not replace this one.
- [x] **R6's blocking rule — DECIDED 2026-08-17: sync among whoever has joined.** Members with
      accounts sync; everyone else stays a local-only participant, clearly labelled, behaving
      exactly as they do today. Chosen because it is a **strict superset of current behaviour**
      — nothing gets worse for anyone — and because the literal reading (all-or-nothing) lets
      one person who never installs freeze a group for everybody, and that hold-out is usually
      the person you most need to track. Rejected a per-group toggle: it asks the user to pick
      between two behaviours neither of which they have seen yet.
- [x] **R4 granularity — DECIDED 2026-08-17: per data type**, not per row. You choose by kind
      (personal transactions, people details, goals, budgets); a **shared group always syncs as
      a whole unit**, which is what keeps splits balanced — see Finding 3 above: a txn plus its
      `txn_payment` and `txn_share` rows is one atomic fact. Per-row withholding was the literal
      ask and is where wrong-money bugs live: a group whose members each hold back half its
      transactions cannot produce a balance anyone agrees with. All-or-nothing per device was
      rejected as dropping R4 entirely.
- [ ] **Non-engineering cost.** India's DPDP obligations once personal data sits on a
      server, a rewritten privacy policy, hosting, uptime and someone on call.
- [x] **Reword "nothing leaves your device"** — done 2026-08-17 in the same change that shipped
      S1: `VOICE_SHORTCUT_PRIVACY`, `help.tsx`'s "Offline by default", `Onboarding.tsx`'s "No
      account needed", the backup screen's explainer, and `FEATURES_AND_FLOWS.md` §19. All now
      say *nothing is uploaded unless you ask*, and name both exceptions (cloud receipt scan,
      server backup). **The store listing is still yours to update** — it isn't in this repo.
- [ ] **Privacy policy + DPDP.** Unchanged by S1 being opt-in: the moment one real user signs in,
      an email address is personal data on a server you operate.

**S1 done. S2/S3 remain V3.**

---

## 7. Explicitly out of scope — dropped, not deferred

| Thing | Why |
|---|---|
| **Gmail live ingestion / CASA** | Restricted scope, Tier-3 assessment, ~$thousands/yr. The paste + file import path stays. |
| **Account Aggregator** | Needs a partner. Not started, not scoped. |
| GPay auto-import | Blocked on an unknown export format (`F4`). |
| Android SMS reading | Play-policy dead. |
| Multi-currency | Needs historical rates; get it right on day one or not at all. |
| Real multi-user sync | Scoped as **V3** — see [§6b](#6b-server-login-and-sync--requirements-raised-2026-08-11). `person.remote_uid` was reserved for it and is still unused. |
