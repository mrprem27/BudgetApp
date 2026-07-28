import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadViews, upsertView, deleteView, makeViewId, type SavedView } from '../lib/reviewViews';
import type { ReviewFilters } from '../lib/reviewFilter';

const store = AsyncStorage as unknown as { __reset: () => void; __failNextGet: () => void };

const view = (id: string, name = id): SavedView => ({
  id,
  name,
  filters: {} as ReviewFilters,
  groupId: null,
  paidBy: null,
});

beforeEach(() => store.__reset());

describe('makeViewId', () => {
  it('is prefixed and non-empty', () => {
    expect(makeViewId()).toMatch(/^v_/);
  });
  it('does not collide across rapid successive calls', () => {
    const ids = new Set(Array.from({ length: 200 }, () => makeViewId()));
    expect(ids.size).toBe(200);
  });
});

describe('loadViews', () => {
  it('returns an empty list when nothing is saved', async () => {
    await expect(loadViews()).resolves.toEqual([]);
  });

  it('returns an empty list (not a throw) when the stored JSON is corrupt', async () => {
    await AsyncStorage.setItem('review_saved_views', '{not json');
    await expect(loadViews()).resolves.toEqual([]);
  });

  it('returns an empty list when storage itself fails', async () => {
    store.__failNextGet();
    await expect(loadViews()).resolves.toEqual([]);
  });
});

describe('upsertView', () => {
  it('adds a new view', async () => {
    const out = await upsertView(view('a'));
    expect(out.map(v => v.id)).toEqual(['a']);
    await expect(loadViews()).resolves.toHaveLength(1);
  });

  it('appends distinct views in insertion order', async () => {
    await upsertView(view('a'));
    await upsertView(view('b'));
    await expect(loadViews()).resolves.toMatchObject([{ id: 'a' }, { id: 'b' }]);
  });

  it('replaces an existing view by id instead of duplicating it', async () => {
    await upsertView(view('a', 'first'));
    const out = await upsertView(view('a', 'renamed'));
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('renamed');
  });

  it('replaces in place, preserving position', async () => {
    await upsertView(view('a'));
    await upsertView(view('b'));
    await upsertView(view('c'));
    const out = await upsertView(view('b', 'edited'));
    expect(out.map(v => v.id)).toEqual(['a', 'b', 'c']);
    expect(out[1].name).toBe('edited');
  });

  it('persists the group and payer targeting', async () => {
    await upsertView({ ...view('a'), groupId: 'g1', paidBy: 'p1' });
    const [saved] = await loadViews();
    expect(saved.groupId).toBe('g1');
    expect(saved.paidBy).toBe('p1');
  });

  it('survives a reload from storage', async () => {
    await upsertView(view('a', 'Groceries'));
    const reloaded = await loadViews();
    expect(reloaded[0]).toEqual(view('a', 'Groceries'));
  });
});

describe('deleteView', () => {
  it('removes the matching view', async () => {
    await upsertView(view('a'));
    await upsertView(view('b'));
    const out = await deleteView('a');
    expect(out.map(v => v.id)).toEqual(['b']);
  });

  it('is a no-op for an unknown id', async () => {
    await upsertView(view('a'));
    const out = await deleteView('nope');
    expect(out.map(v => v.id)).toEqual(['a']);
  });

  it('handles deleting from an empty list', async () => {
    await expect(deleteView('a')).resolves.toEqual([]);
  });

  it('persists the deletion', async () => {
    await upsertView(view('a'));
    await deleteView('a');
    await expect(loadViews()).resolves.toEqual([]);
  });
});
