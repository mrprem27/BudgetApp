import type * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { planAutoAllocations, planOverspendRaid, planSurplusSweep } from '../../lib/savingsEngine';
import { settings } from '../../lib/settings';
import { generateInsights, type Insight, type CategorySpend } from '../../lib/savingsInsights';
import { cashPositionFromTotals, computeTotalMoney, openingTotal, type CashPosition, type CashTotals, type TotalMoney } from '../../lib/cash';
import { CASH_TOTALS_SQL, BUCKET_FLOWS_SQL } from './cashQuery';
import type { AssetBucket } from '../../constants/enums';
import { getMoneyProfile, type MoneyProfileWithMeta } from './moneyProfile';
import { getMe } from './persons';
import { getTransactionsInRange } from './transactions';
import { myShareOf } from '../../lib/splitMath';
import { getMyExposure } from './balances';
import { queueDelete, queueUpsert } from './syncQueue';

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
  /**
   * Which bucket this money moved to or from — bank, cash or wallet.
   *
   * Null means unknown, not a default: every row written before this column
   * existed has none, and a withdrawal against an unattributed balance asks rather
   * than guessing. See the migration comment in `schema.ts`.
   */
  source_asset: AssetBucket | null;
  created_at: number;
};

// --- Goals ---------------------------------------------------------------

export async function getGoals(db: SQLite.SQLiteDatabase, includeArchived = false): Promise<SavingsGoal[]> {
  const where = includeArchived ? '' : 'WHERE is_archived = 0';
  // Flat, unsectioned order: drag rank first, newest first as a stable tiebreak
  // before any reordering (all sort_order default to 0 until the user drags).
  // Callers that need the three priority sections (Emergency/Need/Want) group
  // this by `priority` themselves — see `loadSavingsTabData`.
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
  await queueUpsert(db, 'savings_goal', id);
  return row;
}

/**
 * Persist a manual drag order: each id's array position becomes its `sort_order`.
 *
 * `orderedIds` is only the goals the drag list showed — the *active* ones — but
 * `sort_order` is a single ranking over **every** goal. Writing `0..n-1` for just
 * that subset left completed goals holding stale values from a previous ordering,
 * so they interleaved: a completed goal with `sort_order = 1` sat between the two
 * active goals the user had just placed 1st and 3rd, and both the funding order
 * and the raid order read that combined ranking. Goals not in `orderedIds` are
 * therefore pushed below the ones that are, keeping the permutation total.
 */
export async function reorderGoals(db: SQLite.SQLiteDatabase, orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.runAsync('UPDATE savings_goal SET sort_order = ? WHERE id = ?', [i, orderedIds[i]]);
      await queueUpsert(db, 'savings_goal', orderedIds[i]);
    }
    // Everything the caller did not rank keeps its relative order, but strictly
    // after the ranked block. Ordered by (sort_order, created_at) so the result is
    // deterministic even when the untouched rows all still hold the default 0.
    const placeholders = orderedIds.map(() => '?').join(',');
    const rest = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM savings_goal WHERE id NOT IN (${placeholders})
       ORDER BY sort_order ASC, created_at ASC`,
      orderedIds,
    );
    for (let j = 0; j < rest.length; j++) {
      await db.runAsync(
        'UPDATE savings_goal SET sort_order = ? WHERE id = ?', [orderedIds.length + j, rest[j].id],
      );
      await queueUpsert(db, 'savings_goal', rest[j].id);
    }
  });
}

export async function updateGoal(db: SQLite.SQLiteDatabase, id: string, g: NewGoal): Promise<void> {
  await db.runAsync(
    `UPDATE savings_goal SET name=?, target=?, priority=?, category=?, icon=?, color=?, allocation=?, frequency=?, locked=?, target_date=? WHERE id=?`,
    [g.name, g.target, g.priority, g.category ?? null, g.icon ?? null, g.color ?? null, g.allocation ?? 0, g.frequency ?? 'none', g.locked ? 1 : 0, g.target_date ?? null, id],
  );
  await queueUpsert(db, 'savings_goal', id);
}

export async function setGoalLocked(db: SQLite.SQLiteDatabase, id: string, locked: boolean): Promise<void> {
  await db.runAsync('UPDATE savings_goal SET locked=? WHERE id=?', [locked ? 1 : 0, id]);
  await queueUpsert(db, 'savings_goal', id);
}

/** Deletes a goal. Its earmarked savings return to Cash available (ledger rows are dropped). */
export async function deleteGoal(db: SQLite.SQLiteDatabase, id: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    const ledger = await db.getAllAsync<{ id: string }>('SELECT id FROM savings_txn WHERE goal_id = ?', [id]);
    await db.runAsync('DELETE FROM savings_txn WHERE goal_id = ?', [id]);
    await db.runAsync('DELETE FROM savings_goal WHERE id = ?', [id]);
    // The ledger first: on the server its rows point at the goal.
    for (const t of ledger) await queueDelete(db, 'savings_txn', t.id, { id: t.id });
    await queueDelete(db, 'savings_goal', id, { id });
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
    await queueUpsert(db, 'savings_goal', goal.id);
    for (const t of ledger) {
      await db.runAsync(
        // Stays a raw INSERT because it restores the ORIGINAL id and created_at,
        // which `insertSavingsTxn` deliberately mints fresh. It must still carry
        // every column, or an undo silently strips the provenance it is restoring.
        `INSERT INTO savings_txn (id, goal_id, amount, kind, source, date, note, source_asset, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [t.id, t.goal_id, t.amount, t.kind, t.source, t.date, t.note ?? null, t.source_asset ?? null, t.created_at],
      );
      await queueUpsert(db, 'savings_txn', t.id);
    }
  });
}

// --- Ledger (goal funding) -----------------------------------------------

/**
 * The ONE place a savings ledger row is written.
 *
 * Three other sites used to hand-roll this INSERT — `restoreGoal`,
 * `runAutoFunding` and `applyOverspendRaid` — which is how `source_asset` would
 * have landed in one of them and been forgotten in the rest. A ledger with holes
 * in its provenance is worse than one with none, because the gaps are invisible.
 */
async function insertSavingsTxn(db: SQLite.SQLiteDatabase, t: Omit<SavingsTxn, 'id' | 'created_at'>): Promise<void> {
  const id = uuid();
  await db.runAsync(
    `INSERT INTO savings_txn (id, goal_id, amount, kind, source, date, note, source_asset, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, t.goal_id, t.amount, t.kind, t.source, t.date, t.note ?? null, t.source_asset ?? null, Date.now()],
  );
  await queueUpsert(db, 'savings_txn', id);
}

/**
 * Fund a goal — earmarks money to it, out of one bucket.
 *
 * `sourceAsset` is what a later withdrawal returns to. Optional because a caller
 * genuinely may not know (an old flow, a fixture); null records that honestly
 * rather than picking a bucket that would then be silently drained on the way back.
 */
export async function fundGoal(
  db: SQLite.SQLiteDatabase,
  goalId: string,
  amount: number,
  source: 'manual' | 'auto' = 'manual',
  note?: string,
  sourceAsset: AssetBucket | null = null,
): Promise<void> {
  if (amount <= 0) return;
  await insertSavingsTxn(db, { goal_id: goalId, amount, kind: 'allocate', source, date: Date.now(), note: note ?? null, source_asset: sourceAsset });
}

/**
 * Pull money back out of a goal, into a named bucket.
 *
 * `toAsset` is the destination, and it must be one this goal was actually funded
 * from — `fundedByAsset` below is what bounds it. Sweeping ₹5,000 out of the bank
 * and handing it back as cash is not a round trip; it rewrites where the user's
 * money is, quietly, and every figure built on that is then wrong.
 *
 * Null is allowed and means "we do not know where this came from" — the only
 * honest answer for a goal funded before the column existed.
 */
export async function withdrawFromGoal(
  db: SQLite.SQLiteDatabase,
  goalId: string,
  amount: number,
  note?: string,
  toAsset: AssetBucket | null = null,
): Promise<void> {
  if (amount <= 0) return;
  await insertSavingsTxn(db, { goal_id: goalId, amount, kind: 'withdraw', source: 'manual', date: Date.now(), note: note ?? null, source_asset: toAsset });
}

/**
 * What a goal holds, split by the bucket it came from — allocations minus
 * withdrawals, per asset.
 *
 * This is what makes a withdrawal bounded rather than a guess. A goal funded
 * ₹3,000 from bank and ₹2,000 from wallet cannot return ₹4,000 to the bank, and
 * `source_asset` on a single row does not say that — only the per-bucket balance
 * does. FIFO or pro-rata would be inventing a fact about money.
 *
 * The `null` key is the pre-column balance: real, and deliberately not attributed.
 */
export async function fundedByAsset(
  db: SQLite.SQLiteDatabase,
  goalId: string,
): Promise<Record<string, number>> {
  const rows = await db.getAllAsync<{ source_asset: string | null; net: number }>(
    `SELECT source_asset,
            COALESCE(SUM(CASE WHEN kind = 'allocate' THEN amount
                              WHEN kind = 'withdraw' THEN -amount ELSE 0 END), 0) AS net
       FROM savings_txn WHERE goal_id = ? GROUP BY source_asset`,
    [goalId],
  );
  const out: Record<string, number> = {};
  for (const r of rows) if (r.net !== 0) out[r.source_asset ?? 'unknown'] = r.net;
  return out;
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

/** How many ledger rows the goal screen renders. It draws them in a ScrollView,
 *  so this is what keeps an old goal with hundreds of contributions from
 *  mounting every row at once. */
export const GOAL_HISTORY_PAGE = 50;

/**
 * A goal's contribution ledger, newest first.
 *
 * `limit` bounds it for display. Pass `null` for the COMPLETE ledger — the
 * delete-with-undo path needs every row to restore the goal faithfully, so it
 * must not be capped.
 */
export async function getGoalHistory(
  db: SQLite.SQLiteDatabase,
  goalId: string,
  limit: number | null = GOAL_HISTORY_PAGE,
): Promise<SavingsTxn[]> {
  const clause = limit === null ? '' : ` LIMIT ${Math.max(1, Math.floor(limit))}`;
  return db.getAllAsync<SavingsTxn>(
    `SELECT * FROM savings_txn WHERE goal_id = ? ORDER BY date DESC, created_at DESC${clause}`,
    [goalId],
  );
}

/** Total ledger rows for a goal — lets the screen say "showing 50 of 214". */
export async function getGoalHistoryCount(db: SQLite.SQLiteDatabase, goalId: string): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM savings_txn WHERE goal_id = ?', [goalId],
  );
  return row?.n ?? 0;
}

// --- Auto-funding (Phase 2) ---------------------------------------------

/**
 * Catch-up auto-funding. Runs cheaply on app open / Savings focus: funds each
 * goal's fixed allocation for every elapsed period from Cash available
 * (emergency → need → want, then drag rank, when cash is short), then advances
 * each goal's schedule anchor. Idempotent — nothing happens until a full period
 * elapses.
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
        await insertSavingsTxn(db, {
          goal_id: a.goalId, amount: a.amount, kind: 'allocate', source: 'auto',
          date: now, note: null,
          // Where scheduled funding draws from. Bank, because that is where a
          // standing transfer comes from for almost everyone — and because it is
          // the bucket `INCOME_LANDING_DEFAULT` puts salary into, so the money
          // being swept is the money that arrived.
          source_asset: 'bank',
        });
      }
      await db.runAsync('UPDATE savings_goal SET last_auto_at = ? WHERE id = ?', [a.newAnchor, a.goalId]);
      await queueUpsert(db, 'savings_goal', a.goalId);
    }
  });
  return true;
}

export type OverspendRaid = { withdrawals: { goalId: string; name: string; amount: number }[]; total: number };

/**
 * If Cash available has gone negative (overspending), cover the deficit by
 * pulling from `want`-tagged goals first, then `need` — `emergency` and
 * `locked` goals are never touched, and drag rank breaks ties within a tag.
 * Records the raid as auto goal withdrawals and returns what moved so the Plan
 * screen can show a notice + offer Undo. Investments are never touched.
 */
/**
 * What a raid *would* take, without taking it (`V2-10`).
 *
 * Splitting propose from apply is the whole fix. Money used to move out of goals
 * during app boot, with an after-the-fact notice — and `COMPETITIVE_ANALYSIS.md` §7
 * asked whether that was right and never got an answer. No competitor auto-transfers
 * between goals, so there was no evidence users read it as reassuring, and "unlocked"
 * was a trap default: it meant "may be spent without asking", which is not what the
 * word implies.
 */
export async function proposeOverspendRaid(db: SQLite.SQLiteDatabase): Promise<OverspendRaid> {
  const cash = await getCashPosition(db);
  if (cash.available >= 0) return { withdrawals: [], total: 0 };

  // Money owed to me offsets the shortfall before any goal is touched: fronting a
  // group bill drops cash by the full amount while most of it is on its way back,
  // and `CASH_TOTALS_SQL` has no receivable term.
  //
  // Deliberately NOT mirrored into `lib/safeToSpend.ts`, which excludes owed-to-me
  // on purpose (see its note at :30). A receivable is not spendable, but it IS a
  // reason not to liquidate. Don't unify the two call sites.
  //
  // Only `expected` receivables offset. A balance you have written off is money you
  // have decided is not coming back, so covering a shortfall with it would be
  // covering it with nothing — and the cost of being wrong here is a liquidated
  // savings goal.
  const me = await getMe(db);
  const owedToMe = me ? (await getMyExposure(db, me.id)).owedExpected : 0;
  const shortfall = Math.max(0, -cash.available - owedToMe);
  if (shortfall === 0) return { withdrawals: [], total: 0 };

  const [goals, saved] = await Promise.all([getGoals(db), getGoalSavedMap(db)]);
  const raids = planOverspendRaid(
    goals.map(g => ({ id: g.id, priority: g.priority, locked: g.locked, sort_order: g.sort_order, target: g.target })),
    saved, shortfall,
  );
  const nameById = new Map(goals.map(g => [g.id, g.name]));
  return {
    withdrawals: raids.map(r => ({ goalId: r.goalId, name: nameById.get(r.goalId) ?? 'Goal', amount: r.amount })),
    total: raids.reduce((s, r) => s + r.amount, 0),
  };
}

/**
 * Actually move the money, for a plan the user has agreed to.
 *
 * Takes the withdrawals rather than recomputing so that what was shown is exactly
 * what happens — re-planning here could quietly raid a different goal than the one
 * named in the prompt if anything changed in between.
 */
export async function applyOverspendRaid(
  db: SQLite.SQLiteDatabase,
  withdrawals: { goalId: string; name: string; amount: number }[],
): Promise<OverspendRaid> {
  const chosen = withdrawals.filter(w => w.amount > 0);
  if (chosen.length === 0) return { withdrawals: [], total: 0 };
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const r of chosen) {
      await insertSavingsTxn(db, {
        goal_id: r.goalId, amount: r.amount, kind: 'withdraw', source: 'auto',
        date: now, note: 'Covered overspend',
        // Null on purpose: a raid covers a shortfall in the pooled figure, not in
        // one named bucket, so there is no honest asset to name here yet. Naming
        // one would make the undo put money back somewhere it never came from.
        source_asset: null,
      });
    }
  });
  return { withdrawals: chosen, total: chosen.reduce((s, r) => s + r.amount, 0) };
}

/**
 * Push what is left of an underspent month into the goals that are short.
 *
 * Applies rather than proposes, unlike the raid — and the asymmetry is the same
 * one `runSavingsMaintenance` already draws. This moves money *into* goals, which
 * is what the user opted in for; the raid takes money *out*, which needs a yes
 * every time.
 *
 * `planSurplusSweep` refuses rather than guesses (no real surplus, no single
 * bucket that covers it, nothing short), so a no-op here is the normal case and
 * not a failure.
 */
export async function runSurplusSweep(db: SQLite.SQLiteDatabase): Promise<void> {
  const [goals, saved, cash] = await Promise.all([
    getGoals(db), getGoalSavedMap(db), getCashPosition(db),
  ]);
  // Only what is genuinely spare, and only from buckets we can name. The
  // unattributed remainder is excluded on purpose: sweeping money whose origin we
  // never recorded would create exactly the un-returnable balance this feature
  // exists to prevent.
  const surplus = Math.max(0, cash.available);
  // `anchor` is the scheduled-funding clock and means nothing to a sweep, but
  // `GoalLike` carries it — mapped rather than loosened, so the scheduled planner
  // keeps requiring it.
  const plan = planSurplusSweep(
    goals.map(g => ({ ...g, anchor: g.last_auto_at ?? g.created_at })),
    saved, surplus, cash.byBucket ?? {},
  );
  if (plan.length === 0) return;

  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const a of plan) {
      await insertSavingsTxn(db, {
        goal_id: a.goalId, amount: a.amount, kind: 'allocate', source: 'auto',
        date: now, note: 'Swept from surplus', source_asset: a.sourceAsset,
      });
    }
  });
}

/** Undo an overspend raid by re-funding the goals it pulled from. */
export async function undoOverspendRaid(db: SQLite.SQLiteDatabase, withdrawals: { goalId: string; amount: number }[]): Promise<void> {
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const w of withdrawals) {
      if (w.amount <= 0) continue;
      // No asset: an undo puts back what the raid took, and the raid recorded
      // where that went. Attributing it here would be guessing twice.
      await insertSavingsTxn(db, { goal_id: w.goalId, amount: w.amount, kind: 'allocate', source: 'auto', date: now, note: 'Undo overspend cover', source_asset: null });
    }
  });
}

/**
 * Run savings automation: scheduled per-goal funding (from Cash available) →
 * overspend raid (pull from `want`/`need` goals when cash goes negative,
 * never `emergency` or locked). Returns the raid result so the caller can
 * surface a notice.
 */
export async function runSavingsMaintenance(db: SQLite.SQLiteDatabase): Promise<OverspendRaid> {
  await runAutoFunding(db).catch(() => {});
  // Opt-in and off by default — see `settings.autoSweep`. It moves real money into
  // goals, so it runs only for someone who asked for it.
  if (await settings.autoSweep().catch(() => false)) {
    await runSurplusSweep(db).catch(() => {});
  }
  // Proposes only. Scheduled funding still runs unattended — the user set that up on
  // purpose and it moves money *into* goals. Taking money *out* now needs a yes.
  return proposeOverspendRaid(db).catch(() => ({ withdrawals: [], total: 0 }));
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
    const mine = myShareOf(t, me.id);
    if (mine > 0) map[t.category] = (map[t.category] ?? 0) + mine;
  }
  return Object.entries(map).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
}

/** Your real money — derived cash position across all groups, minus money in goals. */
export async function getCashPosition(
  db: SQLite.SQLiteDatabase,
  /**
   * An already-loaded profile, when the caller has one.
   *
   * Reading it is no longer just a KV lookup: `investments` is derived from the
   * asset register, so every `getMoneyProfile` is now an aggregate too. This
   * function and `getTotalMoney` used to read it separately, so Plan issued four
   * of them per load and Home five — twice each, since the savings tab's focus
   * effect reloads. `asset` is tiny, so this was never going to be slow; it was
   * simply the same question asked five times.
   */
  preloaded?: MoneyProfileWithMeta,
  /**
   * The cutoff every query below reads against. Defaults to `Date.now()` — the
   * only behavior every existing caller sees. A caller asking "what was cash
   * as of `asOfMs`" (the money engine's back-test, `EN8`) gets a real
   * historical figure instead — `CASH_TOTALS_SQL`'s own cutoff parameter was
   * already there, just always bound to `Date.now()` rather than exposed.
   * `getTotalSaved` stays date-unbound (a known simplification, `SPEC-ENGINE.md`
   * §12b) — none of the back-test's fixture personas ever record a savings
   * deposit, so it reads 0 either way for them; a real ledger with savings
   * activity would need this too before the back-test could trust `available`
   * for a date with money already saved by then.
   */
  asOfMs: number = Date.now(),
): Promise<CashPosition> {
  const me = await getMe(db);
  const empty: CashPosition = { available: 0, openingCash: 0, income: 0, paidExpenses: 0, settledOut: 0, settledIn: 0, savings: 0, cardSpend: 0 };
  if (!me) return empty;
  // Aggregate the four running sums in SQL instead of loading every txn + all its
  // split rows across all history and reducing in JS. Parity with computeCash() is
  // locked by cashSql.test.ts.
  // `cardBaselineAt` — NOT `updatedAt` — bounds the card-spend window, so it's read before
  // the totals query rather than alongside it. Using the general "last edited" stamp meant
  // any Plan edit re-based the window and erased the card spend it was measuring.
  const profile = preloaded ?? await getMoneyProfile(db);
  const [row, savedTotal] = await Promise.all([
    db.getFirstAsync<CashTotals>(CASH_TOTALS_SQL, [profile.cardBaselineAt ?? 0, profile.cardBaselineAt ?? 0, me.id, me.id, asOfMs]),
    getTotalSaved(db),
  ]);
  const totals: CashTotals = row ?? { income: 0, paidExpenses: 0, settledOut: 0, settledIn: 0, cardSpend: 0 };
  // The SUM, not one bucket — see `openingTotal`. This is the line that keeps
  // every downstream figure identical across the bucket split.
  const pos = cashPositionFromTotals(totals, savedTotal, openingTotal(profile));

  /*
   * Where that money actually sits. Additive detail: `available` above is
   * untouched, and every analytical consumer keeps reading it.
   *
   * `unattributed` is the honest remainder — movement on entries whose pay method
   * was never recorded. It is real money, counted in the total, that we decline to
   * assign to a bucket rather than guessing and quietly draining one.
   */
  const flows = await db.getAllAsync<{ bucket: string | null; delta: number }>(
    BUCKET_FLOWS_SQL, [me.id, me.id, asOfMs],
  );
  const flowOf = (b: AssetBucket) => flows.find(f => f.bucket === b)?.delta ?? 0;
  pos.byBucket = {
    bank:   profile.openingBank   + flowOf('bank'),
    cash:   profile.openingCash   + flowOf('cash'),
    wallet: profile.openingWallet + flowOf('wallet'),
  };
  pos.unattributed = flows.find(f => f.bucket === null)?.delta ?? 0;
  return pos;
}

/** The single "Total Money" figure + breakdown for the Plan screen. */
export async function getTotalMoney(db: SQLite.SQLiteDatabase): Promise<TotalMoney> {
  // One profile read, handed down — see `getCashPosition`'s `preloaded`.
  const profile = await getMoneyProfile(db);
  return computeTotalMoney(await getCashPosition(db, profile), profile);
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
