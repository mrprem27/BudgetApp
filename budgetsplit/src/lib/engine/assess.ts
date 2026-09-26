/**
 * E4 — the questions, answered on the projection (`SPEC-ENGINE.md` §4). Pure.
 *
 * First slice (`EN2`): `safeToSpend` only, on the deterministic projection.
 * `afford()`, `budgetForecast()` and `goalForecast()` arrive with `EN4`.
 */
import type { FinanceSnapshot, Projection } from './types';
import { projectKnown } from './projection';
import { STS_HORIZON_DAYS } from '../safeToSpend';

export type SafeToSpendV2 = {
  /** The largest amount spendable today while the projected path never goes
   *  below zero — the path's own low point. May be negative: already
   *  over-committed is the honest answer, not an error (matches today's `SafeToSpend`). */
  amount: number;
  lowPoint: Projection['lowPoint'];
  dailyRate: number | null;
  projection: Projection;
};

/**
 * `safeToSpend()` = the largest `x` such that spending `x` today keeps the
 * projected low point ≥ 0. Spending `x` today only ever changes the STARTING
 * balance (`available − x`); every later day's balance is that starting point
 * plus the same events regardless of `x`, so the whole path — and therefore
 * its low point — shifts down by exactly `x`. The largest safe `x` is thus
 * exactly the unshifted path's own low point. `SPEC-ENGINE.md` §4 E4 still
 * describes this as a binary search over `afford()`, for once `afford()`
 * itself stops being linear in the purchase amount (a Want past a goal's
 * target date, a budget line crossed) — not yet true here, since `afford()`
 * doesn't exist yet (`EN4`).
 */
export function safeToSpendV2(snapshot: FinanceSnapshot, horizonDays: number = STS_HORIZON_DAYS): SafeToSpendV2 {
  const projection = projectKnown(snapshot, horizonDays);
  return {
    amount: projection.lowPoint.amount,
    lowPoint: projection.lowPoint,
    dailyRate: projection.dailyRate,
    projection,
  };
}
