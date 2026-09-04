import { groupsTabView } from '../lib/groupsView';

/**
 * The Groups tab declared an `EmptyState` — icon disc, title, explanation, "New
 * Group" CTA — that **could not render**, for the entire life of the screen.
 * `seedIfNeeded` creates the Personal group unconditionally, so the list it was
 * conditioned on was never empty. Nobody noticed because onboarding used to create
 * a second group from the people step; `W1-08` removed that, and the hole became
 * the first thing a new user meets.
 *
 * `emptyState.test.ts` could not have caught it: that guard checks empty states are
 * not *rebuilt*, not that they are *reachable*. This is the reachability half.
 */

const personal = { id: 'p', is_personal: 1 };
const flat = { id: 'g1', is_personal: 0 };
const trip = { id: 'g2', is_personal: 0 };

describe('what the Groups tab shows', () => {
  it('offers the prompt when Personal is the only thing there', () => {
    // The exact state a user lands in after onboarding now.
    const v = groupsTabView([personal]);
    expect(v.showEmptyPrompt).toBe(true);
    // …and Personal is STILL listed. With `flags.splitting` on, this list is the
    // only route into the Personal ledger, so hiding it to make the list "empty"
    // would trade a missing empty state for a missing ledger.
    expect(v.active).toEqual([personal]);
  });

  it('offers it on a genuinely empty database too', () => {
    expect(groupsTabView([])).toEqual({ active: [], showEmptyPrompt: true });
  });

  it('drops the prompt as soon as one real group exists', () => {
    expect(groupsTabView([personal, flat]).showEmptyPrompt).toBe(false);
  });

  it('pins Personal first whatever order the query returned', () => {
    expect(groupsTabView([flat, personal, trip]).active).toEqual([personal, flat, trip]);
  });

  it('does not invent a Personal row when there is none', () => {
    // Defensive: a shared-only list must not gain a phantom first entry.
    expect(groupsTabView([flat, trip]).active).toEqual([flat, trip]);
  });

  it('treats a null is_personal as shared, not as Personal', () => {
    // The column is nullable; only `1` means personal, and `!== 1` is the filter.
    const v = groupsTabView([{ id: 'x', is_personal: null }]);
    expect(v.showEmptyPrompt).toBe(false);
    expect(v.active).toEqual([{ id: 'x', is_personal: null }]);
  });
});
