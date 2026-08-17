// SQL for the derived cash position, aggregated in the DB instead of loading every
// txn + all its split rows into JS and reducing there (getCashPosition scans all of
// history). Kept import-free so it can be unit-tested against a real SQLite engine
// (see cashSql.test.ts) to guarantee it stays in lockstep with computeCash().
//
// (txn_payment / txn_share have a composite PK on (txn_id, person_id), so there is
// at most one row per person per txn — SUM(amount) therefore equals computeCash()'s
// single per-person amount, not a double-count.)

/**
 * Sums, for one person, across all non-deleted, non-recurring txns dated at/before a
 * cutoff. Bind params IN ORDER — `?` binds by position in the statement TEXT, and the
 * two card-baseline filters sit in the SELECT, so they come FIRST:
 *   [cardBaselineMs, cardBaselineMs, personId, personId, toMs]
 *   income       = my payments on income txns
 *   paidExpenses = my payments on expense txns **paid with anything but a card**
 *   settledOut   = my payments on settlement txns
 *   settledIn    = my shares   on settlement txns
 *   cardSpend    = my payments on **card** expense txns dated after cardBaselineMs,
 *                  MINUS my payments on card-bill settlements after it (repayment)
 *
 * The card split is the point: putting a purchase on a card doesn't move cash, it
 * creates debt. `paidExpenses` therefore excludes it and `cardSpend` carries it over
 * to `creditUsed` (see computeTotalMoney). Counting it in both would be a
 * double-count — which is what this replaced.
 *
 * A **card repayment** is a settlement txn with `pay_method = 'card'` (see
 * `insertCardBillPayment`): the cash leaves through `settledOut` like any other
 * settlement, and the same amount comes OFF the card debt here — one row, both
 * sides, so `creditUsed` finally has a way down between Plan edits.
 *
 * `cardBaselineMs` is when the user last confirmed their card balance; spend at or
 * before it is already inside the stated `creditUsed`, so only later rows count.
 * Pass 0 to count all of history (they've never confirmed one).
 *
 * Mirrors computeCash()'s per-txn reduce exactly.
 */
export const CASH_TOTALS_SQL = `
  SELECT
    COALESCE(SUM(CASE WHEN t.kind = 'income'     THEN mp.amt ELSE 0 END), 0) AS income,
    COALESCE(SUM(CASE WHEN t.kind = 'expense'
                       AND (t.pay_method IS NULL OR t.pay_method <> 'card')
                      THEN mp.amt ELSE 0 END), 0) AS paidExpenses,
    COALESCE(SUM(CASE WHEN t.kind = 'settlement' THEN mp.amt ELSE 0 END), 0) AS settledOut,
    COALESCE(SUM(CASE WHEN t.kind = 'settlement' THEN ms.amt ELSE 0 END), 0) AS settledIn,
    COALESCE(SUM(CASE WHEN t.kind = 'expense'
                       AND t.pay_method = 'card'
                       AND t.date > ?
                      THEN mp.amt
                      WHEN t.kind = 'settlement'
                       AND t.pay_method = 'card'
                       AND t.date > ?
                      THEN -mp.amt
                      ELSE 0 END), 0) AS cardSpend
  FROM txn t
  LEFT JOIN (SELECT txn_id, SUM(amount) AS amt FROM txn_payment WHERE person_id = ? GROUP BY txn_id) mp ON mp.txn_id = t.id
  LEFT JOIN (SELECT txn_id, SUM(amount) AS amt FROM txn_share   WHERE person_id = ? GROUP BY txn_id) ms ON ms.txn_id = t.id
  WHERE t.is_deleted = 0 AND t.recur_freq IS NULL AND t.date <= ?
`;
