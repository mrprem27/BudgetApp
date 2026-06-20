import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { planAutoAllocations, monthsToSweep, planReduction } from '../../lib/savingsEngine';
import { getSpentInRange } from '../../lib/budget';
import { generateInsights, type Insight, type CategorySpend } from '../../lib/savingsInsights';
import { computeCash, type CashPosition } from '../../lib/cash';
import { getAllGroups } from './groups';
import { getMe } from './persons';
import { getTransactionsInRange } from './transactions';

export type Priority = 'high' | 'medium' | 'low';
export type SavingsFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'none';
export type SavingsTxnKind = 'deposit' | 'allocate' | 'withdraw';

export type SavingsGoal = {
  id: string;
  name: string;
  target: number;          // paise
  priority: Priority;
  category: string | null;
  icon: string | null;
  color: string | null;
  allocation: number;      // fixed allocation per frequency (paise)
  frequency: SavingsFrequency;
  locked: number;          // 0 | 1
  is_archived: number;     // 0 | 1
  last_auto_at: number | null; // auto-funding schedule anchor
  created_at: number;
};

export type SavingsTxn = {
  id: string;
  goal_id: string | null;
  amount: number;
  kind: SavingsTxnKind;
  source: 'manual' | 'auto';
  date: number;
  note: string | null;
  created_at: number;
};

export type PoolSummary = { total: number; allocated: number; unallocated: number };

// --- Goals ---------------------------------------------------------------

export async function getGoals(db: SQLite.SQLiteDatabase, includeArchived = false): Promise<SavingsGoal[]> {
  const where = includeArchived ? '' : 'WHERE is_archived = 0';
  // High → Medium → Low, then newest first.
  return db.getAllAsync<SavingsGoal>(
    `SELECT * FROM savings_goal ${where}
     ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, created_at DESC`,
  );
}

export async function getGoalById(db: SQLite.SQLiteDatabase, id: string): Promise<SavingsGoal | null> {
  return db.getFirstAsync<SavingsGoal>('SELECT * FROM savings_goal WHERE id = ?', [id]);
}

export type NewGoal = {
  name: string;
  target: number;
  priority: Priority;
  category?: string | null;
  icon?: string | null;
  color?: string | null;
  allocation?: number;
  frequency?: SavingsFrequency;
  locked?: boolean;
};

export async function insertGoal(db: SQLite.SQLiteDatabase, g: NewGoal): Promise<SavingsGoal> {
  const id = uuid();
  const now = Date.now();
  const row: SavingsGoal = {
    id, name: g.name, target: g.target, priority: g.priority,
    category: g.category ?? null, icon: g.icon ?? null, color: g.color ?? null,
    allocation: g.allocation ?? 0, frequency: g.frequency ?? 'none',
    locked: g.locked ? 1 : 0, is_archived: 0, last_auto_at: null, created_at: now,
  };
  await db.runAsync(
    `INSERT INTO savings_goal (id, name, target, priority, category, icon, color, allocation, frequency, locked, is_archived, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [row.id, row.name, row.target, row.priority, row.category, row.icon, row.color, row.allocation, row.frequency, row.locked, row.created_at],
  );
  return row;
}

export async function updateGoal(db: SQLite.SQLiteDatabase, id: string, g: NewGoal): Promise<void> {
  await db.runAsync(
    `UPDATE savings_goal SET name=?, target=?, priority=?, category=?, icon=?, color=?, allocation=?, frequency=?, locked=? WHERE id=?`,
    [g.name, g.target, g.priority, g.category ?? null, g.icon ?? null, g.color ?? null, g.allocation ?? 0, g.frequency ?? 'none', g.locked ? 1 : 0, id],
  );
}

export async function setGoalLocked(db: SQLite.SQLiteDatabase, id: string, locked: boolean): Promise<void> {
  await db.runAsync('UPDATE savings_goal SET locked=? WHERE id=?', [locked ? 1 : 0, id]);
}

/** Deletes a goal. Its earmarked savings return to the pool (allocations are dropped). */
export async function deleteGoal(db: SQLite.SQLiteDatabase, id: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM savings_txn WHERE goal_id = ?', [id]);
    await db.runAsync('DELETE FROM savings_goal WHERE id = ?', [id]);
  });
}

// --- Ledger / pool -------------------------------------------------------

async function insertTxn(db: SQLite.SQLiteDatabase, t: Omit<SavingsTxn, 'id' | 'created_at'>): Promise<void> {
  await db.runAsync(
    `INSERT INTO savings_txn (id, goal_id, amount, kind, source, date, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), t.goal_id, t.amount, t.kind, t.source, t.date, t.note ?? null, Date.now()],
  );
}

/** Add money into the Savings Pool (unallocated). */
export async function addToPool(db: SQLite.SQLiteDatabase, amount: number, source: 'manual' | 'auto' = 'manual', note?: string): Promise<void> {
  if (amount <= 0) return;
  await insertTxn(db, { goal_id: null, amount, kind: 'deposit', source, date: Date.now(), note: note ?? null });
}

/** Move money from the pool's unallocated balance into a goal. */
export async function allocateToGoal(db: SQLite.SQLiteDatabase, goalId: string, amount: number, source: 'manual' | 'auto' = 'manual', note?: string): Promise<void> {
  if (amount <= 0) return;
  await insertTxn(db, { goal_id: goalId, amount, kind: 'allocate', source, date: Date.now(), note: note ?? null });
}

/**
 * Atomically top up the pool by `shortfall` (when the goal needs more than the
 * unallocated balance) and allocate `amount` to the goal — in one transaction so
 * a failure can never deposit without allocating.
 */
export async function depositAndAllocate(db: SQLite.SQLiteDatabase, goalId: string, amount: number, shortfall = 0): Promise<void> {
  if (amount <= 0) return;
  await db.withTransactionAsync(async () => {
    if (shortfall > 0) {
      await insertTxn(db, { goal_id: null, amount: shortfall, kind: 'deposit', source: 'manual', date: Date.now(), note: null });
    }
    await insertTxn(db, { goal_id: goalId, amount, kind: 'allocate', source: 'manual', date: Date.now(), note: null });
  });
}

/** Pull money back out of a goal, returning it to the pool's unallocated balance. */
export async function withdrawFromGoal(db: SQLite.SQLiteDatabase, goalId: string, amount: number, note?: string): Promise<void> {
  if (amount <= 0) return;
  await insertTxn(db, { goal_id: goalId, amount, kind: 'withdraw', source: 'manual', date: Date.now(), note: note ?? null });
}

/** Take money out of the Savings Pool entirely (back to spending money). */
export async function withdrawFromPool(db: SQLite.SQLiteDatabase, amount: number, note?: string): Promise<void> {
  if (amount <= 0) return;
  await insertTxn(db, { goal_id: null, amount, kind: 'withdraw', source: 'manual', date: Date.now(), note: note ?? null });
}

/** Saved (earmarked) amount per goal: allocations minus withdrawals. */
export async function getGoalSavedMap(db: SQLite.SQLiteDatabase): Promise<Record<string, number>> {
  const rows = await db.getAllAsync<{ goal_id: string; saved: number }>(
    `SELECT goal_id,
            SUM(CASE WHEN kind='allocate' THEN amount WHEN kind='withdraw' THEN -amount ELSE 0 END) AS saved
       FROM savings_txn
      WHERE goal_id IS NOT NULL
      GROUP BY goal_id`,
  );
  const map: Record<string, number> = {};
  for (const r of rows) map[r.goal_id] = r.saved ?? 0;
  return map;
}

export async function getPoolSummary(db: SQLite.SQLiteDatabase): Promise<PoolSummary> {
  const row = await db.getFirstAsync<{ deposits: number; pool_out: number; allocated: number }>(
    `SELECT
        COALESCE(SUM(CASE WHEN kind='deposit' THEN amount ELSE 0 END), 0) AS deposits,
        COALESCE(SUM(CASE WHEN kind='withdraw' AND goal_id IS NULL THEN amount ELSE 0 END), 0) AS pool_out,
        COALESCE(SUM(CASE WHEN kind='allocate' THEN amount WHEN kind='withdraw' AND goal_id IS NOT NULL THEN -amount ELSE 0 END), 0) AS allocated
       FROM savings_txn`,
  );
  const total = (row?.deposits ?? 0) - (row?.pool_out ?? 0);
  const allocated = row?.allocated ?? 0;
  return { total, allocated, unallocated: total - allocated };
}

export async function getGoalHistory(db: SQLite.SQLiteDatabase, goalId: string): Promise<SavingsTxn[]> {
  return db.getAllAsync<SavingsTxn>(
    'SELECT * FROM savings_txn WHERE goal_id = ? ORDER BY date DESC, created_at DESC',
    [goalId],
  );
}

// --- Auto-funding (Phase 2) ---------------------------------------------

/**
 * Catch-up auto-funding. Runs cheaply on app open / Savings focus: funds each
 * goal's fixed allocation for every elapsed period (priority order when the
 * pool is short), then advances each goal's schedule anchor. Idempotent —
 * nothing happens until a full period elapses.
 */
export async function runAutoFunding(db: SQLite.SQLiteDatabase): Promise<boolean> {
  const goals = await getGoals(db);
  const eligible = goals.filter(g => g.allocation > 0 && g.frequency !== 'none');
  if (eligible.length === 0) return false;

  const [saved, pool] = await Promise.all([getGoalSavedMap(db), getPoolSummary(db)]);
  const now = Date.now();
  const plan = planAutoAllocations(
    eligible.map(g => ({ id: g.id, target: g.target, allocation: g.allocation, frequency: g.frequency, priority: g.priority, anchor: g.last_auto_at ?? g.created_at })),
    saved, pool.unallocated, now,
  );
  if (plan.length === 0) return false;

  await db.withTransactionAsync(async () => {
    for (const a of plan) {
      if (a.amount > 0) {
        await db.runAsync(
          `INSERT INTO savings_txn (id, goal_id, amount, kind, source, date, note, created_at)
           VALUES (?, ?, ?, 'allocate', 'auto', ?, NULL, ?)`,
          [uuid(), a.goalId, a.amount, now, now],
        );
      }
      await db.runAsync('UPDATE savings_goal SET last_auto_at = ? WHERE id = ?', [a.newAnchor, a.goalId]);
    }
  });
  return true;
}

const SWEEP_KEY = 'savings_last_sweep';
/** Opt-in flag for the budget-leftover auto-sweep (off by default). */
export const AUTO_SWEEP_KEY = 'auto_sweep_enabled';

/**
 * Sweep completed-month budget leftover into the Savings Pool (replaces
 * carry-over). Only groups with a monthly limit and carry_over OFF are swept —
 * groups that opted into carry-over keep rolling over. First run starts fresh
 * (no retroactive sweep). Idempotent via the stored month marker.
 */
export async function runLeftoverSweep(db: SQLite.SQLiteDatabase): Promise<number> {
  const marker = await AsyncStorage.getItem(SWEEP_KEY);
  const { months, newMarker } = monthsToSweep(marker, new Date());
  if (!marker) { await AsyncStorage.setItem(SWEEP_KEY, newMarker); return 0; } // initialise, no back-sweep
  if (months.length === 0) { await AsyncStorage.setItem(SWEEP_KEY, newMarker); return 0; }

  const groups = (await getAllGroups(db)).filter(g => (g.limit_monthly ?? 0) > 0 && g.carry_over !== 1);
  let total = 0;
  for (const m of months) {
    for (const g of groups) {
      const spent = await getSpentInRange(db, g.id, m.start, m.end);
      total += Math.max(0, (g.limit_monthly ?? 0) - spent);
    }
  }
  if (total > 0) await addToPool(db, total, 'auto', 'Budget leftover');
  await AsyncStorage.setItem(SWEEP_KEY, newMarker);
  return total;
}

/**
 * Keep allocated ≤ pool total. If the pool can't back all earmarked savings,
 * pull funds from the lowest-priority unlocked goals first (protecting
 * high-priority and locked goals). Returns the amount reclaimed.
 */
export async function reconcileAllocations(db: SQLite.SQLiteDatabase): Promise<number> {
  const pool = await getPoolSummary(db);
  if (pool.unallocated >= 0) return 0;
  const excess = -pool.unallocated;
  const [goals, saved] = await Promise.all([getGoals(db, true), getGoalSavedMap(db)]);
  const reductions = planReduction(goals.map(g => ({ id: g.id, priority: g.priority, locked: g.locked })), saved, excess);
  if (reductions.length === 0) return 0;

  let reclaimed = 0;
  await db.withTransactionAsync(async () => {
    for (const r of reductions) {
      await insertTxn(db, { goal_id: r.goalId, amount: r.reduceBy, kind: 'withdraw', source: 'auto', date: Date.now(), note: 'Auto-reduced' });
      reclaimed += r.reduceBy;
    }
  });
  return reclaimed;
}

/**
 * Run savings automation: scheduled per-goal funding → (opt-in) leftover sweep →
 * reconcile. The budget-leftover sweep moves unspent budget into the pool, which
 * lowers "Cash available", so it is OFF by default and runs only when the user
 * has enabled it in Settings (`AUTO_SWEEP_KEY`).
 */
export async function runSavingsMaintenance(db: SQLite.SQLiteDatabase): Promise<void> {
  await runAutoFunding(db).catch(() => {});
  if ((await AsyncStorage.getItem(AUTO_SWEEP_KEY)) === 'true') {
    await runLeftoverSweep(db).catch(() => {});
  }
  await reconcileAllocations(db).catch(() => {});
}

// --- Insights (Phase 3) --------------------------------------------------

/** My expense spending by category over the last 30 days, highest first. */
export async function getCategorySpend30d(db: SQLite.SQLiteDatabase): Promise<CategorySpend[]> {
  const me = await getMe(db);
  if (!me) return [];
  const now = Date.now();
  const txns = await getTransactionsInRange(db, null, now - 30 * 86400000, now);
  const map: Record<string, number> = {};
  for (const t of txns) {
    if (t.is_deleted || t.kind !== 'expense') continue;
    const mine = t.shares.find(s => s.personId === me.id)?.amount ?? 0;
    if (mine > 0) map[t.category] = (map[t.category] ?? 0) + mine;
  }
  return Object.entries(map).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
}

/** Your real money — derived cash position across all groups, minus savings. */
export async function getCashPosition(db: SQLite.SQLiteDatabase): Promise<CashPosition> {
  const me = await getMe(db);
  const empty: CashPosition = { available: 0, income: 0, paidExpenses: 0, settledOut: 0, settledIn: 0, savings: 0 };
  if (!me) return empty;
  const [txns, pool] = await Promise.all([
    getTransactionsInRange(db, null, 0, Date.now()),
    getPoolSummary(db),
  ]);
  return computeCash(txns, me.id, pool.total);
}

/** Build psychological savings insights from real goals + spending. */
export async function buildSavingsInsights(db: SQLite.SQLiteDatabase): Promise<Insight[]> {
  const [goals, saved, spend] = await Promise.all([getGoals(db), getGoalSavedMap(db), getCategorySpend30d(db)]);
  if (goals.length === 0) return [];
  return generateInsights({
    goals: goals.map(g => {
      const s = saved[g.id] ?? 0;
      return { id: g.id, name: g.name, saved: s, target: g.target, remaining: Math.max(0, g.target - s), priority: g.priority, allocation: g.allocation, frequency: g.frequency };
    }),
    spend,
  });
}
