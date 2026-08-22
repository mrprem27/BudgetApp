import { asTrustState } from '../constants/enums';

/** Just enough of a `Person` to decide. Structural, so tests need no db. */
export type TrustSubject = {
  is_me: number;
  remote_uid: string | null;
  trust_state: string | null;
};

/**
 * Can this person's entry land in my ledger without my say-so?
 *
 * Three answers, in order, and the order matters:
 *
 * 1. **Me: always.** AGENTS §13 — you can always make yourself worse off, never
 *    someone else. My own entries never queue for my own approval.
 * 2. **No account: never.** `remote_uid` is the binding between a local `person`
 *    row and a server account. Without one there is no write path, so nothing can
 *    arrive claiming to be them and the stored trust value is unreachable. This is
 *    the clause that makes the whole feature a strict no-op today: nothing writes
 *    `remote_uid` yet, so every person on every device takes this branch.
 * 3. **Otherwise, whatever I decided.** Default `review`, because the safe answer
 *    to "may someone I have not vouched for move my numbers" is no.
 *
 * Deliberately reads the person, not the group. A group is only a set of humans,
 * and a group-level switch would silently extend trust to whoever is added next.
 */
export function appliesImmediately(p: TrustSubject): boolean {
  if (p.is_me === 1) return true;
  if (p.remote_uid == null) return false;
  return asTrustState(p.trust_state) === 'trusted';
}
