# BudgetSplit — Feedback v2 Implementation Plan (Phases A–E)

Decisions locked: start with Analytics; add expo-location now (needs one Xcode rebuild);
keep biometric lock + add privacy/blur screen; add unique email id now (default hello123@vortiqal.com).

## Phase A — Analytics & budget-centric (priority)
- A1. `src/lib/analytics.ts` engine — utilization, at-risk, period-over-period, projection, rule-based recommendations. ✅
- A2. Group **Budget tab**: budget-health summary (spent/allocated + utilization bar + over/near/on-track counts), recommendations list, at-risk highlights, above the cadence list.
- A3. **Dashboard**: budget summary tiles (Total Budget / Spent / Remaining) + over/near counts + richer pie legend (amount + %), top categories with ▲/▼ vs last period.
- A4. **Reports → Insights**: per-group budget analytics (utilization, at-risk, recommendations, highest/lowest, biggest change, projected month-end).
- A5. **Charts**: readable axes (y context, x labels), value-on-tap, budget overlay / overspend highlight, period-over-period framing.

## Phase B — Transaction model
- B1. Schema: add `transfer` to `txn.kind` (table rebuild migration — SQLite CHECK can't be altered in place).
- B2. `person`: add unique `email` (+ optional `mobile`); seed me with hello123@vortiqal.com.
- B3. `txn` metadata: `tz` (timezone), optional `lat`/`lng`/`place_label` columns.
- B4. **Transfer** type in add flow (money moved A→B; excluded from spending/budget).
- B5. **Settlement flow** (item 7): rename Paid → Settle/Record Payment; autofill outstanding, editable, partial settlements.

## Phase C — UX quick wins
- C1. Budget cadence: default Monthly; other cadences behind a dropdown/sheet (item 8).
- C2. Confirmation on removing a budget line / destructive budget actions (item 9).
- C3. Free date/time picker on transactions — any past/future date (item 10).
- C4. Keyboard: auto-focus, smooth-scroll-to-field, dynamic bottom padding so action buttons stay reachable (items 11, 12).
- C5. Add-button rework: icons + descriptions, distinct Expense / Group / Settlement cards (item 17).
- C6. General polish pass — hierarchy, spacing, states (item 13).

## Phase D — Settings / Help / Privacy
- D1. Settings reorg: Account · Privacy & Security · Preferences · Help & Support · About (item 15).
- D2. Dedicated Help & Guide screen; move educational content out of Settings (item 16).
- D3. Privacy screen / app-switcher blur on backgrounding; keep biometric lock (item 5).
- D4. Preferences: theme, currency, date/time format, default budget type, notifications, location toggle.

## Phase E — Performance
- E1. Faster first launch: defer heavy analytics/chart work, memoize, minimize synchronous DB on boot, lazy charts.

## Metadata / location (item 14)
- Optional, user-controlled (Settings → Privacy → Save Transaction Location), via `expo-location`.
- Capture lat/lng + reverse-geocoded label on create; show on transaction details; disable anytime.
