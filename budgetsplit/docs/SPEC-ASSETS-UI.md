# SPEC — Assets and Afford, composed (`U-45`, `U-46`)

Your feedback 2026-09-30: Assets is not structured, its + / − and colours make no sense, editing
feels rough, the actions belong at the bottom with proper buttons, and everything should come from
the theme. Afford should also sit on Overview. Picks: **Sum card** for Assets, **Overview + Goals**
for Afford. Part of the `U-16` composition pass; the selectors (`U-22`, `U-23`) follow separately.

## Rules

- Theme only: `colors.*`, `type.*`, `space.*`, shared components (`SumLine`, `Card`, `ListRow`,
  `PrimaryButton`, `SecondaryButton`). No new hex, no hand-rolled buttons.
- `colors.settle` means money moving between two things you own. It is never income green or
  spending coral.

## Modules

| # | What | Done when |
|---|---|---|
| 1 | **Asset movements wear the settle colour.** "Moved to Gold" rendered −₹ in expense coral and "Moved from Gold" +₹ in income green, in every ledger, contrary to `settlementView`'s own rule. The amount now takes `settle.tint` for asset movements. | A movement never shows green or coral. Guard in `bugscan`. |
| 2 | **An asset's page signs from the asset's side.** On `/asset/[id]`, money in reads positive, money out reads `−`, both settle colour. Everywhere else the sign stays your cash's side. | Test on the sign; the rest unchanged. |
| 3 | **Assets list is a sum.** `AssetsSection`: one card of `SumLine`s (asset colour dot, name, kind hint, worth, ›), then `= Worth`, then one hint line. No per-row Move. **No longer counted** stays below, quieter. **Move money** and **Add asset** are a pair of buttons at the end. | Same section on Money → Assets and `/assets`. |
| 4 | **Asset page: hero, then history, and a tidier edit sheet.** Hero = icon, worth, kind · movements; Move money (primary) and Update worth (secondary) as one equal pair. Edit sheet: Name and Kind, Save, then Stop counting and Delete as quiet text actions each with one line saying what it does. | Nothing destructive sits next to Save as an equal button. |
| 5 | **Afford on Overview too.** `AffordHeroCard` directly under the Available money card, and still first on Goals. Same component, both behind `flags.affordCheck`. | Both places, one component. |

Build order **1 → 2 → 3 → 4 → 5**, one commit for the lot (small, one screen family).

## Commands

```
cd budgetsplit && npx tsc --noEmit
cd budgetsplit && npx jest --silent
```

## Not in scope

The Move money sheet's own layout (chips From/To; unchanged unless it reads badly on the phone),
asset kinds, and anything in the engine: no figure changes, only how they are drawn.
