import { canRead, groupContext } from '../utils/access';
import { guard, versionIs } from '../utils/guard';
import { bumpScope, clean, createdAt, Rejected, SCOPE_SEQ, type CustomSpec, type Mutation, type PushContext } from '../utils/mutation';
import { canEditGroupBudget, canSetOverrideFor, syncIds } from '../rules';
import { activity } from './groups';

/**
 * A budget line in a group (SPEC-SERVER.md §2.6). Money, so compare-and-set.
 *
 *   * A DEFAULT line (person_id NULL) is the group's — admins only (`canEditGroupBudget`).
 *   * An OVERRIDE is one person's own, and nobody else may set it, not even an admin
 *     (`canSetOverrideFor`) — the app's own rules, imported.
 *
 * The id is the line's natural key, `group:category:person|*`. The phone saves a
 * budget by replacing every line wholesale with fresh ids; a derived id turns that
 * into updates of the same rows rather than a delete-and-create churn that would
 * collide with the unique index mid-push.
 */

const COLUMNS = ['group_id', 'category', 'cadence', 'amount', 'person_id'] as const;

const budgetId = syncIds.budget;

async function writeBudget(ctx: PushContext, m: Mutation): Promise<D1PreparedStatement[]> {
  const { db, userId, now } = ctx;
  const existing = await db.prepare('SELECT group_id, category, person_id, version, deleted_at FROM budgets WHERE id = ?')
    .bind(m.entityId).first<{ group_id: string; category: string; person_id: string | null; version: number; deleted_at: number | null }>();
  const data = m.op === 'upsert' ? clean('budgets', COLUMNS, m.data ?? {}) : {};

  const groupId = (existing?.group_id ?? data.group_id) as string | undefined;
  const personId = (existing ? existing.person_id : (data.person_id ?? null)) as string | null;
  if (typeof groupId !== 'string') throw new Rejected('invalid', 'budgets.group_id is required');

  if (m.op === 'upsert') {
    if (typeof data.category !== 'string') throw new Rejected('invalid', 'budgets.category is required');
    const expected = budgetId(groupId, data.category, (data.person_id ?? null) as string | null);
    if (m.entityId !== expected) throw new Rejected('invalid', `budgets: id must be ${expected}`);
    if (existing && (existing.group_id !== data.group_id || existing.person_id !== (data.person_id ?? null))) {
      throw new Rejected('invalid', 'budgets: a line never changes group or owner');
    }
  }

  if (!(await canRead(ctx, groupId))) throw new Rejected('forbidden', 'budgets: not a member of that group');
  const ctxGroup = await groupContext(db, groupId, userId);
  if (!ctxGroup) throw new Rejected('forbidden', 'budgets: not a member of that group');
  const allowed = personId === null ? canEditGroupBudget(ctxGroup) : canSetOverrideFor(ctxGroup, personId);
  if (!allowed) {
    throw new Rejected('forbidden', personId === null
      ? 'Only an admin can change the group budget'
      : 'Only that person can set their own budget');
  }

  const fences = [
    guard(db, 'NOT EXISTS (SELECT 1 FROM budgets WHERE id = ? AND scope_id <> ?)', m.entityId, groupId),
    versionIs(db, 'budgets', m.entityId, m.baseVersion),
  ];
  if (m.op === 'delete') {
    if (!existing || existing.deleted_at !== null) throw new Rejected('not_found', 'budgets: nothing to delete');
    return [
      ...fences,
      bumpScope(ctx, groupId),
      db.prepare(`UPDATE budgets SET deleted_at = ?, version = version + 1, seq = ${SCOPE_SEQ}, updated_at = ?, updated_by = ?
                   WHERE id = ?`).bind(now, groupId, now, userId, m.entityId),
      activity(ctx, groupId, 'budget', m.entityId, 'deleted', 'Removed a budget line', null, m.data),
    ];
  }

  const cols = Object.keys(data);
  const write = existing
    ? db.prepare(`UPDATE budgets SET ${[...cols.map(c => `${c} = ?`), 'deleted_at = NULL', 'version = version + 1',
        `seq = ${SCOPE_SEQ}`, 'updated_at = ?', 'updated_by = ?'].join(', ')} WHERE id = ?`)
      .bind(...cols.map(c => data[c]), groupId, now, userId, m.entityId)
    : (() => {
      const all = ['id', 'scope_id', 'version', 'created_at', 'updated_at', 'created_by', 'updated_by', ...cols];
      return db.prepare(`INSERT INTO budgets (${all.join(', ')}, seq) VALUES (${all.map(() => '?').join(', ')}, ${SCOPE_SEQ})`)
        .bind(m.entityId, groupId, 1, createdAt(m.data, now), now, userId, userId, ...cols.map(c => data[c]), groupId);
    })();
  return [
    ...fences,
    bumpScope(ctx, groupId),
    write,
    activity(ctx, groupId, 'budget', m.entityId, existing ? 'updated' : 'created',
      existing ? 'Changed a budget line' : 'Added a budget line', (data.amount as number) ?? null, m.data),
  ];
}

export const BUDGET_ENTITIES: Record<string, CustomSpec> = {
  budgets: { table: 'budgets', money: true, custom: writeBudget },
};
