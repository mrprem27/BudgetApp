import { NOT_AWAITING_APPROVAL } from './approvalSql';

/**
 * The effective **From** of a row (`U-48`): `pay_from` when set, else the usual for its How. The
 * SQL twin of `payFromOf` (`constants/enums.ts`) — this module stays import-free so it can run
 * against a real engine; the parity tests hold the two together.
 */
export const EFFECTIVE_FROM_SQL = `(CASE
      WHEN t.pay_from IS NOT NULL THEN t.pay_from
      WHEN t.pay_method = 'card' AND t.kind = 'settlement' THEN 'bank'
      WHEN t.pay_method = 'card'   THEN 'credit'
      WHEN t.pay_method = 'cash'   THEN 'cash'
      WHEN t.pay_method = 'wallet' THEN 'wallet'
      WHEN t.pay_method IN ('bank', 'upi', 'autopay') THEN 'bank'
      ELSE NULL END)`;
const FROM = EFFECTIVE_FROM_SQL;
/** A card-bill payment (`isCardRepayment`). */
const REPAY = `(t.kind = 'settlement' AND t.pay_method = 'card')`;

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
 *   paidExpenses = my payments on expense txns **whose From is not a credit card**
 *   settledOut   = my payments on settlement txns, likewise
 *   settledIn    = my shares   on settlement txns
 *   cardSpend    = my payments **from a credit card** (spend, or a transfer) dated after
 *                  cardBaselineMs, MINUS my card-bill payments after it (repayment)
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
                       AND (${FROM} IS NULL OR ${FROM} <> 'credit')
                      THEN mp.amt ELSE 0 END), 0) AS paidExpenses,
    COALESCE(SUM(CASE WHEN t.kind = 'settlement'
                       AND (${FROM} IS NULL OR ${FROM} <> 'credit')
                      THEN mp.amt ELSE 0 END), 0) AS settledOut,
    COALESCE(SUM(CASE WHEN t.kind = 'settlement' THEN ms.amt ELSE 0 END), 0) AS settledIn,
    COALESCE(SUM(CASE WHEN (t.kind = 'expense' OR (t.kind = 'settlement' AND NOT ${REPAY}))
                       AND ${FROM} = 'credit'
                       AND t.date > ?
                      THEN mp.amt
                      WHEN ${REPAY}
                       AND t.date > ?
                      THEN -mp.amt
                      ELSE 0 END), 0) AS cardSpend
  FROM txn t
  LEFT JOIN (SELECT txn_id, SUM(amount) AS amt FROM txn_payment WHERE person_id = ? GROUP BY txn_id) mp ON mp.txn_id = t.id
  LEFT JOIN (SELECT txn_id, SUM(amount) AS amt FROM txn_share   WHERE person_id = ? GROUP BY txn_id) ms ON ms.txn_id = t.id
  WHERE t.is_deleted = 0 AND t.recur_freq IS NULL AND t.date <= ?
    AND ${NOT_AWAITING_APPROVAL}
`;

/**
 * Net movement per bucket — bank, cash, wallet — since the opening balances.
 *
 * A **separate** statement rather than more columns on `CASH_TOTALS_SQL`, on
 * purpose. That one is pinned byte-for-byte against the JS reducer by
 * `cashSql.test.ts` and read by Safe-to-Spend, the raid, afford and the health
 * score; reshaping it to carry three more dimensions would put all of that at risk
 * for a figure only two screens need. This adds detail beside it and changes
 * nothing about it.
 *
 * The bucket mapping mirrors `assetOf` in `constants/enums.ts` — that file owns
 * the policy (why `upi` and `autopay` read as bank), this is the same rule in SQL
 * because this module stays import-free so it can be tested against a real engine.
 * If one changes, change both; `bucketFlows.test.ts` fails when they disagree.
 *
 * **`NULL` groups to `NULL` and is deliberately not a bucket.** `txn.pay_method`
 * is nullable and real rows have it, where it has only ever meant "not card".
 * Forcing those into bank would silently drain that bucket for every legacy row
 * while the total stayed correct — wrong in the way nothing looks broken. They
 * come back as an unattributed row, counted in the total and attributed nowhere.
 *
 * Anything from a credit card is absent for the same reason it is absent from `available`: it
 * moves no money out of any place, it creates debt. A card-bill payment's From is the bank, so
 * the bank goes down when you pay the bill — before `U-48` it was skipped, and Bank + Cash +
 * Wallet stopped adding up to Spendable after the first bill paid.
 */
export const BUCKET_FLOWS_SQL = `
  SELECT
    CASE WHEN ${FROM} IN ('bank', 'cash', 'wallet') THEN ${FROM} ELSE NULL END AS bucket,
    COALESCE(SUM(
      CASE
        WHEN t.kind = 'income'     THEN  COALESCE(mp.amt, 0)
        WHEN t.kind = 'expense'    THEN -COALESCE(mp.amt, 0)
        WHEN t.kind = 'settlement' THEN  COALESCE(ms.amt, 0) - COALESCE(mp.amt, 0)
        ELSE 0
      END
    ), 0) AS delta
  FROM txn t
  LEFT JOIN (SELECT txn_id, SUM(amount) AS amt FROM txn_payment WHERE person_id = ? GROUP BY txn_id) mp ON mp.txn_id = t.id
  LEFT JOIN (SELECT txn_id, SUM(amount) AS amt FROM txn_share   WHERE person_id = ? GROUP BY txn_id) ms ON ms.txn_id = t.id
  WHERE t.is_deleted = 0 AND t.recur_freq IS NULL AND t.date <= ?
    AND (${FROM} IS NULL OR ${FROM} <> 'credit')
    AND ${NOT_AWAITING_APPROVAL}
  GROUP BY bucket
`;
