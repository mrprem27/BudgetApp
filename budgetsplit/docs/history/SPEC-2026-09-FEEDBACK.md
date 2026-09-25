# SPEC — Post-sync feedback pass

> **FROZEN 2026-09-24.** Every module shipped or decided. Its behaviour lives in `docs/SYSTEM.md` and
> `docs/SCREENS.md`, and its sync question became `SPEC-SERVER.md`. Never edited to keep a test green.

`Status: DONE 2026-09-24 · Branch: fix/post-sync-feedback · Written 2026-09-23`

A working spec for one piece of work. It is **not** an eighth live doc: open decisions get a
`DQ-` row in `docs/TRACKER.md` plus an entry in `docs/FINDINGS.md`, and when this work lands its
behaviour moves into `docs/SYSTEM.md` / `docs/SCREENS.md` and this file goes to `docs/history/`.

---

## 0 · Capability map

| Module id | Responsibility | Depends on | This pass |
|---|---|---|---|
| `boot-flicker` | First launch goes straight from the splash into onboarding with no flash | — | ✅ spec'd |
| `onboarding-steps` | A shorter, cleaner question flow (§2) | — | ✅ spec'd |
| `friends` | Friends icon on Groups, one name, a better New Group flow | — | ✅ spec'd |
| `recurring-vocab` | One vocabulary and one UI for Recurring / Upcoming / Reminders | — | ✅ spec'd |
| `add-kinds` | Take the Invest pill out of Add; investing is done from within Expense | — | ✅ shipped 2026-09-24 — paused, then confirmed the same session |
| `sync-architecture` | Audit the current sync, then decide what replaces it | — | ✅ audited, direction chosen 2026-09-24 (`DQ-93`) → `SPEC-SERVER.md` |
| `entry-gate` | Welcome screen: **New user** → onboarding · **Existing user** → log in | `onboarding-steps`, `sync-architecture` | ✅ UI shipped · restore moves to `SPEC-SERVER.md` §4 |

**Build order:** `boot-flicker` → `onboarding-steps` → `add-kinds` → `friends` → `recurring-vocab`.
The `sync-architecture` audit runs alongside them. `entry-gate` gets its screen and sign-in now; what
signing in *brings back* waits for the sync decision.

**Applies to every module** (not a module of its own): crisp, clean, sensible. No screen, popup,
subtitle or help line that repeats what is already on screen. Every module's review includes a
"what can be deleted" pass.

---

## 1 · `boot-flicker`

**Objective.** On a first launch, the splash hands over to onboarding with nothing flashing in
between.

**What happens today** (from the code, not yet seen on a device): the native splash →
`BrandedLoader` (logo + spinner) at up to three separate points, each one unmounting and
remounting: root boot (`app/_layout.tsx:163`), `FlagsGate` (`FeatureFlagsProvider.tsx:59`) and
`OnboardingGate` (`OnboardingGate.tsx:36`). Then the hero, where the static logo disappears and
`LogoAssembly` rebuilds it from nothing. Logo → spinner → blank → logo reassembling is the flicker.

**Acceptance**
- [x] A cold first launch shows exactly one continuous loading visual, then the hero. No spinner
      appears and disappears, and the logo does not vanish and come back more than once.
- [x] "Replay welcome tour" in Settings, followed by a relaunch, behaves the same.
- [x] A returning user's cold launch (onboarding done) is no worse than today.
- [x] `LogoAssembly.tsx`, the hero ring/fan and `HERO_REVEAL_MS` are unchanged. (`AGENTS.md` §11,
      `onboardingConsistency.test.ts`)

**Approach.** Collapse the three gates onto **one** loader that stays mounted until the first real
screen is ready, so nothing remounts. Holding the native splash instead needs `expo-splash-screen`,
which is **not installed**. That is a new dependency plus a native rebuild, so it is **Ask first**
and only the fallback.

---

## 2 · `onboarding-steps`

**Objective.** A flow that asks only what it needs, with no step that can be skipped by accident
and none that belongs somewhere else.

**New flow:** hero → **welcome (`entry-gate`)** → intent → name → take-home → payday → money → pay →
budget → permissions → summary. The people step is removed.

| # | Feedback | Acceptance |
|---|---|---|
| O1 | Continue/Skip stay behind the keyboard; the keyboard has **Done** at the right | [ ] The footer no longer rides the keyboard (drop `KeyboardStickyView` in `StepScaffold`). [ ] Text fields (Name) use `returnKeyType="done"`, which is the bottom-right key. [ ] Number-pad fields get a `KeyboardToolbar` (already in `react-native-keyboard-controller` 1.21.6) showing **Done** only. iOS number pads have no return key. [ ] Done dismisses the keyboard and reveals the footer. |
| O2 | Name has no Skip | [ ] No Skip on the name step. [ ] Continue is disabled until `name.trim()` is non-empty. [ ] Submitting from the keyboard with an empty name does nothing. |
| O3 | ~~Take-home as selectable amounts~~ — **cut 2026-09-23**, see `DQ-88` | Reverted. A preset grid was built (reordered ahead of the typed field) and removed on review: one `StepAmountField`, no chips — same as before this pass. Not a deferral; closed. |
| O4 | "When are you going to receive your next payment?" | [ ] Its own step, titled exactly that. [ ] `DatePickerSheet` (existing primitive), from today onward. [ ] It replaces `DayOfMonthGrid` on this step. [ ] The salary rule anchors at the **chosen date at 00:00** (today `paydayAnchor` uses **09:00**, `lib/onboarding.ts:68`) and repeats monthly on that day of the month, clamped for short months. [ ] The step is skipped when no take-home was given. |
| O5 | Better "What do you have right now?" options, incl. Cash Available | [x] **Cash available stays the one open hero field** (`StepAmountField`), not a chip — a 5-chip "nothing open by default" version was built and cut the same day (too much friction, see the money-step guard test). [x] **Bank balance · Wallet · Investments · Credit card** are the four behind a pick; each ticked chip reveals its own amount row. [x] These map to the fields that already exist: `openingBank` / `openingCash` / `openingWallet` in `moneyProfile.ts`, the asset register, and credit limit + used. No schema change. [x] Un-ticking clears the value (as before). [x] Nothing is written for an unticked chip — `undefined`, not 0 (new: the old code always wrote `creditLimit`/`creditUsed` as 0 even when Credit card was never ticked). |
| O6 | Remove "Who do you split with?" | [ ] The `people` stage is gone from `NUMBERED_STEPS` and the step count. [ ] The summary shows one line: *"Add friends in Settings to split expenses."* [ ] The Home people tile no longer reads `onboarding_skipped_people`. It shows for anyone with splitting on and zero friends. |
| O7 | Remove the Siri row | [ ] The permissions step no longer shows it. [ ] `openVoiceSetup` stays in the file with `// Parked until Siri Intents — see TRACKER`. [ ] `lib/voiceShortcut*` stays (still used by `settings/voice`). |
| O8 | Crisp copy | [ ] Every step: a title, at most one short subtitle, and no help line that repeats the subtitle. [ ] The before/after for every string is listed in the PR. |

---

## 3 · `entry-gate`

**Objective.** A new user goes straight into setup, and a returning user can get to their account
without answering questions they already answered.

**Screen:** separate, after the hero's "Get Started" (your choice). Two option cards: **New here**
→ intent step · **I have an account** → sign in.

**Acceptance (this pass)**
- [x] The welcome screen exists and both cards route correctly. Back returns to the hero.
- [x] Sign-in is **email → the emailed code** (the same code path `settings/account.tsx` already uses), entered in the app. No passphrase, no key.
      ⚠️ The emailed *link* cannot work here: `/auth` is a Stack route, and `OnboardingGate`
      renders `Onboarding` instead of the Stack until onboarding is done.
- [x] After sign-in: continue into onboarding, signed in. **Restoring data is blocked on §7.** — §7 is decided (`DQ-93`); restore is `SPEC-SERVER.md` §4.

**Decided (2026-09-23):** the server does **not** require a passphrase or key. Passphrases are for
local use only: backup files and app lock. We're in development, so existing server data may be
wiped.
**Consequence to act on:** the hero tagline ("nothing is uploaded unless you ask"), the backup copy
("cannot be opened by anyone, including us") and the store listing / privacy answers (`B-08`,
`B-13`) become false once the server holds readable data. `B-09` (India DPDP) stops being
hypothetical. These are rewritten in the same change that ships server-readable data, not before.

---

## 4 · `add-kinds`

Not part of your original feedback — it entered this spec while I was writing the capability map,
and the only piece you'd actually confirmed was the money-math question (Q1/`DQ-87`). Asked
directly, you first said "will discuss," then minutes later, unprompted: "Lets Remove Invest it or
so… 3 States are Fine… for v1 atleast." Shipped as designed below. `tasks/todo.md` T11 has the
full detail, including one revision from tracing the code: the "Switch to Invest" banner stays
tap-to-confirm, not a fully automatic switch — smart-category re-matches the category on every
keystroke, so instant switching would flip the screen mid-sentence.

**Objective.** Add has three kinds: Expense · Transfer · Income. Investing is something you do
from Expense, not a fourth pill.

**Acceptance**
- [x] `ADD_KIND_TABS` renders Expense · Transfer · Income. Invest is gone from the switcher — `ADD_KIND`
      itself (validation: deep link, voice, drafts) keeps all 4 on purpose. Voice hints and help
      needed no change, confirmed by tracing rather than assumed.
- [x] Picking the **Investment** category in Expense shows the asset picker, as the Invest pill did —
      via the existing tap-to-confirm Banner, unchanged.
- [x] **Money math unchanged by default (Q1):** that entry still saves as a transfer to an asset.
      Net worth stays flat, and it stays out of spending analysis (`AGENTS.md` §12).
- [x] `report-transactions`' "Invested" filter, `settlementView` and the asset screen are unchanged.
- [x] `addKind.test.ts` extended (2 new assertions), not deleted; `moveToInvestments.test.ts` untouched
      and still green — nothing about Invest's own money behaviour changed.

---

## 5 · `friends`

**Objective.** Friends are managed in one place, reached the same way, and called by one name.

**Acceptance**
- [x] A Friends icon (`users`) at the top right of the **Groups tab** header, next to archive and `+`.
      Groups tab only (your choice).
- [x] `/friends` is titled **Friends**, and every label that means this screen says "Friends"
      (Settings row, onboarding summary, help, empty states). "Linked people" stays where it is.
- [x] Adding, renaming and removing a friend behave the same from Friends, a group's Members
      tab, and the New Group member picker: same sheet, same destructive confirm.
- [x] **New Group:** redesigned from **layout options you pick before any code** (as with every
      screen here). Known problems with the current sheet: type is a row of text chips with no
      icon or colour, a member can't be added from inside the sheet, and default split is a chip
      row where `AGENTS.md` §9 says a single choice is `TabPills`.

---

## 6 · `recurring-vocab`

**Objective.** One word per concept, used identically everywhere.

| Word | Means | Only these surfaces |
|---|---|---|
| **Recurring** | The rules, the inventory | Plan → Recurring list, `/recurring/[id]`, the group Recurring tab |
| **Upcoming** | The next charges, one row per occurrence, **one component** (`ComingUpList`) | Home, Plan, the Home bell screen |
| **Reminders** | Notification settings only | Settings → Notifications & Reminders |

**Acceptance**
- [x] "Due this month", "Coming up", "Bills", "Bill reminders", "renewal" and "Subscription" no
      longer appear in UI copy. A source-scanning guard enforces it.
- [x] The Home bell opens a screen titled **Upcoming** (today `/reminders`, titled "Reminders").
- [x] Every Upcoming list uses `ComingUpList` with the same row shape, and every Recurring list uses
      `RecurringRow`.
- [x] Settings rows: "Reminders for upcoming charges" and "Daily log reminder".

---

## 7 · `sync-architecture` — audit only

**Delivered 2026-09-24:** `docs/history/SYNC-AUDIT-2026-09.md`. Direction chosen the same day: a
server-readable model (option B, `DQ-93`), specified in `SPEC-SERVER.md`.

**Deliverable:** `docs/history/SYNC-AUDIT-2026-09.md` (frozen once written). It covers the entities,
the flows, the server tables, what is missing (including the 7 open `SYNC-F` items), and **a
proposed server-side model**: tables, entities, the sync protocol, and what the server can read.
**You approve a direction before any sync spec or code.**

---

## Commands

```
Test:       cd budgetsplit && npx jest
Test one:   cd budgetsplit && npx jest src/__tests__/onboardingSteps.test.ts
Calendar:   cd budgetsplit && npm run test:calendar   # known flake — re-run a single date before believing it
Typecheck:  cd budgetsplit && npx tsc --noEmit        # app only: tsconfig excludes src/__tests__
Run (iOS):  cd budgetsplit && npm run ios
```

## Project structure (the parts this touches)

```
app/(tabs)/groups.tsx, app/friends.tsx, app/reminders.tsx, app/add/quick.tsx
src/components/system/Onboarding.tsx         + onboarding/Step*.tsx  (render only)
src/hooks/useOnboardingForm.ts                 state + stage machine
src/lib/onboarding.ts, onboardingSteps.ts      pure: finalize, paydayAnchor, step list
src/components/finance/GroupForm.tsx           the one group editor
src/components/finance/home/ComingUpList.tsx   the one Upcoming list
src/constants/enums.ts                         ADD_KIND
src/__tests__/                                 pure-logic tests + source-scanning guards
```

## Code style

The house style is `AGENTS.md`. One example of the shape expected:

```tsx
<StepScaffold
  stageKey="name"
  onBack={() => setStage('intent')}
  {...(stepPosition('name', intent) ?? {})}
  title="First, your name"
  footer={<StepFooter primaryLabel="Continue" onPrimary={next} disabled={!name.trim()} />}
>
  <Input value={name} onChangeText={setName} returnKeyType="done" onSubmitEditing={next} autoFocus />
</StepScaffold>
```

Logic in `src/lib` (pure), state in `src/hooks`, screens compose. Tokens only, never a raw hex.
`Chip` / `TabPills` / `ListRow` / `EmptyState`, never hand-rolled. Fixed sets are enums in
`constants/enums.ts`.

## Testing strategy

- **Pure logic → Jest** in `src/__tests__/`: step list (`onboardingSteps.test.ts`), payday anchoring
  at 00:00 incl. the 29–31 clamp (`finalizeOnboarding.test.ts`, run under `test:calendar`), and the
  money-step mapping (`finalizeOnboarding.test.ts`).
- **Consistency → source-scanning guards** (there are no render tests): banned recurring words,
  one `ComingUpList` for every Upcoming, `ADD_KIND` without Invest, no `skipLabel` on the name
  step.
- **Every regression test is proven by reverting its fix and watching it fail** (`AGENTS.md`).
- **UI → your device pass.** I report the gates and list the risks. Your feedback is the device test.

## Boundaries

- **Always:** keep the money math in `AGENTS.md` §12–13. Integer paise. Multi-table writes in one
  transaction. `refresh()` after writes. Update the tests with the change. File open decisions as
  `DQ-` in TRACKER + FINDINGS.
- **Ask first:** any new dependency (incl. `expo-splash-screen`), any schema change, anything that
  makes server data readable, layout of any redesigned screen (show options first), and deleting
  a test.
- **Never:** modify `LogoAssembly.tsx`, the hero ring/fan or `HERO_REVEAL_MS`. Never make a second
  tracker. Never commit secrets. Never push under the company GitHub account.

## Success criteria

Every checkbox in §1–§6 is ticked. `npx jest` and `npx tsc --noEmit` are green. Your device pass
finds none of the fifteen original points still present. §7's audit is delivered and a direction
chosen.

## Open questions (default applies if unanswered)

| # | Question | Default |
|---|---|---|
| Q1 | Investing from Expense: keep it as a transfer to an asset (net worth flat), or count it as spending? | Keep as a transfer. UI change only |
| Q3 | Before §7 lands, does "I have an account" restore anything? | No. Sign in, then onboarding |
| Q4 | Does the Home bell keep its icon once it opens Upcoming? | Yes, a bell, relabelled |

~~Q2, take-home presets~~ — moot: O3 was cut, not answered a different way. See `DQ-88`.
