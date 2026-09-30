# SPEC — People and group selectors (`U-22`, `U-23`)

Your ask: a proper design for choosing people and choosing a group, not a list of rows. Picks
2026-09-30: **Avatar grid** for people, **Tile grid** for groups. Part of the `U-16` pass.

## Modules

| # | What | Where | Done when |
|---|---|---|---|
| 1 | **`PersonPicker` becomes an avatar grid.** Four across: a 52pt avatar, the name under it; ticked = accent ring and a ✓ badge. With `onCreate`, a **+ New** tile comes first and the "Search or add…" field sits above; without it, the field shows only past 8 people. Same props, so every caller changes at once. | Members → Add to group, Same person as…, Review's "Who paid you?" | No row list left in the component. |
| 2 | **"Just with people" in Add uses it.** `DestinationSheet`'s checkbox rows become `PersonPicker`; the confirm button is unchanged. | Add → Where does this go? | One people control in the sheet. |
| 3 | **`GroupGrid`: groups as tiles.** Two across: the group's icon in its colour, name, "Only you" / "With N"; selected = accent border and ✓. Takes plain items, so Personal-as-sentinel (Review) and Personal-as-group (Add) both fit. | Add's `DestinationSheet` (usual first, then More groups), Review's `ReviewDestSheet` and `BulkGroupSheet` | Every group chooser is the same tiles; `DestOption` deleted. |

Build order **1 → 2 → 3**, one commit. Theme tokens and shared components only.

## Not in scope

`SplitEditor` (already avatars, with amounts under each), `PayersSheet` (amounts per person, a form,
not a selector), the transfer's single-person slot (`TransferSlotSheet`), and group management screens.
