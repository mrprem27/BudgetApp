# Plan — V1 close-out (P1)

`Written 2026-09-30 · Tasks: ./todo.md · Tracker: docs/TRACKER.md §0 · Predecessor: docs/history/PLAN-2026-09-CLOSEOUT.md`

## Goal

One place that says what V1 still needs, what was deferred and why, and what the app can already do
that is easy to forget — plus a pass for the bugs a phone pass would trip over, fixed before it.

## Decisions

- **The tracker is `docs/TRACKER.md`, not a new file.** It is already the guarded register; a second
  list is how the old one drifted. It gains §0 (the road to V1), §9 `V-` (deferred), §10 (built but
  easy to forget, no ids) and §11 `U-` (open from this pass; tomorrow's feedback lands here).
- **The old `tasks/` files are frozen** into `docs/history/`, with their unticked phone checks carried
  into `todo.md` below.
- **Fix what is a bug; ask what is layout.** Wrong destinations, dead switches, silent failures: fixed
  with a regression each, proven by reverting. Layout and IA calls are `U-` rows with a default.
- **Performance is measured, not assumed.** The loaders were timed at ~3,100 entries; nothing in the
  data layer changes until the phone confirms the cost (`U-02`).

## Phase 2 (tomorrow)

Your phone pass and feedback → `U-11` onwards → fix, with the layout answers from §0 step 2.
