import { create } from 'zustand';
import type { Person } from '../db/queries/persons';
import type { BudgetGroup } from '../db/queries/groups';
import type { TxnWithSplits } from '../db/queries/transactions';

type AppState = {
  persons: Person[];
  groups: BudgetGroup[];
  currentGroupId: string | null;
  txns: TxnWithSplits[];
  isLocked: boolean;
  biometricEnabled: boolean;

  setPersons: (persons: Person[]) => void;
  setGroups: (groups: BudgetGroup[]) => void;
  setCurrentGroupId: (id: string | null) => void;
  setTxns: (txns: TxnWithSplits[]) => void;
  addTxn: (txn: TxnWithSplits) => void;
  removeTxn: (id: string) => void;
  setLocked: (locked: boolean) => void;
  setBiometricEnabled: (enabled: boolean) => void;

  getMe: () => Person | undefined;
};

export const useStore = create<AppState>((set, get) => ({
  persons: [],
  groups: [],
  currentGroupId: null,
  txns: [],
  isLocked: false,
  biometricEnabled: false,

  setPersons: (persons) => set({ persons }),
  setGroups:  (groups)  => set({ groups }),
  setCurrentGroupId: (id) => set({ currentGroupId: id }),
  setTxns:    (txns)    => set({ txns }),
  addTxn:     (txn)     => set(s => ({ txns: [txn, ...s.txns] })),
  removeTxn:  (id)      => set(s => ({ txns: s.txns.filter(t => t.id !== id) })),
  setLocked:  (locked)  => set({ isLocked: locked }),
  setBiometricEnabled: (enabled) => set({ biometricEnabled: enabled }),

  getMe: () => get().persons.find(p => p.is_me === 1),
}));
