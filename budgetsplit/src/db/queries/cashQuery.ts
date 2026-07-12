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
 * cutoff. Bind params IN ORDER: [personId, personId, toMs].
 *   income       = my payments on income txns
 *   paidExpenses = my payments on expense txns
 *   settledOut   = my payments on settlement txns
 *   settledIn    = my shares   on settlement txns
 * Mirrors computeCash()'s per-txn reduce exactly.
 */
export const CASH_TOTALS_SQL = `
  SELECT
    COALESCE(SUM(CASE WHEN t.kind = 'income'     THEN mp.amt ELSE 0 END), 0) AS income,
    COALESCE(SUM(CASE WHEN t.kind = 'expense'    THEN mp.amt ELSE 0 END), 0) AS paidExpenses,
    COALESCE(SUM(CASE WHEN t.kind = 'settlement' THEN mp.amt ELSE 0 END), 0) AS settledOut,
    COALESCE(SUM(CASE WHEN t.kind = 'settlement' THEN ms.amt ELSE 0 END), 0) AS settledIn
  FROM txn t
  LEFT JOIN (SELECT txn_id, SUM(amount) AS amt FROM txn_payment WHERE person_id = ? GROUP BY txn_id) mp ON mp.txn_id = t.id
  LEFT JOIN (SELECT txn_id, SUM(amount) AS amt FROM txn_share   WHERE person_id = ? GROUP BY txn_id) ms ON ms.txn_id = t.id
  WHERE t.is_deleted = 0 AND t.recur_freq IS NULL AND t.date <= ?
`;
