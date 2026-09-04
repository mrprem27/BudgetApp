import type { Person } from '../db/queries/persons';
import { asTrustState } from '../constants/enums';

/**
 * Sorting the people list into the three answers the Trust Centre exists to show.
 *
 * Pure, so the shape of the screen is testable without a database or a renderer —
 * and so "which bucket does this person fall in" has one definition rather than one
 * per surface, which is how trust ended up explained six different ways before
 * `trustCopy` existed.
 */

/**
 * Three, not two, and the third is the point.
 *
 * A person with no linked account has **no write path at all** (`lib/trust.ts`
 * checks `remote_uid` before it reads any trust value), so their toggle is inert
 * whatever it says. Showing them among "waits for you" would be a lie in the
 * reassuring direction: it reads as "I am holding their entries back", when in
 * fact nothing of theirs can arrive to be held.
 */
export type TrustBucket =
  /** Linked, and trusted: their entries count on arrival. */
  | 'immediate'
  /** Linked, not trusted: their entries wait. */
  | 'waits'
  /** No account — the setting is stored, and cannot do anything yet. */
  | 'unreachable';

export type TrustRow = {
  person: Person;
  bucket: TrustBucket;
  /** Their stored answer, which survives them having no account. */
  state: 'trusted' | 'review';
  /** Group names where I have set an exception. Empty is the common case. */
  exceptions: string[];
};

export type TrustSections = {
  immediate: TrustRow[];
  waits: TrustRow[];
  unreachable: TrustRow[];
  /** Everyone the screen has anything to say about. */
  total: number;
};

export function bucketFor(p: Person): TrustBucket {
  if (p.remote_uid == null) return 'unreachable';
  return asTrustState(p.trust_state) === 'trusted' ? 'immediate' : 'waits';
}

/**
 * @param people every person on the device, `getAllPersons` order
 * @param exceptionsByPerson person id → the group NAMES they have an exception in
 *
 * `is_me` is dropped: my own entries never wait for my own approval
 * (`appliesImmediately` returns true for `is_me` before anything else), so a row
 * for myself would be a control that cannot change an outcome.
 */
export function buildTrustSections(
  people: Person[],
  exceptionsByPerson: Map<string, string[]>,
): TrustSections {
  const rows: TrustRow[] = people
    .filter(p => p.is_me !== 1)
    .map(p => ({
      person: p,
      bucket: bucketFor(p),
      state: asTrustState(p.trust_state),
      exceptions: exceptionsByPerson.get(p.id) ?? [],
    }));

  return {
    immediate: rows.filter(r => r.bucket === 'immediate'),
    waits: rows.filter(r => r.bucket === 'waits'),
    unreachable: rows.filter(r => r.bucket === 'unreachable'),
    total: rows.length,
  };
}
