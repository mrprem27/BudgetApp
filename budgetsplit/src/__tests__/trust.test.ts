import { appliesImmediately } from '../lib/trust';

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
