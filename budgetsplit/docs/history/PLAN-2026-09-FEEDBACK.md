# Implementation Plan — Post-sync feedback pass

> **FROZEN 2026-09-24.** Every task closed; see `TASKS-2026-09-FEEDBACK.md`. Never edited to keep a test green.

`Spec: SPEC-2026-09-FEEDBACK.md · Tasks: TASKS-2026-09-FEEDBACK.md · Branch: fix/post-sync-feedback · Written 2026-09-23`

## Overview

Six modules from `SPEC.md`, built in the spec's order: `boot-flicker` → `onboarding-steps` →
`entry-gate` (screen + sign-in only) → `add-kinds` → `friends` → `recurring-vocab`. The
`sync-architecture` audit is a docs-only track that runs alongside and ends in a decision from you.
21 tasks (T0–T20), none larger than M, with a checkpoint after each phase. Your device pass is the
check at every checkpoint.

## Dependency graph

```
T0 file SPEC's open questions in TRACKER/FINDINGS
 │
 ├─ T1 one boot loader ───────────────────────────────┐
 ├─ T2 keyboard: footer behind, Done toolbar          │  independent of each other,
 ├─ T3 name has no Skip + Siri row out                │  all in onboarding
 │                                                    ▼
 ├─ T4 people step out ──┐                      CHECKPOINT A
 ├─ T5 take-home presets │
 ├─ T6 next-payment date ├─► T8 copy trim (last: it rewrites every step's text)
 ├─ T7 money options ────┘            ▼
 │                              CHECKPOINT B
 ├─ T9 welcome stage ─► T10 in-flow sign-in ─► CHECKPOINT C
 ├─ T11 Invest pill → Expense ─────────────► CHECKPOINT D
 ├─ T12 People→Friends + Groups icon
 │     └─ T13 New Group layout options (you pick) ─► T14 build it ─► T15 one add/remove path
 │                                                                  ▼
 │                                                            CHECKPOINT E
 ├─ T16 /reminders → /upcoming, one Upcoming list ─► T17 vocabulary sweep + guard ─► CHECKPOINT F
 │
 └─ (parallel, docs only) T18 sync audit: current state ─► T19 proposal ─► DECISION GATE
T20 close-out: behaviour into SYSTEM/SCREENS, SPEC + plan → docs/history/
```

## Architecture decisions

- **One loader, mounted once (T1).** The flicker comes from three `BrandedLoader`s in three tree
  positions (root, `FlagsGate`, `OnboardingGate`), each unmounting and remounting. The fix is one
  root-level overlay that stays mounted and fades out once every gate reports ready, while the gates
  render `null` until then. **No `expo-splash-screen`**: it isn't installed, and adding it means a
  new dependency plus a native rebuild. It's the fallback only if T1 doesn't fix it on device.
- **The footer stops riding the keyboard (T2).** This reverses a deliberate earlier fix, the
  `KeyboardStickyView` comment in `StepScaffold`. The reason that fix existed (the name field and
  Continue were both hidden) is now met by a `KeyboardToolbar` with `showArrows={false}` and a
  Done button. `KeyboardAwareScrollView`'s `bottomOffset` becomes the toolbar height, so the
  focused field stays visible.
- **`AddKind.Invest` stays as internal state (T11).** Only the *rendered* switcher loses it.
  Deep links (`?kind=invest`), voice parsing and `useAddTxnForm`'s param check keep working. So the
  change is a new `ADD_KIND_TABS`, not an edit to `ADD_KIND`. Money math doesn't change (SPEC Q1
  default).
- **Payday becomes a date, not a day-of-month (T6).** State changes from `payday: number` to
  `firstPayDate: ms`. `paydayAnchor` goes from 09:00 to 00:00 and takes the chosen date. The
  day-of-month is derived from that date for the monthly rule. `SummaryStage` reads the date.
- **The route is renamed `/reminders` → `/upcoming` (T16)** rather than only retitled. A screen
  called Upcoming at a path called reminders is the inconsistency this module exists to remove.
  The guards (`deadRouteRef`, the SC- per route rule, `router.push` literals) force the SYSTEM.md
  update into the **same** task.
- **The vocabulary guard is scoped (T17).** "Bill" is legitimate for a credit-card bill
  (`PayCardBillSheet`) and in category keyword lists (`smartCategory`, `mcc`, `paytmParse`). The
  guard bans the *recurring* phrasings only ("Due this month", "Coming up", "Bill reminders",
  "renewal", "Subscription"), in `app/` and `src/components/`.
- **Sign-in logic is extracted, not copied (T10).** `settings/account.tsx` already does email →
  code → `verifyMagicLink` → `claimMyAccount`. That moves into one hook both screens call.
- **Docs move with the code.** Any task that changes a route, flag, screen or count updates
  `docs/SYSTEM.md` / `docs/SCREENS.md` in the same commit, because the guards fail otherwise.
  Open decisions go to TRACKER + FINDINGS (T0), never into this file.

## Task list

Full detail, acceptance criteria and verification for each task are in `./todo.md`.

| Phase | Tasks | Checkpoint |
|---|---|---|
| 0 · Housekeeping | T0 | — |
| 1 · First launch | T1 · T2 · T3 | **A**: a first launch on device is smooth, the keyboard behaves, Name is required |
| 2 · Onboarding questions | T4 · T5 · T6 · T7 · T8 | **B**: the full onboarding on device, and the data written is right |
| 3 · Entry | T9 · T10 | **C**: New / Existing both work end to end |
| 4 · Add kinds | T11 | **D**: logging an investment from Expense, net worth flat |
| 5 · Friends | T12 · T13 · T14 · T15 | **E**: Friends reached from Groups, New Group redesigned |
| 6 · Recurring vocab | T16 · T17 | **F**: one word per concept everywhere |
| ∥ · Sync audit | T18 · T19 | **Decision gate**: you pick the direction |
| 7 · Close-out | T20 | — |

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| T1 doesn't cure the flicker (the cause is inferred from code, not seen) | Med | The device check at A decides. The fallback, `expo-splash-screen`, is Ask-first |
| T2 re-introduces "field hidden under keyboard" | Med | `bottomOffset` = toolbar height; the name step and all amount fields are checked on a small phone at A |
| T6 date math across short months, year end and DST | High | Pure function, tested under `npm run test:calendar`. Anchor at local 00:00, clamp 29–31 |
| T11: with no Invest pill, how does a user back out of invest mode? | Med | Decided at task start (the category chip goes back to Expense). If unclear, a layout question first |
| No render tests: UI regressions pass CI | High | Source-scanning guards for every rule; each regression test proven by reverting its fix; your device pass at each checkpoint |
| Removing the people step breaks the Home tiles' `skippedPeople` logic | Low | T4 removes the reader and the writer together; the Settings "Replay welcome tour" reset is updated too |
| Sync audit grows into a redesign before you decide | Med | T18/T19 are docs only; no sync spec or code until the gate |
| Server-readable data makes the privacy copy false | High | Not in this plan. It ships with whatever sync direction is chosen, per SPEC §3 |

## Open questions

The four SPEC questions (Q1–Q4) are filed as `DQ-` rows by T0, each with its default. Nothing in
this plan is blocked on them.
