import { formatCompact } from './money';

export type ForecastTile = { tone: 'good' | 'over' | 'neutral'; amount: string; sub: string };

/**
 * Home's month-end tile (`U-21`): the projected total as the figure, and against the budget in a
 * few words — short enough to share a row with Safe to spend.
 */
export function forecastTile(input: { projected: number; budget: number; mask?: (paise: number) => string }): ForecastTile {
  const fmt = input.mask ?? formatCompact;
  const amount = fmt(input.projected);
  if (input.budget <= 0) return { tone: 'neutral', amount, sub: 'at this pace' };
  const delta = input.projected - input.budget;
  return delta > 0
    ? { tone: 'over', amount, sub: `${fmt(delta)} over budget` }
    : { tone: 'good', amount, sub: `${fmt(-delta)} under budget` };
}
