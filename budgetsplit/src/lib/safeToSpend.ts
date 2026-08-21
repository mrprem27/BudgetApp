/**
 * Safe-to-Spend — what's genuinely yours to spend over the horizon, once every
 * claim already standing against your cash is set aside.
 *
 *   StS = liquid cash
 *       − committed bills still due before the horizon (my share)
 *       − card balance still to repay
 *       − goal contributions still due this cycle (unfunded portion)
 *       − what I owe people, net of settlements
 *       − everyday spending still to come before the horizon
 *
 * Simple Bank's proven formula, plus two terms it could not have. The
 * settlement-exposure term is the one only a split app can subtract (money in my
 * account that is really someone else's). The everyday-spend term is the one
 * that makes "safe" true rather than aspirational — bills and goals are not the
 * only things that will take money out of this account before the horizon.
 *
 * Each input has exactly one source. Adding a term without honouring that is how
 * the same rupee gets subtracted twice:
 *
 * - `available`      — `getCashPosition` (already net of money set aside in
 *                      goals, so funded contributions are not re-subtracted).
 * - `upcomingBills`  — `expandUpcoming` my-share occurrences + logged future
 *                      one-offs, the same basis Afford's committed-bills uses.
 * - `cardRepayment`  — `TotalMoney.creditUsed`. Card spend never lowered
 *                      `available` (it is debt, not cash out — see `lib/cash.ts`),
 *                      so this is the only place it is claimed.
 * - `goalRemaining`  — monthly goal commitment minus what's already been
 *                      allocated this month, floored at zero per goal.
 * - `netIOwe`        — `getMyExposure().owe` (owed-to-me is deliberately NOT
 *                      added back: it isn't liquid until it's settled).
 *                      ⚠️ `proposeOverspendRaid` DOES net owed-to-me, and that is
 *                      not an inconsistency to "fix". It answers a different
 *                      question: a receivable is not spendable (so it stays out
 *                      here), but it IS a reason not to break open a savings goal
 *                      (so it counts there). Changing either to match the other
 *                      breaks one of them.
 * - `everydaySpend`  — `typicalDailySpend` × days left, over **non-recurring**
 *                      expense only. Recurring-linked rows are already in
 *                      `upcomingBills`; counting them here too would double-book
 *                      every bill in the app.
 *
 * Horizon is a rolling 30 days, not month-end: a calendar horizon shows its best
 * figure on the 28th, the day rent is closest. Assembly lives in
 * `db/queries/spendPower.ts`. Pure; no React, no db.
 *
 * The amount may be negative — that is the honest answer, not an error.
 */

export type SafeToSpendParts = {
  /** Liquid cash right now (paise). */
  available: number;
  /** My share of bills still due before the horizon (paise). */
  upcomingBills: number;
  /** Card balance still to repay (paise). */
  cardRepayment: number;
  /** Goal contributions still due this cycle, unfunded portion (paise). */
  goalRemaining: number;
  /** What I owe others, net of settlements (paise, ≥ 0). */
  netIOwe: number;
  /** Everyday (non-bill) spending still to come before the horizon (paise). */
  everydaySpend: number;
};

export type SafeToSpend = SafeToSpendParts & {
  /** The headline figure. Negative means already over-committed. */
  amount: number;
  /** Days from now to the horizon — the basis of `everydaySpend` and of pacing. */
  daysLeft: number;
  /** Typical spend per day (paise), or null when there isn't enough history to
   *  say. Null means `everydaySpend` is 0 because it is unknown, not because it
   *  is zero — the two must not look alike. */
  dailyRate: number | null;
};

/** Rolling horizon, in days. Not `endOfMonth` — see the header. */
export const STS_HORIZON_DAYS = 30;

export function computeSafeToSpend(
  parts: SafeToSpendParts,
  meta: { daysLeft?: number; dailyRate?: number | null } = {},
): SafeToSpend {
  const clean = (n: number) => (Number.isFinite(n) ? n : 0);
  const claim = (n: number) => Math.max(0, clean(n));
  const available = clean(parts.available);
  const upcomingBills = claim(parts.upcomingBills);
  const cardRepayment = claim(parts.cardRepayment);
  const goalRemaining = claim(parts.goalRemaining);
  const netIOwe = claim(parts.netIOwe);
  const everydaySpend = claim(parts.everydaySpend);
  return {
    available, upcomingBills, cardRepayment, goalRemaining, netIOwe, everydaySpend,
    amount: available - upcomingBills - cardRepayment - goalRemaining - netIOwe - everydaySpend,
    daysLeft: Math.max(0, Math.round(clean(meta.daysLeft ?? STS_HORIZON_DAYS))),
    dailyRate: meta.dailyRate == null || !Number.isFinite(meta.dailyRate)
      ? null
      : Math.max(0, meta.dailyRate),
  };
}

/**
 * The unfunded remainder of this cycle's goal commitments. Funded allocations
 * have already left `available` (cash math subtracts goal balances), so only
 * the not-yet-funded remainder is still a claim on today's cash.
 */
export function goalRemainingThisCycle(
  goals: Array<{ id: string; monthlyRate: number; saved: number; target: number }>,
  allocatedThisMonth: Record<string, number>,
): number {
  let sum = 0;
  for (const g of goals) {
    if (g.monthlyRate <= 0) continue;
    if (g.saved >= g.target) continue; // completed goals claim nothing
    sum += Math.max(0, g.monthlyRate - (allocatedThisMonth[g.id] ?? 0));
  }
  return sum;
}

// --- Everyday spend --------------------------------------------------------

/** Days of history the daily rate is estimated over. */
export const EVERYDAY_WINDOW_DAYS = 90;
/** Below this many days of history, refuse to estimate rather than guess. */
export const EVERYDAY_MIN_DAYS = 30;
/** Share of the highest-spend days discarded before averaging. */
const TRIM_RATIO = 0.1;

const DAY_MS = 86_400_000;

/**
 * Typical spend per day, robust to the day you'd never repeat.
 *
 * A **trimmed mean**, not a mean and not a plain median:
 *
 * - A mean is what every competitor uses (Copilot's docs confirm a plain average
 *   of complete months, no filtering). One ₹40,000 medical bill inside ₹400 days
 *   moves it by ₹444/day and the estimate is wrong for a quarter.
 * - A plain median over the window is *too* robust: most people don't spend
 *   every day, so once zero-spend days are in the window the median collapses to
 *   ₹0 and the term vanishes.
 *
 * So: keep every day including the zero ones (dropping them would overestimate,
 * since the horizon contains zero-days too), discard the top `TRIM_RATIO` of
 * days, and average what's left over the days that remain. The unusual day is
 * gone; the ordinary rhythm — including the quiet days — survives.
 *
 * @param dailyTotals paise spent per day, one entry per day in the window,
 *   zero-spend days included. Order is irrelevant.
 */
export function typicalDailySpend(dailyTotals: number[]): number | null {
  const days = dailyTotals.filter(n => Number.isFinite(n)).map(n => Math.max(0, n));
  if (days.length < EVERYDAY_MIN_DAYS) return null;
  const sorted = [...days].sort((a, b) => a - b);
  // Trim from the top only. A low outlier is just a quiet day — real, and it
  // belongs in the average; a high one is the purchase you'd never repeat.
  const keep = sorted.length - Math.floor(sorted.length * TRIM_RATIO);
  const kept = sorted.slice(0, Math.max(1, keep));
  const total = kept.reduce((s, n) => s + n, 0);
  return Math.round(total / kept.length);
}

/**
 * Bucket expenses into per-day totals, ready for `typicalDailySpend`. Days with
 * no spend are present as 0 — that is the point: the horizon contains quiet days
 * too, and dropping them here would overestimate the rate.
 *
 * **Not on the shipping path — and deliberately kept.** `getSafeToSpend` runs
 * `DAILY_SPEND_SQL` (`db/queries/spendRateQuery.ts`) instead, because it is
 * called on Home, on Afford and after every expense save, and loading 90 days of
 * rows plus their splits three times over to compute one number is the wrong
 * trade. This stays as the readable statement of the rule, with
 * `spendRateSql.test.ts` locking the two in step — the same arrangement
 * `computeCash` and `CASH_TOTALS_SQL` already use, for the same reason.
 *
 * **The window starts at the first transaction, not at `fromMs`.** A two-week-old
 * account has 90 days of *window* but 14 days of *history*; averaging over the
 * window would divide a fortnight of spending across three months and report a
 * rate roughly six times too low — a confidently wrong number, which is worse
 * than no number. Clamping here is also what gives `EVERYDAY_MIN_DAYS` something
 * real to gate on: the returned length is days-of-history, not window length.
 *
 * Recurring-linked rows are excluded: they are already claimed by
 * `upcomingBills`, and a bill counted in both terms is subtracted twice.
 * Settlements are excluded because settling a debt isn't consumption (the
 * original purchase was already booked) — the same rule the rest of the app's
 * analysis follows.
 */
export function dailySpendTotals<T extends {
  kind: string;
  is_deleted?: number | boolean;
  parent_recur_id?: string | null;
  recur_freq?: string | null;
  date: number;
}>(
  txns: T[],
  myShare: (t: T) => number,
  fromMs: number,
  toMs: number,
): number[] {
  const qualifies = (t: T) =>
    !t.is_deleted && t.kind === 'expense' && !t.parent_recur_id && !t.recur_freq
    && t.date >= fromMs && t.date <= toMs;

  let earliest = Infinity;
  for (const t of txns) if (qualifies(t) && t.date < earliest) earliest = t.date;
  if (!Number.isFinite(earliest)) return [];

  const startMs = Math.max(fromMs, earliest);
  const dayCount = Math.max(1, Math.ceil((toMs - startMs) / DAY_MS));
  const buckets = new Array<number>(dayCount).fill(0);
  for (const t of txns) {
    if (!qualifies(t)) continue;
    const idx = Math.min(dayCount - 1, Math.floor((t.date - startMs) / DAY_MS));
    if (idx < 0) continue;
    const share = myShare(t);
    if (share > 0) buckets[idx] += share;
  }
  return buckets;
}

/** What the daily rate implies for the days still left in the horizon. */
export function everydaySpendAhead(dailyRate: number | null, daysLeft: number): number {
  if (dailyRate == null || !Number.isFinite(dailyRate) || dailyRate <= 0) return 0;
  return Math.max(0, Math.round(dailyRate * Math.max(0, daysLeft)));
}
