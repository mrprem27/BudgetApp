import { Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { softDeleteTxn, restoreTxn } from '../db/queries/transactions';
import { useToast } from '../components/system/Toast';
import { isRecurInstance } from '../lib/groupDetail';
import { haptic } from '../lib/haptics';
import type { TxnWithSplits } from '../db/queries/transactions';

/**
 * Transaction actions for any ledger screen: delete (with recurring
 * rule/occurrence handling + Undo) and open-for-edit. `reload` re-fetches the
 * screen after a write.
 *
 * Group-agnostic on purpose: every destination is derived from the transaction
 * itself, so this serves the cross-group Personal and person ledgers (where each
 * row can belong to a different group) as well as a single group's. It took a
 * `groupId` fallback until the route that needed it turned out not to exist.
 */
export function useGroupTxnActions(reload: () => Promise<void> | void) {
  const db = useSQLiteContext();
  const router = useRouter();
  const { showUndo } = useToast();

  async function deleteTxn(targetId: string, cascade: boolean, message: string) {
    try {
      await softDeleteTxn(db, targetId, cascade);
    } catch (e) {
      // An entry somebody else wrote is refused here — the honest action on one
      // is to say it is wrong, which records the decision and tells them. Said
      // out loud rather than swallowed into "something went wrong".
      haptic.error();
      Alert.alert(
        "Can't delete this",
        e instanceof Error ? e.message : 'Please try again.',
      );
      return;
    }
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
      // A materialized occurrence has no detail page of its own — open the rule
      // it came from. The id is the rule's with an `_n` suffix, the same
      // derivation `handleDelete` already does above.
      //
      // This pointed at `/group/{id}/recurring` until it was noticed that the
      // screen had been deleted — `app/recurring/[id].tsx` replaced it, and this
      // one caller was missed. With no `+not-found.tsx` in `app/`, tapping Edit
      // on a recurring row landed on expo-router's Unmatched Route screen, from
      // three separate ledgers. `deadRouteRef.test.ts` is what stops it recurring.
      router.push(`/recurring/${txn.id.replace(/_\d+$/, '')}`);
      return;
    }
    router.push(`/txn/${txn.id}`);
  }

  return { handleDelete, handleEditTxn };
}
