# SPEC — Forms, group screen, truncation (Phase 5c remainder)

Closes the open build items of `tasks/todo.md` Phase 5c: F1–F3, N1–N3, G1–G2, T1. Approved 2026-09-30.
Out of scope: the device checks (§0, CP1/CP3b/CP4 — yours) and Phase 6 (deferred).

## Objective

Make money forms, the group screen and long names read the way `group/[id]/edit.tsx` already does:
card-grouped rows, one hint line, nothing cut off without a way to read it. Users: the pilot, on a phone.

## Capability map (approved)

| # | Module | Items | Depends on |
|---|---|---|---|
| 1 | Amount form row | F1 → F2 → F3 | — |
| 3 | Members "+ New" first | N3 | — |
| 2 | Clean notes | N1 | — |
| 5 | Full text on hold | T1 | — |
| 4 | Group screen | G1, G2 | 5 |
| 6 | Forms to the Edit-group shape | N2 (named sheets only) | 1 |

Build order: **1 → 3 → 2 → 5 → 4 → 6**. One commit per module.

## Commands

```
cd budgetsplit && npx tsc --noEmit
cd budgetsplit && npx jest --silent
```
Doc guards (`countClaims`, `deadRouteRef`, `screenIdMap`, `coverage`) fail when a module or route count
changes — update `SYSTEM.md`/`SCREENS.md` in the same commit.

## Structure and style

- Primitives in `components/ui/` (no domain imports); widgets in `components/finance/`; logic in `src/lib`; hooks in `src/hooks`. `app/` and components import only types from `src/db`.
- Tokens only (`space`, `layout`, `colors`, `type`); `StyleSheet.create`; money as integer paise via `parseToPaise` / `formatRupees`.
- A replaced component is deleted (`deadComponents.test.ts`). `spendPower.moveToInvestments` + its test are deleted with module 1.

## Testing

No render tests exist, so each module gets: a pure-logic test where there is logic, and a source guard
where the rule is "use X, not Y". Every regression test is revert-checked. Anything visual is proven on the phone.

## Boundaries

- **Always:** reuse `Card`, `ListRow`, `Divider indent="text"`, `InfoLabel`, `SheetModal`, `KeyboardForm`; one hint line max (AGENTS §14).
- **Ask first:** any schema change; any new dependency; any layout not described below.
- **Never:** touch `LogoAssembly` / the onboarding hero; nest a modal inside a sheet; show one total across kinds.

---

## Module 1 · Amount form row (F1–F3)

- **F1 `ui/AmountRow`** — `{ icon, label, value, onChangeText, placeholder?, color? }`. `IconCircle` 32 + label left, `₹` + right-aligned numeric `TextInput` right, no inner border, min height `layout.rowMinHeight`. Used inside `Card` with `Divider indent="text"`.
- **F2 `MoneyEditorSheet`** — card 1: Bank / Cash / Wallet as AmountRows, then a read-only total row (Bank + Cash + Wallet). Card 2: Credit limit / Used, then an "Available credit" line. Each explanatory hint moves behind `InfoLabel`.
- **F3** — the same rows in `AssetSheet` (create / restate) and `PayCardBillSheet`.
- **Accept:** the total equals the sum of the three parsed paise values, including empty and `0` (pure helper, tested); no `Input` with an amount remains in those three sheets (guard).

## Module 3 · Members "+ New" first (N3)

- `MembersTab`: a `ListRow` "Add member" (`user-plus`) as the **first** row of the members card, calling `onInvite`; the bottom "Invite someone" button goes. Same in `group/[id]/members.tsx` if it lists members before its add control.
- **Accept:** a guard that the add row precedes `members.map` in the source.

## Module 2 · Clean notes (N1)

Already true: rows trim the note, show one line, and notes are trimmed on save. The gaps:
- `lib/noteText.oneLine(note)` — trim and collapse every run of whitespace, newlines included, to one space; `''` → null.
- `TransactionRow`: a transfer's note (hidden today, because `settlementTitle` wins) shows as the secondary line; every surface uses `oneLine`.
- **Accept:** `oneLine` tests (leading/trailing, inner newlines, whitespace-only → null); a transfer with a note has a secondary line (pure `rowText` helper extracted from the row, tested).

## Module 5 · Full text on hold (T1)

- `hooks/useFullTextOnHold(text)` → `{ onLongPress, delayLongPress }`, showing `Alert.alert(text)` only when non-empty. Native alert, per the decision.
- Wired into `ListRow` (title / subtitle), `Chip`, the group header name, and member / asset / friend name rows.
- **Accept:** hook test with a mocked `Alert`; a guard that those components pass it.

## Module 4 · Group screen (G1, G2)

- **G1** — one `GroupHeaderCard` replaces `GroupHero` + `GroupBalanceCard` (both deleted). Left: group icon, name (one line, T1 on hold), member avatar stack. Top right: "You're owed ₹X" / "You owe ₹X" / "Settled up", coloured by direction; `Settle up` below it only when there is someone to settle with. Background: the group colour at ≈18% fading to transparent.
- **G2** — `ui/FilterBar`, same props: a full-width search field, always visible; a `Filters` button with an active-count badge; active filters as removable chips below, only when set. The sheet holds Type, When (presets + `DateRangeSheet`), Who, **Tags**, and screen-specific scope chips. `TxnFilters` gains `tags: string[]` (any-of, matched by `tagKey`), and the tag options come from the rows (`rankTagsByFrequency`). No schema change: `txn.tags` exists.
- **Accept:** tag match tests (any-of, case-insensitive, none = no filter), revert-checked; `filtersActive` counts tags; a pure `activeFilterCount` used by the badge is tested.

## Module 6 · Forms to the Edit-group shape (N2)

- Scope (decided): `MoneyEditorSheet` (done in module 1), `AssetSheet`, `PayCardBillSheet`, the goal sheets reached from `app/(tabs)/savings.tsx`, and Edit group's own inputs.
- Shape: `SectionHeader` + `Card` of `ListRow`/`AmountRow`/`Input` rows, dividers between them, and at most one caption line under a control.
- **Accept:** a guard over those files: no bare `TextInput`, and no `type.body` paragraph under a control.

## Loose end

The asset → asset move routes through Bank internally (todo "Decisions"). That stays as-is; it is not a module here.
