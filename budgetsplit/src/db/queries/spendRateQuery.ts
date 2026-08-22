import { NOT_AWAITING_APPROVAL } from './approvalSql';

// SQL for the everyday-spend rate's per-day buckets, aggregated in the DB rather
// than loading 90 days of txns + all their split rows into JS and reducing there.
//
// The same reasoning as CASH_TOTALS_SQL in `cashQuery.ts`, and it matters more
// here: `getSafeToSpend` is called on Home, on Afford (which already loads its
// own 90-day window), and once more after every expense is saved. Loading the
// rows a second and third time to compute one number was the wrong trade.
//
// Kept import-free so it can be unit-tested against a real SQLite engine
// (see spendRateSql.test.ts) to guarantee it stays in lockstep with
// `dailySpendTotals()`, which remains the readable definition of the rule.
//
// (txn_share has a composite PK on (txn_id, person_id), so there is at most one
// row per person per txn — SUM(amount) is therefore that person's single share,
// not a double-count.)

/**
 * My share of everyday expense, grouped into day buckets measured from `?fromMs`.
 *
 * Bind params IN ORDER — `?` binds by position in the statement TEXT:
 *   [personId, fromMs, fromMs, toMs]
 *
 * Returns `{ day, amt }` rows, `day` being a 0-based offset in whole days from
 * `fromMs`. **Only days with spend appear** — the caller fills the gaps with
 * zeros, because a quiet day is real data and dropping it would overestimate the
 * rate.
 *
 * What's excluded, and why each one:
 * - `is_deleted` — never counted anywhere.
 * - `kind <> 'expense'` — income isn't spend, and settling a debt isn't
 *   consumption (the original purchase was already booked as an expense).
 * - `recur_freq IS NOT NULL` — that row is a *rule template*, not a real spend.
 * - `parent_recur_id IS NOT NULL` — a materialized occurrence of a rule. These
 *   are already claimed by Safe-to-Spend's `upcomingBills`; counting them here
 *   too would subtract every bill in the app twice.
 * - a share of 0 or less — matches every other aggregator in the codebase.
 *
 * Mirrors `dailySpendTotals()` exactly.
 */
export const DAILY_SPEND_SQL = `
  SELECT
    CAST((t.date - ?) / 86400000 AS INTEGER) AS day,
    SUM(ms.amt) AS amt
  FROM txn t
  JOIN (SELECT txn_id, SUM(amount) AS amt FROM txn_share WHERE person_id = ? GROUP BY txn_id) ms
    ON ms.txn_id = t.id
  WHERE t.is_deleted = 0
    AND t.kind = 'expense'
    AND t.recur_freq IS NULL
    AND t.parent_recur_id IS NULL
    AND t.date >= ?
    AND t.date <= ?
    AND ms.amt > 0
    AND ${NOT_AWAITING_APPROVAL}
  GROUP BY day
  ORDER BY day
`;

/** One row of `DAILY_SPEND_SQL`. */
export type DailySpendRow = { day: number; amt: number };

/**
 * Turn the sparse rows into the dense, history-clamped bucket array
 * `typicalDailySpend` expects.
 *
 * **The window starts at the first spend, not at `fromMs`.** A two-week-old
 * account has 90 days of *window* but 14 days of *history*; averaging over the
 * window would divide a fortnight of spending across three months and report a
 * rate roughly six times too low — a confidently wrong number, which is worse
 * than no number. Clamping here is also what gives `EVERYDAY_MIN_DAYS` something
 * real to gate on: the returned length is days-of-history, not window length.
 */
export function bucketsFromDailyRows(rows: DailySpendRow[], fromMs: number, toMs: number): number[] {
  if (rows.length === 0) return [];
  let firstDay = Infinity;
  for (const r of rows) if (r.day < firstDay) firstDay = r.day;

  const startMs = fromMs + firstDay * 86_400_000;
  const dayCount = Math.max(1, Math.ceil((toMs - startMs) / 86_400_000));
  const buckets = new Array<number>(dayCount).fill(0);
  for (const r of rows) {
    const idx = Math.min(dayCount - 1, r.day - firstDay);
    if (idx >= 0) buckets[idx] += r.amt;
  }
  return buckets;
}
