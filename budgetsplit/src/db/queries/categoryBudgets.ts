import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';

import type { BudgetCadence } from '../../constants/enums';
import { resolveBudgetLines } from '../../lib/budget';
import { getGroupContext, getPersonalGroup } from './groups';
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
  /** Required: omitting it silently returned defaults only, dropping every override. */
  meId: string,
): Promise<CategoryBudget[]> {
  return resolveBudgetLines(await getCategoryBudgetRows(db, groupId), meId);
}

/**
 * **My Budget** — the global one, resolved for me. The Personal group's lines (see
 * the model note in `lib/budget`); empty when there is no Personal group, never a
 * substitute group's lines.
 */
export async function getMyGlobalBudgetRows(
  db: SQLite.SQLiteDatabase,
  meId: string,
): Promise<CategoryBudget[]> {
  const personal = await getPersonalGroup(db);
  return personal ? getCategoryBudgets(db, personal.id, meId) : [];
}

/** Write My Budget. Throws when there is no Personal group rather than picking one. */
export async function setMyGlobalBudget(
  db: SQLite.SQLiteDatabase,
  entries: Array<{ category: string; cadence: BudgetCadence; amount: number }>,
  opts: { actorId: string },
): Promise<void> {
  const personal = await getPersonalGroup(db);
  if (!personal) throw new Error('No personal group: cannot save My Budget');
  // Level 'group' on the Personal group IS the global level — `person_id IS NULL`.
  await setCategoryBudgets(db, personal.id, entries, { level: 'group', actorId: opts.actorId });
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

  /*
   * A whole-level replace, but only over the categories the editor could actually
   * show.
   *
   * `entries` is built from the caller's own catalog, and a budget line can name a
   * category that catalog does not contain — `category_budget.category` is a name,
   * not a foreign key, which is the whole reason `foldBudgetStatuses` exists. A
   * blanket DELETE therefore erased any line the editor was unable to render: an
   * admin opening the group budget and pressing Save would silently drop a Gym
   * default they had never seen, and nothing would report it.
   *
   * So rows are preserved when their category is neither in the catalog nor in the
   * submitted entries — i.e. exactly the rows that were folded into `Others` and
   * could not have been edited.
   */
  const known = new Set(
    (await db.getAllAsync<{ name: string }>("SELECT name FROM category WHERE kind = 'expense'"))
      .map(r => r.name),
  );
  const submitted = new Set(entries.map(e => e.category));
  const existing = await db.getAllAsync<{ id: string; category: string }>(
    personId === null
      ? 'SELECT id, category FROM category_budget WHERE group_id = ? AND person_id IS NULL'
      : 'SELECT id, category FROM category_budget WHERE group_id = ? AND person_id = ?',
    personId === null ? [groupId] : [groupId, personId],
  );
  const doomed = existing
    .filter(r => known.has(r.category) || submitted.has(r.category))
    .map(r => r.id);

  await db.withTransactionAsync(async () => {
    for (const id of doomed) {
      await db.runAsync('DELETE FROM category_budget WHERE id = ?', [id]);
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
