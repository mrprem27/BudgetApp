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
- [ ] **CP1** — gates · SYSTEM.md query-module count (25 → 26) committed with M1 · commit · push
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
- [ ] **P3 · Person screen action (S)**
  - Files: `app/person/[id].tsx`, a picker sheet under `src/components/finance/`
  - Accept: only eligible pairs are offered; the confirm names both people and the number of entries that move
  - Verify: `tsc`; the full suite
- [ ] **CP2** — gates · deploy · commit · push

## Phase 3 · The money engine (`docs/SPEC-ENGINE.md`)

Old F1 (cushion patch) dropped: the engine removes the threshold it would have fixed.

- [ ] **EN1 · Snapshot + personas (M)** — `db/queries/engineSnapshot.ts`, 5 personas via real write paths · Accept: parts equal today's `getSafeToSpend` on demo + personas; each field pinned to its source
- [ ] **EN2 · First slice → dev screen (M)** — everyday rate, deterministic projection (30 d), `safeToSpend` v2, `app/dev/engine.tsx` (dev tools only) · Accept: equals today's figure when no bill is dated inside the horizon; every difference names its event
- [ ] **EN3 · Uncertainty band (M)** — seeded PRNG, 7-day block bootstrap ×500, P10/P50/P90, P20 low point, floor = a week of essentials · Accept: deterministic; empty sample → known path exactly; < 100 ms / year; P20 falls as variance rises
- [ ] **EN4 · Afford v2 on the dev screen (M)** — verdict rules, ranked reasons, largest comfortable amount, Need/Want + Now/Can wait · Accept: property tests (⟺ StS, monotonic, more income never worse, No only on shortfall); persona goldens; recurring ₹2,000 > one-time ₹2,000
- [ ] **EN5 · Income + receivables (M)** — income model, horizon to next income (min 30, irregular 60), Beta-binomial repayment in the simulation · Accept: payday horizon; freelancer 60 d; no-history friend = prior; tipping receivable named; a guard that the rating never syncs
- [ ] **EN6 · True expenses, 12-month horizon (M)** — sinking funds, "unfundable → No" · Accept: ₹60k fee claims only its accrual; March made unfundable → No today; no double subtraction
- [ ] **EN7 · Confidence + explanation (S)** · Accept: every reason renders with only result numbers; thin-data persona → no verdict + "what's missing"
- [ ] **EN8 · Back-test + ship gates (M)** — spec §8 · Accept: gates pass on personas, or the surface is marked facts-only with the reason recorded
- [ ] **CP3 DEVICE (yours)** — the dev screen on your real ledger: do the new Safe-to-Spend and Afford answers make sense? **No switch before this.**
- [ ] **EN9 · Behaviour, the rest (M)** — category model, seasonality, exceptional days, fixed/variable, Need/Want learning · Accept: spec E2 acceptance
- [ ] **EN10 · Switch Safe-to-Spend (S)** — Home + `StsSheet` tap-through (`DQ-103`), layout from O-103 · Accept: parity notes committed; no screen calls the old formula
- [ ] **EN11 · Switch Afford (S)** — `app/afford.tsx` + the Add screen hint, layout from O-100; delete the six checks · Accept: a guard that no `evaluateAfford` caller remains; EN8 gates still pass
- [ ] **EN12 · Signals, one surface per commit (S each)** — forecast card + budget bar · low-point warning · unusual spend · recurring analysis · savings suggestion · Insights · health Spend/Save · Accept: same number or a written, justified difference; nothing below its minimum
- [ ] **CP3b** — gates, commit, push after each switch; device look at Home, Afford and Insights after EN11

## Phase 4 · UPI payment redesign (`DQ-98`)

- [ ] **U1 · Logos (S)** — `logo` on `UpiAppSpec`, `assets/upi/*.png` from official artwork, `UpiAppIcon` with a monogram fallback · Accept: a guard fails on any spec without a logo or pointing at a missing file
- [ ] **U2 · Default app (S)** — `settings.upiLastApp` + pure `pickDefaultApp` · Accept: last-used → popularity order → none; an uninstalled last-used app falls back
- [ ] **U3 · Button + grid on Scan & pay (M)** — `finance/pay/UpiPayButton`, `finance/pay/UpiAppGrid`, `useUpiHandoff.payWith/defaultApp`, `ScanPaySheet` rebuilt · Accept: blocked apps shown with their subtitle; VPA first, name marked unverified; UPI invariants hold
- [ ] **U4 · Settle-up + Request QR; delete the old picker (S)** · Accept: a guard finds no `ActionSheetIOS` in the pay code and exactly three `UpiPayButton` call sites · Android keeps handing off to the OS chooser (U5 deferred), so the button shows no app logo there
- [ ] ~~**U5 · Android package targeting (M)**~~ — **DEFERRED 2026-09-26 (user).** Android keeps the OS chooser for now; revisit with the Android port — package names on specs, `expo-intent-launcher` (**new dependency**), `<queries>` in `app.json`, the "Other UPI app" tile · Accept: `tsc`; the suite; the prebuild config holds · **needs a rebuild**
- [ ] **CP4** — gates · commit · push
- [ ] **CP4 DEVICE (yours, iOS)** — pay with the default app · Change → another app · relaunch → new default kept · Request QR scanned from a second phone

## Phase 5 · Your decisions (`DQ-99`, `DQ-101`, `DQ-102`, and the engine's two screens)

Options tasks come first; each build task is sized once you've picked.

- [ ] **O-103 · Safe-to-Spend screen options** (after CP3) — tap-through lines, the band, "cash last confirmed" → you pick → built in EN10
- [ ] **O-100 · Afford screen options** (after CP3) — headline, ≤ 2 reasons, the two chips → you pick → built in EN11
- [ ] **O-101 · Settings options** — consolidated rows → you pick
- [ ] **B-101 · Build the pick**
- [ ] **O-102 · Copy rule** (after B-101) — one line for `AGENTS.md` → you approve
- [ ] **B-102 · Copy pass**, screen by screen
- [ ] **O-99 · Recurring / Upcoming options** → you pick
- [ ] **B-99 · Build the pick**

When each Phase 5 item closes, its tracker row moves to `DONE` and its `FINDINGS.md` entry records the answer.
