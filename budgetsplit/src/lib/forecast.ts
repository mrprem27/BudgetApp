/**
 * Month-end spending forecast — pure, on-device, no ML / no network.
 *
 * Statistical model (credibility-weighted shrinkage):
 *
 *   projected = z · runRate + (1 − z) · priorMonthTotal
 *
 * where `runRate = (spentSoFar / n) · daysInMonth` is the unbiased month-total
 * estimate from `n = dayOfMonth` observed days, and `priorMonthTotal` is the
 * prior (last month's actual). The weight uses the **Bühlmann credibility**
 * formula `z = n / (n + K)`:
 *
 *   - The sample mean spend/day has variance ∝ 1/n, so our confidence in the
 *     run-rate grows with n — but sub-linearly, saturating as the month fills.
 *     `n/(n+K)` captures exactly that (concave, →1), unlike a linear `n/daysInMonth`.
 *   - `K` is the prior's strength in "pseudo-days": with K = 7, last month is
 *     worth ~a week of this month's data. Early on we lean on the prior (a single
 *     ₹-heavy day like rent can't blow up the estimate); past ~K days the live
 *     run-rate dominates.
 *
 * Floored at `spentSoFar` (a month can't end below what's already spent). All
 * amounts are integer paise.
 */

export type ForecastBasis = 'insufficient' | 'run-rate' | 'blended';

export type Forecast = {
  /** Enough data to show a meaningful forecast? */
  ready: boolean;
  /** Projected month-end total (paise). Equals spent-so-far when not ready. */
  projected: number;
  basis: ForecastBasis;
  /** Credibility weight z ∈ [0,1] given to the live run-rate (0 when no prior). */
  credibility: number;
};

/** Need at least this many days of the month before a run-rate means anything. */
export const FORECAST_MIN_DAYS = 3;

/** Prior strength in pseudo-days (Bühlmann K): last month ≈ one week of signal. */
export const FORECAST_PRIOR_DAYS = 7;

export function forecastMonthEnd(
  spentSoFar: number,
  dayOfMonth: number,
  daysInMonth: number,
  priorMonthTotal = 0,
): Forecast {
  if (
    !Number.isFinite(spentSoFar) ||
    !Number.isFinite(dayOfMonth) ||
    daysInMonth <= 0 ||
    dayOfMonth < FORECAST_MIN_DAYS ||
    dayOfMonth > daysInMonth ||
    spentSoFar <= 0
  ) {
    return { ready: false, projected: Math.max(0, Math.round(spentSoFar) || 0), basis: 'insufficient', credibility: 0 };
  }

  const runRate = (spentSoFar / dayOfMonth) * daysInMonth;

  let projected: number;
  let basis: ForecastBasis;
  let credibility = 0;
  if (priorMonthTotal > 0) {
    // Bühlmann credibility: confidence in the live run-rate grows as n/(n+K).
    credibility = dayOfMonth / (dayOfMonth + FORECAST_PRIOR_DAYS);
    projected = credibility * runRate + (1 - credibility) * priorMonthTotal;
    basis = 'blended';
  } else {
    projected = runRate;
    basis = 'run-rate';
  }

  projected = Math.max(projected, spentSoFar); // can't end below what's already spent
  return { ready: true, projected: Math.round(projected), basis, credibility };
}

/**
 * Cumulative projected spend at a future `day` — a straight line from today's
 * running total toward the month-end projection. Days at/before today return the
 * actual running total.
 */
export function projectedAtDay(
  spentSoFar: number,
  dayOfMonth: number,
  daysInMonth: number,
  projected: number,
  day: number,
): number {
  if (day <= dayOfMonth) return spentSoFar;
  if (daysInMonth <= dayOfMonth) return projected;
  return spentSoFar + (projected - spentSoFar) * ((day - dayOfMonth) / (daysInMonth - dayOfMonth));
}
