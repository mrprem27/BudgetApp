import * as SQLite from 'expo-sqlite';
import { startOfMonth, endOfMonth } from 'date-fns';
import { computeSafeToSpend, goalRemainingThisCycle, type SafeToSpend } from '../../lib/safeToSpend';
import { expandUpcoming } from '../../lib/upcoming';
import { myShareOf } from '../../lib/splitMath';
import { monthlyContribution } from '../../lib/savings';
import { getCashPosition, getGoals, getGoalSavedMap } from './savings';
import { getAllGroups } from './groups';
import { getRecurringForGroup, getSkipsMap } from './recurring';
import { getTransactionsInRange } from './transactions';
import { getMyExposure } from './balances';
import { getMe } from './persons';

/**
 * Assemble Safe-to-Spend (see `lib/safeToSpend.ts` for the formula and why
 * each term has exactly one source). Horizon: month-end. Used by Home's hero
 * and by Afford's cash gate — one number, two readers, zero drift.
 */
export async function getSafeToSpend(db: SQLite.SQLiteDatabase, nowMs: number = Date.now()): Promise<SafeToSpend> {
  const me = await getMe(db);
  if (!me) return computeSafeToSpend({ available: 0, upcomingBills: 0, goalRemaining: 0, netIOwe: 0 });

  const today = new Date(nowMs);
  const monthStartMs = startOfMonth(today).getTime();
  const monthEndMs = endOfMonth(today).getTime();

  const [pos, groups, goals, saved, exposure, futureTxns, fundedRows] = await Promise.all([
    getCashPosition(db),
    getAllGroups(db),
    getGoals(db),
    getGoalSavedMap(db),
    getMyExposure(db, me.id),
    // Already-logged future-dated one-offs (recurring occurrences are never
    // materialized ahead of now, so these are disjoint from the expansion).
    getTransactionsInRange(db, null, nowMs, monthEndMs),
    db.getAllAsync<{ goal_id: string; funded: number }>(
      `SELECT goal_id, SUM(amount) AS funded
         FROM savings_txn
        WHERE kind = 'allocate' AND goal_id IS NOT NULL AND date >= ?
        GROUP BY goal_id`,
      [monthStartMs],
    ),
  ]);

  const recurRules = (await Promise.all(groups.map(g => getRecurringForGroup(db, g.id)))).flat();
  const skips = await getSkipsMap(db, recurRules.map(r => r.id));

  let upcomingBills = expandUpcoming(recurRules, me.id, nowMs, monthEndMs, skips)
    .reduce((s, o) => s + o.amount, 0);
  for (const t of futureTxns) {
    if (t.is_deleted || t.kind !== 'expense') continue;
    upcomingBills += myShareOf(t, me.id);
  }

  const allocatedThisMonth: Record<string, number> = {};
  for (const r of fundedRows) allocatedThisMonth[r.goal_id] = r.funded ?? 0;
  const goalRemaining = goalRemainingThisCycle(
    goals.map(g => ({
      id: g.id,
      monthlyRate: monthlyContribution(g.allocation, g.frequency),
      saved: saved[g.id] ?? 0,
      target: g.target,
    })),
    allocatedThisMonth,
  );

  return computeSafeToSpend({
    available: pos.available,
    upcomingBills,
    goalRemaining,
    netIOwe: exposure.owe,
  });
}
