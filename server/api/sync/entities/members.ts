import { ensurePerson, groupContext, myPersonId, personOf } from '../utils/access';
import { bumpScope, Rejected, SCOPE_SEQ, type CustomSpec, type Mutation, type PushContext } from '../utils/mutation';
import { canAddMember, canChangeRole, canRemoveMember, isAdmin, selfPersonId, syncIds } from '../rules';
import { activity } from './groups';

/**
 * Group membership (SPEC-SERVER.md §5, task S18). Every change is a mutation on
 * a `group_members` row, and every one is checked HERE, with the app's own
 * permission functions — not on the phone, where v1 left them (`SYNC-F24`).
 *
 *   * add       an admin adds someone. An account is `invited` until they accept
 *               (joining someone's ledger is their decision); a placeholder — a
 *               name with no account — is `active` at once, as in the app today.
 *   * accept    the invited person, themselves: `invited → active`.
 *   * decline / leave   the person themselves: `→ left`. The owner never leaves:
 *               a group always has its owner, so it always has an admin (`SYNC-F20`).
 *   * remove    an admin, never on the owner: `→ removed`. Their next pull lists
 *               the group as revoked (`SYNC-F16`).
 *   * role      an admin, never on the owner's own role.
 *   * re-add    an admin, on someone who left or was removed: same rules as add.
 *
 * Membership isn't money, so it is last-write-wins (no compare-and-set).
 */

type MemberRow = {
  id: string; group_id: string; person_id: string; role: 'admin' | 'member';
  status: 'invited' | 'active' | 'left' | 'removed'; display_name: string; avatar_color: string;
};

const STATUSES = ['invited', 'active', 'left', 'removed'] as const;
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : null);

async function writeMember(ctx: PushContext, m: Mutation): Promise<D1PreparedStatement[]> {
  const { db, userId, now } = ctx;
  if (m.op === 'delete') throw new Rejected('invalid', 'group_members: leave or remove instead of deleting');
  const raw = m.data ?? {};
  const groupId = text(raw.group_id);
  const inviteeUser = text(raw.user_id);
  // An account's person is the one the server holds for it (derived, `user:<id>`, for any account made since server sync).
  const personId = inviteeUser ? ((await personOf(db, inviteeUser)) ?? selfPersonId(inviteeUser)) : text(raw.person_id);
  if (!groupId || !personId) throw new Rejected('invalid', 'group_members: group_id and person_id are required');
  if (m.entityId !== syncIds.member(groupId, personId)) throw new Rejected('invalid', 'group_members: id does not match the group and person');
  if (raw.status !== undefined && !STATUSES.includes(raw.status as never)) throw new Rejected('invalid', 'group_members: unknown status');
  if (raw.role !== undefined && raw.role !== 'admin' && raw.role !== 'member') throw new Rejected('invalid', 'group_members: unknown role');

  const group = await db.prepare('SELECT kind, owner_id, deleted_at FROM groups WHERE id = ?')
    .bind(groupId).first<{ kind: string; owner_id: string; deleted_at: number | null }>();
  if (!group || group.deleted_at !== null) throw new Rejected('not_found', 'This group no longer exists');
  if (group.kind === 'personal') throw new Rejected('invalid', 'A personal group has no other members');

  const gctx = await groupContext(db, groupId, userId);
  const me = await myPersonId(db, userId);
  const isOwner = personId === ((await personOf(db, group.owner_id)) ?? selfPersonId(group.owner_id));
  const existing = await db.prepare('SELECT * FROM group_members WHERE id = ?').bind(m.entityId).first<MemberRow>();
  const wanted = raw.status as MemberRow['status'] | undefined;

  const write = (sql: string, ...binds: unknown[]): D1PreparedStatement[] => [
    bumpScope(ctx, groupId),
    db.prepare(sql).bind(...binds),
  ];

  // --- add, or re-add after leaving -------------------------------------------------
  if (!existing || ((existing.status === 'left' || existing.status === 'removed') && (wanted === 'invited' || wanted === 'active'))) {
    if (!gctx || !canAddMember(gctx)) throw new Rejected('forbidden', 'Only an admin can add people to this group');
    // An account id nobody has — a link from before a server reset, or demo data —
    // is still a real person in this group's money. Refusing them would refuse
    // every entry that names them too, so they join as a plain name instead.
    const realInvitee = inviteeUser
      && (await db.prepare('SELECT 1 AS n FROM users WHERE id = ? AND deleted_at IS NULL').bind(inviteeUser).first())
      ? inviteeUser : null;
    // The person's own account counts only while it exists: a deleted account's
    // person keeps its user_id (its entries name it), but nobody can accept for it.
    const account = realInvitee
      ?? (await db.prepare(
        `SELECT p.user_id FROM people p JOIN users u ON u.id = p.user_id
          WHERE p.id = ? AND u.deleted_at IS NULL`,
      ).bind(personId).first<string | null>('user_id'));
    const status = account ? 'invited' : 'active';
    const name = text(raw.display_name) ?? existing?.display_name;
    if (!name) throw new Rejected('invalid', 'group_members: display_name is required');
    const color = text(raw.avatar_color) ?? existing?.avatar_color ?? '#20C4B8';
    const role = raw.role === 'admin' ? 'admin' : 'member';
    const person = ensurePerson(db, personId, account ?? null, userId, now);
    if (existing) {
      return [person, ...write(
        `UPDATE group_members SET status = ?, role = ?, display_name = ?, avatar_color = ?, joined_at = ?, left_at = NULL,
                invited_by = ?, version = version + 1, seq = ${SCOPE_SEQ}, updated_at = ?, updated_by = ? WHERE id = ?`,
        status, role, name, color, status === 'active' ? now : null, userId, groupId, now, userId, m.entityId,
      ), activity(ctx, groupId, 'member', m.entityId, 'updated', `Added ${name} back`, null, raw)];
    }
    return [person, ...write(
      `INSERT INTO group_members
         (id, scope_id, version, seq, created_at, updated_at, created_by, updated_by,
          group_id, person_id, display_name, avatar_color, role, status, joined_at, invited_by)
       VALUES (?, ?, 1, ${SCOPE_SEQ}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      m.entityId, groupId, groupId, now, now, userId, userId, groupId, personId, name, color, role, status,
      status === 'active' ? now : null, userId,
    ), activity(ctx, groupId, 'member', m.entityId, 'created', status === 'invited' ? `Invited ${name}` : `Added ${name}`, null, raw)];
  }

  const self = existing.person_id === me;
  const extra: D1PreparedStatement[] = [];
  const sets: string[] = [];
  const binds: unknown[] = [];
  let summary = `Changed ${existing.display_name}`;

  // --- status moves ---------------------------------------------------------------------
  if (wanted && wanted !== existing.status) {
    const from = existing.status;
    if (from === 'invited' && wanted === 'active') {
      // Only they can accept. Anyone else sending "active" — an admin's phone
      // re-saving the row after a role change — leaves them invited: no error,
      // because nothing was asked for that the sender may not have.
      if (self) {
        sets.push('status = ?', 'joined_at = ?'); binds.push('active', now);
        summary = `${existing.display_name} joined`;
        // Anything I was asked while invited, held back by the pull until I could
        // read it, comes down now, with the group.
        extra.push(
          bumpScope(ctx, userId),
          db.prepare(`UPDATE approvals SET seq = ${SCOPE_SEQ} WHERE user_id = ? AND deleted_at IS NULL
                        AND transaction_id IN (SELECT id FROM transactions WHERE group_id = ?)`).bind(userId, userId, groupId),
        );
      }
    } else if (wanted === 'left') {
      if (!self) throw new Rejected('forbidden', 'Only you can leave a group');
      if (isOwner) throw new Rejected('forbidden', 'The owner can’t leave — delete the group instead');
      sets.push('status = ?', 'left_at = ?'); binds.push('left', now);
      summary = from === 'invited' ? `${existing.display_name} declined` : `${existing.display_name} left`;
    } else if (wanted === 'removed' && (from === 'active' || from === 'invited')) {
      if (!gctx || !canRemoveMember(gctx, existing.person_id)) {
        throw new Rejected('forbidden', isOwner ? 'The owner can’t be removed' : 'Only an admin can remove people');
      }
      sets.push('status = ?', 'left_at = ?'); binds.push('removed', now);
      summary = `Removed ${existing.display_name}`;
    } else {
      throw new Rejected('invalid', `group_members: can't go from ${from} to ${wanted}`);
    }
  }

  // --- role -----------------------------------------------------------------------------
  if (raw.role !== undefined && raw.role !== existing.role) {
    if (!gctx || !canChangeRole(gctx, existing.person_id)) {
      throw new Rejected('forbidden', isOwner ? 'The owner’s role never changes' : 'Only an admin can change roles');
    }
    sets.push('role = ?'); binds.push(raw.role);
    summary = raw.role === 'admin' ? `Made ${existing.display_name} an admin` : `${existing.display_name} is no longer an admin`;
  }

  // --- how they appear ------------------------------------------------------------------
  const name = text(raw.display_name);
  const color = text(raw.avatar_color);
  if ((name && name !== existing.display_name) || (color && color !== existing.avatar_color)) {
    if (!self && !(gctx && isAdmin(gctx))) throw new Rejected('forbidden', 'Only an admin can rename someone else');
    if (name) { sets.push('display_name = ?'); binds.push(name); }
    if (color) { sets.push('avatar_color = ?'); binds.push(color); }
  }

  if (sets.length === 0) return [];   // nothing changed: acknowledged, no write
  return [...extra, ...write(
    `UPDATE group_members SET ${sets.join(', ')}, version = version + 1, seq = ${SCOPE_SEQ}, updated_at = ?, updated_by = ?
      WHERE id = ?`,
    ...binds, groupId, now, userId, m.entityId,
  ), activity(ctx, groupId, 'member', m.entityId, 'updated', summary, null, raw)];
}

export const MEMBER_ENTITIES: Record<string, CustomSpec> = {
  group_members: { table: 'group_members', money: false, custom: writeMember },
};
