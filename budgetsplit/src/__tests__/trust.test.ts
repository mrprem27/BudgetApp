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

/**
 * The three rules, from the one sentence that produces them:
 *
 *   Trust means "I believe what you say we spent."
 *   It never means "I believe what you say my money did."
 *
 * Those are different claims. What we spent, they watched happen. What my money
 * did is a fact about my bank they cannot observe — it fails on a declined UPI, a
 * wrong VPA, a bank hold — so honesty is the wrong instrument for it.
 */
describe('the three rules', () => {
  const stranger = { is_me: 0, remote_uid: 'acct-aarav', trust_state: 'review' };
  const trusted = { ...stranger, trust_state: 'trusted' };

  describe('rule 1 — not my money never waits', () => {
    const notMine = { kind: 'expense' as const, touchesMe: false };

    it('lets it through from someone I have NOT trusted', () => {
      /*
       * This used to queue, on the argument that `simplify()` re-pairs debts
       * across a group. True, but it changes WHICH of two people I am told to
       * pay, never how much I owe — and it re-derives on every read. A prompt
       * that cannot change one of my numbers is not a safeguard, it is a
       * monthly interruption asking me to vouch for something I did not watch.
       */
      expect(requiresMyApproval(stranger, notMine)).toBe(false);
    });

    it('lets a settlement between two OTHER people through too', () => {
      // My net with the group is unchanged by it.
      expect(requiresMyApproval(stranger, { kind: 'settlement', touchesMe: false })).toBe(false);
    });

    it('is not overridden by a per-group "review"', () => {
      expect(requiresMyApproval(trusted, notMine, 'review')).toBe(false);
    });
  });

  describe('rule 2 — a claim that my money moved always asks', () => {
    const theySayIPaid = { kind: 'expense' as const, touchesMe: true, assertsIPaid: true };

    it('asks even when I fully trust them', () => {
      // SYNC-F13. "You paid ₹4,000" took cash out of my pocket on their say-so,
      // with no prompt, because only settlements were force-confirmed.
      expect(requiresMyApproval(trusted, theySayIPaid)).toBe(true);
    });

    it('cannot be waived by a per-group "trusted"', () => {
      expect(requiresMyApproval(trusted, theySayIPaid, 'trusted')).toBe(true);
    });

    it('asks for an incoming transfer, the same way, for the same reason', () => {
      const transfer = { kind: 'settlement' as const, touchesMe: true };
      expect(requiresMyApproval(trusted, transfer, 'trusted')).toBe(true);
    });
  });

  describe('rule 3 — an ordinary share is what trust is FOR', () => {
    // Someone else paid, I owe a piece. The common case, and it must stay
    // frictionless or trust buys nothing.
    const myShare = { kind: 'expense' as const, touchesMe: true, assertsIPaid: false };

    it('applies straight away from someone I trust', () => {
      expect(requiresMyApproval(trusted, myShare)).toBe(false);
    });

    it('waits from someone I have not', () => {
      expect(requiresMyApproval(stranger, myShare)).toBe(true);
    });

    it('treats a missing assertsIPaid as false, not as unknown', () => {
      // Older callers omit it. Absent must mean "they did not say I paid",
      // which is the direction that keeps trust working rather than the one
      // that makes everything queue.
      expect(requiresMyApproval(trusted, { kind: 'expense', touchesMe: true })).toBe(false);
    });
  });
});
