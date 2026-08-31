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
 * Still keyed on the PERSON, never on the group. A group is only a set of humans,
 * so a group-level switch would silently extend trust to whoever is added to it
 * next month. `override` does not break that: it is my answer about one human in
 * one place, so nobody inherits anything by being added.
 *
 * What it allows is the thing people actually think — "Aarav is reliable about
 * the flat bills and vague on holiday" — which without it could only be expressed
 * by distrusting him everywhere.
 *
 * @param override this person's trust in the group the entry belongs to, when one
 *   has been set. `null`/absent means fall back to the global answer, which is the
 *   common case and deliberately the default.
 */
export function appliesImmediately(p: TrustSubject, override?: string | null): boolean {
  if (p.is_me === 1) return true;
  // Checked BEFORE the override, not after: without an account there is no write
  // path at all, so no per-group answer can make an unreachable person reachable.
  if (p.remote_uid == null) return false;
  return asTrustState(override ?? p.trust_state) === 'trusted';
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
export function requiresMyApproval(
  author: TrustSubject,
  entry: IncomingEntry,
  /** Their trust in THIS group, when I have set one. See `appliesImmediately`. */
  override?: string | null,
): boolean {
  if (author.is_me === 1) return false;
  /*
   * Ahead of trust, and ahead of any override: a transfer that NAMES ME is
   * confirmed however much I trust the sender, in every group. No per-group answer
   * can waive it, because the reason has nothing to do with the person's honesty.
   *
   * `touchesMe` is the precise boundary, and it is deliberate rather than an
   * oversight — the invariant is sometimes stated as "a transfer always needs
   * approval", which is broader than its own reasoning supports. Everything that
   * makes a transfer different is about MY money: it credits cash I may never have
   * received, and erases a real debt in the same write. A settlement between two
   * OTHER people does neither. My net with the group is unchanged by it; only
   * which of them `simplify()` tells me to pay can shift, and that re-derives on
   * every read. So it follows the ordinary trust rule: from someone on review it
   * waits, like all their entries, and from someone I have trusted it applies.
   *
   * Asking me to "approve" a payment between two people I did not watch make it
   * would be asking me to vouch for something I cannot check, every month, in
   * exchange for no protection at all.
   */
  if (entry.kind === 'settlement' && entry.touchesMe) return true;
  return !appliesImmediately(author, override);
}
