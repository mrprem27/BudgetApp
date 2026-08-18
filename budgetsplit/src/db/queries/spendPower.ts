import * as SQLite from 'expo-sqlite';
import { startOfMonth } from 'date-fns';
import {
  computeSafeToSpend, goalRemainingThisCycle, typicalDailySpend,
  everydaySpendAhead, STS_HORIZON_DAYS, EVERYDAY_WINDOW_DAYS, type SafeToSpend,
} from '../../lib/safeToSpend';
import { DAILY_SPEND_SQL, bucketsFromDailyRows, type DailySpendRow } from './spendRateQuery';
import { expandUpcoming } from '../../lib/upcoming';
import { myShareOf } from '../../lib/splitMath';
import { monthlyContribution } from '../../lib/savings';
import { getCashPosition, getGoals, getGoalSavedMap, getTotalMoney } from './savings';
import { getAllGroups, personalGroupOf } from './groups';
import { getRecurringForGroup, getSkipsMap } from './recurring';
import { getTransactionsInRange, insertTxn } from './transactions';
import { getMyExposure } from './balances';
import { getMe } from './persons';
import { PayMethod } from '../../constants/enums';

export type GoalFundingStatus = {
  /** Monthly goal-funding commitment across active, uncompleted goals (paise). */
  commitMonthly: number;
  /** Allocated to goals so far this month (paise). */
  fundedThisMonth: number;
  /** Unfunded remainder of this cycle's commitments (paise). */
  remaining: number;
  /** Active goals. */
  goalsCount: number;
};

/** This cycle's goal-funding position — shared by Safe-to-Spend and the health
 *  score's Save pillar so "goal commitment" means one thing. */
export async function getGoalFundingStatus(db: SQLite.SQLiteDatabase, nowMs: number = Date.now()): Promise<GoalFundingStatus> {
  const monthStartMs = startOfMonth(new Date(nowMs)).getTime();
  const [goals, saved, fundedRows] = await Promise.all([
    getGoals(db),
    getGoalSavedMap(db),
    db.getAllAsync<{ goal_id: string; funded: number }>(
      `SELECT goal_id, SUM(amount) AS funded
         FROM savings_txn
        WHERE kind = 'allocate' AND goal_id IS NOT NULL AND date >= ?
        GROUP BY goal_id`,
      [monthStartMs],
    ),
  ]);
  const allocatedThisMonth: Record<string, number> = {};
  for (const r of fundedRows) allocatedThisMonth[r.goal_id] = r.funded ?? 0;
  const rated = goals.map(g => ({
    id: g.id,
    monthlyRate: monthlyContribution(g.allocation, g.frequency),
    saved: saved[g.id] ?? 0,
    target: g.target,
  }));
  const commitMonthly = rated.reduce((s, g) => s + (g.saved >= g.target ? 0 : Math.max(0, g.monthlyRate)), 0);
  const fundedThisMonth = Object.values(allocatedThisMonth).reduce((s, v) => s + v, 0);
  return {
    commitMonthly,
    fundedThisMonth,
    remaining: goalRemainingThisCycle(rated, allocatedThisMonth),
    goalsCount: goals.length,
  };
}

const DAY_MS = 86_400_000;
const EMPTY_PARTS = {
  available: 0, upcomingBills: 0, cardRepayment: 0,
  goalRemaining: 0, netIOwe: 0, everydaySpend: 0,
};

/**
 * Assemble Safe-to-Spend (see `lib/safeToSpend.ts` for the formula and why
 * each term has exactly one source). Horizon: a rolling `STS_HORIZON_DAYS`, so
 * the figure can't peak on the 28th with rent three days out. Used by Home's
 * strip and by Afford's cash gate — one number, two readers, zero drift.
 */
export async function getSafeToSpend(db: SQLite.SQLiteDatabase, nowMs: number = Date.now()): Promise<SafeToSpend> {
  const me = await getMe(db);
  if (!me) return computeSafeToSpend(EMPTY_PARTS, { daysLeft: STS_HORIZON_DAYS, dailyRate: null });

  const horizonMs = nowMs + STS_HORIZON_DAYS * DAY_MS;
  const windowStartMs = nowMs - EVERYDAY_WINDOW_DAYS * DAY_MS;

  const [pos, money, groups, funding, exposure, futureTxns, dailyRows] = await Promise.all([
    getCashPosition(db),
    // Card debt never lowered `available` (it is debt, not cash out), so this is
    // the only place it is claimed — see the header of lib/safeToSpend.ts.
    getTotalMoney(db),
    getAllGroups(db),
    getGoalFundingStatus(db, nowMs),
    getMyExposure(db, me.id),
    // Already-logged future-dated one-offs (recurring occurrences are never
    // materialized ahead of now, so these are disjoint from the expansion).
    getTransactionsInRange(db, null, nowMs, horizonMs),
    // Trailing window for the everyday rate, aggregated in SQL rather than
    // loading 90 days of rows + splits — this function runs on Home, on Afford,
    // and after every expense save.
    db.getAllAsync<DailySpendRow>(DAILY_SPEND_SQL, [windowStartMs, me.id, windowStartMs, nowMs]),
  ]);

  const recurRules = (await Promise.all(groups.map(g => getRecurringForGroup(db, g.id)))).flat();
  const skips = await getSkipsMap(db, recurRules.map(r => r.id));

  let upcomingBills = expandUpcoming(recurRules, me.id, nowMs, horizonMs, skips)
    .reduce((s, o) => s + o.amount, 0);
  for (const t of futureTxns) {
    if (t.is_deleted || t.kind !== 'expense') continue;
    upcomingBills += myShareOf(t, me.id);
  }

  const dailyRate = typicalDailySpend(bucketsFromDailyRows(dailyRows, windowStartMs, nowMs));

  return computeSafeToSpend(
    {
      available: pos.available,
      upcomingBills,
      cardRepayment: money.creditUsed,
      goalRemaining: funding.remaining,
      netIOwe: exposure.owe,
      everydaySpend: everydaySpendAhead(dailyRate, STS_HORIZON_DAYS),
    },
    { daysLeft: STS_HORIZON_DAYS, dailyRate },
  );
}

/**
 * Log a card-bill payment: ONE settlement row in the personal ledger with
 * `pay_method = 'card'` — the marker `computeCash`/`CASH_TOTALS_SQL` read to
 * move the same amount out of cash (settledOut) AND off the card debt
 * (cardSpend goes down). Shows in the ledger like any transfer, is excluded
 * from spend analysis like any settlement, and finally gives `creditUsed` a
 * way down between Plan edits. The full accounts model stays future work; this
 * row is designed to survive it (it is just a settlement with a pay method).
 */
export async function payCardBill(db: SQLite.SQLiteDatabase, amountPaise: number, note?: string): Promise<string> {
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) throw new Error('Card payment needs a positive amount');
  const me = await getMe(db);
  if (!me) throw new Error('No current user');
  const personal = personalGroupOf(await getAllGroups(db));
  if (!personal) throw new Error('No personal group');
  return insertTxn(db, {
    groupId: personal.id,
    kind: 'settlement',
    entryMode: 'quick',
    date: Date.now(),
    category: 'Repayment',
    note: note ?? 'Card bill payment',
    payMethod: PayMethod.Card,
    payments: [{ personId: me.id, amount: amountPaise }],
    shares: [],
  });
}
