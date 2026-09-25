/**
 * The app's own rules, imported — never re-implemented (SPEC-SERVER.md principle 3).
 *
 * If a split, permission or trust rule changes in the app, the server enforces the
 * new one on the next deploy, because it is the same function. A copy here would
 * be a second answer to the same question, and the two would drift.
 */
export { validateShares, requiredSides } from '../../../budgetsplit/src/lib/splitMath';
export { requiresMyApproval, appliesImmediately } from '../../../budgetsplit/src/lib/trust';
export type { TrustSubject, IncomingEntry } from '../../../budgetsplit/src/lib/trust';
export {
  isAdmin, isCreator, isMember, canAddMember, canRemoveMember, canChangeRole,
  canEditGroup, canEditGroupBudget, canSetOverrideFor, canDeleteGroup,
} from '../../../budgetsplit/src/lib/permissions';
export type { GroupContext } from '../../../budgetsplit/src/lib/permissions';
export { selfPersonId, syncIds, SYNCED_PREFERENCES, isSyncedPreference } from '../../../budgetsplit/src/lib/sync/ids';
