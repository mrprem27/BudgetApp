import { useCallback } from 'react';
import { Alert, Platform, ActionSheetIOS } from 'react-native';
import { pickAttachment, AttachmentStorageError } from '../lib/attachment';
import { freeBytes } from '../lib/deviceStorage';
import { storageVerdict, storageAdvice, allowsAttachments } from '../lib/storage';

type Opts = {
  onPicked: (uri: string) => void;
  /** Deep-link into the storage screen from the out-of-space alert. */
  onOpenStorageSettings: () => void;
};

/**
 * Opens the receipt picker: camera or library on iOS via an action sheet, camera
 * directly on Android.
 *
 * The picking *interaction* used to live inside `AttachmentRow`, so it was only
 * reachable by rendering that row. The Add screen now offers a receipt chip
 * instead, and needed the same behaviour — hence a hook rather than a `src/lib`
 * helper: this needs `Alert`/`ActionSheetIOS`, and `src/lib` is RN-free by rule.
 *
 * Storage-full is handled here rather than at the call site because it's the same
 * message wherever a receipt is attached, and the expense still saves without the
 * photo — losing the image must never lose the transaction.
 *
 * There are now **two** storage guards, and they do different jobs:
 *  - the **pre-flight** below refuses before opening the camera, so the user isn't asked to
 *    frame a photo that was never going to be saved;
 *  - the **catch** stays, because free space can fall between the check and the copy — and a
 *    check is a snapshot, not a guarantee.
 */
export function useAttachmentPicker({ onPicked, onOpenStorageSettings }: Opts) {
  return useCallback(() => {
    const outOfSpace = (body: string) => Alert.alert(
      'Photo couldn’t be saved',
      body,
      [
        { text: 'Storage settings', onPress: onOpenStorageSettings },
        { text: 'OK', style: 'cancel' },
      ],
    );

    const attach = async (src: 'camera' | 'gallery') => {
      try {
        const u = await pickAttachment(src);
        if (u) onPicked(u);
      } catch (e) {
        if (e instanceof AttachmentStorageError) {
          outOfSpace('Your device is low on storage. Free up space and try again — your expense will still save without the photo.');
        } else {
          // Previously swallowed in silence, which made a permission or codec failure look
          // like a button that does nothing.
          Alert.alert('Couldn’t attach the photo', 'Something went wrong reading that image. Your expense is unaffected.');
        }
      }
    };

    // Pre-flight. A receipt costs megabytes; the transaction it belongs to costs bytes — so
    // photos stop working well before anything threatens the ledger.
    const verdict = storageVerdict(freeBytes());
    if (!allowsAttachments(verdict)) {
      outOfSpace(
        `${storageAdvice(verdict)?.body ?? 'Your device is out of storage.'} Add the expense now and attach a photo once there's room.`,
      );
      return;
    }

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Choose from Library'], cancelButtonIndex: 0 },
        (i) => { if (i === 1) attach('camera'); if (i === 2) attach('gallery'); },
      );
    } else {
      attach('camera');
    }
  }, [onPicked, onOpenStorageSettings]);
}
