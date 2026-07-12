import { create } from 'zustand';
import type { BudgetGroup } from '../db/queries/groups';
import type { Person } from '../db/queries/persons';

/**
 * Small global *client* store — NOT a data mirror. Truth lives in SQLite; screens
 * load through the query layer (see src/hooks/useScreenData). This holds only the
 * handful of values read on nearly every screen, hydrated once at the root
 * (StoreHydrator) and re-hydrated on the DataRefreshProvider signal:
 *   - `me`: the current user; saves a getMe() round-trip in most loaders + instant paint.
 *   - `groups`: the groups list (Home loads it; Groups reads it for instant first paint).
 * Keep this surface tiny — add here only if a value is genuinely app-wide and hot.
 */
type AppState = {
  me: Person | null;
  setMe: (me: Person | null) => void;
  groups: BudgetGroup[];
  setGroups: (groups: BudgetGroup[]) => void;
};

export const useStore = create<AppState>((set) => ({
  me: null,
  setMe: (me) => set({ me }),
  groups: [],
  setGroups: (groups) => set({ groups }),
}));
