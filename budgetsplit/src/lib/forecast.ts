/**
 * Month-end spending forecast — pure, on-device, no ML / no network.
 *
 * A naive run-rate (`spent/day × daysInMonth`) over-reacts to a single early big
 * spend — one rent payment on the 1st projects ~30× rent. So we (a) refuse to
 * forecast until a few days of signal exist, and (b) blend the run-rate with last
 * month's actual total, trusting the run-rate more as the month progresses.
 *
 * All amounts are integer paise.
 */

export type ForecastBasis = 'insufficient' | 'run-rate' | 'blended';

export type Forecast = {
  /** Enough data to show a meaningful forecast? */
  ready: boolean;
  /** Projected month-end total (paise). Equals spent-so-far when not ready. */
  projected: number;
  basis: ForecastBasis;
};

/** Need at least this many days of the month before a run-rate means anything. */
export const FORECAST_MIN_DAYS = 3;

export function forecastMonthEnd(
  spentSoFar: number,
  dayOfMonth: number,
  daysInMonth: number,
  priorMonthTotal = 0,
): Forecast {
  if (
    !Number.isFinite(spentSoFar) ||
    daysInMonth <= 0 ||
    dayOfMonth < FORECAST_MIN_DAYS ||
    dayOfMonth > daysInMonth ||
    spentSoFar <= 0
  ) {
    return { ready: false, projected: Math.max(0, Math.round(spentSoFar) || 0), basis: 'insufficient' };
  }

  const runRate = (spentSoFar / dayOfMonth) * daysInMonth;

  let projected: number;
  let basis: ForecastBasis;
  if (priorMonthTotal > 0) {
    // Early in the month lean on last month's actual; later, trust the run-rate.
    const w = Math.min(1, dayOfMonth / daysInMonth);
    projected = w * runRate + (1 - w) * priorMonthTotal;
    basis = 'blended';
  } else {
    projected = runRate;
    basis = 'run-rate';
  }

  projected = Math.max(projected, spentSoFar); // can't end below what's already spent
  return { ready: true, projected: Math.round(projected), basis };
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
