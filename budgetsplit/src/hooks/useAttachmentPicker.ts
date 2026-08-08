import { useCallback } from 'react';
import { Alert, Platform, ActionSheetIOS } from 'react-native';
import { pickAttachment, AttachmentStorageError } from '../lib/attachment';

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
 */
export function useAttachmentPicker({ onPicked, onOpenStorageSettings }: Opts) {
  return useCallback(() => {
    const attach = async (src: 'camera' | 'gallery') => {
      try {
        const u = await pickAttachment(src);
        if (u) onPicked(u);
      } catch (e) {
        if (e instanceof AttachmentStorageError) {
          Alert.alert(
            'Photo couldn’t be saved',
            'Your device is low on storage. Free up space and try again — your expense will still save without the photo.',
            [
              { text: 'Storage settings', onPress: onOpenStorageSettings },
              { text: 'OK', style: 'cancel' },
            ],
          );
        }
      }
    };

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
