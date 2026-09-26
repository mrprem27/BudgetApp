/**
 * E6 — confidence and reasons, from the same numbers (`SPEC-ENGINE.md` §4). Pure.
 */
import type { FinanceSnapshot, Confidence, Explanation } from './types';
import { dailySample, incomeModel } from './behaviour';
import { EVERYDAY_MIN_DAYS } from '../safeToSpend';

/**
 * Thin data (< `EVERYDAY_MIN_DAYS` of history) suppresses the verdict outright
 * — not just a weak-confidence guess. Otherwise: `irregular` income or a wide
 * P10–P90 band (relative to the amount asked about) caps confidence at
 * `medium`/`low`.
 */
export function explain(snapshot: FinanceSnapshot, bandP10: number, bandP90: number, amountPaise: number): Explanation {
  const days = dailySample(snapshot).length;
  if (days < EVERYDAY_MIN_DAYS) {
    const weeks = Math.max(1, Math.ceil((EVERYDAY_MIN_DAYS - days) / 7));
    return { confidence: 'low', missing: `about ${weeks} more week${weeks === 1 ? '' : 's'} of history`, suppressVerdict: true };
  }

  const income = incomeModel(snapshot);
  const relativeWidth = amountPaise > 0 ? (bandP90 - bandP10) / amountPaise : 0;

  let confidence: Confidence = 'high';
  if (income.consistency === 'irregular') confidence = 'medium';
  if (relativeWidth > 8) confidence = 'low';
  else if (relativeWidth > 3 && confidence === 'high') confidence = 'medium';

  const missing = confidence === 'low'
    ? (income.consistency === 'irregular' ? 'a clearer income pattern' : 'more spending history to narrow the range')
    : undefined;

  return { confidence, missing, suppressVerdict: false };
}
