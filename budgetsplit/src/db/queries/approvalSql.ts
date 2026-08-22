// The one definition of "this entry is not waiting on me".
//
// Its own module, with **zero imports**, for the same reason `cashQuery.ts` and
// `spendRateQuery.ts` are import-free: those two are unit-tested against a real
// SQLite engine (`cashSql.test.ts`, `spendRateSql.test.ts`) outside the React
// Native module graph, and they need this string. A constant they cannot import
// would have to be copied into them, which is exactly the drift that
// `BALANCE_TXN_FILTER` was extracted to stop.

/**
 * A peer entry waiting for my approval is visible in the ledger and moves **none
 * of my numbers**.
 *
 * Every statement that treats `txn` rows as *my money* carries this. The three
 * ledger loaders deliberately do not — the group has to agree on what happened
 * even while I have not accepted my part of it. AGENTS §13 lists both sides, and
 * `approvalInvariant.test.ts` reads the real SQL and fails when a statement over
 * `txn` neither carries this nor says why.
 *
 * Hardcodes the `t.` alias, exactly like `BALANCE_TXN_FILTER`: every site that
 * uses it aliases `txn` as `t`.
 */
export const NOT_AWAITING_APPROVAL =
  "NOT EXISTS (SELECT 1 FROM txn_approval a WHERE a.txn_id = t.id AND a.state = 'pending')";

/**
 * The same fact as a selected column, for the three ledger loaders that
 * deliberately DO show pending entries and must label them.
 *
 * A ledger without the marker would be the worst of both worlds: the entry is
 * visible, so it looks counted, but every figure on the screen excludes it.
 */
export const AWAITING_APPROVAL_COL =
  "EXISTS (SELECT 1 FROM txn_approval a WHERE a.txn_id = t.id AND a.state = 'pending') AS pending_approval";
