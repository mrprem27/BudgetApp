import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReviewFilters } from './reviewFilter';

/**
 * Saved focus "views" for the Review inbox. A view bundles a filter with an
 * optional target group and payer, persisted on-device so it survives restarts.
 * Reason for `paidBy`: an imported statement is often *someone else's*, so a whole
 * view of rows shares one payer (must be a member of the view's group).
 */
const KEY = 'review_saved_views';

export type SavedView = {
  id: string;
  name: string;
  filters: ReviewFilters;
  groupId: string | null;   // bulk-assign matching rows to this group on apply
  paidBy: string | null;    // payer applied on commit (member of groupId)
};

export function makeViewId(): string {
  return `v_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export async function loadViews(): Promise<SavedView[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedView[]) : [];
  } catch { return []; }
}

async function persist(views: SavedView[]): Promise<SavedView[]> {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(views)); } catch { /* best-effort */ }
  return views;
}

/** Insert or replace a view by id; returns the updated list. */
export async function upsertView(view: SavedView): Promise<SavedView[]> {
  const views = await loadViews();
  const i = views.findIndex(v => v.id === view.id);
  if (i >= 0) views[i] = view; else views.push(view);
  return persist(views);
}

export async function deleteView(id: string): Promise<SavedView[]> {
  return persist((await loadViews()).filter(v => v.id !== id));
}
