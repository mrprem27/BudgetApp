# Tasks — Post-sync feedback pass

> **FROZEN 2026-09-24.** Done — every task closed. Successor: `tasks/todo.md` for `SPEC-SERVER.md`.
> Never edited to keep a test green.

`Plan: PLAN-2026-09-FEEDBACK.md · Spec: SPEC-2026-09-FEEDBACK.md`

Every task's verification includes the standing gates. They aren't repeated below:

```
cd budgetsplit && npx jest            # all suites, including the doc and source guards
cd budgetsplit && npx tsc --noEmit    # app code; src/__tests__ is NOT typechecked
```

Every new regression test is proven by reverting its fix and watching it fail (`AGENTS.md`).
"Device" means your device pass. I report the gates and list the risks; I don't ask you to test
before I continue.

---

## Phase 0 · Housekeeping

### - [x] T0 · File the spec's open questions
**Description:** SPEC Q1–Q4 become `DQ-87`…`DQ-90` in `docs/TRACKER.md` §3 (question + default),
with matching entries in `docs/FINDINGS.md` §3 (strict 4-column table). The Siri onboarding row is
noted against the existing "App Intents" item in §8.
**Acceptance:**
- [ ] 4 rows in TRACKER §3 with `DECIDE` status and a default; 4 entries in FINDINGS §3
- [ ] The section counts in TRACKER's header table are updated
**Verification:** `npx jest src/__tests__/trackerIntegrity.test.ts src/__tests__/docIdGraph.test.ts src/__tests__/countClaims.test.ts`; `node scripts/build-system-map.js /tmp/map.html` still parses §3
**Dependencies:** None
**Files:** `docs/TRACKER.md`, `docs/FINDINGS.md`
**Scope:** XS

---

## Phase 1 · First launch

### - [x] T1 · One boot loader, mounted once
**Description:** The root boot effect now reads flags (`loadFlags()`) and onboarding-done
(`settings.onboardingDone()`) **in parallel with opening the DB**, not after it, and hands both
down as `initialFlags`/`initialDone` props. `FeatureFlagsProvider` and `OnboardingGate` start
already-resolved when given those props (lazy `useState` initializer + an early-return in their
effect), so `FlagsGate` and `OnboardingGate` never render their own `BrandedLoader` during a normal
boot — only the root's single loader can fire, and it waits on all four signals (fonts, db, flags,
onboarding-done) before mounting the tree. The two inner `<BrandedLoader/>` call sites stay as
safety nets for a caller that doesn't pass the new props (kept, not deleted — still reachable);
`deadComponents.test.ts` stays green because both are still referenced.
**Acceptance:**
- [x] A cold first launch: one loading visual, then the hero/first screen. Nothing unmounts or
      remounts in between *(verified by source guard; the actual on-screen smoothness is your
      device pass)*
- [x] A returning user's cold launch and the DB-error screen still work (same `dbError`/`dbReady`
      paths, only reordered)
- [x] `LogoAssembly.tsx`, the hero and `HERO_REVEAL_MS` are untouched
**Verification:** `src/__tests__/bootLoader.test.ts` (new) — proven by reverting the loader guard
and watching it fail, then restored · `npx jest` (182 suites, 2395 tests, all pass) · `npx tsc --noEmit` (clean) · Device: fresh install + "Replay welcome tour" → relaunch — **outstanding, yours**
**Dependencies:** T0
**Files:** `app/_layout.tsx`, `src/components/system/FeatureFlagsProvider.tsx`, `src/components/system/OnboardingGate.tsx`, `src/__tests__/bootLoader.test.ts` (new)
**Scope:** M

### - [x] T2 · Footer behind the keyboard, Done on the toolbar
**Description:** `StepScaffold` drops `KeyboardStickyView` — the footer renders in plain flow
below the scroll view, so it's covered by the keyboard exactly as the rest of the page would be.
One `<KeyboardToolbar showArrows={false} />` (from the same `react-native-keyboard-controller`
package as `KeyboardAwareScrollView`) is mounted per step; it's absolutely positioned by the
library itself and tracks focus app-wide via a native listener, so it needs no per-field wiring
and never shows when nothing is focused. The old `footerH` measurement and `bottomOffset` (which
existed only to keep a field clear of the *lifted* footer) are gone with it — `bottomOffset`
defaults to 0, and the library's own keyboard-height tracking is what clears the toolbar. The
Name field already had `returnKeyType="done"` before this task; unchanged.
**Acceptance:**
- [x] With the keyboard up, Continue/Skip are behind it (plain flow, no more `KeyboardStickyView`)
- [x] One `KeyboardToolbar` with Done, no Prev/Next arrows, mounted per step
- [ ] The focused field is never covered, on the smallest supported phone — **device pass, yours**
**Verification:** `onboardingConsistency.test.ts` — 2 new assertions, proven by reverting to
`KeyboardStickyView` and watching both fail, then restored · `npx jest` (182/182) · `npx tsc --noEmit` (clean) · Device: name step, take-home, money rows — **outstanding**
**Dependencies:** T0
**Files:** `src/components/system/onboarding/StepScaffold.tsx`, `src/__tests__/onboardingConsistency.test.ts`
**Scope:** S

### - [x] T3 · Name is required; the Siri row leaves onboarding
**Description:** Two removals in `Onboarding.tsx`. The name step lost `skipLabel`/`onSkip`;
Continue is `disabled={!name.trim()}` and the return key is guarded the same way. The permissions
step no longer renders the Siri `OptionRow` (and its two explanatory comments, replaced by one
"parked, not deleted" note); `openVoiceSetup` stays, now with `// Parked until Siri Intents — see
TRACKER §8` above its original doc comment. `flags`/`useFeatureFlags`/`VOICE_ONE_WAY_NAME` were
removed as imports — they had no other caller in the file once the row was gone.
**Acceptance:**
- [x] No Skip on the name step; an empty or whitespace name can't advance by any path (button
      disabled, submit-from-keyboard guarded)
- [x] No Siri row in onboarding; Settings → Voice (`app/settings/voice.tsx`) untouched
**Verification:** `onboardingConsistency.test.ts` — 3 new assertions, each proven by reverting and
watching it fail (required-name guard, and reinjecting the Siri row), then restored · `npx jest`
(182/182, 2400 tests) · `npx tsc --noEmit` (clean)
**Dependencies:** T0
**Files:** `src/components/system/Onboarding.tsx`, `src/__tests__/onboardingConsistency.test.ts`
**Scope:** S

### Checkpoint A — first launch
- [x] All gates green (182 suites / 2400 tests, `tsc --noEmit` clean)
- [ ] Device: fresh install → no flicker → the keyboard behaves → Name is required — **yours, whenever**

---

## Phase 2 · Onboarding questions

### - [x] T4 · The people step is removed
**Description:** `people` is gone from `OnboardingStage`/`NUMBERED_STEPS`; `stepPosition` no longer
takes `intent` (nothing else varies by persona once this was the only thing that did — every call
site updated, `numberedSteps()` deleted rather than kept as a pass-through). The hook lost
`people`/`personDraft`/`personEmailDraft`/`addPerson`/`removePerson`/`skipPeople` and the
`afterBudget`/`beforePermissions` indirection (budget → permissions and back is now a fixed literal
on both sides). `finalizeOnboarding`'s `OnboardingData` lost `people` and its contact-insertion
loop; `OnboardingPerson` is deleted (had no other caller). `SummaryStage` traded its `people: string[]`
prop for `splits: boolean` (`intent !== 'personal'`) and shows one line — "Add friends in Settings
to split expenses" — instead of reading back who was added, hidden entirely for the 'personal'
persona (who just said they don't split). `settings.onboardingSkippedPeople`/`setOnboardingSkippedPeople`
and their AsyncStorage key are deleted (no other caller); Home's tile gating dropped the
`declinedPeople` check entirely — there's no "declined" answer left to remember, so both tiles now
track only whether a friend/group exists. "Replay welcome tour" no longer clears the flag (it's
gone). Five unused imports (`TouchableOpacity`, `Feather`, `GROUP_COLORS`, `SecondaryButton`,
`ListRow`, `MemberAvatar`) and two orphaned styles (`personForm`, `peopleCard`) came out of
`Onboarding.tsx` with the JSX that used them.
**Acceptance:**
- [x] No people step for any persona; the step count is right from the first question
      (`NUMBERED_STEPS` has 7 entries now, was 8)
- [x] The summary shows the one Friends line (suppressed for 'personal')
- [x] The Home tiles show for anyone with splitting on and no friends/groups — unconditionally,
      no decline to suppress them
**Verification:** `finalizeOnboarding.test.ts` — 5 tests for the deleted contact-insertion loop
replaced with 1 ("creates no group") · `onboardingSteps.test.ts` rewritten for the no-`intent`
signature · `onboardingConsistency.test.ts` — obsolete "no step discards a draft" suite (tested the
deleted people step) removed · `npx jest` (182/182, 2394 tests) · `npx tsc --noEmit` (clean, whole app)
**Dependencies:** Checkpoint A
**Files:** `src/lib/onboardingSteps.ts`, `src/hooks/useOnboardingForm.ts`, `src/lib/onboarding.ts`,
`src/components/system/Onboarding.tsx`, `src/components/system/onboarding/SummaryStage.tsx`,
`app/(tabs)/index.tsx`, `app/(tabs)/settings.tsx`, `src/lib/settings.ts`, `src/lib/homeData.ts`,
`src/__tests__/onboardingSteps.test.ts`, `src/__tests__/finalizeOnboarding.test.ts`,
`src/__tests__/onboardingConsistency.test.ts`
**Scope:** M (touched 9 source files + 3 test files — wider than the 5-file guideline because a
removed step's state, its persistence key, and its one non-onboarding reader (Home) are one
change, not three; each edit was mechanical, not a design decision)

### - [x] T5 · ~~Take-home as selectable amounts~~ — cut, reverted to typing only
**Description:** Built as spec'd — a 7-preset grid (₹25k · 40k · 60k · 80k · 1L · 1.5L · 2L) in
`lib/onboarding.ts` (`INCOME_PRESETS_RUPEES`), reordered ahead of `StepAmountField`, labels shared
with the budget step's `fmtK`. **Reverted on your call mid-build** ("I dont think we require income
preset or so"), clarified as: typing only, no presets — not a smaller/different preset set. The
income step is back to one `StepAmountField`, nothing added, nothing left behind: the const, the
import, the reordered JSX and the `orTypeLabel` style are all removed, not commented out.
`DQ-88` closed as ANSWERED rather than left `DECIDE` — the reversal is a decision, not a deferral.
**Acceptance:**
- [x] No preset chips on the income step; a single typed amount, as before this pass
- [x] `SPEC.md` O3 struck through and Q2 removed from open questions, both pointing at `DQ-88`
**Verification:** `npx jest` (182/182, 2394 tests) · `npx tsc --noEmit` (clean) · doc guards +
system-map rebuild after the TRACKER/FINDINGS edit (`DQ-88` moved from `DECIDE` to the closed list)
**Dependencies:** Checkpoint A
**Files:** `src/components/system/Onboarding.tsx`, `src/lib/onboarding.ts`, `SPEC.md`,
`docs/TRACKER.md`, `docs/FINDINGS.md`, `scripts/build-system-map.js` (no change needed — `DQ-88`'s
area assignment stays valid whether `DECIDE` or `DONE`)
**Scope:** S

### - [x] T6 · "When are you going to receive your next payment?"
**Description:** A new `payday` stage, unconditionally in `NUMBERED_STEPS` right after `income`
(runtime-skipped straight to `money` when `incomeNum === 0`, from either Continue or Skip on the
income step — a deliberate numbering gap over a total that would otherwise shift under the user,
same reasoning `people`'s removal in T4 already established). `OnboardingData.payday: number` →
`firstPayDate: number` (ms). `paydayAnchor` no longer computes a "next occurrence of day-of-month at
09:00" — there's nothing left to compute, since the user now picks the exact date — it floors
whatever it's given to **local 00:00** (proven by 3 new unit tests, incl. a DST-adjacent
month/day-drift check). The monthly rule's future occurrences (clamped for short months) are the
recurring engine's job, unchanged. `DayOfMonthGrid` had exactly one caller and is **deleted**, not
left behind (`AGENTS.md` §9/§11, `deadComponents.test.ts`); a stray mention in `Chip.tsx`'s comment
fixed too. `DatePickerSheet` (shared across 3 other screens) gained an **optional** `minDate` prop —
every existing caller passes none and is unaffected; onboarding is the one caller that does
(`Date.now()`), since "next" stops meaning anything for a past date. The picker is a
`PressableScale` hero (icon + big date + "Tap to change") opening the shared `DatePickerSheet`, not
an inline calendar — `showPayDateSheet` lives in the hook, not local component state, keeping
`Onboarding.tsx` render-only per its own DEBT-12 comment. `SummaryStage`'s `payday: number` →
`firstPayDate: number`; its row now reads "next on {full date}" instead of "on the {Nth}" — the
local `ordinal()` helper (there and in `Onboarding.tsx`) is dead with the day-of-month reading and
removed from both files.
**Acceptance:**
- [x] The step reads exactly "When are you going to receive your next payment?"
- [x] The salary rule's first occurrence is the chosen date at 00:00 and repeats monthly (recurring
      engine unchanged)
- [x] The picker can't select before today (`minDate`); month/day-drift and the midnight floor are
      unit-tested directly, not just observed through `finalizeOnboarding`
**Verification:** `finalizeOnboarding.test.ts` — rewritten `data()` factory + 3 new `paydayAnchor`
unit tests · `onboardingSteps.test.ts` — payday sits right after income · `onboardingConsistency.test.ts`
— 3 new guards (own step exists, no `DayOfMonthGrid` anywhere in onboarding, `minDate` on the
sheet), each proven by reverting and watching it fail, then restored · `npx jest` (182/182, 2401
tests) · `npx tsc --noEmit` (clean) · `npm run test:calendar` — all 7 boundary dates, 2398/2398 each
**Dependencies:** T5
**Files:** `src/lib/onboarding.ts`, `src/lib/onboardingSteps.ts`, `src/hooks/useOnboardingForm.ts`,
`src/components/system/Onboarding.tsx`, `src/components/system/onboarding/SummaryStage.tsx`,
`src/components/ui/DatePickerSheet.tsx`, `src/components/ui/Chip.tsx` (comment only),
`src/components/ui/DayOfMonthGrid.tsx` (deleted), `src/__tests__/finalizeOnboarding.test.ts`,
`src/__tests__/onboardingSteps.test.ts`, `src/__tests__/onboardingConsistency.test.ts`
**Scope:** L (touched 9 source files — over the plan's M estimate: `DatePickerSheet` needed a new
opt-in prop shared by 3 other screens, and the day-of-month picker's removal cascaded into a dead
component and a dead helper in two files. Each addition was additive/mechanical, not a new design
decision, so it stayed one task rather than splitting)

### - [x] T7 · Better "What do you have right now?"
**Description:** Built as spec'd first — 5 equal chips (Bank/Cash/Wallet/Investments/Credit),
nothing open by default. **Reverted mid-build on your call** ("friction to ask everything on
onboarding"), same shape as T5's reversal: **Cash available stays the one open hero field**
(`StepAmountField`, unchanged position/behaviour from before this pass); Bank balance, Wallet,
Investments and Credit card are the four behind a pick (`hasBank`/`hasWallet`/`hasInvest`/
`hasCredit`, `toggleX` clearing text on untick). `moneyRows` — one array driving the collapsible
card, `.map`-interleaved dividers — replaced five hand-written `{hasX && <>...}` blocks. What
survived the revert and is a real fix, not cosmetic: `OnboardingData.money`'s optional fields
(`openingBank?`/`openingWallet?`/`creditLimit?`/`creditUsed?`) now reach `setMoneyProfile` as
`undefined` when unticked, not 0 — the old code always wrote `creditLimit: 0, creditUsed: 0` for
everyone who never ticked Credit card, a real (if minor) correctness gap now closed. `investments`
is destructured out of the `setMoneyProfile` call explicitly rather than passed through by the
"it's a variable, not a literal" loophole a comment elsewhere had already flagged.
**Acceptance:**
- [x] Cash available is the hero, not a chip; four extras (not five) sit behind a pick — locked by
      a guard proven against a reintroduced 5th chip
- [x] Each chip maps to exactly one stored figure; nothing is written for an unticked chip —
      proven at the `setMoneyProfileRows` level (`updatedAt` stays null when nothing was ticked)
- [x] No schema change; Plan → Your money (`MoneyEditorSheet`) shows the same figures after onboarding
**Verification:** `finalizeOnboarding.test.ts` — 2 new tests (nothing-ticked writes nothing;
partial pick writes only what was ticked), the first proven by reverting to an always-definite
`creditUsed: 0` and watching it fail, then restored · `onboardingConsistency.test.ts` — 2 new
guards (hero not chip; exactly 4 chips), proven by reintroducing a 5th chip and watching both fail
· `npx jest` (182/182, 2405 tests) · `npx tsc --noEmit` (clean)
**Dependencies:** Checkpoint A
**Files:** `src/hooks/useOnboardingForm.ts`, `src/lib/onboarding.ts`,
`src/components/system/Onboarding.tsx`, `src/components/system/onboarding/MoneyRow.tsx` (comment),
`src/__tests__/finalizeOnboarding.test.ts`, `src/__tests__/onboardingConsistency.test.ts`, `SPEC.md`
**Scope:** M (build-then-revert cost a second pass through the same files, not extra scope)

### - [x] T8 · Crisp copy pass
**Description:** Audited every step's title/subtitle/extra text block against "title + at most
one subtitle, no help line repeating it." Found one genuine duplication: the `pay` step's
subtitle ("...You can change it on any single one.") and its `helpLine` ("You can change this on
any transaction.") said the same thing in different words — the `helpLine` is deleted. Every
other extra text block audited and kept, because each carries information the subtitle doesn't:
`intent`'s trims note (which flags this persona disables), `money`'s two `SectionHeader`s (cash
vs. the rest are a real distinction, not decoration) and its "tick only what you have" help line,
`budget`'s live percentage line, `permissions`' privacy paragraph (its own comment already
states why it's deliberate). None of T4–T7's own step text needed further trimming — each was
already written tight when those tasks landed. `docs/SCREENS.md`'s onboarding section (§1) was
fully out of date — stage count claims happened to still be right (10/8, `people`→`payday` swap
is a wash) but the per-stage table, stage-order paragraph and `finalizeOnboarding()` bullets
described the pre-T1–T7 flow throughout, including a stale self-admission ("this document
omitted `pay`") that a `pay` row would have fixed months ago. Rewritten stage-by-stage against
the current source, not patched.
**Acceptance:**
- [x] Each step is at most a title plus one subtitle line, or a subtitle plus one piece of live,
      non-decorative information; no duplicated help text (the one instance found is gone)
- [x] Before/after: `pay` step lost one `Text` line ("You can change this on any transaction.");
      everything else in T4–T7's own diffs already stated inline in those tasks' entries above
**Verification:** `onboardingConsistency.test.ts` stays green (19/19) · `npx jest` (182/182, 2405
tests) · `npx tsc --noEmit` (clean) · `node scripts/build-system-map.js` rebuilds clean
(component count −1, confirming `DayOfMonthGrid`'s deletion is reflected) · Device read-through —
**outstanding, yours**
**Dependencies:** T4, T5, T6, T7
**Files:** `src/components/system/Onboarding.tsx`, `docs/SCREENS.md`
**Scope:** S

### Checkpoint B — onboarding complete
- [x] All gates green, including `npm run test:calendar` (all 7 boundary dates, 2398/2398 — run
      during T6; nothing in T7/T8 touches date math, so not re-run)
- [ ] Device: the full onboarding; Plan and Recurring show exactly what was entered — **yours**
- [ ] Your go-ahead before Phase 3

---

## Phase 3 · Entry (screen + sign-in; restore waits for the sync decision)

### - [x] T9 · Welcome stage: New here / I have an account
**Description:** `welcome` (un-numbered, like `hero`/`signin`/`summary`) sits right after the
hero's Get Started, which now opens it instead of `intent` directly. `WelcomeStage.tsx` — body
only, `Onboarding.tsx` supplies the `StepScaffold` around it, `footer={null}` since the two
`OptionRow`s (no `selected`, chevrons not radios — the same "this is a door" reasoning the old
Siri row established) are the navigation, not a form with a Continue button. "I'm new here" →
`intent`. "I have an account" → `signin`, rendered only when `serverConfigured()`. Back → `hero`.
`intent`'s own `onBack` moved from `hero` to `welcome`, since that's now the screen before it.
**Acceptance:**
- [x] Both cards route correctly; Back returns to the hero
- [x] A build with no server (`serverConfigured()` false) shows only "New here" — guarded
**Verification:** `onboardingSteps.test.ts` — `welcome`/`signin` both un-numbered ·
`onboardingConsistency.test.ts` — 4 new guards, one proven by reverting Get Started's target and
watching it fail, then restored · `npx jest` (182/182, 2409 tests) · `npx tsc --noEmit` (clean)
**Dependencies:** Checkpoint B
**Files:** `src/lib/onboardingSteps.ts`, `src/components/system/Onboarding.tsx`,
`src/components/system/onboarding/WelcomeStage.tsx` (new), `src/__tests__/onboardingSteps.test.ts`,
`src/__tests__/onboardingConsistency.test.ts`
**Scope:** S

### - [x] T10 · Sign in from inside onboarding
**Description:** `useEmailSignIn.ts` extracted from `settings/account.tsx`'s existing
email→code→`verifyMagicLink`→`claimMyAccount` logic verbatim (same three error messages, same
validation), parameterized by `onVerified(user: ServerUser)` — the Account screen passes `reload`
(ignoring the argument, which TS allows), onboarding passes a callback that prefills the name
field and advances. `account.tsx` itself is now a consumer of the hook, not a second
implementation — its own state/handlers for email/code/sending/verifying/error are gone. `code`,
not the emailed link, leads in `SignInStage.tsx`: the link opens a Stack route (`app/auth.tsx`)
that `OnboardingGate` doesn't render until onboarding is done, so onboarding's copy asks for the
code from the first screen rather than framing it as `account.tsx`'s "opened the email
somewhere else?" fallback. **No passphrase anywhere** — guarded across all three new/changed
files. `extractAuthToken`'s own unit coverage (`serverApi.test.ts`) is pre-existing and
untouched, since the extraction moved call sites, not that function.
**Acceptance:**
- [x] Sign-in works from onboarding and from Settings → Account through the same hook — guarded
      (both source files reference `useEmailSignIn`)
- [x] The three existing error paths (bad code, `other-account`, ambiguous match) are unchanged —
      same messages, now defined once
- [x] After sign-in, onboarding continues with `user.name` prefilled into the still-blank name
      field, then `intent`
**Verification:** `onboardingConsistency.test.ts` — sign-in guard block (above), incl. the
no-passphrase check proven by injecting the word and watching it fail · `npx jest` (182/182) ·
`npx tsc --noEmit` (clean) · Device: real email round trip — **outstanding, yours**
**Dependencies:** T9
**Files:** `src/hooks/useEmailSignIn.ts` (new), `app/settings/account.tsx`,
`src/components/system/Onboarding.tsx`, `src/components/system/onboarding/SignInStage.tsx` (new)
**Scope:** M

### Checkpoint C — entry
- [x] All gates green (182/182, 2409 tests; `tsc --noEmit` clean; system-map rebuilds clean,
      component count +2 for the two new stage files)
- [ ] Device: the New path and the Existing path (email → code → onboarding) both work — **yours**

---

## Phase 4 · Add kinds

### - [x] T11 · Invest leaves the switcher; Investment in Expense switches in place
**Was paused, then confirmed the same session:** none of your original 15 feedback points
mentioned the Add screen or Invest — `add-kinds` was a module I introduced writing the capability
map, and the only piece you'd confirmed was the money-math question (`DQ-87`). Asked directly, you
first said "will discuss" (a start on `enums.ts` was reverted rather than left half-built); minutes
later, unprompted: **"Lets Remove Invest it or so I belive I dont want to add Unssessary
COmplexity to user or so 3 States are Fine… for v1 atleast."** Built as originally designed.
**Description:** `ADD_KIND_TABS` (Expense · Transfer · Income, 3) now drives the switcher in
`app/add/quick.tsx`. `ADD_KIND` (all 4, unchanged) still validates a deep link's `?kind=`, a voice
parse, a stored draft — `AddKind.Invest` is real, it just has no pill. The existing "Switch to
Invest" `Banner` **stays tap-to-confirm, not automatic** — `useAddTxnForm.ts`'s `onTitleChange`
re-matches the category on every keystroke of the title field, so an instant switch the moment it
matches Investment would flip the whole screen mid-sentence, before the user finished typing. The
original plan's "replaces the banner" undersold what tracing `onTitleChange` actually showed; kept
as a deliberate one-tap confirm instead. `VoiceEntrySheet.tsx` and `app/help.tsx` needed no change
(confirmed by tracing, not assumed): the sheet keys off the caller's active `kind` prop, not a
rendered kind list, and `help.tsx` never mentions Invest.
**Acceptance:**
- [x] The switcher shows three kinds; `?kind=invest` and a voice "SIP 5000" still land in invest
      mode — guarded (`ADD_KIND` unchanged at 4, `addKind.test.ts`'s existing voice-detection test
      untouched and still green)
- [x] Saving from invest mode writes a transfer to an asset: net worth flat, absent from spending
      analysis — unchanged; nothing in `useAddTxnForm.ts`'s save path touched
- [x] Picking another category from invest mode returns to a plain expense with the amount kept —
      unchanged (the Banner's tap-to-confirm design, not automatic, was never this task's job to
      alter beyond removing the pill)
**Verification:** `addKind.test.ts` — 2 new assertions in a new describe block, both proven by
reverting (adding Invest back to `ADD_KIND_TABS`; switching the switcher back to mapping over
`ADD_KIND`) and watching them fail, then restored · existing `addKind.test.ts`/`moveToInvestments.test.ts`
suites untouched and still green (nothing about Invest's own behaviour changed) · `npx jest`
(186/186, 2429 tests) · `npx tsc --noEmit` (clean) · Device: log an SIP from Expense and check net
worth — **outstanding, yours**
**Dependencies:** Checkpoint C (ordering only; no code dependency)
**Files:** `src/constants/enums.ts`, `app/add/quick.tsx`, `src/__tests__/addKind.test.ts`,
`docs/SCREENS.md`, `docs/TRACKER.md`, `docs/FINDINGS.md` (`DQ-91` answered)
**Scope:** M

### Checkpoint D — add kinds
- [x] All gates green (186/186, 2429 tests; `tsc --noEmit` clean) — T11 resumed and shipped after
      Phase 5 was already done, per your confirmation mid-session; revisited retroactively
- [ ] Device: an investment logged from Expense, Plan net worth unchanged — **yours**

---

## Phase 5 · Friends

### - [x] T12 · One name, one door: Friends
**Description:** `/friends`'s `ScreenHeader` title, the Settings row (both `label` and the removal
confirm's "your people list" → "your friends list"), and Groups' balance-list label all renamed
People → Friends. `onboarding summary`/`empty states` needed no change — T4 already wrote "Friends"
there. `help.tsx` mentions neither word, nothing to touch. A `users`-icon button was added to the
Groups tab header (`app/(tabs)/groups.tsx`), before the archive toggle, **always visible**
regardless of active/archived view (unlike archive/`+`, which are view-conditional — Friends isn't
tied to either view, so it doesn't hide). Body copy that uses "people" as a plain noun (search
placeholders, "People you split with" intro line) was left alone — it describes who's in the list,
it doesn't name the screen, so it wasn't in scope.
**Acceptance:**
- [x] No UI string calls this screen "People" — guarded app-wide (`app/` + `src/components/`), not
      just the three known sites
- [x] The Groups header has a Friends button that opens `/friends` — guarded
**Verification:** `friendsNaming.test.ts` (new) — 2 guards, both proven by reverting and watching
them fail, then restored · `docs/SYSTEM.md` — `SC-26`'s description/count (People/2 →
Friends/**3**, the new entry point), its own and `SC-26a`'s "In" prose, and `FE-15`'s name all
updated · `npx jest` (183/183, 2412 tests) · `npx tsc --noEmit` (clean) · system-map rebuilds clean
**Dependencies:** Checkpoint D — **skipped**; T11 (all of Phase 4) is paused pending discussion, so
this proceeded straight from Checkpoint C per your instruction to keep going
**Files:** `app/friends.tsx`, `app/(tabs)/groups.tsx`, `app/(tabs)/settings.tsx`, `docs/SYSTEM.md`,
`src/__tests__/friendsNaming.test.ts` (new). `app/help.tsx` checked, needed no change.
**Scope:** M

### - [x] T13 · New Group: layout options (no code)
**Description:** Traced the real problems against current source first (Type chips render text
only though every `GROUP_TYPES` entry carries an unused icon+colour; Default split is a `Chip`
row for a single choice, which `AGENTS.md` §9 flags as a multi-select misread; the member picker
can only choose from existing `allPersons`, no way to add someone new inline — but `PersonNameSheet`
already exists and is shared by Friends and group Members, so "add inline" means reusing it, not
building a new sheet). Presented 2 options, both single-sheet (no added steps): a minimal fix
(chips gain icons, split becomes `TabPills`, a `+` tile opens `PersonNameSheet`) and the same
three fixes with Type as coloured icon tiles instead of chips.
**Acceptance:** [x] You chose: the bigger visual redesign (coloured icon tiles for Type)
**Verification:** your answer
**Dependencies:** T12
**Files:** none
**Scope:** XS

### - [x] T14 · Build the chosen New Group
**Description:** `GroupForm.tsx`: Type is a row of `IconCircle` tiles (`bg={t.color}`,
`color={colors.onAccent}`, `t.color`'s own accent-bordered `typeTileActive` on selection — same
`tile`/`tileActive`/`tileLabel` convention `CategoryPicker`'s grid already uses, reused rather than
invented). Default split is `TabPills`. The member row gained a dashed `+` tile behind a new
`onRequestNewPerson?: () => void` prop — `GroupForm` stays DB-free (a pure controlled component,
per its own doc comment), so the prop only *requests* the sheet; the caller owns `PersonNameSheet`
and the actual `insertPerson` call. Both callers (`groups.tsx` New Group, `edit.tsx` Edit Group)
wired identically: on submit, `insertPerson` → auto-select the new friend into `members` (typing a
name mid-creation plainly means "and this one," the same reasoning onboarding's removed
`addPerson` used to apply) → `reload()` (this screen's own `allPersons` needs the new row before
the sheet re-renders) → the global `refresh()`.
**Acceptance:**
- [x] It matches the chosen layout; New and Edit both render it — guarded (both callers checked
      identically, not just one)
- [x] Default split is a `TabPills`; the type shows its icon and colour — guarded
**Verification:** `groupFormDesign.test.ts` (new) — 6 assertions across 3 guard blocks, 2 proven
by reverting and watching them fail, then restored · `npx jest` (184/184, 2418 tests) ·
`npx tsc --noEmit` (clean) · Device: create and edit a group, incl. adding a brand-new friend
mid-creation — **outstanding, yours**
**Dependencies:** T13
**Files:** `src/components/finance/GroupForm.tsx`, `app/(tabs)/groups.tsx`,
`app/group/[id]/edit.tsx`, `src/__tests__/groupFormDesign.test.ts` (new), `docs/SCREENS.md`
**Scope:** M

### - [x] T15 · One add/remove path for a friend
**Description:** Traced every `insertPerson` call site before writing anything: `friends.tsx` and
`group/[id]/members.tsx` already rendered `PersonNameSheet` for adding, before this task —
T14 gave `groups.tsx` and `edit.tsx` the same sheet rather than a fourth/fifth hand-rolled input,
so **all four** add-a-person sites now share one component; there was no separate unification
task left to do for "adding." Removal was investigated and deliberately **not** unified: Friends'
delete (`deletePerson`, gone from the roster everywhere) and group Members' remove
(`removeMemberFromGroup`, leaves this one group only) are different actions with different
consequences — same as `members.tsx`'s own "Settle up first" branch already treats them. Unifying
their copy would misstate one of the two. What the guard actually checks: every removal still
goes through a destructive confirm (`style: 'destructive'`), none fires silently.
**Acceptance:**
- [x] All add-a-person entry points open one sheet component — guarded, exact-match against the
      four known call sites (a fifth fails the guard, not a silent pass)
- [x] Every removal confirms, destructively — guarded (not "with the same wording": the two
      actions are genuinely different, see above)
**Verification:** `personNameSheetUsage.test.ts` (new) — 4 assertions, 2 proven by reverting
(reintroducing a bare `insertPerson` call with no sheet; weakening a destructive confirm) and
watching them fail, then restored · `npx jest` (185/185, 2422 tests — one run hit the documented
`jest-worker` SIGSEGV flake, `AGENTS.md`'s standing rule 4, re-ran clean) · `npx tsc --noEmit`
(clean)
**Dependencies:** T14
**Files:** `src/__tests__/personNameSheetUsage.test.ts` (new). No production files changed — T14
already did the only production work T15 needed.
**Scope:** S (smaller than planned: T14 had already closed the "adding" half; this was the
verification pass + the deliberate call not to force-unify the "removing" half)

### Checkpoint E — friends
- [x] All gates green (185/185, 2422 tests; `tsc --noEmit` clean)
- [ ] Device: Groups → Friends, create a group adding a new friend inline — **yours**

---

## Phase 6 · Recurring vocabulary

### - [x] T16 · `/reminders` → `/upcoming`, one Upcoming list
**Description:** Corrected the plan's own assumption first: Home never rendered a "what's due"
list, only a bell + badge count (`homeData.ts` computes the full list, `index.tsx` only reads
`.length`) — filed as `DQ-92` rather than silently built, since adding a card would be a feature,
not a rename. The real duplication was `app/reminders.tsx` hand-rolling its own bill row while
`ComingUpList` (used by Plan) already existed for exactly this. Renamed the route
(`git mv reminders.tsx upcoming.tsx`), retitled "Upcoming", and replaced its hand-rolled section
with `<ComingUpList items={bills} showIcon onLogPayment={...} />` — which needed one real addition
to the shared component: an optional `onLogPayment` prop (a small pill per expense row, opening
Add pre-filled in the bill's own group), since the old screen's "Log payment" action had nowhere
to live in `ComingUpList` before. `ComingUpList`'s own default title changed `'Coming up'` →
`'Upcoming'`, and Plan's explicit `title="Due this month"` override was dropped entirely (now
inherits the default) — both banned phrases gone, not just hidden behind a prop. Six now-dead
styles/imports (`icon`, `rowTop`, `dueChip`, `dueChipText`, `shortDate`, `formatRupees`,
`categoryVisual`, `dueLabel`, `alpha`) removed from `upcoming.tsx` with the JSX that used them.
Six live-doc corrections beyond the obvious rename: `SYSTEM.md`/`SCREENS.md` both still described
a Home "Coming up" card as real in three more places, and `RELEASE_CHECKLIST.md` asked a tester
to verify one — all three rewritten to state what's actually there (`DQ-92`).
**Acceptance:**
- [x] No route or `router.push` literal says `/reminders` — guarded
- [x] Home, Plan and the Upcoming screen all use "Upcoming"/`ComingUpList` — guarded (Home via its
      badge label only, since it has no list to title)
**Verification:** `upcomingVocab.test.ts` (new) — 5 assertions, the dead-route one proven by
reverting Home's bell target and watching it fail, then restored · `deadRouteRef.test.ts` and
`countClaims.test.ts` caught 5 real doc-drift issues my own sweep missed (4 stale `/reminders`
citations, 1 accidental route-count-claim collision from "route (2026" reading as "routes (N)") —
all fixed, not silenced · `npx jest` (186/186, 2427 tests) · `npx tsc --noEmit` (clean, after
patching `.expo/types/router.d.ts` — gitignored, regenerates on next `expo start`, hand-edited
only to unblock local verification without a running dev server)
**Dependencies:** Checkpoint E
**Files:** `app/reminders.tsx` → `app/upcoming.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/savings.tsx`,
`src/components/finance/home/ComingUpList.tsx`, `docs/SYSTEM.md`, `docs/SCREENS.md`,
`docs/RELEASE_CHECKLIST.md`, `docs/TRACKER.md`, `docs/FINDINGS.md`, `scripts/build-system-map.js`,
`src/__tests__/upcomingVocab.test.ts` (new)
**Scope:** L (found and fixed a real cross-doc drift beyond the rename itself — each fix was a
factual correction, not a design decision, so it stayed one task rather than splitting)

### - [x] T17 · Vocabulary sweep + guard
**Description:** Replace "Due this month", "Coming up", "Bill reminders", "Bill & renewal
reminders", "renewal" and "Subscription(s)" in UI copy (Settings → Notifications, features, help,
the group Recurring tab, `StsSheet`, `TotalMoneyCard`). Add a source-scanning guard over `app/` and
`src/components/`. A credit-card "bill" and category keyword lists are allowed.
**What actually happened:** "Due this month" and "Coming up" were already fully collapsed by T16 —
re-grepped both phrases across `app/`+`src/components/` and found only historical comments explaining
the old titles (`app/plan/recurring.tsx`, `app/(tabs)/savings.tsx`, `ComingUpList.tsx`), left alone
as prose about the past, same treatment as `SYSTEM.md`'s "renamed from `/reminders`" note in T16.
`app/features.tsx`, `app/help.tsx`, `RecurringTab.tsx`, `StsSheet.tsx` and `TotalMoneyCard.tsx` were
already clean — grepped for every banned phrase and found nothing, so none of them needed edits (the
plan's file list was a guess at where the drift might be, not a confirmed inventory). The only real
occurrences were the toggle Settings called "Bill reminders" and onboarding's permissions step called
"Bill & renewal reminders" — two names for the same `renewals` pref, seen back to back by a new user
(Settings row → onboarding echoes it in the summary). Renamed both, plus the time-picker sheet title
("Renewal reminder time" → "Reminder time"), to one string: "Reminders for upcoming charges". Left
every internal identifier alone — `renewalTime`, `renewalLeadDays`, `prefs.renewals`, the `'renewal'`
`timeEditing` state value — these are the `ReminderPrefs` schema's own field names, not copy, and
renaming them would be a schema-touching change no one asked for. "Daily log reminder" already
matched the target wording on both the Settings row and its `Toggle` label; nothing to change there.
**Acceptance:**
- [x] The guard fails on any banned phrase and passes on the allow-list
- [x] The Settings rows read "Reminders for upcoming charges" and "Daily log reminder"
**Verification:** `src/__tests__/reminderVocab.test.ts` (new), proven by reverting the notifications.tsx
copy back to "Bill reminders" and watching 2 of 4 assertions fail, then restored; full suite
187/187 → 187/187 (2433 tests), `npx tsc --noEmit` clean, doc guards (`trackerIntegrity`,
`countClaims`, `docIdGraph`, `docIds`, `docCoverage`, `deadRouteRef`) all green
**Dependencies:** T16
**Files:** `app/settings/notifications.tsx`, `src/components/system/Onboarding.tsx`,
`src/components/system/onboarding/SummaryStage.tsx`, `docs/SCREENS.md` (2 spots), `docs/SYSTEM.md`
(1 spot), `src/__tests__/reminderVocab.test.ts` (new — named for what it guards, not the ticket)
**Scope:** S, copy-only across 3 source files once the wider file list turned out clean

### Checkpoint F — vocabulary
- [x] All gates green
- [ ] Device: Home, Plan, a group and Settings all say Recurring / Upcoming / Reminders the same way — outstanding, yours

---

## Parallel track · Sync audit (docs only, no code)

### - [x] T18 · Sync audit: what exists
**Description:** Map the current sync: entities, tables (client and D1), flows (share, join,
push, pull, approve, remove, leave), keys, and the 7 open `SYNC-F` items. Include what's missing.
**Acceptance:** [x] Every flow is traced to the code (`file:line`); every gap is named with its consequence
**Verification:** an adversarial review of the prose against the code before you see it
**Dependencies:** T0
**Files:** `docs/history/SYNC-AUDIT-2026-09.md` (new)
**Scope:** M
**What actually happened (2026-09-24):** written fresh, directly, in-session — every claim read
from the source and re-checked against the exact lines quoted rather than delegated to a background
agent, after the prior attempt's background-agent findings were lost. All 7 `SYNC-F` items
re-verified: 6 confirmed exactly as `TRACKER.md` files them, one (`SYNC-F15`) confirmed but found
worse than filed (`peerIngest.ts`'s entry lookup checks neither authorship nor **group membership**
of the target row before overwriting it), and one (`SYNC-F22`) found **partially fixed in code**
(`actor_person_id` exists and is populated, commit `03e3300`, 2026-09-04) but still `OPEN` in
`TRACKER.md` written 2026-09-07 — flagged in the audit rather than silently corrected, since T18's
file scope is the audit doc only. T19 is next and is gated on your read of §5–§6.

### - [x] T19 · Sync proposal
**Description:** A server-side model: tables, entities, the sync protocol, auth, what the server can
read, the migration from today (dev data may be wiped), and the privacy/DPDP consequences. Includes
the choice between keeping and replacing the current engine.
**Acceptance:** [x] It ends with a single recommended direction and the decision you need to make
**Verification:** your decision
**Dependencies:** T18
**Files:** `docs/history/SYNC-AUDIT-2026-09.md`
**Scope:** M
**What actually happened (2026-09-24):** added as §7 of the same file. Recommends **A: harden in
place**, which keeps the zero-knowledge server and the current engine and does not replace them. It
closes `F15` in the client only, and `F16`/`F24` with one new cleartext `sync_member.role` column and
a server-side removal route. `F17` rotates the key going forward and never re-seals old entries (a
`key_epoch` integer). `F20` falls back to `sync_group.owner_user`, which the server already stores.
It all lands in one additive migration, `0011`. **Decided 2026-09-24: B, not A** — privacy set aside,
the server holds everything, readable (`DQ-93`). A is recorded but not built. Next: `SPEC-SERVER.md`.

### ✅ Decision gate — sync direction chosen 2026-09-24 (`DQ-93`). Restore and the new sync spec → `SPEC-SERVER.md`.

---

## Phase 7 · Close-out

### - [x] T20 · Behaviour into the live docs; spec to history
**Description:** Anything not already moved into `docs/SYSTEM.md` / `docs/SCREENS.md` goes there,
TRACKER rows are closed, and `SPEC.md` and `tasks/` move to `docs/history/` with a frozen banner.
**Acceptance:** [x] No live doc contradicts the shipped behaviour; SPEC is frozen
**Verification:** the full `npx jest`; `node scripts/build-system-map.js /tmp/map.html`
**Dependencies:** Checkpoint F, and the decision gate for anything sync-related
**Files:** `docs/SYSTEM.md`, `docs/SCREENS.md`, `docs/TRACKER.md`, `docs/FINDINGS.md`, `SPEC.md`
**Scope:** S
**What actually happened (2026-09-24):** re-checked every task's behaviour against the live docs.
Two descriptions still showed the pre-pass onboarding, and both were rewritten: `SCREENS.md` FLOW-01
(one loader, 12 stages, no contacts written) and `SYSTEM.md`'s cold-start line (no `people` stage;
`welcome`/`signin`/`payday` added). Every other task had already updated its own docs. Tracker:
`DQ-89` and `DQ-32` answered by the sync direction, `DQ-93` recorded, `DQ-94`–`DQ-96` filed
(SPEC-SERVER's open questions), and `SYNC-F22` re-worded. All 25 `SPEC.md` acceptance boxes are
ticked. The device passes marked **yours** above are still outstanding and carry over as a
checklist in the next `tasks/todo.md`. `SPEC.md` → `docs/history/SPEC-2026-09-FEEDBACK.md`,
`tasks/` → `docs/history/{PLAN,TASKS}-2026-09-FEEDBACK.md`, and every citation was renamed to
match.
