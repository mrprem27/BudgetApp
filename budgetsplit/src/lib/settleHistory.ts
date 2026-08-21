const DAY_MS = 86_400_000;

/**
 * How often two people actually settle up, from the gaps between their
 * settlements. Pure — no React, no db.
 *
 * Deliberately **not** "days for a debt to be paid". That would need each
 * settlement matched to the expenses it cleared, and a settlement clears a net
 * balance, not a list of rows — so the matching would be invented, and a confident
 * wrong number is worse than none. The rhythm between settlements is directly
 * observable and answers the question people actually ask: is this someone who
 * squares up, and roughly how often.
 *
 * Median, not mean: one forgotten trip that settled six months late shouldn't
 * redefine a flatmate who pays every Sunday.
 */
export function settleRhythmDays(settlementDatesMs: readonly number[]): number | null {
  // Two settlements make one gap; one makes none, and "settled once" is not a rhythm.
  if (settlementDatesMs.length < 3) return null;

  const sorted = [...settlementDatesMs].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1];
    // Same-day settlements are one act split across groups ("settle all"), not two
    // occasions — counting them would drag every rhythm toward zero.
    if (gap >= DAY_MS) gaps.push(gap);
  }
  if (gaps.length < 2) return null;

  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const median = gaps.length % 2 === 0 ? (gaps[mid - 1] + gaps[mid]) / 2 : gaps[mid];
  return Math.max(1, Math.round(median / DAY_MS));
}

/** Plain-English form of {@link settleRhythmDays}. Null when there isn't enough history. */
export function settleRhythmLabel(days: number | null): string | null {
  if (days == null) return null;
  if (days <= 2) return 'Usually settles within a couple of days';
  if (days <= 10) return `Usually settles every ${days} days`;
  if (days <= 45) return 'Usually settles about once a month';
  return 'Settles every few months';
}

/** No settle history at all — how long before a balance looks abandoned. */
const NO_RHYTHM_STALE_DAYS = 60;
/** How many of someone's usual cycles can pass before it stops looking normal. */
const STALE_RHYTHM_MULTIPLE = 3;

/**
 * Has this balance gone quiet for longer than it should have?
 *
 * Judged against the person's OWN rhythm, not a fixed number of days: someone who
 * settles quarterly is not overdue at 40 days, and someone who settles every
 * Sunday is. With no rhythm to judge against, falls back to a plain two months.
 *
 * This only ever produces a *suggestion* — nothing is downgraded on the strength
 * of it. See `setReceivableState`, which is a deliberate act.
 */
export function isReceivableStale(
  lastSettledMs: number | null,
  nowMs: number,
  rhythmDays: number | null,
): boolean {
  // Never settled with them at all is not evidence of anything yet.
  if (lastSettledMs == null) return false;
  const quietDays = (nowMs - lastSettledMs) / DAY_MS;
  const limit = rhythmDays == null ? NO_RHYTHM_STALE_DAYS : rhythmDays * STALE_RHYTHM_MULTIPLE;
  return quietDays > limit;
}
