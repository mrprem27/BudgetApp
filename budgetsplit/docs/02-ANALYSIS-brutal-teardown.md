# BudgetSplit — Brutal Product & UX Teardown

*React Native / Expo Router · SQLite · Zustand · dark theme · India-first finance app.*
*Analysis grounded in the actual codebase as of this commit. No charity applied.*

---

> **Owner's decision (read this first).** This teardown recommends cutting the "experiment"
> features. The owner chose a different resolution, and it is final:
>
> - **Identity** = two always-on pillars + insights: **Personal Finance** (budget +
>   spending) **and Group Splitting** (the original moat), with **Insights** turning both
>   into "where money goes and can go." Nothing is deleted.
> - **Experiment-debt** is NOT cut. It becomes **user-toggleable sections, default OFF** —
>   the dev-only feature flags become a real user-facing "Sections / Customize" system.
>   Clean default UI for newcomers; nothing lost for power users.
> - **Genuine bugs** (duplicate settle flows, 3-surface recurrence, scattered settings,
>   split-brain categories, debug screens in nav) get unified regardless of toggles.
>
> So read Section D/G below as "these features lack a home and a spine," **not** "delete
> them." `03-PROMPT-design-redesign.md` is the authoritative direction.

---

## A. The one-sentence product (and why it's the headline)

You **cannot** write one clean sentence for this app, and that is finding #1.

It is simultaneously:
- a **personal expense tracker** (quick add, categories, dashboard),
- a **bill-splitting app** (groups, members, itemized splits, settle-up — Splitwise),
- a **budgeting app** (per-category limits, utilization bars, financial health score),
- a **savings/goals app** (goals, allocation sweeps, cash-position),
- and a **financial-advice engine** (afford check, subscription detection, insights,
  forecasts, opportunity-cost nudges).

Five products share one shell. None of them owns the home screen. A first-time user has
no idea whether they're supposed to *log a coffee*, *split rent with flatmates*, *set a
budget*, or *save for a goal*. **That ambiguity is the root cause of every symptom you
described** ("feels random", "messy", "feature confusion", "less clarity"). The UI isn't
the disease — it's the rash.

---

## B. First-run & primary flow

**Cold path:** `app/_layout.tsx` → gates (FeatureFlags → Undo → LockGate → OnboardingGate)
→ `Onboarding` → lands on **Home** (`app/(tabs)/index.tsx`, ~805 lines).

Problems:

1. **Onboarding is rigid and presumptuous.** It forces a name + avatar and hardcodes a
   "Personal" group before you've expressed any intent. It never asks the one question
   that would disambiguate the whole app: *"Are you here to track your own spending, or
   to split with people?"* That single question could route the entire experience.

2. **The landing screen has no hero.** `index.tsx` stacks 8+ unranked sections — cash,
   net balance, group health, budget vs. spend, category donut, insights carousel,
   savings summary, tracking streak — and which one is "the number" shifts as feature
   flags toggle. A finance app's home screen must answer one question in the first
   second ("am I okay this month?"). This one asks the user to choose between eight.

3. **The primary action is ambiguous.** The FAB (`components/ui/FAB.tsx`) fans out to
   quick / income / itemized / transfer. Four entry modes with no recommended default
   means every "add" is a decision. Most users do one thing 90% of the time (log an
   expense); that should be one tap, not a menu.

**Verdict on first-run:** intent leaks immediately and never recovers. The app shows
everything because it doesn't know what you came for.

---

## C. Navigation map & coherence

**Visible tabs (4):** Home (`index`), Groups (`groups`), Money (`savings`), Settings.
**Hidden but routable:** Reports (`reports.tsx`, `href: null`).

**Modal stack (slide-from-bottom):** `add/quick`, `add/income`, `add/itemized`, `add/transfer`.

**Stack-push deep links (slide-from-right):** `afford`, `settle`, `friends`, `categories`,
`search`, `history`, `help`, `features`, `storage`, `group/[id]` (+ sub-routes `budget`,
`insights`, `members`, `recurring`, `edit`), `category/[name]`, `txn/[id]`, `savings/[id]`.

**Coherence failures:**

| Problem | Evidence |
|---|---|
| **Reports is a dead-end.** 801 lines of charts, hidden from the tab bar (`href: null`), reachable only by ad-hoc navigation. No drill-down from chart → transactions. PDF export buried, no share. | `app/(tabs)/reports.tsx` |
| **Two settle flows, no model.** Global `/settle` (person↔person) vs. group `SettleSheet` inside group detail. A user with a debt has no idea whether to *transfer*, *settle globally*, or *settle in group*. | `app/settle.tsx`, `components/finance/SettleSheet.tsx`, `app/add/transfer.tsx` |
| **Three modal presentations for the same class of action.** Custom `SheetModal`, RN `Modal`, and stack-push screens all used for "do a thing and come back." No consistent depth metaphor. | `components/ui/SheetModal.tsx` + RN Modal in add screens |
| **Debug screens shipped in the nav graph.** `/storage` (device storage info) and `/features` (15+ flag toggles) are reachable like real features. | `app/storage.tsx`, `app/features.tsx` |
| **No hierarchy cues.** `/group/[id]/budget` never tells the user "Groups › Flatmates › Budget." Deep screens float context-free. | all `group/[id]/*` |
| **Money tab is a second kitchen-sink.** Goals + pool + subscriptions + what-if + recurring summary + insights, all on one 544-line screen with no sub-tabs. | `app/(tabs)/savings.tsx` |

---

## D. Feature sprawl audit

**Core / Supporting / Debt** classification. "Debt" = exists in code, but hidden,
unfinished, unreachable, computed-once, or duplicated.

| Feature | File | Class | Finished? | Why it feels random |
|---|---|---|---|---|
| Quick expense | `app/add/quick.tsx` (816 L) | **Core** | Functional, unmaintainable | 816-line monolith, all `useState`, no validation lib |
| Itemized split | `app/add/itemized.tsx` (705 L) | **Core** | Yes | 705-line wizard; **no recurrence** (quick has it, this doesn't) |
| Groups + members | `app/(tabs)/groups.tsx`, `group/[id]/*` | **Core** | Yes | Solid; the clearest part of the app |
| Settlements | `app/settle.tsx`, `lib/settle.ts` | **Core** | Algorithm good, UX split | Two flows, no guidance (see C) |
| Budgets / utilization | `group/[id]/budget.tsx`, `db/queries/categoryBudgets.ts` | **Core** | Yes | Buried inside group detail; not surfaced for personal use |
| Income entry | `app/add/income.tsx` | Supporting | Yes | Fine |
| Transfers | `app/add/transfer.tsx` | Supporting | Yes | Overlaps settle conceptually |
| Savings goals + pool | `app/(tabs)/savings.tsx`, `lib/savings*.ts` | Supporting | Yes | Crammed; auto-sweep is invisible magic |
| Recurring txns | `group/[id]/recurring.tsx`, `lib/recurrence.ts` | Supporting | Partial | In quick add **and** a group sub-tab **and** materialized at app-launch — 3 surfaces, one concept |
| Reminders | `lib/reminders.ts`, `lib/reminderPlan.ts` | Supporting | Partial | No in-app notification center / history |
| Reports / charts | `app/(tabs)/reports.tsx` (801 L) | **Debt** | Built, hidden | `href: null`, no drill-down, copy-pasted `fmtY` |
| **Afford check** | `app/afford.tsx`, `lib/afford.ts` | **Debt** | Prototype | No group/person context, computes once on mount, no "add this expense" CTA after verdict |
| **Subscription detection** | `lib/subscriptions.ts` | **Debt** | Hidden | Flag-gated on Money tab; no dedup vs. manual recurring; no "manage" action |
| **Financial health score** | `lib/financialHealth.ts` (100+ L) | **Debt** | Semi-abandoned | Shown on dashboard only if flag on; influences nothing; invisible elsewhere |
| **Spending forecast** | `lib/forecast.ts` | **Debt** | Orphan | Lives in reports only; no action attached |
| **Savings insights / opportunity cost** | `lib/savingsInsights.ts` | **Debt** | Orphan | Tone-coded nudges with nowhere coherent to live |
| Smart category matcher | `lib/smartCategory.ts`, `smartCategoryLearn.ts` | Supporting | Yes | Good idea; defaults in a constants file fight learned overrides |
| Search | `app/search.tsx` | Supporting | Isolated | Fixed 3-year window, no saved searches, links from nowhere |
| Audit log | `app/history.tsx` | Supporting | Yes | Fine but orphaned |
| OCR receipt | `modules/expo-ocr`, `lib/ocr.ts` | **Debt** | Unclear surface | Native module shipped; unclear where it's invoked in the flow |
| Location tagging | `lib/location.ts` (lat/lng/place on txn) | **Debt** | Captured, unused | Stored on every txn; surfaced nowhere |

**Thesis confirmed.** ~5 Core features carry the app. ~8 features are
experiment-debt: built, partially wired, hidden behind flags, computed once, or
surfaced nowhere. The experiments are well-intentioned (the math in `afford.ts`,
`settle.ts`, `savingsEngine.ts` is genuinely clever) but they dilute the product and
are the direct source of the "feature confusion" feeling.

---

## E. Information architecture problems

1. **Categories live in two minds.** Defaults baked into `constants/categories.ts`;
   custom ones in `app/categories.tsx`; the matcher (`smartCategory.ts`) knows defaults
   while `smartCategoryLearn.ts` overrides with a learned map. No single "manage
   categories for this group" flow. The user can't tell what's editable.

2. **Settings are scattered across three stores.** Feature flags in
   `FeatureFlagsProvider` (Zustand), reminder/display/automation prefs in AsyncStorage,
   app config in a SQLite `settings` table. Three sources of truth for "preferences."

3. **Settle vs. transfer vs. group-settle** — three mechanisms for "money moved between
   people," no decision guidance (see C).

4. **Recurrence has three surfaces** — quick-add fields, group `recurring` sub-tab, and
   launch-time `materializeDueOccurrences()` in `_layout.tsx`. One concept, three places
   to reason about it.

5. **Store vs. DB divergence risk.** Screens query SQLite directly
   (`getTransactionsForGroup(db, …)`) while the Zustand store caches `txns[]` that is
   "rarely refreshed." Undo manually pokes both. The cache can lie.

6. **Personal vs. shared identity is muddy.** `budget_group` carries `is_personal`,
   `is_shared`, `is_archived` flags — the schema admits the app is two products, but the
   UI never commits to either at the top level.

---

## F. UI / visual-craft critique — why it "looks like a generic AI app"

The styling *foundations* are actually fine (semantic tokens in `constants/colors.ts`,
`typography.ts`, `layout.ts`, `palette.ts`). The problem is **discipline and hierarchy**,
not the palette:

1. **Monolith screens with zero component extraction.** Home 805 L, Reports 801 L, Quick
   816 L, Itemized 705 L, Money 544 L. These aren't screens, they're scrolls. No
   section components, so every screen reinvents layout and the rhythm drifts.

2. **Tokens defined but not consistently used.** `components/tokens.ts` exists, yet
   screens import straight from `constants/` and pepper inline style objects for anything
   dynamic. The result is visually *almost* consistent — which reads as "templated."

3. **Copy-pasted helpers instead of shared lib.** `utilLabel` and `healthColor` are
   redefined across dashboard, groups, and `group/[id]`. `fmtY` axis-labels copy-pasted
   in reports. Same logic, slightly different each time → subtle visual inconsistency.

4. **Inconsistent empty/loading/error states.** Some screens use the real `EmptyState` /
   `ErrorState` / `Skeleton` components; others fall back to bare `Text` "No data yet" on
   a `ScrollView`. There is no enforced state-machine per screen, so the app feels
   half-finished in exactly the places a new user lands first.

5. **No visual hierarchy on dense screens.** Everything is a card of roughly equal weight.
   Equal weight = no weight. Nothing tells the eye what matters, which is the textbook
   signature of generated UI.

6. **No consistent modal depth.** Bottom-sheet, RN Modal, and stack-push all coexist for
   the same job, so transitions feel arbitrary.

**Bottom line:** it doesn't look generic because the tokens are bad — it looks generic
because **nothing is emphasized, everything is a card, and the same patterns are
re-implemented slightly differently on every screen.** That's a hierarchy and
componentization problem, not a color problem.

---

## G. The honest verdict

**Biggest single problem (one paragraph):** The app never decided what it is. It tries to
be Splitwise + a personal budget tracker + a savings app + a financial advisor in one
flat navigation, and because no use case won, the home screen, the add button, and the
information architecture all hedge. Every other symptom — cluttered dashboard, four add
modes, two settle flows, eight half-finished "smart" features hidden behind flags, the
templated look — is a downstream consequence of that one missing decision.

**5 highest-leverage cuts (delete or hide today):**
1. **Reports tab** → fold its 2 best charts into Home/group detail; delete the rest.
2. **Financial health score** → remove; it influences nothing and is flag-hidden.
3. **Afford check** → cut as a standalone screen, or rebuild it *inside* the add flow
   ("you have ₹X left in Food this month") where it has context.
4. **Forecast + savings-insights orphans** → cut until there's a home for them.
5. **`/storage` and `/features` debug screens** → move behind a hidden dev gate.

**5 highest-leverage fixes (finish or unify):**
1. **One home hero**: pick the single most important number and own the top of the screen.
2. **One default add action**: FAB logs an expense in one tap; other modes are secondary.
3. **One "money between people" model**: merge transfer/settle into a single guided flow.
4. **Unify recurrence** into one place and one mental model.
5. **One settings source of truth**; one categories management flow per group.

**What it should become:** Pick ONE identity at the top level. The schema (`is_personal`
/ `is_shared`) and the strongest code (splitting + settle) point to **"split expenses
with people, and see your own money clearly"** — i.e. *Splitwise with a real personal
budget attached*. Commit to that. Make the home screen answer "am I okay + who owes whom,"
make adding an expense one tap, and demote every advisor-style feature to a single
contextual nudge instead of its own screen.

---

## If you only do 3 things

1. **Decide the identity** (recommend: shared-splitting + personal-budget; cut the rest)
   and rewrite onboarding to ask the one routing question.
2. **Rebuild Home** around a single hero answer + one primary add action; extract its 8
   sections into ranked components and delete the ones the chosen identity doesn't need.
3. **Cut the experiment-debt** (health score, afford screen, forecast, orphan insights,
   reports tab, debug screens) so the ~5 core features can breathe.

> Everything below the fold (monolith refactors, token discipline, state-machine for
> empty/loading/error, store-vs-DB consolidation) is real work but secondary — it makes
> a *coherent* app polished. Do the three above first or the polish just decorates the
> confusion.
