import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { startOfMonth } from 'date-fns';
import {
  computeSafeToSpend, goalRemainingThisCycle, typicalDailySpend,
  everydaySpendAhead, STS_HORIZON_DAYS, EVERYDAY_WINDOW_DAYS, type SafeToSpend, type SafeToSpendBreakdown,
} from '../../lib/safeToSpend';
import { getFinanceSnapshot } from './engineSnapshot';
import type { FinanceSnapshot } from '../../lib/engine/types';
import { safeToSpendV2 } from '../../lib/engine/assess';
import { lowPointWarning } from '../../lib/engine/signals';
import { DAILY_SPEND_SQL, bucketsFromDailyRows, type DailySpendRow } from './spendRateQuery';
import { expandUpcoming } from '../../lib/upcoming';
import { myShareOf } from '../../lib/splitMath';
import { monthlyContribution } from '../../lib/savings';
import { getCashPosition, getGoals, getGoalSavedMap } from './savings';
import { getMoneyProfile } from './moneyProfile';
import { computeTotalMoney } from '../../lib/cash';
import { getAllGroups, personalGroupOf } from './groups';
import { getAllRecurringRules, getSkipsMap } from './recurring';
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
 * the figure can't peak on the 28th with rent three days out.
 *
 * The old formula. Only the dev comparison screen reads it now, as the
 * independent reference `getSafeToSpendV2` is compared against.
 */
export async function getSafeToSpend(db: SQLite.SQLiteDatabase, nowMs: number = Date.now()): Promise<SafeToSpend> {
  const me = await getMe(db);
  if (!me) return computeSafeToSpend(EMPTY_PARTS, { daysLeft: STS_HORIZON_DAYS, dailyRate: null });

  const horizonMs = nowMs + STS_HORIZON_DAYS * DAY_MS;
  const windowStartMs = nowMs - EVERYDAY_WINDOW_DAYS * DAY_MS;

  // One profile read for both, handed down — `getMoneyProfile` derives
  // `investments` from the asset register, so it is an aggregate now and this
  // function was issuing three of them per call, on Home's hot path.
  const profile = await getMoneyProfile(db);
  const pos = await getCashPosition(db, profile);
  // Card debt never lowered `available` (it is debt, not cash out), so this is
  // the only place it is claimed — see the header of lib/safeToSpend.ts. Derived
  // from the two above rather than re-read, which is what `getTotalMoney` does.
  const money = computeTotalMoney(pos, profile);

  const [funding, exposure, futureTxns, dailyRows] = await Promise.all([
    getGoalFundingStatus(db, nowMs),
    getMyExposure(db, me.id),
    // Already-logged future-dated one-offs (recurring occurrences are never
    // materialized ahead of now, so these are disjoint from the expansion).
    getTransactionsInRange(db, null, nowMs, horizonMs),
    // Trailing window for the everyday rate, aggregated in SQL rather than
    // loading 90 days of rows + splits.
    db.getAllAsync<DailySpendRow>(DAILY_SPEND_SQL, [windowStartMs, me.id, windowStartMs, nowMs]),
  ]);

  const recurRules = await getAllRecurringRules(db);
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
 * Safe-to-Spend off the money engine (`SPEC-ENGINE.md` §4.1) — Home, its sheet
 * and the Add screen's toast. The v1 policy (horizon to payday, salary counted)
 * comes from `safeToSpendV2`'s own defaults, the same ones `afford()` uses.
 *
 * The parts are read **up to the low point**: cash, plus income before it, minus
 * every claim before it and the everyday rate for those days. That is the walk
 * itself, so the lines always add up to the figure. Events are filed by `kind`,
 * never by label — a bill named "Card repayment" is still a bill.
 *
 * `getSafeToSpend` (above) stays as the dev comparison screen's independent
 * reference; nothing user-facing reads it.
 */
export async function getSafeToSpendV2(db: SQLite.SQLiteDatabase, nowMs: number = Date.now()): Promise<SafeToSpendBreakdown> {
  return safeToSpendOf(await getFinanceSnapshot(db, nowMs));
}

/**
 * The same answer from a snapshot the caller already holds. A loader that also needs the
 * snapshot (Insights, Badges) used to build it twice, about forty round trips each time.
 */
export function safeToSpendOf(snapshot: FinanceSnapshot): SafeToSpendBreakdown {
  const v2 = safeToSpendV2(snapshot);
  const days = v2.projection.days;
  // L10: a low point at `asOf` itself means the balance never dipped below
  // today's cash. The parts (all zero) still sum to `amount`; only the label
  // changes — "safe through the horizon's end", not "until today".
  const noDip = v2.lowPoint.date <= snapshot.asOf;
  const untilMs = noDip && days.length > 0 ? days[days.length - 1].date : v2.lowPoint.date;
  const toLow = noDip ? [] : days.filter(d => d.date <= untilMs);

  const parts = { income: 0, upcomingBills: 0, cardRepayment: 0, goalRemaining: 0, netIOwe: 0 };
  for (const e of toLow.flatMap(d => d.events)) {
    if (e.kind === 'income') parts.income += e.amountPaise;
    else if (e.kind === 'card') parts.cardRepayment -= e.amountPaise;
    else if (e.kind === 'goals') parts.goalRemaining -= e.amountPaise;
    else if (e.kind === 'owe') parts.netIOwe -= e.amountPaise;
    else parts.upcomingBills -= e.amountPaise;
  }

  return {
    available: snapshot.cash.available,
    ...parts,
    everydaySpend: (v2.dailyRate ?? 0) * toLow.length,
    amount: v2.amount,
    daysLeft: toLow.length,
    dailyRate: v2.dailyRate,
    untilMs,
    noDip,
    events: v2.projection.days.flatMap(d => d.events),
    warning: lowPointWarning(snapshot, v2.projection),
  };
}

/**
 * Log a card-bill payment: ONE settlement in the personal ledger, from a bank account INTO a card
 * (`to_account_id`, `DQ-109`). Cash leaves that bank (settledOut) and the same amount comes off
 * the card's debt (`cardSpend` goes down). Shows in the ledger like any transfer and is excluded
 * from spend analysis like any settlement. Omitted accounts are the defaults.
 */
export async function payCardBill(
  db: SQLite.SQLiteDatabase, amountPaise: number, note?: string,
  accounts: { from?: string; card?: string } = {},
): Promise<string> {
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
    payMethod: PayMethod.Bank,
    accountId: accounts.from,
    toAccountId: accounts.card ?? 'default:card',
    payments: [{ personId: me.id, amount: amountPaise }],
    shares: [],
  });
}

/** The category every balance adjustment carries — how `settlementView` tells one apart (`U-64`). */
export const BALANCE_ADJUSTMENT_CATEGORY = 'Balance adjustment';

/**
 * Bring one place (bank, cash or wallet) to what it really holds (`U-64`): the gap between the
 * app's figure and the real one is recorded as ONE personal entry, so history still adds up and
 * the fix is visible, dated and undoable — rather than the starting balance being rewritten
 * under every entry since.
 *
 * It is a settlement in the personal group with only me on it: money appearing (a share for me)
 * or disappearing (a payment by me), from that place. So it is never spending or income (analysis
 * excludes settlements), never a debt with anyone (only me), and it moves exactly that place
 * (`BUCKET_FLOWS_SQL`: share − payment) and Spendable by the gap. Returns null for no gap.
 */
export async function recordBalanceAdjustment(
  db: SQLite.SQLiteDatabase, place: 'bank' | 'cash' | 'wallet', deltaPaise: number, accountId?: string,
): Promise<string | null> {
  if (!Number.isFinite(deltaPaise) || deltaPaise === 0) return null;
  const me = await getMe(db);
  if (!me) throw new Error('No current user');
  const personal = personalGroupOf(await getAllGroups(db));
  if (!personal) throw new Error('No personal group');
  const amount = Math.abs(Math.round(deltaPaise));
  return insertTxn(db, {
    groupId: personal.id,
    kind: 'settlement',
    entryMode: 'quick',
    date: Date.now(),
    category: BALANCE_ADJUSTMENT_CATEGORY,
    note: deltaPaise > 0 ? 'Balance corrected up' : 'Balance corrected down',
    payMethod: place as PayMethod,
    accountId,
    payments: deltaPaise < 0 ? [{ personId: me.id, amount }] : [],
    shares: deltaPaise > 0 ? [{ personId: me.id, amount }] : [],
  });
}
