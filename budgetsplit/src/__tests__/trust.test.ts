import { appliesImmediately, requiresMyApproval } from '../lib/trust';

/**
 * The three-line function that decides whether someone else's entry reaches my
 * ledger unasked. Its second clause is the reason this whole feature is a no-op
 * on every database that exists today.
 */
describe('appliesImmediately', () => {
  const p = (over: Partial<Parameters<typeof appliesImmediately>[0]> = {}) => ({
    is_me: 0, remote_uid: null as string | null, trust_state: 'review', ...over,
  });

  it('always applies my own entries', () => {
    // AGENTS §13: you can always make yourself worse off, never someone else.
    expect(appliesImmediately(p({ is_me: 1 }))).toBe(true);
    // ...even if some migration left my own row marked "review".
    expect(appliesImmediately(p({ is_me: 1, trust_state: 'review' }))).toBe(true);
  });

  it('never applies an entry from someone with no account, whatever their trust says', () => {
    // THE clause that makes this inert today: nothing writes `remote_uid`, so no
    // person on any current device can take the trusted branch. A hand-added
    // contact you marked trusted still has no write path.
    expect(appliesImmediately(p({ remote_uid: null, trust_state: 'trusted' }))).toBe(false);
    expect(appliesImmediately(p({ remote_uid: null, trust_state: 'review' }))).toBe(false);
  });

  it('applies a linked person only once I have trusted them', () => {
    expect(appliesImmediately(p({ remote_uid: 'acct-1', trust_state: 'trusted' }))).toBe(true);
    expect(appliesImmediately(p({ remote_uid: 'acct-1', trust_state: 'review' }))).toBe(false);
  });

  it('treats an unknown or missing state as review, never as trusted', () => {
    // A narrowing bug must fail closed. `asTrustState` decides this.
    expect(appliesImmediately(p({ remote_uid: 'acct-1', trust_state: null }))).toBe(false);
    expect(appliesImmediately(p({ remote_uid: 'acct-1', trust_state: 'TRUSTED' }))).toBe(false);
    expect(appliesImmediately(p({ remote_uid: 'acct-1', trust_state: 'nonsense' }))).toBe(false);
  });
});

/**
 * Per-person, per-group trust.
 *
 * The rule that has always held is that trust is keyed on a HUMAN, never on a
 * group — a group is only a set of people, so a group-level switch would extend
 * trust to whoever is added to it next month without anyone deciding anything.
 *
 * An override does not break that: it is still my answer about one person, just
 * scoped to one place. What it buys is the thing people actually think — "Aarav
 * is reliable about the flat bills and vague on holiday" — which before could
 * only be said by distrusting him everywhere.
 */
describe('trusting someone in one group and not another', () => {
  const aarav = { is_me: 0, remote_uid: 'acct-aarav', trust_state: 'review' };
  const expense = { kind: 'expense' as const, touchesMe: true };

  it('falls back to the global answer when I have set nothing', () => {
    // The common case, and deliberately the default: no override must be
    // indistinguishable from "I never thought about it", not from a decision.
    expect(requiresMyApproval(aarav, expense, null)).toBe(true);
    expect(requiresMyApproval(aarav, expense, undefined)).toBe(true);
    expect(requiresMyApproval({ ...aarav, trust_state: 'trusted' }, expense, null)).toBe(false);
  });

  it('lets one group trust someone the global answer does not', () => {
    expect(requiresMyApproval(aarav, expense, 'trusted')).toBe(false);
  });

  it('lets one group withhold trust the global answer gives', () => {
    // The direction that matters more: "trusted everywhere except the trip" has
    // to be reachable, or the override is a one-way door.
    const trusted = { ...aarav, trust_state: 'trusted' };
    expect(requiresMyApproval(trusted, expense, 'review')).toBe(true);
  });

  it('cannot make someone with no account reachable', () => {
    /*
     * The account check comes BEFORE the override, and must. Without a
     * `remote_uid` there is no write path at all, so trusting them in a group is
     * an opinion about somebody who cannot send anything — and if a write ever
     * did arrive, it would be from an unbound identity.
     */
    const stranger = { is_me: 0, remote_uid: null, trust_state: 'review' };
    expect(appliesImmediately(stranger, 'trusted')).toBe(false);
    expect(requiresMyApproval(stranger, expense, 'trusted')).toBe(true);
  });

  it('never lets a group waive the transfer rule', () => {
    /*
     * A transfer is confirmed however much I trust the sender, in every group. No
     * per-group answer may waive it, because the reason has nothing to do with
     * that person's honesty — an incoming transfer fails for reasons neither side
     * controls, and "I paid you ₹5,000" erases a real debt in the same write.
     */
    const transfer = { kind: 'settlement' as const, touchesMe: true };
    expect(requiresMyApproval({ ...aarav, trust_state: 'trusted' }, transfer, 'trusted')).toBe(true);
  });

  it('still never queues my own entries, whatever a group says', () => {
    const me = { is_me: 1, remote_uid: 'acct-me', trust_state: 'review' };
    expect(requiresMyApproval(me, expense, 'review')).toBe(false);
  });
});
