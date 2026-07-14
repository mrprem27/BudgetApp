import { Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { softDeleteTxn, restoreTxn } from '../db/queries/transactions';
import { useUndo } from '../components/system/UndoToast';
import { isRecurInstance } from '../lib/groupDetail';
import { haptic } from '../lib/haptics';
import type { TxnWithSplits } from '../db/queries/transactions';

/**
 * Group-detail transaction actions: delete (with recurring rule/occurrence
 * handling + Undo) and open-for-edit. `reload` re-fetches the screen after a write.
 */
export function useGroupTxnActions(groupId: string, reload: () => Promise<void> | void) {
  const db = useSQLiteContext();
  const router = useRouter();
  const { showUndo } = useUndo();

  async function deleteTxn(targetId: string, cascade: boolean, message: string) {
    await softDeleteTxn(db, targetId, cascade);
    haptic.warning();
    await reload();
    showUndo({
      message,
      onUndo: async () => { try { await restoreTxn(db, targetId, cascade); haptic.success(); await reload(); } catch { /* ignore */ } },
    });
  }

  function handleDelete(txnId: string) {
    const recurring = isRecurInstance(txnId);
    const targetId = recurring ? txnId.replace(/_\d+$/, '') : txnId;
    if (!recurring) {
      Alert.alert('Delete transaction?', undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteTxn(targetId, false, 'Transaction deleted') },
      ]);
      return;
    }
    Alert.alert(
      'Delete recurring rule?',
      'Keep the transactions it has already logged, or remove them too?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete rule only', onPress: () => deleteTxn(targetId, false, 'Recurring rule deleted') },
        { text: 'Delete rule + all logged', style: 'destructive', onPress: () => deleteTxn(targetId, true, 'Recurring + occurrences deleted') },
      ],
    );
  }

  function handleEditTxn(txn: TxnWithSplits) {
    if (isRecurInstance(txn.id)) {
      router.push(`/group/${groupId}/recurring`);
      return;
    }
    router.push(`/txn/${txn.id}`);
  }

  return { handleDelete, handleEditTxn };
}
