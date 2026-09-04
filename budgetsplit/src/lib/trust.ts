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
  /**
   * Does a PAYMENT name me — is somebody asserting that my money already moved?
   *
   * Deliberately separate from `touchesMe` rather than a narrowing of it. The two
   * mean different things and both are needed: `touchesMe` is "am I in this at
   * all", which decides whether it is my business; this is "did they say I paid",
   * which decides whether trust is even the right question.
   *
   * Optional so an older caller keeps compiling and keeps its previous meaning —
   * absent is the same as false, which is the safe direction.
   */
  assertsIPaid?: boolean;
};

/**
 * Does this entry need my say-so before it counts?
 *
 * One sentence produces the whole function:
 *
 * > **Trust means "I believe what you say we spent." It never means "I believe
 * > what you say my money did."**
 *
 * Those are different claims. What we spent is a thing they watched happen and I
 * can check against my own memory of the evening. What my money did is a fact
 * about my bank that they cannot observe at all — and it fails for reasons neither
 * of us controls: a declined UPI, a wrong VPA, a bank hold. Trusting someone's
 * honesty is the wrong instrument for it, so no amount of trust waives it and no
 * per-group override can either.
 *
 * Three rules, in order:
 *
 * 1. **Not my money → never waits.** If neither a payment nor a share names me,
 *    approving it moves not one of my figures, and asking is friction buying
 *    nothing. This used to queue on the argument that `simplify()` can re-pair
 *    debts across a group — true, but it changes *which* of two people I am told
 *    to pay, never how much I owe, and it re-derives on every read. A prompt that
 *    cannot change a number is not a safeguard.
 * 2. **They said my money moved → always ask.** A payment naming me, or a transfer
 *    naming me. "You paid ₹4,000" takes cash out on their say-so; "I paid you
 *    ₹5,000" credits cash I may never have received *and* erases a real debt in
 *    the same write. Both are claims about my account.
 * 3. **Otherwise → trust decides.** A share I owe is a cost I would have agreed to
 *    anyway, and that is the ordinary case: someone else paid, we all owe a piece.
 *    This is what keeps trust worth having.
 *
 * A settlement between two OTHER people follows rule 1 with everyone else. My net
 * is unchanged by it, and asking me to vouch for a payment I did not watch would
 * be a monthly interruption in exchange for no protection.
 */
export function requiresMyApproval(
  author: TrustSubject,
  entry: IncomingEntry,
  /** Their trust in THIS group, when I have set one. See `appliesImmediately`. */
  override?: string | null,
): boolean {
  if (author.is_me === 1) return false;
  // Rule 1. Nothing of mine is named, so nothing of mine can move.
  if (!entry.touchesMe) return false;
  // Rule 2. Ahead of trust and ahead of any override, because the reason has
  // nothing to do with this person's honesty.
  if (entry.assertsIPaid || entry.kind === 'settlement') return true;
  // Rule 3.
  return !appliesImmediately(author, override);
}
