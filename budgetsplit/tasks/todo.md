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
- [ ] Friends "name missing when I owe" → a screenshot if it is still there (`U-09`)
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
