import { create } from 'zustand';
import type { BudgetGroup } from '../db/queries/groups';

/**
 * Minimal shared store. The app is SQLite-direct — every screen loads through
 * the query layer into local state — so this holds only the one thing that's
 * genuinely shared across screens: the groups list (Home loads it; Groups reads
 * it for an instant first paint before its own reload). The former
 * persons/txns/currentGroupId/isLocked/biometricEnabled surface had zero readers
 * and was removed (see docs/BRUTAL_ANALYSIS.md §1.1 / REFACTORING_PLAN Phase 2).
 */
type AppState = {
  groups: BudgetGroup[];
  setGroups: (groups: BudgetGroup[]) => void;
};

export const useStore = create<AppState>((set) => ({
  groups: [],
  setGroups: (groups) => set({ groups }),
}));
