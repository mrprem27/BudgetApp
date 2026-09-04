import { buildTrustSections, bucketFor } from '../lib/trustCentre';
import type { Person } from '../db/queries/persons';

/**
 * "Who can add to my ledger" had no answer you could read in one go — trust was
 * visible one person at a time, on that person's own screen, and only when they
 * had a linked account.
 *
 * The bucketing is the whole screen, so it is tested here rather than being
 * trusted to a component nothing renders.
 */

const p = (over: Partial<Person> = {}): Person => ({
  id: 'p1', name: 'Aarav', avatar_color: '#20C4B8', is_me: 0,
  remote_uid: 'acct-aarav', trust_state: 'review', image_uri: null,
  ...over,
} as Person);

describe('which group a person belongs in', () => {
  it('puts a linked, trusted person in "counts straight away"', () => {
    expect(bucketFor(p({ trust_state: 'trusted' }))).toBe('immediate');
  });

  it('puts a linked, untrusted person in "waits for you"', () => {
    expect(bucketFor(p({ trust_state: 'review' }))).toBe('waits');
  });

  /**
   * The third group, and the reason there are three.
   *
   * `lib/trust.ts` checks `remote_uid` BEFORE it reads any trust value, so a
   * person with no account has no write path and their setting cannot do
   * anything. Filing them under "waits for you" would reassure in the wrong
   * direction — it reads as "I am holding their entries back" when nothing of
   * theirs can arrive to be held.
   */
  it('puts an unlinked person in its own group, whatever their setting says', () => {
    expect(bucketFor(p({ remote_uid: null, trust_state: 'trusted' }))).toBe('unreachable');
    expect(bucketFor(p({ remote_uid: null, trust_state: 'review' }))).toBe('unreachable');
  });

  it('fails closed on a value it does not recognise', () => {
    // `asTrustState` narrows anything that is not literally 'trusted'.
    expect(bucketFor(p({ trust_state: 'TRUSTED' }))).toBe('waits');
    expect(bucketFor(p({ trust_state: null }))).toBe('waits');
  });
});

describe('building the list', () => {
  const me = p({ id: 'me', name: 'Me', is_me: 1, remote_uid: 'acct-me', trust_state: 'trusted' });
  const trusted = p({ id: 'a', name: 'Aarav', trust_state: 'trusted' });
  const waiting = p({ id: 'b', name: 'Priya', trust_state: 'review' });
  const inert = p({ id: 'c', name: 'Sneha', remote_uid: null });

  it('sorts everyone into the three groups', () => {
    const s = buildTrustSections([me, trusted, waiting, inert], new Map());
    expect(s.immediate.map(r => r.person.id)).toEqual(['a']);
    expect(s.waits.map(r => r.person.id)).toEqual(['b']);
    expect(s.unreachable.map(r => r.person.id)).toEqual(['c']);
  });

  it('leaves me out entirely', () => {
    // My own entries never wait for my own approval, so a row for myself would be
    // a control that cannot change an outcome.
    const s = buildTrustSections([me, trusted], new Map());
    expect(s.total).toBe(1);
    expect([...s.immediate, ...s.waits, ...s.unreachable].map(r => r.person.id)).not.toContain('me');
  });

  it('carries the group names I have set an exception in', () => {
    const s = buildTrustSections([trusted], new Map([['a', ['Goa Trip']]]));
    expect(s.immediate[0].exceptions).toEqual(['Goa Trip']);
  });

  it('reports nobody rather than throwing when there is nobody', () => {
    const s = buildTrustSections([me], new Map());
    expect(s).toMatchObject({ immediate: [], waits: [], unreachable: [], total: 0 });
  });
});
