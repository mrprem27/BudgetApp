# HANDOFF — 2026-10-01 (read first; continue from here)

Branch `claude/branch-selection-gi7lyy`, pushed. Plan: `docs/SPEC-SERVER-WEBAPP.md` §7; readiness per
module: `docs/TRACKER.md` §0a. Tests 2,933 green, tsc clean (app + `server/api`). Servers deployed:
API (fresh D1 `feba219a…`, live hub, `/v1`, nightly cron) and receipt proxy (U-70 fix).

## Done this session (committed)
1a named accounts (U-68) · receipt scan qty/503 fix (U-70) · 1b card bill bank→card (DQ-109) · 1c closed on
defaults · 2a live updates (DQ-108) · 2b cleanup cron · 2c `/v1` reads (DQ-104) · Paid from on every row
(DQ-18) · one red on Home (DQ-12) · Help SectionCard (DQ-17) · backOr everywhere (OV-10) · itemize grid
(U-69) · bottom space via `useContentInset` + guard · Budget/Recurring boxed (SectionCard), Expand all in top
card, one top-card size · Stopped recurring = own view · recurring search + sort (Next/Newest/Amount) ·
Groups search (≥5) · Personal "Friends" + "This month · N filters" · **badges ~30** (`lib/badges.ts`),
smaller dimmed board, Earned box collapsed at bottom of Badges screen.

## Done 2026-10-01 (NOT committed yet)
U-71 to U-75 are now rows (TRACKER §11 + FINDINGS; 293 items (93 open), 84 in §11) · **U-76** section icons from one map
(`sectionIcon` in `constants/categories`; Categories, budget editor, Budget tab boxes) · **U-77** Home hero
padding one step down · **U-78** `HeaderIconButton showLabel` on Recurring (Money) and Reports (Insights) ·
**U-75 follow-up**: six more badges (36 at most), board disc 24pt everywhere · **U-79** person page redone
(balance card, one options card, header Edit; `usePersonEdit` shared with Friends) · **U-80** Budget/Recurring
decluttered (no recurring search/sort, Stopped = closed box on the page, tinted card back, Expand all on the
card's last line, section bar only when open) · **U-81** demo data no longer future-dated before 10:00/12:00 · **U-82** Home loader split
(`loadHomeBase` + `loadHomePeriod`): a pill tap is 6 to 22 queries, was 90 to 106 · **U-83** Search off Home,
Personal opens on All · Recurring tab = plain list + "All recurring"; Money's page = search, sort chips, Stopped
box · Budget + Recurring share `SummaryCard` · badge board smaller again · Search screen DELETED (Personal on All replaces it) ·
PDF has a category ring + spend bars · demo data sensible by day / month / year (`thisMonth` null, `recent`).

## Open — next, in order
00. **Two specs built 2026-10-01, both waiting on the user:** `docs/SPEC-ANALYTICS.md` (needs a Mixpanel project
   token in `.env` + a service account for `scripts/usage-report.js`) and `docs/SPEC-ANDROID.md` (code ready,
   never built: no JDK / Android SDK on this Mac; Android Studio or EAS, user's pick).
0. **`docs/SPEC-SPEED-PDF-READS-FOLDERS.md`**, answered 2026-10-01 (release build; PDF = Reports export; v1
   endpoints later; server folders now). Built: speed steps 0 to 4, the PDF (U-19), the server split (U-84, NOT
   deployed). Open: speed step 5 (per-group reads) after the user's load times from the dev screen; the pure
   split for v1; `src/shared`; `src/lib` by area after the phone pass.
1. Person page (U-79): user review on phone.
3. Lag elsewhere (user, 2026-10-01): U-02 full reload on every focus, and the engine snapshot's ~40 queries
   (Home, Money, Afford, Badges). Needs the user to name the slow screens, and a release build to judge.
4. Budget/Recurring (U-80), badges + labelled header buttons: user review on phone (board wrap at 36, pill width beside the large title).
4. Needs the phone / user: U-16, U-20, W1-28/29/32 spacing, U-02 perf, D-01–D-03 UPI,
   live updates with two signed-in phones, receipt scan after rebuild (60 s timeout needs new build).
5. Waiting outside repo: Workers Paid (DQ-95 → DQ-105 server repeat posting, DQ-107 queues), Apple
   (B-02, push notifications, TestFlight), Brevo key (B-07), privacy/store (B-08, B-10, B-13), merge to main (B-19),
   Android native project (V-07), `/v1` budget/reports/money reads (need shared lib first).

## Rules learned this session
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
