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
 *    `remote_uid`, so this branch is taken until you match them on Linked people.
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

/** The parts of an incoming entry that decide whether it can touch me unasked. */
export type IncomingEntry = {
  kind: 'expense' | 'income' | 'settlement';
  /** Does this entry name me as a payer or a sharer? */
  touchesMe: boolean;
};

/**
 * Does this entry need my say-so before it counts?
 *
 * `appliesImmediately` asks "do I trust this person". This asks the prior
 * question — "is trust even the right test here" — and for one kind it is not.
 *
 * **A transfer is always confirmed, however much I trust the sender.** Trust is
 * about honesty, and an incoming transfer fails for reasons neither person
 * controls: a declined UPI, a wrong VPA, a bank hold. The cost of being wrong is
 * also asymmetric in a way an expense's is not — "I paid you ₹5,000" credits cash
 * I may never have received *and* erases a real debt in the same write, so an
 * honest mistake quietly writes off money I am owed. An expense from someone I
 * trust only adds a cost I would have agreed to anyway.
 *
 * The same reasoning applies whichever way the transfer points. If they claim I
 * paid them, my cash goes down on their say-so; if they claim they paid me, my
 * receivable goes down. Either way a figure of mine moves because someone else
 * said so, which is the thing this whole model exists to stop.
 *
 * Entries that do not name me at all still queue, because `simplify()` re-pairs
 * debts across the whole group — an expense between two other people can still
 * move who I owe.
 */
export function requiresMyApproval(author: TrustSubject, entry: IncomingEntry): boolean {
  if (author.is_me === 1) return false;
  if (entry.kind === 'settlement' && entry.touchesMe) return true;
  return !appliesImmediately(author);
}
