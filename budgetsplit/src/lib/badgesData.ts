import type * as SQLite from 'expo-sqlite';
import { getMe } from '../db/queries/persons';
import { getMyActivity } from '../db/queries/transactions';
import { getAllGroups, sharedGroupsOf } from '../db/queries/groups';
import { getMyExposure } from '../db/queries/balances';
import { getGoals, getGoalSavedMap } from '../db/queries/savings';
import { getAssets } from '../db/queries/assets';
import { getSafeToSpendV2 } from '../db/queries/spendPower';
import { getTotalMoney } from '../db/queries/savings';
import { getAllRecurringRules } from '../db/queries/recurring';
import { getFinanceSnapshot } from '../db/queries/engineSnapshot';
import { getMyGlobalBudgetSummary } from './budget';
import { explain } from './engine/explain';
import { incomeModel } from './engine/behaviour';
import { myShareOf, myIncomeOf } from './splitMath';
import { computeBadges, type Badge } from './badges';
import { parseTags } from './tags';

/**
 * Everything the profile's badges read (`U-59`), each from the engine or loader that already owns
 * that answer — this file only gathers them for `computeBadges`.
 */
export async function loadBadges(db: SQLite.SQLiteDatabase, nowMs: number = Date.now()): Promise<Badge[]> {
  const me = await getMe(db);
  if (!me) return [];
  const [activity, groups, exposure, goals, saved, assets, sts, snapshot, budget, money, rules] = await Promise.all([
    getMyActivity(db, me.id),
    getAllGroups(db),
    getMyExposure(db, me.id),
    getGoals(db),
    getGoalSavedMap(db),
    getAssets(db),
    getSafeToSpendV2(db, nowMs),
    getFinanceSnapshot(db, nowMs),
    getMyGlobalBudgetSummary(db, me.id),
    getTotalMoney(db),
    getAllRecurringRules(db),
  ]);
  const emergency = goals.find(g => g.priority === 'emergency');
  const counted = activity.filter(t => !t.pendingApproval);
  const why = explain(snapshot);
  const income = incomeModel(snapshot);
  return computeBadges({
    nowMs,
    rows: counted.map(t => ({
      date: t.date,
      spent: t.kind === 'expense' ? myShareOf(t, me.id) : 0,
      income: t.kind === 'income' ? myIncomeOf(t, me.id) : 0,
      kind: t.kind,
      category: t.category,
      shared: !t.isPersonal,
      hasNote: !!t.note?.trim(),
      hasReceipt: !!t.attachment_uri,
      tagCount: parseTags(t.tags).length,
    })),
    safeToSpend: why.suppressVerdict ? null : sts.amount,
    lowSoon: !!sts.warning,
    incomeConsistency: income.incomeMonths > 0 ? income.consistency : null,
    owe: exposure.owe,
    owed: exposure.owed,
    hasShared: sharedGroupsOf(groups).length > 0,
    goalsDone: goals.filter(g => g.target > 0 && (saved[g.id] ?? 0) >= g.target).length,
    goalsCount: goals.length,
    budgetPct: budget.allocated > 0 ? budget.pct : null,
    assetCount: assets.length,
    goalsSaved: goals.reduce((sum, g) => sum + (saved[g.id] ?? 0), 0),
    emergency: emergency ? { saved: saved[emergency.id] ?? 0, target: emergency.target } : null,
    recurringRules: rules.filter(r => r.recur_state !== 'ended' && !r.author_person_id).length,
    card: money.creditLimit > 0 ? { used: money.creditUsed, limit: money.creditLimit } : null,
    cashAvailable: money.cashAvailable,
  });
}
