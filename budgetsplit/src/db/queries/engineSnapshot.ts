import * as SQLite from 'expo-sqlite';
import type { FinanceSnapshot } from '../../lib/engine/types';
import { myShareOf } from '../../lib/splitMath';
import { getMe } from './persons';
import { getMoneyProfile } from './moneyProfile';
import { getCashPosition, getGoals, getGoalSavedMap } from './savings';
import { computeTotalMoney } from '../../lib/cash';
import { getAllGroups } from './groups';
import { getRecurringForGroup, getSkipsMap } from './recurring';
import { getTransactionsInRange, getSharedActivityWith } from './transactions';
import { getMyExposure } from './balances';
import { getMyGlobalBudgetRows } from './categoryBudgets';
import { getGoalFundingStatus } from './spendPower';

const DAY_MS = 86_400_000;
const HISTORY_MONTHS = 24;

const EMPTY: FinanceSnapshot = {
  asOf: 0,
  meId: '',
  cash: { available: 0, creditUsed: 0, creditLimit: 0, cardDueDay: null },
  recurring: { rules: [], skips: {} },
  goals: { list: [], savedByGoal: {}, funding: { commitMonthly: 0, fundedThisMonth: 0, remaining: 0, goalsCount: 0 } },
  exposure: { owe: 0, owed: 0, owedExpected: 0, net: 0, owePeople: 0, owedPeople: 0, perPerson: [] },
  receivables: [],
  budgets: [],
  history: [],
};

/**
 * `money.card_due_day` — new, optional, asked once (`SPEC-ENGINE.md` §4 E1,
 * §12 open question 1). Not yet part of `MoneyProfile`'s typed contract (nothing
 * writes it), so read directly rather than widening that type before there is a
 * Settings row to write it from.
 */
async function getCardDueDay(db: SQLite.SQLiteDatabase): Promise<number | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'money.card_due_day'",
  );
  const n = row ? Number(row.value) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * E1 — every input the money engine reads, from one place (`SPEC-ENGINE.md` §4).
 * A plain, pure object; everything built on it (`lib/engine/*`) is pure too.
 *
 * Reuses today's queries rather than re-deriving anything, so a snapshot's parts
 * equal what `getSafeToSpend` already computes from the same ledger — the
 * accept criterion `engineSnapshot.test.ts` checks directly.
 */
export async function getFinanceSnapshot(db: SQLite.SQLiteDatabase, nowMs: number = Date.now()): Promise<FinanceSnapshot> {
  const me = await getMe(db);
  if (!me) return { ...EMPTY, asOf: nowMs };

  const profile = await getMoneyProfile(db);
  const [pos, groups, exposure, budgets, cardDueDay] = await Promise.all([
    getCashPosition(db, profile),
    getAllGroups(db),
    getMyExposure(db, me.id),
    getMyGlobalBudgetRows(db, me.id),
    getCardDueDay(db),
  ]);
  const money = computeTotalMoney(pos, profile);

  const [recurRulesByGroup, goals, savedByGoal, funding, history] = await Promise.all([
    Promise.all(groups.map(g => getRecurringForGroup(db, g.id))),
    getGoals(db),
    getGoalSavedMap(db),
    getGoalFundingStatus(db, nowMs),
    getTransactionsInRange(db, null, nowMs - HISTORY_MONTHS * 30 * DAY_MS, nowMs),
  ]);
  const rules = recurRulesByGroup.flat();
  const skipsBySeries = await getSkipsMap(db, rules.map(r => r.id));
  // `getSkipsMap` returns `Map<string, Set<number>>` — flattened to a plain,
  // JSON-serializable object, since `FinanceSnapshot` is meant to be exactly that
  // (deep-equal comparisons in tests, and later a hash seed for E3's PRNG).
  const skips: Record<string, number[]> = {};
  for (const [seriesId, dates] of skipsBySeries) skips[seriesId] = [...dates].sort((a, b) => a - b);

  // Settlement dates per person I have a receivable or payable with — the raw
  // material for E2's repayment model. `getSharedActivityWith` already excludes
  // the Personal group and unaccepted rows the same way the person screen does.
  const withExposure = exposure.perPerson.filter(p => p.net !== 0);
  const receivables = await Promise.all(withExposure.map(async p => {
    const activity = await getSharedActivityWith(db, me.id, p.personId);
    const settlementDates = activity
      .filter(t => t.kind === 'settlement' && !t.pendingApproval)
      .map(t => t.date)
      .sort((a, b) => b - a);
    return { personId: p.personId, settlementDates };
  }));

  const historyRows = history
    .filter((t): t is typeof t & { kind: 'expense' | 'income' } => t.kind === 'expense' || t.kind === 'income')
    .map(t => ({
      id: t.id,
      date: t.date,
      kind: t.kind,
      category: t.category,
      // Income is never split (AGENTS.md §12): the full amount lands in `payments`,
      // never `shares`, so `myShareOf` (which reads `shares`) would silently read 0.
      amountPaise: t.kind === 'income' ? (t.payments.find(p => p.personId === me.id)?.amount ?? 0) : myShareOf(t, me.id),
      isRecurringLinked: t.parent_recur_id != null,
    }))
    .sort((a, b) => a.date - b.date);

  return {
    asOf: nowMs,
    meId: me.id,
    cash: { available: pos.available, creditUsed: money.creditUsed, creditLimit: money.creditLimit, cardDueDay },
    recurring: { rules, skips },
    goals: { list: goals, savedByGoal, funding },
    exposure,
    receivables,
    budgets,
    history: historyRows,
  };
}
