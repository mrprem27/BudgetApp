import { useState } from 'react';
import { Alert, Platform, ActionSheetIOS } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getApproval } from '../db/queries/approval';
import { disputesFor } from '../db/queries/syncDoc';
import { useRouter } from 'expo-router';
import { freeBytes } from '../lib/deviceStorage';
import { storageVerdict, storageAdvice, allowsAttachments } from '../lib/storage';
import { haptic } from '../lib/haptics';
import { pickAttachment, deleteAttachment, AttachmentStorageError } from '../lib/attachment';
import {
  getTxnById, getLineItems, setTxnAttachment, softDeleteTxn, restoreTxn,
} from '../db/queries/transactions';
import { getGroupById } from '../db/queries/groups';
import { getGroupMembers, getMe } from '../db/queries/persons';
import { getAuditLog } from '../db/queries/audit';
import { useToast } from '../components/system/Toast';
import { useDataRefresh } from '../components/system/DataRefreshProvider';
import { useScreenData } from './useScreenData';
import type { TxnDetailData } from '../lib/txnDetail';

/**
 * Data + write-handlers for the transaction detail screen: the load, receipt
 * attach/replace/remove (deleting the old file from disk on replace) and
 * delete-with-undo. Extracted from `app/txn/[id].tsx` so the screen renders.
 */
export function useTxnDetail(id: string) {
  const db = useSQLiteContext();
  const router = useRouter();
  const { showUndo } = useToast();
  const { refresh } = useDataRefresh();
  const [showAttachment, setShowAttachment] = useState(false);

  const { data, loading, error, reload } = useScreenData(async (database): Promise<TxnDetailData> => {
    const t = await getTxnById(database, id);
    if (!t) {
      return { txn: null, members: [], me: null, groupName: '', isPersonal: false, history: [], items: [], parentRule: null, disputes: [] };
    }
    const [grp, mems, meRow, hist, li, disputes] = await Promise.all([
      getGroupById(database, t.group_id),
      getGroupMembers(database, t.group_id),
      getMe(database),
      getAuditLog(database, { entityId: id }),
      t.entry_mode === 'itemized' ? getLineItems(database, id) : Promise.resolve([]),
      disputesFor(database, id),
    ]);
    const parentRule = t.parent_recur_id ? await getTxnById(database, t.parent_recur_id) : null;
    return {
      txn: t,
      members: mems,
      me: meRow,
      groupName: grp?.name ?? '',
      isPersonal: grp?.is_personal === 1,
      history: hist,
      items: li,
      parentRule,
      disputes,
    };
  }, [id]);

  const txn = data?.txn ?? null;
  const members = data?.members ?? [];
  const me = data?.me ?? null;
  const groupName = data?.groupName ?? '';
  const isPersonal = data?.isPersonal ?? false;
  const history = data?.history ?? [];
  const items = data?.items ?? [];
  const parentRule = data?.parentRule ?? null;

  async function attachReceipt(source: 'camera' | 'gallery') {
    // Same pre-flight as the Add screen's receipt chip, and read from the same rule
    // (`allowsAttachments`) so the two paths can never disagree about when photos stop.
    const verdict = storageVerdict(freeBytes());
    if (!allowsAttachments(verdict)) {
      Alert.alert(
        'Photo couldn\u2019t be saved',
        storageAdvice(verdict)?.body ?? 'Your device is out of storage.',
        [
          { text: 'Storage settings', onPress: () => router.push('/settings/storage') },
          { text: 'OK', style: 'cancel' },
        ],
      );
      return;
    }
    try {
      const uri = await pickAttachment(source);
      if (!uri) return;
      // Replacing an existing receipt → remove the old file from disk first.
      if (txn?.attachment_uri) await deleteAttachment(txn.attachment_uri);
      await setTxnAttachment(db, id, uri);
      haptic.success();
      await reload();
    } catch (e) {
      if (e instanceof AttachmentStorageError) {
        // Reachable even after the pre-flight: space can vanish between the check and the
        // copy. Offers the same way out the Add screen does.
        Alert.alert(
          'Low on storage',
          'Your device ran out of room while saving the photo. The transaction itself is unchanged.',
          [
            { text: 'Storage settings', onPress: () => router.push('/settings/storage') },
            { text: 'OK', style: 'cancel' },
          ],
        );
      } else {
        Alert.alert('Something went wrong', 'Could not attach the receipt.');
      }
    }
  }

  function chooseReceiptSource() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take photo', 'Choose from library'], cancelButtonIndex: 0 },
        (i) => { if (i === 1) attachReceipt('camera'); if (i === 2) attachReceipt('gallery'); },
      );
    } else {
      attachReceipt('camera');
    }
  }

  function removeReceipt() {
    if (!txn?.attachment_uri) return;
    Alert.alert('Remove receipt?', 'The photo will be deleted from this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          const old = txn.attachment_uri;
          await setTxnAttachment(db, id, null);
          if (old) await deleteAttachment(old);
          haptic.warning();
          setShowAttachment(false);
          await reload();
        },
      },
    ]);
  }

  function onDelete() {
    Alert.alert('Delete transaction?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await softDeleteTxn(db, id);
          refresh();
          haptic.warning();
          showUndo({
            message: 'Transaction deleted',
            onUndo: async () => { try { await restoreTxn(db, id); refresh(); haptic.success(); } catch { /* ignore */ } },
          });
          router.back();
        } catch {
          haptic.error();
          Alert.alert('Something went wrong', 'Please try again.');
        }
      } },
    ]);
  }

  return {
    txn, members, me, groupName, isPersonal, history, items, parentRule,
    disputes: data?.disputes ?? [],
    loading, error, reload,
    showAttachment, setShowAttachment,
    chooseReceiptSource, removeReceipt, onDelete,
  };
}
