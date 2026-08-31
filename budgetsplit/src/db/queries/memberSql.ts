// The one definition of "this person is still in this group".
//
// Its own module with zero imports, for the same reason `approvalSql.ts` has
// none: a constant that has to be copied into a caller is exactly the drift the
// constant was extracted to stop.

/**
 * Membership is **soft**: `group_member.deleted_at` records that somebody left,
 * and the row stays.
 *
 * It has to stay because a hard delete cannot travel. The schema said so when the
 * column was added and nothing used it: *"a hard delete cannot propagate — the
 * other device keeps the row and pushes it back."* Removing a member deleted the
 * row here and simply omitted them from the next roster, and omission is
 * indistinguishable from a roster that is merely stale, so `adoptGroup` could not
 * act on it. They stayed a member on every other phone forever, with
 * `ingestPeerTxn` still accepting entries that named them.
 *
 * It also has to stay because of what removal must never do. What someone spent
 * is a fact about the past; who they are to this group now is a fact about the
 * present. Only the second is anyone's to change — so their entries, their
 * shares and their balance all survive, and the row that explains who they were
 * survives with them.
 *
 * **Every read of `group_member` that means "who is in this group NOW" carries
 * this.** `memberInvariant.test.ts` reads the real SQL and fails when one does
 * not, or when it is not allowlisted with a reason. A missed clause puts a
 * removed member back into a split, or drops a present one — both silently wrong,
 * and both persisting into months that are already closed.
 *
 * Takes the alias as an argument because, unlike `txn`, the sites here alias
 * `group_member` half a dozen different ways (`m`, `gm`, `gm1`, `gm2`, `a`, `b`).
 */
export const memberActive = (alias: string): string => `${alias}.deleted_at IS NULL`;

/** For the common unaliased `FROM group_member` case. */
export const MEMBER_ACTIVE = 'deleted_at IS NULL';
