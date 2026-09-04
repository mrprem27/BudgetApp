import type { DeletePersonResult } from '../db/queries/persons';

/**
 * Why a person could not be removed, in the words the refusal should use.
 *
 * ## Why this file exists
 *
 * `deletePerson` refuses on any reference across ten columns, and every refusal
 * used to arrive as one bucket — `in-use`. Friends said the same sentence to all of
 * them: *"You've shared expenses with them, so removing them would change your
 * numbers. Take them out of a group instead."*
 *
 * For somebody whose only reference is a group membership, **both halves are
 * false.** No expense was ever shared, and taking them out of a group changes
 * nothing — removal is soft on purpose, so the membership row survives and keeps
 * blocking. The user is told to do something that cannot help, and when it does not
 * help there is nothing else to try.
 *
 * A refusal has to be true before it can be useful, so each block states the actual
 * reason and only offers a next step where one exists. Where none exists, it says
 * so — an honest dead end beats advice that wastes somebody's afternoon.
 *
 * Whether the group case *should* block at all is a separate, open question
 * (`DQ-25`). This file describes what the app does today; it does not defend it.
 */
export function refusalReason(res: Extract<DeletePersonResult, { ok: false }>): string {
  switch (res.reason) {
    case 'is-me': return 'This is you — every balance in the app is measured against this row.';
    case 'not-found': return 'They are already gone.';
  }

  switch (res.via) {
    case 'account':
      return "They've linked an account, so their entries can reach you at any time. "
        + 'Take them out of the groups you share instead — that stops the entries without losing anything.';
    case 'history':
      return "You've shared money with them, so removing them would change your numbers. "
        + 'Take them out of a group instead — their history stays either way.';
    case 'group':
      // Deliberately offers nothing: there is no action that unblocks this today.
      return 'They are in a group with you, and that record is kept even after someone leaves '
        + 'so past splits still add up. Removing them from the group will not change it.';
  }
}
