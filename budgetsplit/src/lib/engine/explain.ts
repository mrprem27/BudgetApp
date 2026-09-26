/**
 * E6 — confidence and reasons, from the same numbers (`SPEC-ENGINE.md` §4). Pure.
 *
 * Confidence used to also widen on the uncertainty band's own P10–P90 spread
 * (`EN3`). That band was reverted — see `projection.ts`'s file header — so
 * confidence is sized off the two honest signals left: how much history
 * there is, and how consistent income looks. A narrower model than before,
 * on purpose (no substitute invented for what the band gave it).
 */
import type { FinanceSnapshot, Confidence, Explanation } from './types';
import { dailySample, incomeModel } from './behaviour';
import { EVERYDAY_MIN_DAYS } from '../safeToSpend';

/** Below this, `dailySample` history is "thin but usable" rather than solid. */
const THIN_HISTORY_DAYS = EVERYDAY_MIN_DAYS * 2;

/**
 * Thin data (< `EVERYDAY_MIN_DAYS` of history) suppresses the verdict outright
 * — not just a weak-confidence guess. Otherwise: `irregular` income caps
 * confidence at `medium`; history between `EVERYDAY_MIN_DAYS` and
 * `THIN_HISTORY_DAYS` caps it at `medium` too, since `everydayRatePaise` just
 * cleared its own minimum and hasn't had long to settle.
 */
export function explain(snapshot: FinanceSnapshot): Explanation {
  const days = dailySample(snapshot).length;
  if (days < EVERYDAY_MIN_DAYS) {
    const weeks = Math.max(1, Math.ceil((EVERYDAY_MIN_DAYS - days) / 7));
    return { confidence: 'low', missing: `about ${weeks} more week${weeks === 1 ? '' : 's'} of history`, suppressVerdict: true };
  }

  const income = incomeModel(snapshot);
  let confidence: Confidence = 'high';
  if (income.consistency === 'irregular' || days < THIN_HISTORY_DAYS) confidence = 'medium';

  const missing = confidence === 'medium'
    ? (income.consistency === 'irregular' ? 'a clearer income pattern' : 'more spending history')
    : undefined;

  return { confidence, missing, suppressVerdict: false };
}
