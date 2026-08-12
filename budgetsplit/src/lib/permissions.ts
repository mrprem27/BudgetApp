import type { GroupRole } from '../constants/enums';

/**
 * Who may do what inside a group. Pure — no db, no React — so every rule below is
 * tested directly rather than inferred from whether a screen hid a button.
 *
 * **Two levels, not three.** The group's creator is `budget_group.created_by`,
 * which is written once and never updated; `group_member.role` is `admin` or
 * `member`. Creator-ness deliberately does not live in the role column, because a
 * role is editable and the creator's protection must not be. That is what makes
 * "nobody can remove the group creator" a property of the data model rather than a
 * rule someone can edit their way around.
 *
 * The creator is always treated as an admin regardless of what their role row says,
 * so a corrupted or mis-migrated role cannot lock them out of their own group.
 *
 * **Enforced at the query layer, not here and not in screens.** These functions
 * decide; `db/queries/*` refuse. A screen hiding a button is a courtesy, not a
 * control — the write path is the control.
 */

/** Everything a permission decision needs about the actor and the group. */
export type GroupContext = {
  /** The group's immutable creator (`budget_group.created_by`). Null on pre-migration rows. */
  createdBy: string | null;
  /** The acting person. */
  actorId: string;
  /** The actor's stored role, or null when they are not a member at all. */
  actorRole: GroupRole | null;
};

/** The creator is an admin by definition, whatever the role row happens to say. */
export function isCreator(ctx: GroupContext): boolean {
  return ctx.createdBy !== null && ctx.createdBy === ctx.actorId;
}

export function isAdmin(ctx: GroupContext): boolean {
  return isCreator(ctx) || ctx.actorRole === 'admin';
}

export function isMember(ctx: GroupContext): boolean {
  return ctx.actorRole !== null;
}

/**
 * Edit the group's **default** budget — the line every member inherits.
 *
 * Not a member-level action: a default someone else did not agree to is exactly
 * the thing the personal override exists to escape, so changing it for everyone is
 * an admin act.
 */
export const canEditGroupBudget = isAdmin;

/**
 * Set a personal budget override.
 *
 * Only ever for yourself, and **not even an admin may set someone else's**. An
 * allowance a person never agreed to, that they cannot see because there is no
 * sync yet, is worse than no allowance at all — it would silently drive *their*
 * over-budget warnings from *your* opinion.
 */
export function canSetOverrideFor(ctx: GroupContext, targetPersonId: string): boolean {
  return isMember(ctx) && ctx.actorId === targetPersonId;
}

/** Add someone to the group. */
export const canAddMember = isAdmin;

/**
 * Remove someone. Admins may remove members and each other — **but never the
 * creator**, by anyone, including another admin and including the creator
 * themselves. A group with no creator has no un-removable administrator, which is
 * how a shared group becomes permanently unmanageable.
 */
export function canRemoveMember(ctx: GroupContext, targetPersonId: string): boolean {
  if (ctx.createdBy !== null && targetPersonId === ctx.createdBy) return false;
  return isAdmin(ctx);
}

/**
 * Promote or demote. Any admin — including the creator — may make or unmake other
 * admins, but the creator's own role is fixed for the same reason they cannot be
 * removed.
 */
export function canChangeRole(ctx: GroupContext, targetPersonId: string): boolean {
  if (ctx.createdBy !== null && targetPersonId === ctx.createdBy) return false;
  return isAdmin(ctx);
}

/**
 * Delete the whole group. Creator only — it destroys every member's history, not
 * just the actor's, and it is the one action no other admin can undo.
 */
export const canDeleteGroup = isCreator;

/** Raised by the query layer when a write is refused. */
export class PermissionError extends Error {
  constructor(action: string) {
    super(`Not allowed: ${action}`);
    this.name = 'PermissionError';
  }
}
