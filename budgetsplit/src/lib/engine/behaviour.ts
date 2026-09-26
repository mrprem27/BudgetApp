/**
 * E2 — statistics over this person's own history (`SPEC-ENGINE.md` §4).
 *
 * First slice (`EN2`): the everyday rate only. Pure — no React, no database.
 */
import type { FinanceSnapshot, Behaviour } from './types';
import { dailySpendTotals, typicalDailySpend, EVERYDAY_WINDOW_DAYS } from '../safeToSpend';

/**
 * The everyday (variable) spend rate: the trimmed mean of my-share, non-recurring
 * expense over the trailing `EVERYDAY_WINDOW_DAYS` — the exact rule
 * `getSafeToSpend` already uses (`typicalDailySpend`, "moved unchanged" per
 * `SPEC-ENGINE.md` §6), reused rather than re-derived so the two can never drift.
 *
 * `dailySpendTotals` wants the raw shape it already knows how to filter
 * (`kind`, `is_deleted`, `parent_recur_id`, `recur_freq`, `date`); `history`
 * rows have already been reduced to their engine shape, so they're adapted back
 * into just enough of that shape to qualify — `isRecurringLinked` standing in
 * for the two columns it was computed from.
 */
export function everydayRate(snapshot: FinanceSnapshot): number | null {
  const fromMs = snapshot.asOf - EVERYDAY_WINDOW_DAYS * 86_400_000;
  const rows = snapshot.history.map(h => ({
    kind: h.kind,
    is_deleted: 0,
    parent_recur_id: h.isRecurringLinked ? 'linked' : null,
    recur_freq: null,
    date: h.date,
    amountPaise: h.amountPaise,
  }));
  const buckets = dailySpendTotals(rows, r => r.amountPaise, fromMs, snapshot.asOf);
  return typicalDailySpend(buckets);
}

export function behaviourOf(snapshot: FinanceSnapshot): Behaviour {
  return { everydayRatePaise: everydayRate(snapshot) };
}
