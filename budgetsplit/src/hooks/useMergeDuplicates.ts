import { useState } from 'react';
import { Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { softDeleteTxn } from '../db/queries/transactions';
import { useDataRefresh } from '../components/system/DataRefreshProvider';
import { haptic } from '../lib/haptics';
import type { MergeDuplicate } from '../lib/sync';

/** Removing this phone's copy of a merge duplicate — one at a time, or every one still listed. */
export function useMergeDuplicates(duplicates: MergeDuplicate[]) {
  const db = useSQLiteContext();
  const { refresh } = useDataRefresh();
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const pending = duplicates.filter(d => !removed.has(d.mine));

  async function run(ids: string[]) {
    setBusy(true);
    try {
      for (const id of ids) {
        await softDeleteTxn(db, id);
        setRemoved(prev => new Set(prev).add(id));
      }
    } catch {
      haptic.error();
      Alert.alert('Could not remove it', 'Please try again.');
    } finally {
      refresh();
      setBusy(false);
    }
  }

  return {
    pending, busy, removed,
    removeMine: (txnId: string) => run([txnId]),
    removeAll: () => run(pending.map(d => d.mine)),
  };
}
