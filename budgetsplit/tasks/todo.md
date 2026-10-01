# HANDOFF — 2026-10-01, night (read first; continue from here)

Branch `claude/branch-selection-gi7lyy`. **Commits ahead of origin, NOT pushed** (push needs the
`mrprem27` account switch, see Rules). Server deployed after the folder split (U-84); nothing server-side
changed since but its README. Gates at the last full run: 3,026 tests green, tsc clean for the app.
Nothing from today has been seen on a phone. Tracker: 310 items (94 open), 101 in §11.

## Built today, all committed (the why is in FINDINGS §11, U-71 to U-101)
Earlier: speed, budget and recurring cards, person page, Members tab, report PDF, analytics, Android readiness.
This session: **Profile screen** in sections, every badge under the profile row in Settings (U-92) · **demo
starter set** (U-94) · **report PDF rebuilt** as a statement (U-95) · Upcoming listed once, to month-end, the
bell on the same window (U-96) · group totals follow the filters (U-97) · Simplify is a switch (U-98) ·
**Not set is a place in Move money** (U-99) · **Insights as tiles**, one sheet each (U-91) · consistency
pass, app and server (U-100) · then code review, simplify, code review again, all findings applied.

## Open — next, in order
1. **The phone pass on today's work.** Most worth looking at: the Insights preferences sheet stepping aside
   for its pickers; the PDF's charts (reported missing on the phone before the rebuild, never reproduced);
   Profile; the group totals row with filters on.
2. **U-101** `SCREENS.md`'s Money section still describes the old Plan screen. A doc rewrite.
3. **Speed, step 5** (`docs/SPEC-SPEED-PDF-READS-FOLDERS.md` §1): Reports read 565 ms on the user's phone,
   build type unknown. Check with a release build before cutting its per-group reads.
4. **Parked by the user:** stop editing balances directly and record an adjustment entry instead (as Fold does).
5. **Waiting on the user:** Mixpanel project token + service account · Android build route · whether to push.
6. **Known and not fixed** (from the reviews, outside today's diff): Settings computes every badge on each
   focus (spec step 4); a sheet opened from inside a sheet needs its caller to hide the parent by hand, in
   four places (a stack in `lib/sheetStage` would remove that; wants a device); seven hand-configured
   switches with no shared toggle primitive; Reports and its PDF word "same as last month" by different
   thresholds.
7. Needs the phone / user: U-16, U-20, W1-28/29/32 spacing, D-01–D-03 UPI, live updates with two
   signed-in phones, receipt scan after rebuild.
8. Waiting outside repo: Workers Paid (DQ-95 → DQ-105, DQ-107), Apple (B-02, push, TestFlight), Brevo key
   (B-07), privacy/store (B-08, B-10, B-13), merge to main (B-19).

## Rules learned this session
A SQL statement over `txn` must show its two exclusions (`recur_freq IS NULL`, `NOT_AWAITING_APPROVAL`) in its own
template, or `txnInvariant` / `approvalInvariant` fail: do not split the WHERE into a second constant.
Do not rewrite Paid from on entries in bulk: a shared entry's update makes the server re-ask approvals.
To look at the PDF without a phone: a throwaway jest test (`freshPhone` + `loadDemoData` + `loadReportsData` +
`buildReportHtml`, write the HTML out), then headless Chrome `--print-to-pdf`; delete the test after.
Tracker counts only via script (recount rows + Closed lists; §0 summary table is unguarded). New route →
regenerate `.expo/types/router.d.ts` (`CI=1 npx expo start --offline`, kill after types appear). Jest flake: a
random suite fails to load; rerun alone. Don't add `thinkingBudget` to the Gemini proxy (400). Deploy:
`cd server/api && npx wrangler deploy`; push: `gh auth switch --user mrprem27` then
`git -c credential.helper='!gh auth git-credential' push`, then switch back to prem-bhati-27.

---

# Tasks — V1 close-out

`Plan: ./plan.md · Tracker: docs/TRACKER.md (start at §0) · Predecessor: docs/history/TASKS-2026-09-CLOSEOUT.md`

Gates, every task: `npx jest` · `npx tsc --noEmit` (app) · `cd ../server/api && npx tsc --noEmit -p .` when the server changes.

## P1 · Tracker and pass 2 — 2026-09-30

- [x] V1 tracker: `TRACKER.md` §0 road to V1, §9 deferred (`V-`), §10 built-but-easy-to-forget, §11 open (`U-`); stale rows re-checked (`B-03`, `DQ-94`, `DQ-98`, `W1-02` closed; `B-19` added; §3's counts corrected)
- [x] Pass 2 fixes `P2-1`–`P2-12`, `P2-15` (`SPEC-BUGSCAN.md`), each with a regression proven by reverting
- [x] New guards: routes nothing opens (`deadRouteRef`), switches nothing reads (`featureFlags`), async confirm buttons without error handling (`bugscan` `P2-6`)
- [x] Old `tasks/` files frozen into `docs/history/`

## P2 · Your phone pass — `U-10`

Findings become `U-11`, `U-12`, … in `TRACKER.md` §11.

**Changed tonight — look first**
- [ ] Feature Management → turn **Recurring** off: no Recurring tab in a group or in Personal
- [ ] Feature Management → turn **Reminders** off: no reminders fire; on again → they come back
- [ ] Feature Management → turn **Recurring** off: no renewal reminders either
- [ ] Feature Management → re-pick your setup: the switches change on screen at once
- [ ] Leave the app for a while, come back: Home shows any rule that came due, without changing tab
- [ ] Afford: "how often" is a segmented control; with Goals off there is no goal button
- [ ] New goal sheet: frequency and target date are segmented controls, like Priority
- [ ] Tap a backup reminder → Backup opens (not Reports)
- [ ] Feature Management: the streak switch is now "Streak Calendar" — it governs the calendar card; the ⚡ count shows either way

**The close-out list (was D4)**
- [ ] Headers on all four tabs · Money's Overview / Assets / Goals and the goal links
- [ ] Filters, including Clear when a tag is set · the group header card
- [ ] Scan & Pay with the app icons · Settings from Home's avatar · card due-day field · time picker
- [ ] Demo personas on the dev screen · Personal → Recurring · Excel import (dates, multi-line cells)
- [x] Friends "name missing when I owe": fixed, confirmed by the user 2026-10-01 (`U-09`)
- [ ] Afford — anything that feels broken (you mentioned it; `U-04` is one guess)

**Carried from server sync and onboarding**
- [ ] Fresh install → no flicker → the keyboard behaves → Name is required
- [ ] "Replay welcome tour" → relaunch behaves the same
- [ ] The focused field is never covered on the smallest supported phone
- [ ] The full onboarding; Money and Recurring show exactly what was entered
- [ ] The New path and the Existing path (email → code → onboarding) both work
- [ ] An investment logged from Expense; net worth unchanged
- [ ] Groups → Friends; create a group adding a new friend inline
- [ ] Sign in → reinstall → sign in → the same numbers everywhere, including a goal's balance
- [ ] Airplane mode: add an expense, network back on → it uploads
- [ ] Sign out → empty, skips onboarding → sign in → everything is back
- [ ] Airplane mode: add an expense, sign out → the warning names 1 change; Cancel keeps it
- [ ] Offline, syncing, up to date and failed states read right · restore shows real progress
- [ ] Merge: sign out → add two expenses and a friend the account knows by email → sign in → **Merge** → both expenses there, the friend is one person
- [ ] UPI: pay with the default app · Change → another app · relaunch keeps it · Request QR scanned from a second phone
- [ ] Two phones, two accounts, one group: an expense on A appears on B · "I paid you" waits on B · B's rejection shows on A · removing B stops B's syncing · B cannot edit A's entry
