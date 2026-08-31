import { computeDonutWedges } from '../lib/donut';
import { authorLabel } from '../lib/txnDetail';
import { backOr } from '../lib/nav';
import type { Person } from '../db/queries/persons';

/**
 * The donut's wedge array is NOT the caller's data array.
 *
 * `computeDonutWedges` drops any category worth zero or less, so the two are
 * only the same length while every value is positive. The component indexed the
 * wedge it drew and then read the selection out of `data`, so one ₹0 category
 * put every index past it off by one — and since selection is driven by name,
 * the popped-out slice, the centre label, the amount, the percentage and the
 * 6-month trend chart all described a category the user had not tapped.
 */
describe('donut wedges line up with what was tapped', () => {
  const seg = (name: string, paise: number) => ({ name, paise, color: '#000' });

  it('drops a zero category, so wedge indices do not match the input', () => {
    const data = [seg('Food', 50000), seg('Empty', 0), seg('Rent', 50000)];
    const wedges = computeDonutWedges(data, 100000);
    expect(wedges).toHaveLength(2);
    // The exact divergence the component walked into: index 1 is Rent in the
    // wedges and 'Empty' in the input.
    expect(wedges[1].name).toBe('Rent');
    expect(data[1].name).toBe('Empty');
  });

  it('every wedge carries the name and amount of the slice drawn', () => {
    const data = [seg('Food', 30000), seg('Zero', 0), seg('Rent', 70000)];
    const wedges = computeDonutWedges(data, 100000);
    expect(wedges.map(w => [w.name, w.paise])).toEqual([['Food', 30000], ['Rent', 70000]]);
  });

  it('drops a negative the same way', () => {
    const wedges = computeDonutWedges([seg('A', -500), seg('B', 1000)], 1000);
    expect(wedges.map(w => w.name)).toEqual(['B']);
  });
});

/**
 * The detail screen said "Added by you" on every entry, a co-member's included —
 * on the screen where you decide whether to trust that person's entries.
 */
describe('authorLabel', () => {
  const me = { id: 'me', name: 'Prem' } as Person;
  const aarav = { id: 'p2', name: 'Aarav' } as Person;

  it('names the peer who actually wrote it', () => {
    expect(authorLabel(aarav, me)).toBe('Aarav');
  });

  it('says you, with your name, for your own entry', () => {
    // `author` is null exactly when `author_person_id IS NULL`, which is the
    // app's canonical "authored by me" (AUTHORED_BY_ME).
    expect(authorLabel(null, me)).toBe('Prem (you)');
  });

  it('still says something when the local person row has no name', () => {
    expect(authorLabel(null, null)).toBe('You');
  });
});

/**
 * `router.back()` on an empty stack does nothing — no error, no movement. Several
 * screens here are reachable from outside the app (a tapped reminder, the voice
 * shortcut, a sign-in link) and arrive as the only route in the stack, where the
 * header's back control was simply dead.
 */
describe('backOr', () => {
  const spy = () => {
    const calls: string[] = [];
    return { calls, back: () => calls.push('back'), replace: (h: never) => calls.push(`replace:${h}`) };
  };

  it('goes back when there is somewhere to go back to', () => {
    const s = spy();
    backOr({ ...s, canGoBack: () => true }, '/reports');
    expect(s.calls).toEqual(['back']);
  });

  it('falls back on a cold start, where back would have done nothing', () => {
    const s = spy();
    backOr({ ...s, canGoBack: () => false }, '/(tabs)');
    expect(s.calls).toEqual(['replace:/(tabs)']);
  });

  it('replaces rather than pushes, so the stranded route is not left behind', () => {
    const s = spy();
    backOr({ ...s, canGoBack: () => false }, '/plan');
    // A push would leave the deep-linked screen under the fallback, so Back from
    // the fallback would return to the screen the user just left.
    expect(s.calls[0].startsWith('replace:')).toBe(true);
  });
});
