# HANDOFF — 2026-09-30 (read first; continue from here)

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

## Still to track (not yet U- rows — add them to TRACKER §11 + FINDINGS, counts by script)
Phone-pass feedback 2026-09-30 → U-71 bottom gap (done) · U-72 Budget/Recurring boxes + top card (done) ·
U-73 Stopped view, recurring search/sort, group search (done) · U-74 Personal labels (done; user unsure what
"Others" was — ask with a screenshot) · U-75 badges ×3, earned collapsed, dull unearned, small board (done,
not seen on phone).

## Open — next, in order
1. **Friend edit screen** UI/UX "not great" (`app/(people)/person/[id]` edit / PersonNameSheet?) — ask the user which
   screen + what bothers them, then redo with Card/ListRow/Input.
2. **Category section icons**: Categories screen sections get the budget editor's section icons
   (`SECTION_ICON` in `finance/budget/BudgetEditor.tsx`) — move the map to `constants/categories` and use it in
   Categories, Budget editor and Budget tab boxes (`BudgetList` SectionCard `icon`). One icon set everywhere.
3. **Home hero padding**: reduce padding in `finance/home/HeroCard.tsx` (one token step).
4. **Money tab top-right icons** (Recurring, Reports): add a text label under/beside each icon so it says what
   it is (check `app/(tabs)/savings.tsx` header / HeaderIconButton; maybe a `label` display prop).
5. Badges: user review on phone; check the board wraps well at 30.
6. Needs the phone / user: U-09 screenshot, U-16, U-20, W1-28/29/32 spacing, U-02 perf, D-01–D-03 UPI,
   live updates with two signed-in phones, receipt scan after rebuild (60 s timeout needs new build).
7. Waiting outside repo: Workers Paid (DQ-95 → DQ-105 server repeat posting, DQ-107 queues), Apple
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
