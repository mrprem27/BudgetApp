# Personal / Budget / Insights Redesign — Agreed Spec & Plan

> Status: **agreed 2026-06-27**, not yet built. This is the reference for the phased work.
> Companion to [FEATURES_AND_FLOWS.md](./FEATURES_AND_FLOWS.md) (current behaviour).

## The decisions (locked)

1. **Personal = everything involving me.** A unified view aggregating: personal expenses/income,
   personal recurring, my **share** of group expenses, and settlements/transfers involving me —
   anything that affects my balance.
2. **Dissolve the "Personal group."** It is no longer a group in the Groups list. Its data folds
   into the unified Personal view. (A hidden container may remain internally for storage during
   migration, but the UI never shows "Personal" as an ordinary group.)
3. **Personal lives as a pinned card** at the **top of the Groups tab**, opening a **group-style
   screen** (same outside structure as any group). Home dashboard stays as-is.
4. **Personal screen = tabbed**, like a group:
   - **Header:** Total **Owe** · Total **Lent / To-receive** · **Net** (optional).
   - **Expenses tab:** every transaction involving me. Filters (default **Personal only**):
     `Personal only` · `Group txns involving me` · `All` · `Specific group`. Amounts shown are
     **my share**. Tapping a group transaction **navigates to the original txn in its group**
     (never duplicated).
   - **Budget tab:** my **global** budget (below).
   - **Recurring tab/section:** collapsible, **grouped by group**, with personal recurring shown
     separately.
5. **Budgets are individual (per-user), measured by my share.**
   - A **global** personal budget per category = personal spend **+ my share** of group spend.
   - **Each group can also have its own** individual budget (my share within that group).
   - There is **no shared group budget** (privacy + differing limits).
   - Spend counting always uses **my share**, never the full group amount.
6. **Insights = one central hub** = the **existing** Insights screen (reached from the Plan icon),
   expanded to absorb the scattered insight surfaces (group `InsightsTab`, savings insights).
   - **Dashboard category tap → comprehensive category-insights page**, pulling: personal + group
     spend (trend), **places** (locations), **recurring** in that category, **goals & budget**
     (utilisation / over-under) — everything related to that category.
   - **Groups / Budgets / Goals → management only; Insights → analytics.**
7. **Recurring naming:** use **"Recurring"** consistently (rename "Subscriptions"). Keep the
   Recurring screen (reached from Plan) **and** add the Recurring section inside Personal.
8. **Undo everywhere:** every destructive action (delete txn from Search / Personal / group /
   txn-detail, delete goal, remove member, delete settlement, …) routes through the existing
   `UndoProvider` / `UndoToast`.
9. **Goals:** completed goals (saved ≥ target) **sort to the bottom** and get a **distinct
   "completed" card UI** vs active goals.
10. **Transfers:** when picking a person to transfer/settle with, **show the existing balance**
    with them (optionally broken down by shared group).

## Phased delivery

**Phase 0 — Unblock testing.** Fix the empty-demo-data bug (the seeder must verifiably write data
or fail loudly). Prereq for validating every later phase.

**Phase 1 — Quick wins** (independent, low-risk):
- Rename Subscriptions → Recurring (flag label, Plan chip, screen titles).
- Goals: completed → bottom + distinct completed UI.
- Transfers: show balance with the selected person (optional per-group breakdown).
- Undo for all delete sites.

**Phase 2 — Personal view** (structural): dissolve personal group → unified Personal; pinned card
at top of Groups; group-style tabbed screen (header + Expenses w/ filters + source-linking +
Budget + Recurring). Migration: seeder, queries, Settings "Budget" link, category detail, docs.

**Phase 3 — Budget model:** global personal budget (by my share, all sources) + optional per-group
individual budget. Group "Budget" tab = my individual budget for that group; Personal "Budget" tab
= global. Spend = my share.

**Phase 4 — Insights hub:** centralise into the Insights screen; Dashboard category tap → rich
category-insights page (personal + group spend, places, recurring, goals & budget). Strip insight
duties from Groups/Budgets/Goals.

## Progress

- **Phase 0** ✅ seeder hardened with write-verification.
- **Phase 1** ✅ Recurring rename · Goals completed UI · Transfer balances · Undo (members + goals).
- **Phase 2** 🚧 `app/personal.tsx` built: pinned Groups card → `/personal`; group-style screen with
  Owe/Lent/Net header + tabs **Activity** (filters Personal/Groups/All/specific-group, my-share
  amounts, tap → source `/txn/[id]`) and **Recurring** (collapsible, grouped by group). Data via
  `getMyActivity` (transactions.ts). The **Budget tab is a placeholder** linking to the personal
  budget editor — replaced by the global budget in Phase 3. The personal group still exists in the
  DB as storage (UI-level dissolve).
- **Phase 3** ✅ budgets are now **my-share** aware. `getCategorySpending`/`getCategoryBudgetStatus`/
  `getBudgetAnalytics` take an optional `meId` (counts only my share; `null` group spans all groups).
  New `getMyGlobalBudgetStatus(meId)` = the personal-group budgets measured against my share across
  **all** groups → rendered in the Personal **Budget** tab. The group Budget tab now shows my
  individual share vs the group's limit. (Dashboard/Reports/Insights still pass no `meId` = full
  totals — aligning those is a follow-up.)
- **Phase 4** ⏳ pending.

## Open details (resolve during each phase)
- Exact filter labels & ordering on the Personal Expenses tab.
- How per-group individual budgets surface in the group screen (tab vs section).
- Whether the hidden Personal container is kept or fully removed post-migration.
- Category-insights page exact section order.
