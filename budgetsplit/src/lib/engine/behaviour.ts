/**
 * E2 — statistics over this person's own history (`SPEC-ENGINE.md` §4).
 *
 * First slice (`EN2`): the everyday rate only. Pure — no React, no database.
 */
import type { FinanceSnapshot, Behaviour } from './types';
import { dailySpendTotals, typicalDailySpend, EVERYDAY_WINDOW_DAYS, EVERYDAY_MIN_DAYS } from '../safeToSpend';

/**
 * `dailySpendTotals` wants the raw shape it already knows how to filter
 * (`kind`, `is_deleted`, `parent_recur_id`, `recur_freq`, `date`); `history`
 * rows have already been reduced to their engine shape, so they're adapted back
 * into just enough of that shape to qualify — `isRecurringLinked` standing in
 * for the two columns it was computed from.
 */
function toQualifyingRows(rows: FinanceSnapshot['history']) {
  return rows.map(h => ({
    kind: h.kind,
    is_deleted: 0,
    parent_recur_id: h.isRecurringLinked ? 'linked' : null,
    recur_freq: null,
    date: h.date,
    amountPaise: h.amountPaise,
  }));
}

/**
 * The person's own everyday-spend sample, one entry per day over the trailing
 * `EVERYDAY_WINDOW_DAYS`, zero-spend days included — the raw material E3's
 * 7-day block bootstrap draws from (§4 E2, "a 7-day block sample for the
 * bootstrap, keeping the weekday rhythm"). Empty below the earliest qualifying
 * transaction (same clipping `dailySpendTotals` itself does).
 */
export function dailySample(snapshot: FinanceSnapshot): number[] {
  const fromMs = snapshot.asOf - EVERYDAY_WINDOW_DAYS * 86_400_000;
  return dailySpendTotals(toQualifyingRows(snapshot.history), r => r.amountPaise, fromMs, snapshot.asOf);
}

/**
 * The everyday (variable) spend rate: the trimmed mean of my-share, non-recurring
 * expense over the trailing `EVERYDAY_WINDOW_DAYS` — the exact rule
 * `getSafeToSpend` already uses (`typicalDailySpend`, "moved unchanged" per
 * `SPEC-ENGINE.md` §6), reused rather than re-derived so the two can never drift.
 */
export function everydayRate(snapshot: FinanceSnapshot): number | null {
  return typicalDailySpend(dailySample(snapshot));
}

/**
 * Default Need/Want classification by category name (`SPEC-ENGINE.md` §5) —
 * the seed used until the person picks differently for a category (that choice
 * lands with `EN4`; this list is only ever the fallback, and today's only
 * caller). Matches the spec's own worked examples (Groceries, Rent, Medical,
 * Bills → Need; Dining, Shopping, Entertainment → Want) against
 * `constants/categories.ts`'s actual catalog names, plus the generic
 * "Food"/"Medical" synonyms free-text categories (and the fixture personas)
 * use. Everything unlisted defaults to Want, matching the spec's own examples.
 */
export const NEED_CATEGORY_SEED: ReadonlySet<string> = new Set([
  'Rent', 'Maintenance', 'Household Help', 'Home Supplies',
  'Groceries', 'Food',
  'Electricity', 'Mobile Recharge', 'WiFi & Broadband', 'Bills',
  'Health & Pharmacy', 'Medical', 'Insurance',
  'EMI & Loans', 'Education', 'Taxes', 'Fuel',
]);

export function isNeedCategory(category: string): boolean {
  return NEED_CATEGORY_SEED.has(category);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

/**
 * The floor E3 protects: one week of this person's essential spending — the
 * P50 (median, not the trimmed mean `everydayRate` uses) of Need-category
 * daily spend, zero-spend days included, × 7 (§4 E3). Cold start (fewer than
 * `EVERYDAY_MIN_DAYS` qualifying days): 0, never a guess — matching every
 * other E2 model's own minimum-data rule.
 */
export function essentialFloor(snapshot: FinanceSnapshot): number {
  const fromMs = snapshot.asOf - EVERYDAY_WINDOW_DAYS * 86_400_000;
  const needRows = snapshot.history.filter(h => h.kind === 'expense' && isNeedCategory(h.category));
  const buckets = dailySpendTotals(toQualifyingRows(needRows), r => r.amountPaise, fromMs, snapshot.asOf);
  if (buckets.length < EVERYDAY_MIN_DAYS) return 0;
  return median(buckets) * 7;
}

export function behaviourOf(snapshot: FinanceSnapshot): Behaviour {
  return { everydayRatePaise: everydayRate(snapshot), essentialFloorPaise: essentialFloor(snapshot) };
}
