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
 *
 * That claim used to be half true, which is worse than not making it. Membership
 * was guarded as `if (actorId && …)` with `actorId` optional, so a caller that
 * omitted it did not fail — it skipped the check, and `group/[id]/edit.tsx` did
 * exactly that. Group rename, the default split and simplify-debt had no
 * capability at all. Sharing a group — which is granting membership, and
 * discloses every member's name and account id — was ungated on both paths. Each
 * is now checked in the query, and the actor is required rather than optional.
 *
 * What is deliberately NOT a permission:
 * - **Archiving and unarchiving.** They change my own list and nothing anyone
 *   else can see, so there is nobody to protect.
 * - **Editing or deleting somebody else's entry.** Not a matter of rank — no
 *   admin may rewrite what another person recorded either. `PeerEntryError`
 *   refuses it outright, and approve/reject is the way to answer one.
 *
 * The one rule that remains advisory is the wire: a peer can push whatever
 * `EntryDoc` and whatever roster it likes, and `ingestPeerTxn` checks membership,
 * authorship and balance but never role. Enforcing role across devices needs the
 * server, which today has exactly one such rule (`DELETE /sync/groups/:id` is
 * owner-only).
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

/**
 * Rename the group, change its icon or colour, or change the **default split**
 * and whether debts are simplified.
 *
 * There was no capability for this at all, and no check anywhere, so any member
 * could rename a shared group for everybody and change the split mode every
 * future expense in it defaults to. The last two are not cosmetic: they decide
 * what the settle-up instructions say, and they now travel on the roster, so one
 * member's change reaches every phone.
 */
export const canEditGroup = isAdmin;

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
