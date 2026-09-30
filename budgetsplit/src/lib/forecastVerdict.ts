import { formatCompact } from './money';

export type ForecastVerdict = { tone: 'good' | 'over' | 'neutral'; headline: string; sub: string | null };

/**
 * Home's forecast as one sentence: where the month is heading against the budget, and — only when it
 * explains an overshoot — the category that moved most. The chart and the working live in Insights.
 * `mask` hides figures when amounts are hidden.
 *
 * Every headline says **Projected**: "₹5K over budget by month end" read as money already gone (`U-11`).
 */
export function forecastVerdict(input: {
  projected: number;
  budget: number;
  topShift?: { cat: string; pct: number } | null;
  mask?: (paise: number) => string;
}): ForecastVerdict {
  const fmt = input.mask ?? formatCompact;
  if (input.budget <= 0) {
    return { tone: 'neutral', headline: `Projected ${fmt(input.projected)} by month end`, sub: 'Set a budget to see if you’re on track' };
  }
  const delta = input.projected - input.budget;
  if (delta > 0) {
    const s = input.topShift && input.topShift.pct > 5 ? `At this pace · ${input.topShift.cat} up ${input.topShift.pct}%` : 'At this pace, by month end';
    return { tone: 'over', headline: `Projected ${fmt(delta)} over budget`, sub: s };
  }
  return { tone: 'good', headline: `Projected ${fmt(-delta)} under budget`, sub: 'At this pace, by month end' };
}
