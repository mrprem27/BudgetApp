import {
  isCreator, isAdmin, isMember, canEditGroupBudget, canSetOverrideFor,
  canAddMember, canRemoveMember, canChangeRole, canDeleteGroup,
  type GroupContext,
} from '../lib/permissions';

const CREATOR = 'p-creator';
const ADMIN = 'p-admin';
const MEMBER = 'p-member';
const OUTSIDER = 'p-outsider';

const ctx = (actorId: string, actorRole: GroupContext['actorRole']): GroupContext =>
  ({ createdBy: CREATOR, actorId, actorRole });

const asCreator = ctx(CREATOR, 'admin');
const asAdmin = ctx(ADMIN, 'admin');
const asMember = ctx(MEMBER, 'member');
const asOutsider = ctx(OUTSIDER, null);

describe('who is who', () => {
  it('recognises the creator', () => {
    expect(isCreator(asCreator)).toBe(true);
    expect(isCreator(asAdmin)).toBe(false);
  });

  it('treats the creator as an admin even if their role row says member', () => {
    // A mis-migrated or corrupted role must not lock someone out of their own group.
    expect(isAdmin({ createdBy: CREATOR, actorId: CREATOR, actorRole: 'member' })).toBe(true);
  });

  it('does not treat a non-member as a member', () => {
    expect(isMember(asOutsider)).toBe(false);
    expect(isAdmin(asOutsider)).toBe(false);
  });

  it('handles a pre-migration group with no creator recorded', () => {
    const orphan: GroupContext = { createdBy: null, actorId: MEMBER, actorRole: 'admin' };
    expect(isCreator(orphan)).toBe(false);
    expect(isAdmin(orphan)).toBe(true); // the role still stands on its own
  });
});

describe('group default budget', () => {
  it('is editable by the creator and by admins', () => {
    expect(canEditGroupBudget(asCreator)).toBe(true);
    expect(canEditGroupBudget(asAdmin)).toBe(true);
  });

  it('is not editable by a plain member — that is what their own override is for', () => {
    expect(canEditGroupBudget(asMember)).toBe(false);
  });

  it('is not editable by someone outside the group', () => {
    expect(canEditGroupBudget(asOutsider)).toBe(false);
  });
});

describe('personal overrides are strictly self-only', () => {
  it('lets any member set their own', () => {
    expect(canSetOverrideFor(asMember, MEMBER)).toBe(true);
    expect(canSetOverrideFor(asAdmin, ADMIN)).toBe(true);
  });

  it('stops an ADMIN setting someone else’s', () => {
    // An allowance nobody agreed to, that they cannot see (no sync yet), would
    // silently drive their over-budget warnings from someone else's opinion.
    expect(canSetOverrideFor(asAdmin, MEMBER)).toBe(false);
  });

  it('stops the CREATOR setting someone else’s', () => {
    expect(canSetOverrideFor(asCreator, MEMBER)).toBe(false);
  });

  it('stops a non-member setting anything', () => {
    expect(canSetOverrideFor(asOutsider, OUTSIDER)).toBe(false);
  });
});

describe('membership', () => {
  it('lets admins add people', () => {
    expect(canAddMember(asAdmin)).toBe(true);
    expect(canAddMember(asMember)).toBe(false);
  });

  it('lets admins remove members and each other', () => {
    expect(canRemoveMember(asAdmin, MEMBER)).toBe(true);
    expect(canRemoveMember(asCreator, ADMIN)).toBe(true);
  });

  it('NOBODY can remove the creator', () => {
    expect(canRemoveMember(asAdmin, CREATOR)).toBe(false);
    expect(canRemoveMember(asMember, CREATOR)).toBe(false);
    // Not even the creator themselves — a group with no un-removable admin
    // becomes permanently unmanageable.
    expect(canRemoveMember(asCreator, CREATOR)).toBe(false);
  });

  it('does not let a plain member remove anyone', () => {
    expect(canRemoveMember(asMember, ADMIN)).toBe(false);
  });
});

describe('roles', () => {
  it('lets any admin make and unmake other admins', () => {
    expect(canChangeRole(asAdmin, MEMBER)).toBe(true);
    expect(canChangeRole(asCreator, ADMIN)).toBe(true);
    expect(canChangeRole(asAdmin, ADMIN)).toBe(true); // demote a peer, or themselves
  });

  it('NOBODY can demote the creator', () => {
    expect(canChangeRole(asAdmin, CREATOR)).toBe(false);
    expect(canChangeRole(asCreator, CREATOR)).toBe(false);
  });

  it('does not let a plain member change roles', () => {
    expect(canChangeRole(asMember, ADMIN)).toBe(false);
  });
});

describe('deleting the group', () => {
  it('is creator-only — it destroys every member’s history, not just the actor’s', () => {
    expect(canDeleteGroup(asCreator)).toBe(true);
    expect(canDeleteGroup(asAdmin)).toBe(false);
    expect(canDeleteGroup(asMember)).toBe(false);
  });
});
