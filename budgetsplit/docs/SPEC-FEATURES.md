# SPEC-FEATURES — Feature Management by persona and level

Status: **BUILT 2026-09-30** from your answers (below). Tracker: `U-01`. `lib/levels.ts`, `levels.test.ts`.

## The problem

Feature Management is 16 on/off switches, set once by the onboarding answer ("What brings you here?")
and then left to you. Two things are wrong with it:

- **One axis where there are two.** The onboarding answer says *what you use the app for* (your own
  money, splitting, a household, both). It says nothing about *how much you want at once*. Someone who
  splits trips may still want everything; someone tracking their own money may want only the basics.
- **Switches gate whole features, never parts of one.** What overwhelms a new user is rarely a whole
  feature — it is Add with eight chips (split, payer, tags, time, location, receipt, repeat, pay method)
  when all they wanted was "₹250, food". There is no way to say "a simpler Add" today.

And one switch is already dead: Insights (`U-01`, `P2-13`).

## The model — two answers, both changeable

**1 · What for** — the four cards that exist today (Track my own spending · Split with people · Share a
household · Both). Decides which *areas* exist: Groups, Money, splitting, UPI.

**2 · How much at once** — new, three levels:

| Level | For | Add | Home and tabs |
|---|---|---|---|
| **Simple** | "Just let me log what I spend." | A calculator-style amount, a category, Save. Nothing else on screen | Spend this month, budget if set. No health score, no Insights tab |
| **Standard** | Most people, after a week or two | + note, date, split (if splitting), repeat | + goals, recurring, Afford, Insights |
| **Everything** | You, and anyone who wants all of it | Every chip: tags, time, location, receipt, pay method, itemize | Every surface, health score, reports, import |

Levels **add**; they never remove data. Going from Everything to Simple hides controls — tags already
on an entry stay on it and still show on the entry itself.

**Learn, then add.** Simple is the default for a new install. The app offers the next level when it has
a reason to — after ~20 entries ("Want to split, repeat or add notes?"), or when you try something
the level hides — never on a timer, and one offer at a time, dismissible for good.

**Feature Management** becomes: the two answers at the top (two rows, each opening a picker), then the
switches, grouped as today, each showing whether the level turned it on. A switch you flip yourself
wins over the level until you pick a level again.

## How it fits the code

- `settings.level` (`simple | standard | full`) beside `onboarding_intent`.
- Effective flags = `DEFAULTS` ∩ what-for patch ∩ level patch, with your own flips on top — the same
  sparse-patch shape `personaDefaults.ts` already uses, so one function composes them.
- **Sub-feature gating** is new: a small set of keys for Add's detail chips (`addDetails: 'basic' |
  'standard' | 'all'`), read by `DetailChips` and `AmountField` — not a flag per chip, which would put
  eight new switches in front of the person this is meant to calm down.
- The Insights tab hides when its flag is off (the tab bar has four slots; Money then sits alone on
  the right) — or Insights folds into Money for Simple. Question 3.
- Onboarding gains one screen after "What brings you here?": "How much do you want to start with?",
  three cards, Simple pre-selected. It must stay one tap (`project_onboarding_friction_bias`).

## Your answers (2026-09-30), and what was built

1. **Names:** Simple / Standard / Everything.
2. **Simple's Add:** amount, category, the group picker, Save. Title, notes, tags, time, place,
   receipt, repeat and pay method hide — never while editing an entry that already has them.
3. **Insights in Simple:** kept. (Trimming what is on it is a follow-up.)
4. **Level up:** offered on Home after 20 entries, one level at a time, dismissible for good per level.
5. **Existing installs:** Everything, with no switch changed.

**Changed from the draft:** no new onboarding screen. New installs start on Simple and grow through the
offer, which keeps onboarding at the taps it has (`project_onboarding_friction_bias`). Feature
Management has the level as a second row under "Your setup"; picking one resets the switches (asked
first), and re-picking a setup keeps the level on top.

## Out of scope

Paywalls or tiers (`DQ-01`: none exist and none are planned here) — levels are about how much is on
screen, never what you are allowed to use.
