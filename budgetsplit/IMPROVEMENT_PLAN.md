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
- [x] Strip nav/modal-open haptics: settings nav rows, add/quick cat-picker, CategoryPicker, MoreOptions (commit a407332)
- [x] Touch target: TransferBody swap → hitSlop
- [x] a11y (partial): CategoryDonut center, FilterBar clear ×2, DatePicker prev/next arrows. Remaining: txn/[id] roles, notifications switch role/state, review/itemized toggle states — TODO.
- [x] CTAs → PrimaryButton: personal "Set a budget", SplitSheet "Done". (categories "Add" LEFT — it's an inline Cancel|Add pair, not a screen CTA; Home empty + itemized header LEFT as intentional design per "do what's best".)
- [x] Color TOKENS added: `onAccent`, `expenseTint(+Strong)`, `incomeTint(+Strong)`, `settleTint(+Strong)` in colors.ts. **Bulk raw-hex→token sweep DEFERRED** (~20 files, cosmetic, needs device verification — a partial swap would add inconsistency; do opportunistically).
- [ ] **DEFERRED** Delete dead savings styles + share velocity/subs card (dead styles interleaved with live ones → risky without device check; harmless at runtime).
- [ ] **DEFERRED** Consolidate category-color palettes (3 → 1).

## Done since (commits 3ca5e21, a377a6f)
- [x] Single-person settle dead-end — Settle button only shows with a real counterpart
- [x] Back-in-render → effect: txn/[id], savings/[id], members (edit.tsx earlier)
- [x] refresh() after write in add/quick + add/itemized
- [x] Color hex→token sweep (10 files, exact-match, visually identical)
- [x] Remaining a11y: txn/[id] roles, notification steppers (notifications switch already had role+state)

## Phase 3 — done in verified per-screen phases (2026-07-13)
Went screen-by-screen in committed batches (tsc + tests each), not a big-bang diff.
- [x] **P3.1** — afford, insights (PR #8)
- [x] **P3.2/P3.3** — reports, categories, settings/notifications, category/[name], group/[id]/budget, group/[id]/edit (bc81acd)
- [x] **P3.3 rest** — savings/[id], txn/[id], storage (dc12cdd). **11 screens migrated total.**
- [x] **P3.4 — assessed, correctly NOT migrated.** All four (index, groups, savings, group/[id]) have loads with SIDE EFFECTS or size that make useScreenData wrong: `groups`→`setGroups` (global store), `savings`→`runSavingsMaintenance` (mutation; would loop on refetch), `index`→`setGroups` + focus-tied `setAppLastOpen` write, `group/[id]`→1000 lines + freshly hardened. Left hand-rolled = the correct architecture per AGENTS.md.
- [x] **P3.6** — property-scoped exact-match spacing/radius token sweep (38 files, pixel-identical).
- [ ] **P3.5 — opportunistic (not blanket).** The `Input` component's focus-border/label/padding differ from the bespoke inline `TextInput`s, so converging changes appearance and needs device/design verification. Do per-field when editing a screen, not via an unverifiable blanket swap.

## Still deferred (cosmetic / low-value)
- Dead-style removal + velocity/subs card extraction; category-palette consolidation.
- Remaining raw hex that has no exact token (one-off greens like #14271F) + '#fff'→onAccent sweep.
- Spacing/typography raw-pixel token sweep.
- review/itemized toggle `accessibilityState` polish.

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
