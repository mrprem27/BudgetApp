import { ensureSelfPerson, mayAdminister, meOf } from '../utils/access';
import { guard } from '../utils/guard';
import { bumpScope, clean, createdAt, Rejected, SCOPE_SEQ, type CustomSpec, type Mutation, type PushContext } from '../utils/mutation';
import { syncIds } from '../rules';

/**
 * A group is its own scope, created together with its owner's membership
 * (SPEC-SERVER.md §2.5). Members other than the owner arrive in S18.
 *
 *   * create — anyone may create a group; they become its permanent owner and first admin.
 *   * update — admins only (`canEditGroup` = `isAdmin`, the app's own rule). `kind` never changes.
 *   * delete — the owner only (`canDeleteGroup` = `isCreator`); a tombstone, never a hard delete.
 *     The personal group cannot be deleted at all.
 */

const COLUMNS = ['kind', 'name', 'icon', 'color', 'simplify_debts', 'default_split', 'carry_over', 'currency'] as const;

async function writeGroup(ctx: PushContext, m: Mutation): Promise<D1PreparedStatement[]> {
  const { db, userId, now } = ctx;
  const id = m.entityId;
  const existing = await db.prepare('SELECT kind, owner_id, deleted_at FROM groups WHERE id = ?')
    .bind(id).first<{ kind: string; owner_id: string; deleted_at: number | null }>();

  if (m.op === 'delete') {
    if (!existing || existing.deleted_at !== null) throw new Rejected('not_found', 'groups: nothing to delete');
    if (existing.owner_id !== userId) throw new Rejected('forbidden', 'Only the person who created a group can delete it');
    if (existing.kind === 'personal') throw new Rejected('invalid', 'The personal group cannot be deleted');
    return [
      guard(db, 'EXISTS (SELECT 1 FROM groups WHERE id = ? AND owner_id = ? AND deleted_at IS NULL)', id, userId),
      bumpScope(ctx, id),
      db.prepare(`UPDATE groups SET deleted_at = ?, version = version + 1, seq = ${SCOPE_SEQ}, updated_at = ?, updated_by = ?
                   WHERE id = ?`).bind(now, id, now, userId, id),
      activity(ctx, id, 'group', id, 'deleted', 'Deleted the group', null, m.data),
    ];
  }

  const data = clean('groups', COLUMNS, m.data ?? {});

  if (!existing) {
    if (m.baseVersion !== 0) throw new Rejected('not_found', 'groups: nothing to update');
    if (typeof data.kind !== 'string') throw new Rejected('invalid', 'groups.kind is required');
    const me = await meOf(ctx);
    const raw = m.data ?? {};
    const ownerName = typeof raw.owner_display_name === 'string' && raw.owner_display_name.trim()
      ? raw.owner_display_name.trim()
      : (await db.prepare('SELECT name FROM users WHERE id = ?').bind(userId).first<string>('name')) ?? 'Me';
    const ownerColor = typeof raw.owner_avatar_color === 'string' ? raw.owner_avatar_color : '#20C4B8';
    const cols = Object.keys(data);
    const all = ['id', 'scope_id', 'version', 'created_at', 'updated_at', 'created_by', 'updated_by', 'owner_id', ...cols];
    return [
      guard(db, 'NOT EXISTS (SELECT 1 FROM groups WHERE id = ?)', id),
      db.prepare("INSERT INTO sync_scopes (id, kind, seq, created_at) VALUES (?, 'group', 0, ?)").bind(id, now),
      ensureSelfPerson(db, userId, now),
      bumpScope(ctx, id),
      db.prepare(`INSERT INTO groups (${all.join(', ')}, seq) VALUES (${all.map(() => '?').join(', ')}, ${SCOPE_SEQ})`)
        .bind(id, id, 1, createdAt(m.data, now), now, userId, userId, userId, ...cols.map(c => data[c]), id),
      // The owner's own membership: active and admin from the first moment.
      db.prepare(`INSERT INTO group_members
          (id, scope_id, version, seq, created_at, updated_at, created_by, updated_by,
           group_id, person_id, display_name, avatar_color, role, status, joined_at)
        VALUES (?, ?, 1, ${SCOPE_SEQ}, ?, ?, ?, ?, ?, ?, ?, ?, 'admin', 'active', ?)`)
        .bind(syncIds.member(id, me), id, id, now, now, userId, userId, id, me, ownerName, ownerColor, now),
      activity(ctx, id, 'group', id, 'created', 'Created the group', null, m.data),
    ];
  }

  if (existing.deleted_at !== null) throw new Rejected('not_found', 'groups: this group was deleted');
  if (!(await mayAdminister(db, id, userId))) throw new Rejected('forbidden', 'Only an admin can change the group');
  if ('kind' in data && data.kind !== existing.kind) throw new Rejected('invalid', "A group's kind never changes");
  delete data.kind;
  const cols = Object.keys(data);
  return [
    bumpScope(ctx, id),
    db.prepare(`UPDATE groups SET ${[...cols.map(c => `${c} = ?`), 'version = version + 1', `seq = ${SCOPE_SEQ}`, 'updated_at = ?', 'updated_by = ?'].join(', ')}
                 WHERE id = ?`).bind(...cols.map(c => data[c]), id, now, userId, id),
    activity(ctx, id, 'group', id, 'updated', 'Changed the group', null, m.data),
  ];
}

/**
 * One feed row, written in the same batch as the change it describes.
 *
 * The phone writes its own `audit_log` row for the change, with a richer summary
 * ("Added ₹300 · Food"). When the mutation carries that row as `audit: {id,
 * summary}`, the feed row takes the same id and text, so the pull REPLACES the
 * phone's row instead of adding a second one. The actor is always the session's.
 */
export function activity(
  ctx: PushContext,
  scopeId: string,
  entity: 'txn' | 'group' | 'member' | 'budget' | 'recurring' | 'settlement',
  entityId: string,
  action: 'created' | 'updated' | 'deleted',
  summary: string,
  amount: number | null = null,
  raw?: Record<string, unknown>,
): D1PreparedStatement {
  const audit = raw?.audit && typeof raw.audit === 'object' ? raw.audit as Record<string, unknown> : {};
  const id = typeof audit.id === 'string' && /^[\w:-]{8,80}$/.test(audit.id) ? audit.id : crypto.randomUUID();
  const text = typeof audit.summary === 'string' && audit.summary.trim() ? audit.summary.slice(0, 500) : summary;
  return ctx.db.prepare(
    `INSERT OR IGNORE INTO activity_log (id, scope_id, seq, actor_id, entity, entity_id, action, amount, summary, created_at)
     VALUES (?, ?, ${SCOPE_SEQ}, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, scopeId, scopeId, ctx.userId, entity, entityId, action, amount, text, ctx.now);
}

export const GROUP_ENTITIES: Record<string, CustomSpec> = {
  groups: { table: 'groups', money: false, custom: writeGroup },
};
