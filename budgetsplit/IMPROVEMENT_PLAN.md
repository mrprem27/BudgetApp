# BudgetSplit — Audit & Improvement Plan (living tracker)

Grounded in three read-only audits (input fields; screens/flows/state; design-system/a11y) against `AGENTS.md`. Worked one item at a time; each `[x]` is verified (`tsc` + `jest` from `budgetsplit/`). Runtime/device verification is the user's. `(BLOCKED)` = waiting on a Questions & Clarifications answer.

## Phase 0 — Correctness & dead-ends  ✅ done (tsc clean)
- [x] group/[id].tsx — try/catch + `loadError`/`ErrorState` + "Group not found" `EmptyState` (no more blank dead-end)
- [x] plan/recurring.tsx & reminders.tsx — destructure `error` → `ErrorState` (stop masking failures as empty)
- [x] txn/[id].tsx — "Transaction not found" `EmptyState` (loaded-aware) instead of blank header

## Phase 1 — Consistency & state  ✅ mostly done (tsc + 212 tests green)
- [x] groups.tsx — loading guard (`loaded`) gates empty state → no false-empty flash
- [x] savings.tsx — loading guard on goals empty state
- [x] Pull-to-refresh: friends, group/[id]/members, group/[id]/recurring, history, review. (search SKIPPED — query-driven list, not a refresh surface.)
- [x] friends.tsx — `keyboardShouldPersistTaps="handled"` on main ScrollView (+ pull-to-refresh)
- [x] itemized.tsx — hero TOTAL now `adjustsFontSizeToFit minimumFontScale={0.6}` (no truncation)
- [x] itemized inline-edit paddings → `space.sm`. (afford input padding = device-verify, deferred.)
- [ ] **(BLOCKED — Q1)** Header consistency: itemized → ModalHeader; flag Home/Groups/group headers
- [ ] **(BLOCKED — Q1)** Skeleton unification (Home null-while-loading reconcile)
- [x] review.tsx — keyboard-drop fix (RowCard → inline renderRow)

## Phase 2 — Design system & de-duplication
- [ ] CTAs → PrimaryButton: personal, categories, review×2, SplitSheet (index empty BLOCKED — Q1)
- [ ] Strip nav/modal-open haptics: settings ×9, add/quick cat-picker, CategoryPicker, MoreOptions
- [ ] Color tokens (expense/income/settle tints, onAccent, healthAmber reuse) + replace raw-hex cluster
- [ ] Delete dead/duplicated styles (savings velocity/subs/forecast) + share velocity/subs card
- [ ] Consolidate category-color palettes (3 → 1)
- [ ] a11y: CategoryDonut, FilterBar role, txn/[id], DatePicker arrows, notifications switch + sweep
- [ ] Touch target: TransferBody swap → hitSlop

## Phase 3 — Deeper refactors
- [ ] Converge raw TextInputs → Input (where re-implementing Input)
- [ ] Migrate legacy screens to useScreenData
- [ ] Spacing/typography token sweep

## Cross-cutting — edge cases
- [ ] Max-amount/overflow guard (money.ts) + tests
- [ ] edit.tsx handleSave — add catch (silent failure)
- [ ] router.back() during render → effect (edit, txn/[id], savings/[id], members)
- [ ] Single-person settle dead-end
- [ ] Long-name maxLength (GroupForm, savings goal)
- [ ] add/quick + add/itemized — refresh() after write

## Questions & Clarifications
- **Q1 (open, re-ask):** Normalize the *intentional-design* Home first-run empty state + itemized header to the shared system, or leave them? Blocks: itemized→ModalHeader, Home empty→EmptyState/PrimaryButton. User is deciding.
- Color-token names to confirm before the sweep.
