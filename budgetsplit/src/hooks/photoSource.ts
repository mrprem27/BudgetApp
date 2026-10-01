import { ActionSheetIOS, Alert, Platform } from 'react-native';

export type PhotoSource = 'camera' | 'gallery';

/**
 * "Take photo or choose one": the system action sheet on iOS, a three-button alert on Android
 * (which has no action sheet, and whose alerts hold three buttons at most).
 *
 * Android used to get the camera with no question asked, so a receipt already in the gallery
 * could not be attached there at all. Not a hook, but it lives beside the hooks that call it
 * because it needs `Alert`, which `src/lib` stays free of.
 */
export function choosePhotoSource(onPick: (source: PhotoSource) => void): void {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Cancel', 'Take photo', 'Choose from library'], cancelButtonIndex: 0 },
      i => { if (i === 1) onPick('camera'); if (i === 2) onPick('gallery'); },
    );
    return;
  }
  Alert.alert('Add a photo', undefined, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Choose from library', onPress: () => onPick('gallery') },
    { text: 'Take photo', onPress: () => onPick('camera') },
  ], { cancelable: true });
}
