import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { planAutoAllocations, planOverspendRaid } from '../../lib/savingsEngine';
import { generateInsights, type Insight, type CategorySpend } from '../../lib/savingsInsights';
import { computeCash, computeTotalMoney, type CashPosition, type TotalMoney } from '../../lib/cash';
import { getMoneyProfile } from './moneyProfile';
import { getAllGroups } from './groups';
import { getMe } from './persons';
import { getTransactionsInRange } from './transactions';
import { getCategoriesByFrequency, type Category } from './categories';
import { getCategoryBudgets, type BudgetCadence } from './categoryBudgets';
import { startOfMonth, endOfMonth, getDaysInMonth } from 'date-fns';

// Domain value sets are defined once in constants/enums.ts; re-exported here for
// existing importers.
import type { Priority, SavingsFrequency, SavingsTxnKind } from '../../constants/enums';
export type { Priority, SavingsFrequency, SavingsTxnKind } from '../../constants/enums';

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
  target_date: number | null;  // optional deadline (epoch ms)
  sort_order: number;          // manual drag rank (lower = funded first)
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

// --- Goals ---------------------------------------------------------------

export async function getGoals(db: SQLite.SQLiteDatabase, includeArchived = false): Promise<SavingsGoal[]> {
  const where = includeArchived ? '' : 'WHERE is_archived = 0';
  // Manual drag rank first (lower = higher priority); newest first as a stable tiebreak
  // before any reordering (all sort_order default to 0 until the user drags).
  return db.getAllAsync<SavingsGoal>(
    `SELECT * FROM savings_goal ${where}
     ORDER BY sort_order ASC, created_at DESC`,
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
  target_date?: number | null;
};

export async function insertGoal(db: SQLite.SQLiteDatabase, g: NewGoal): Promise<SavingsGoal> {
  const id = uuid();
  const now = Date.now();
  // New goals append to the bottom of the manual rank (funded last by default).
  const maxRow = await db.getFirstAsync<{ m: number }>('SELECT COALESCE(MAX(sort_order), -1) AS m FROM savings_goal');
  const sortOrder = (maxRow?.m ?? -1) + 1;
  const row: SavingsGoal = {
    id, name: g.name, target: g.target, priority: g.priority,
    category: g.category ?? null, icon: g.icon ?? null, color: g.color ?? null,
    allocation: g.allocation ?? 0, frequency: g.frequency ?? 'none',
    locked: g.locked ? 1 : 0, is_archived: 0, last_auto_at: null,
    target_date: g.target_date ?? null, sort_order: sortOrder, created_at: now,
  };
  await db.runAsync(
    `INSERT INTO savings_goal (id, name, target, priority, category, icon, color, allocation, frequency, locked, is_archived, target_date, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [row.id, row.name, row.target, row.priority, row.category, row.icon, row.color, row.allocation, row.frequency, row.locked, row.target_date, row.sort_order, row.created_at],
  );
  return row;
}

/** Persist a manual drag order: each id's array position becomes its sort_order. */
export async function reorderGoals(db: SQLite.SQLiteDatabase, orderedIds: string[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.runAsync('UPDATE savings_goal SET sort_order = ? WHERE id = ?', [i, orderedIds[i]]);
    }
  });
}

export async function updateGoal(db: SQLite.SQLiteDatabase, id: string, g: NewGoal): Promise<void> {
  await db.runAsync(
    `UPDATE savings_goal SET name=?, target=?, priority=?, category=?, icon=?, color=?, allocation=?, frequency=?, locked=?, target_date=? WHERE id=?`,
    [g.name, g.target, g.priority, g.category ?? null, g.icon ?? null, g.color ?? null, g.allocation ?? 0, g.frequency ?? 'none', g.locked ? 1 : 0, g.target_date ?? null, id],
  );
}

export async function setGoalLocked(db: SQLite.SQLiteDatabase, id: string, locked: boolean): Promise<void> {
  await db.runAsync('UPDATE savings_goal SET locked=? WHERE id=?', [locked ? 1 : 0, id]);
}

/** Deletes a goal. Its earmarked savings return to Cash available (ledger rows are dropped). */
export async function deleteGoal(db: SQLite.SQLiteDatabase, id: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM savings_txn WHERE goal_id = ?', [id]);
    await db.runAsync('DELETE FROM savings_goal WHERE id = ?', [id]);
  });
}

/** Re-create a goal and its ledger exactly as captured — the undo of `deleteGoal`. */
export async function restoreGoal(db: SQLite.SQLiteDatabase, goal: SavingsGoal, ledger: SavingsTxn[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO savings_goal (id, name, target, priority, category, icon, color, allocation, frequency, locked, is_archived, last_auto_at, target_date, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [goal.id, goal.name, goal.target, goal.priority, goal.category, goal.icon, goal.color, goal.allocation, goal.frequency, goal.locked, goal.is_archived, goal.last_auto_at, goal.target_date, goal.sort_order, goal.created_at],
    );
    for (const t of ledger) {
      await db.runAsync(
        `INSERT INTO savings_txn (id, goal_id, amount, kind, source, date, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [t.id, t.goal_id, t.amount, t.kind, t.source, t.date, t.note ?? null, t.created_at],
      );
    }
  });
}

// --- Ledger (goal funding) -----------------------------------------------

async function insertSavingsTxn(db: SQLite.SQLiteDatabase, t: Omit<SavingsTxn, 'id' | 'created_at'>): Promise<void> {
  await db.runAsync(
    `INSERT INTO savings_txn (id, goal_id, amount, kind, source, date, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), t.goal_id, t.amount, t.kind, t.source, t.date, t.note ?? null, Date.now()],
  );
}

/** Fund a goal directly from Cash available — earmarks money to the goal. */
export async function fundGoal(db: SQLite.SQLiteDatabase, goalId: string, amount: number, source: 'manual' | 'auto' = 'manual', note?: string): Promise<void> {
  if (amount <= 0) return;
  await insertSavingsTxn(db, { goal_id: goalId, amount, kind: 'allocate', source, date: Date.now(), note: note ?? null });
}

/** Pull money back out of a goal, returning it to Cash available. */
export async function withdrawFromGoal(db: SQLite.SQLiteDatabase, goalId: string, amount: number, note?: string): Promise<void> {
  if (amount <= 0) return;
  await insertSavingsTxn(db, { goal_id: goalId, amount, kind: 'withdraw', source: 'manual', date: Date.now(), note: note ?? null });
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

/** Total money currently earmarked across all goals (paise). */
export async function getTotalSaved(db: SQLite.SQLiteDatabase): Promise<number> {
  const map = await getGoalSavedMap(db);
  return Object.values(map).reduce((a, b) => a + Math.max(0, b), 0);
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
 * goal's fixed allocation for every elapsed period from Cash available (priority
 * order when cash is short), then advances each goal's schedule anchor.
 * Idempotent — nothing happens until a full period elapses.
 */
export async function runAutoFunding(db: SQLite.SQLiteDatabase): Promise<boolean> {
  const goals = await getGoals(db);
  const eligible = goals.filter(g => g.allocation > 0 && g.frequency !== 'none');
  if (eligible.length === 0) return false;

  const [saved, cash] = await Promise.all([getGoalSavedMap(db), getCashPosition(db)]);
  const now = Date.now();
  const plan = planAutoAllocations(
    eligible.map(g => ({ id: g.id, target: g.target, allocation: g.allocation, frequency: g.frequency, priority: g.priority, sort_order: g.sort_order, anchor: g.last_auto_at ?? g.created_at })),
    saved, cash.available, now,
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

export type OverspendRaid = { withdrawals: { goalId: string; name: string; amount: number }[]; total: number };

/**
 * If Cash available has gone negative (overspending), cover the deficit by
 * pulling from the lowest-priority unlocked goals first (drag rank). Records the
 * raid as auto goal withdrawals and returns what moved so the Plan screen can
 * show a notice + offer Undo. Investments are never touched.
 */
export async function runOverspendRaid(db: SQLite.SQLiteDatabase): Promise<OverspendRaid> {
  const cash = await getCashPosition(db);
  if (cash.available >= 0) return { withdrawals: [], total: 0 };
  const deficit = -cash.available;
  const [goals, saved] = await Promise.all([getGoals(db), getGoalSavedMap(db)]);
  const raids = planOverspendRaid(
    goals.map(g => ({ id: g.id, priority: g.priority, locked: g.locked, sort_order: g.sort_order })),
    saved, deficit,
  );
  if (raids.length === 0) return { withdrawals: [], total: 0 };

  const nameById = new Map(goals.map(g => [g.id, g.name]));
  const now = Date.now();
  let total = 0;
  await db.withTransactionAsync(async () => {
    for (const r of raids) {
      await db.runAsync(
        `INSERT INTO savings_txn (id, goal_id, amount, kind, source, date, note, created_at)
         VALUES (?, ?, ?, 'withdraw', 'auto', ?, 'Covered overspend', ?)`,
        [uuid(), r.goalId, r.amount, now, now],
      );
      total += r.amount;
    }
  });
  return {
    withdrawals: raids.map(r => ({ goalId: r.goalId, name: nameById.get(r.goalId) ?? 'Goal', amount: r.amount })),
    total,
  };
}

/** Undo an overspend raid by re-funding the goals it pulled from. */
export async function undoOverspendRaid(db: SQLite.SQLiteDatabase, withdrawals: { goalId: string; amount: number }[]): Promise<void> {
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const w of withdrawals) {
      if (w.amount <= 0) continue;
      await insertSavingsTxn(db, { goal_id: w.goalId, amount: w.amount, kind: 'allocate', source: 'auto', date: now, note: 'Undo overspend cover' });
    }
  });
}

/**
 * Run savings automation: scheduled per-goal funding (from Cash available) →
 * overspend raid (pull lowest-priority goals when cash goes negative). Returns
 * the raid result so the caller can surface a notice.
 */
export async function runSavingsMaintenance(db: SQLite.SQLiteDatabase): Promise<OverspendRaid> {
  await runAutoFunding(db).catch(() => {});
  return runOverspendRaid(db).catch(() => ({ withdrawals: [], total: 0 }));
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

/** Your real money — derived cash position across all groups, minus money in goals. */
export async function getCashPosition(db: SQLite.SQLiteDatabase): Promise<CashPosition> {
  const me = await getMe(db);
  const empty: CashPosition = { available: 0, openingCash: 0, income: 0, paidExpenses: 0, settledOut: 0, settledIn: 0, savings: 0 };
  if (!me) return empty;
  const [txns, savedTotal, profile] = await Promise.all([
    getTransactionsInRange(db, null, 0, Date.now()),
    getTotalSaved(db),
    getMoneyProfile(db),
  ]);
  return computeCash(txns, me.id, savedTotal, profile.openingCash);
}

/** The single "Total Money" figure + breakdown for the Plan screen. */
export async function getTotalMoney(db: SQLite.SQLiteDatabase): Promise<TotalMoney> {
  const [cash, profile] = await Promise.all([getCashPosition(db), getMoneyProfile(db)]);
  return computeTotalMoney(cash, profile);
}

// --- "Can I afford this?" snapshot ---------------------------------------

/** Per-category context feeding the afford engine (all paise). */
export type AffordCategoryStat = { spentThisMonth: number; norm: number; budget?: number };

export type AffordSnapshot = {
  /** Spendable cash right now. */
  available: number;
  /** My share of expenses dated from now to month-end (committed bills). */
  upcomingBills: number;
  /** Last-30-day income, used as a typical-monthly-income proxy. */
  monthlyIncome: number;
  /** Personal-ledger expense categories, for the picker. */
  categories: Category[];
  /** Per-category spend-this-month, 30-day norm, and monthly budget (if set). */
  byCategory: Record<string, AffordCategoryStat>;
};

const AFFORD_DAY_MS = 86_400_000;

/** Normalize a budget line of any cadence to its monthly-equivalent paise. */
function monthlyBudgetEquivalent(cadence: BudgetCadence, amount: number, daysInMonth: number): number | undefined {
  switch (cadence) {
    case 'monthly': return amount;
    case 'yearly': return Math.round(amount / 12);
    case 'daily': return amount * daysInMonth;
    case 'once': return undefined; // a one-off isn't a recurring monthly cap
    default: return undefined;
  }
}

/**
 * Everything the "Can I afford this?" engine needs, in one round-trip: cash,
 * committed upcoming bills, a monthly-income proxy, the categories you can pick,
 * and — per category — how much you've spent this month, your 30-day norm, and
 * any explicit monthly budget. Keeping the gathering here makes the screen thin
 * and the inputs reproducible.
 */
export async function getAffordSnapshot(db: SQLite.SQLiteDatabase): Promise<AffordSnapshot> {
  const empty: AffordSnapshot = { available: 0, upcomingBills: 0, monthlyIncome: 0, categories: [], byCategory: {} };
  const me = await getMe(db);
  if (!me) return empty;

  const now = Date.now();
  const today = new Date(now);
  const monthStart = startOfMonth(today).getTime();
  const monthEnd = endOfMonth(today).getTime();
  const daysInMonth = getDaysInMonth(today);

  const groups = await getAllGroups(db);
  const personal = groups.find(g => g.is_personal === 1) ?? groups[0] ?? null;

  const [pos, categories, budgets, monthTxns, recentTxns, futureTxns] = await Promise.all([
    getCashPosition(db),
    personal ? getCategoriesByFrequency(db, personal.id) : Promise.resolve([] as Category[]),
    personal ? getCategoryBudgets(db, personal.id) : Promise.resolve([]),
    getTransactionsInRange(db, null, monthStart, now),
    getTransactionsInRange(db, null, now - 30 * AFFORD_DAY_MS, now),
    getTransactionsInRange(db, null, now, monthEnd),
  ]);

  const myShare = (t: { shares: Array<{ personId: string; amount: number }> }) =>
    t.shares.find(s => s.personId === me.id)?.amount ?? 0;

  // This-month spend per category (my share).
  const spentThisMonth: Record<string, number> = {};
  for (const t of monthTxns) {
    if (t.is_deleted || t.kind !== 'expense') continue;
    const mine = myShare(t);
    if (mine > 0) spentThisMonth[t.category] = (spentThisMonth[t.category] ?? 0) + mine;
  }

  // 30-day norm per category (my share) + 30-day income (monthly-income proxy).
  const norm: Record<string, number> = {};
  let monthlyIncome = 0;
  for (const t of recentTxns) {
    if (t.is_deleted) continue;
    if (t.kind === 'expense') {
      const mine = myShare(t);
      if (mine > 0) norm[t.category] = (norm[t.category] ?? 0) + mine;
    } else if (t.kind === 'income') {
      monthlyIncome += t.payments.reduce((s, p) => s + p.amount, 0);
    }
  }

  // Committed bills: my share of future-dated expenses through month-end.
  let upcomingBills = 0;
  for (const t of futureTxns) {
    if (t.is_deleted || t.kind !== 'expense') continue;
    upcomingBills += myShare(t);
  }

  // Budgets, normalized to a monthly figure.
  const budgetByCat: Record<string, number> = {};
  for (const b of budgets) {
    const m = monthlyBudgetEquivalent(b.cadence, b.amount, daysInMonth);
    if (m && m > 0) budgetByCat[b.category] = m;
  }

  const byCategory: Record<string, AffordCategoryStat> = {};
  const names = new Set<string>([
    ...categories.map(c => c.name),
    ...Object.keys(spentThisMonth),
    ...Object.keys(norm),
    ...Object.keys(budgetByCat),
  ]);
  for (const name of names) {
    byCategory[name] = {
      spentThisMonth: spentThisMonth[name] ?? 0,
      norm: norm[name] ?? 0,
      budget: budgetByCat[name],
    };
  }

  return { available: pos.available, upcomingBills, monthlyIncome, categories, byCategory };
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
