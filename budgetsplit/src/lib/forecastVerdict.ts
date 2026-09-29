import { formatCompact } from './money';

export type ForecastVerdict = { tone: 'good' | 'over' | 'neutral'; headline: string; sub: string | null };

/**
 * Home's forecast as one sentence: where the month is heading against the budget, and — only when it
 * explains an overshoot — the category that moved most. The chart and the working live in Insights.
 * `mask` hides figures when amounts are hidden.
 */
export function forecastVerdict(input: {
  projected: number;
  budget: number;
  topShift?: { cat: string; pct: number } | null;
  mask?: (paise: number) => string;
}): ForecastVerdict {
  const fmt = input.mask ?? formatCompact;
  if (input.budget <= 0) {
    return { tone: 'neutral', headline: `About ${fmt(input.projected)} by month end`, sub: 'Set a budget to see if you’re on track' };
  }
  const delta = input.projected - input.budget;
  if (delta > 0) {
    const s = input.topShift && input.topShift.pct > 5 ? `${input.topShift.cat} up ${input.topShift.pct}%` : null;
    return { tone: 'over', headline: `${fmt(delta)} over budget by month end`, sub: s };
  }
  return { tone: 'good', headline: `On track — ${fmt(-delta)} to spare`, sub: 'by month end' };
}
