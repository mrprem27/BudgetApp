# Prompt — BudgetSplit Redesign (real UI/UX, not a generated template)

> Two prompts. **Prompt 1** is for design/UX thinking (IA, flows, visual system).
> **Prompt 2** is for implementing it in the actual codebase. Run Prompt 1 first,
> review its output, then feed the approved decisions into Prompt 2.
>
> Both are written specifically to defeat the failure mode the owner called out:
> *"current structure looks like another UI app, I want real UI/UX, not the random
> flow Claude always makes."* The anti-patterns section is the load-bearing part — do
> not delete it.

---

## PROMPT 1 — Product & UX redesign (IA + flows + visual system)

You are a principal product designer redesigning **BudgetSplit**, a React Native
(Expo Router) finance app. A brutal teardown already exists (see
`docs/02-ANALYSIS-brutal-teardown.md` — read it first). The teardown's symptom is real
(the app reads as a generated template with no hierarchy), but the owner has decided the
diagnosis is **organization, not feature count.**

### The chosen identity (non-negotiable — design to this)

**"Where your money goes, and where it can go."** A complete money-clarity app built on
**two always-on pillars plus insights**:

1. **Personal Finance** — budgeting + spending tracking. Know where your own money goes.
2. **Group Splitting** — shared expenses, itemized splits, settle-up. *This was the
   original moat; treat it as a first-class pillar, not a sub-feature.*
3. **Insights** — the layer that turns 1 + 2 into understanding ("where it can go").

These three are the **default core experience** and must feel clean, focused, and
obviously connected — not a pile of cards.

**Nothing gets deleted.** Every other capability (afford check, financial health score,
forecast, subscription detection, savings goals, savings-insights, reminders, reports/
charts) is a legitimate "know where money goes/can go" feature. But they are NOT forced
on everyone.

### The mechanism: optional, user-toggleable sections — DEFAULT OFF

This is the core design decision. Convert the existing dev-only feature flags
(`app/features.tsx`, `FeatureFlagsProvider`) into a **user-facing "Sections / Modules"
system**:

- The default app shows ONLY the two pillars + insights — clean and uncluttered.
- Everything else ships **toggled OFF by default.** A user opts in from a clear
  "Add sections / Customize" surface (e.g. in Settings or a Home "＋ Add section" affordance).
- When a section is ON, it appears in its proper home (a Home card, a tab, or inside a
  relevant flow). When OFF, it's completely absent from the UI — no dead "No data"
  stubs, no half-visible teasers.
- Each toggle needs a one-line plain-English description of what it adds, so the user
  understands what they're turning on.

This satisfies both goals at once: **clean default UI/UX** for newcomers, **nothing lost**
for power users. Design the toggle catalog: list every optional section, its default
(OFF), its home when enabled, and its one-line description.

### Also fix the genuine bugs (independent of toggles)

These are incoherence, not features — unify them regardless of which sections are on:

- Two settle flows + transfer → **one** "money between people" model.
- Recurrence's three surfaces (quick-add fields, group sub-tab, launch materialization)
  → one mental model.
- Three settings stores (AsyncStorage + FeatureFlagsProvider + SQLite `settings`) → one
  source of truth — which now also backs the user-facing section toggles.
- Categories' split-brain (constants defaults vs. `categories.tsx`) → one management flow.
- `/storage` stays dev-gated (it's debug, not a user section). `/features` is *replaced*
  by the new user-facing Sections screen.

Net: a focused, coherent default built on the two pillars + insights, with everything
else available as clean opt-in modules. Don't delete capability; don't force it either.

### ❌ Anti-patterns to actively avoid (this is why past attempts failed)

1. **No "card soup."** Do NOT design a home screen that is 8 equal-weight cards stacked
   vertically. Equal weight = no hierarchy = looks generated. There must be ONE hero
   that answers a single question, then a clear descending hierarchy.
2. **No feature-per-screen reflex.** Do not invent a new tab/screen for every capability.
   Capabilities live *inside* the flow where they're relevant (e.g. "you have ₹X left in
   Food" appears in the add-expense flow, not a separate Afford screen).
3. **No generic dashboard / "Overview" / "Analytics" filler.** Every section must map to
   a real user question with a real next action. If a section has no action, cut it.
4. **No four-way "add" menus.** One primary action, one tap. Secondary modes are
   progressively disclosed, not presented as equals.
5. **No inventing flows the data can't support.** Design only against the real schema
   (`src/db/schema.ts`): person, budget_group, group_member, txn, txn_payment,
   txn_share, line_item, category, category_budget, savings_goal, audit_log. Don't
   assume cloud sync, multi-device, or auth that doesn't exist.
6. **No vibes-only visuals.** Reuse the existing token system (`src/constants/colors.ts`,
   `typography.ts`, `layout.ts`, `palette.ts`). Don't introduce a parallel design
   language; refine the one that's there.
7. **No "happy path only."** Every screen must specify its empty, loading, and error
   state (the current app fakes these with bare "No data yet" text).

### Deliverables (in this order)

1. **Identity statement** — one sentence + who the primary user is + the single question
   the app answers on open. Reflect the two pillars (Personal Finance + Group Splitting)
   + Insights as the always-on core.
1b. **Section-toggle catalog** — a table of every optional module: name | default (OFF) |
   home when enabled | one-line user-facing description | where the user toggles it. Plus
   the design of the "Add sections / Customize" surface itself.
2. **Navigation architecture** — final tab set (justify each tab; default ≤ 5) and what
   moves off-nav into contextual flows. A table: every current screen → keep / merge /
   relocate / dev-gate, with the destination. The goal is that every feature has an
   obvious home under the "where money goes" spine — not fewer features.
3. **Home screen spec** — the ONE hero (which number, why), then ranked sections each
   with: the user question it answers, the data behind it, and its tap-through action.
   Explicitly state what is NOT on home.
4. **Primary "add expense" flow** — one-tap default, where split/itemized/income/recurring
   live as progressive disclosure, where the contextual budget nudge appears.
5. **"Money between people" unified flow** — merge transfer/settle/group-settle into one
   guided model. Spell out the decision the UI makes for the user.
6. **Per-screen state matrix** — for every kept screen: empty / loading / error / full.
7. **Visual system refinements** — hierarchy rules (what gets emphasis and how), spacing
   rhythm, one consistent modal-depth metaphor (pick bottom-sheet OR stack-push for
   "do-and-return", not both), component-extraction list (the 5 monolith screens that
   must be broken into named sections).
8. **Home / relocation map** — for each feature, its new home under the spine (which tab
   or which flow it lives in) and how it's reached. Anything you propose to actually
   remove must be listed separately with justification and flagged for owner approval —
   the default is keep + relocate, not cut.

**Output:** Markdown, the 8 sections above, in order. Be decisive — make the call and
justify it in one line, don't present menus of options. Where a layout matters, sketch it
in ASCII so hierarchy is unambiguous. End with a phased plan: *Phase 1 (identity + home +
add flow), Phase 2 (unify money-between-people + state matrix), Phase 3 (visual polish +
monolith refactor).*

---

## PROMPT 2 — Implementation (after Prompt 1 is approved)

You are implementing the approved BudgetSplit redesign in the real codebase
(React Native + Expo Router + SQLite + Zustand). The redesign spec from Prompt 1 and the
teardown in `docs/02-ANALYSIS-brutal-teardown.md` are your source of truth.

**Rules of engagement:**

1. **Work in phases, smallest shippable unit first.** Do not rewrite the app in one pass.
   Phase 1 = identity + Home + add-expense flow. Stop and let me review before Phase 2.
2. **Reuse, don't reinvent.** Use existing `src/components/ui/*` and `finance/*`
   components and the `src/constants/*` tokens. If you need a new component, extract it
   from an existing monolith screen — don't add a parallel pattern.
3. **Pick ONE modal metaphor** for do-and-return actions and apply it everywhere; delete
   the others. State which you chose and why.
4. **Break the monoliths as you touch them.** When you edit `index.tsx` (805 L),
   `reports.tsx` (801 L), `add/quick.tsx` (816 L), `add/itemized.tsx` (705 L), or
   `savings.tsx` (544 L), extract named section components — leave each smaller than you
   found it.
5. **Every screen ships its empty / loading / error states** using the real
   `EmptyState` / `Skeleton` / `ErrorState` components. No bare "No data yet" text.
6. **Don't break the data layer.** Keep the SQLite schema and query functions; if the
   store/DB divergence (cached `txns[]` vs. direct queries) is in your path, fix it by
   making the store the single read source — don't paper over it.
7. **Tests exist** (`src/__tests__/*` — afford, settle, savings, recurrence, etc.). Keep
   them green; update them when you intentionally change behavior; add tests for new
   pure logic.
8. **Relocate, don't delete.** The chosen identity ("where money goes") keeps the
   features and gives each a coherent home. Only remove something if Prompt 1 flagged it
   and the owner approved; otherwise wiring an orphan feature into its new home is the
   task, not deleting it. Dev-gating `/storage` & `/features` is allowed without asking.

**For each phase, report:** what changed (files), what was extracted/deleted, what state
the screens now handle, test status, and what's deferred to the next phase. Show the new
Home as ASCII or a screenshot-able description before I run it.

Start with Phase 1. Confirm your understanding of the chosen identity and the Home hero
in two sentences, then implement.
