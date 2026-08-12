import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';

import type { BudgetCadence } from '../../constants/enums';
import { resolveBudgetLines } from '../../lib/budget';
import { getGroupContext } from './groups';
import { canEditGroupBudget, canSetOverrideFor, PermissionError } from '../../lib/permissions';
export type { BudgetCadence } from '../../constants/enums';

export type CategoryBudget = {
  id: string;
  group_id: string;
  category: string;
  cadence: BudgetCadence;
  amount: number; // paise
  /** NULL = the group default every member inherits. Set = that person's override. */
  person_id: string | null;
};

/** Which level a write targets. */
export type BudgetLevel = 'group' | 'personal';

/**
 * All budget lines for a group — one per category, each with its own cadence.
 * Budget cadence is independent of transaction recurrence (Spec §18).
 */
/** Every raw line for a group, both levels, unresolved. */
export async function getCategoryBudgetRows(
  db: SQLite.SQLiteDatabase,
  groupId: string,
): Promise<CategoryBudget[]> {
  const rows = await db.getAllAsync<CategoryBudget & { period?: string }>(
    // Deterministic order so the de-dupe below is stable: 'monthly' sorts after
    // 'yearly' under DESC, so a monthly line deterministically wins the tiebreak.
    `SELECT id, group_id, category, cadence, amount, person_id FROM category_budget
      WHERE group_id = ? ORDER BY cadence DESC, id ASC`,
    [groupId],
  );
  // De-dupe by (category, level) — legacy data may have had monthly+yearly rows.
  const byKey = new Map<string, CategoryBudget>();
  for (const r of rows) {
    byKey.set(`${r.person_id ?? ''}|${r.category}`, {
      id: r.id, group_id: r.group_id, category: r.category,
      cadence: (r.cadence ?? 'monthly') as BudgetCadence, amount: r.amount,
      person_id: r.person_id ?? null,
    });
  }
  return Array.from(byKey.values());
}

/**
 * The lines that apply **to `meId`** — their overrides where they have them, the
 * group default everywhere else. This is what every reader wants, which is why it
 * keeps the original name: a caller that reached for the raw rows by accident
 * would silently ignore overrides.
 */
export async function getCategoryBudgets(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  meId?: string,
): Promise<CategoryBudget[]> {
  return resolveBudgetLines(await getCategoryBudgetRows(db, groupId), meId);
}

/**
 * Replace the full set of budget lines **at one level**, in one transaction.
 *
 * The two levels never touch each other: writing your override leaves the group
 * default intact (so "revert to default" is just deleting your row), and an admin
 * editing the default leaves everyone's overrides alone.
 *
 * Entries with amount <= 0 are dropped, which is how a line is removed. The legacy
 * `period` column is written as a constant; uniqueness comes from the two partial
 * indexes in `schema.ts` — a plain UNIQUE could not express it, because SQL treats
 * NULL `person_id`s as distinct and would allow unlimited duplicate defaults.
 */
export async function setCategoryBudgets(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  entries: Array<{ category: string; cadence: BudgetCadence; amount: number }>,
  opts: { level: BudgetLevel; actorId: string },
): Promise<void> {
  const ctx = await getGroupContext(db, groupId, opts.actorId);
  if (opts.level === 'group') {
    if (!canEditGroupBudget(ctx)) throw new PermissionError('edit this group\'s budget');
  } else if (!canSetOverrideFor(ctx, opts.actorId)) {
    throw new PermissionError('set a personal budget in this group');
  }
  const personId = opts.level === 'group' ? null : opts.actorId;

  await db.withTransactionAsync(async () => {
    if (personId === null) {
      await db.runAsync('DELETE FROM category_budget WHERE group_id = ? AND person_id IS NULL', [groupId]);
    } else {
      await db.runAsync('DELETE FROM category_budget WHERE group_id = ? AND person_id = ?', [groupId, personId]);
    }
    for (const e of entries) {
      if (e.amount > 0) {
        await db.runAsync(
          'INSERT INTO category_budget (id, group_id, category, period, cadence, amount, person_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [uuid(), groupId, e.category, 'monthly', e.cadence, e.amount, personId],
        );
      }
    }
  });
}
