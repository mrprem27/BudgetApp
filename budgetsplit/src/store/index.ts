import { create } from 'zustand';
import type { BudgetGroup } from '../db/queries/groups';
import type { Person } from '../db/queries/persons';
import type { AccountChoice } from '../lib/paidFrom';

/**
 * Small global *client* store — NOT a data mirror. Truth lives in SQLite; screens
 * load through the query layer (see src/hooks/useScreenData). This holds only the
 * handful of values read on nearly every screen, hydrated once at the root
 * (StoreHydrator) and re-hydrated on the DataRefreshProvider signal:
 *   - `me`: the current user; saves a getMe() round-trip in most loaders + instant paint.
 *   - `groups`: the groups list (Home loads it; Groups reads it for instant first paint).
 *   - `accounts`: every account, archived too, so each transaction row can name where its
 *     money came from (`DQ-18`) without every ledger loader joining `account`.
 * Keep this surface tiny — add here only if a value is genuinely app-wide and hot.
 */
type AppState = {
  me: Person | null;
  setMe: (me: Person | null) => void;
  groups: BudgetGroup[];
  setGroups: (groups: BudgetGroup[]) => void;
  accounts: AccountChoice[];
  setAccounts: (accounts: AccountChoice[]) => void;
};

export const useStore = create<AppState>((set) => ({
  me: null,
  setMe: (me) => set({ me }),
  groups: [],
  setGroups: (groups) => set({ groups }),
  accounts: [],
  setAccounts: (accounts) => set({ accounts }),
}));
