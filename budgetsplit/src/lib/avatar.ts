import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Pick a square photo and copy it into the app's document directory (offline —
 * nothing leaves the device). Returns the persisted local URI, or null if the
 * user cancelled / it failed.
 */
export async function pickAndSaveAvatar(personId: string): Promise<string | null> {
  try {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (res.canceled || !res.assets?.[0]?.uri) return null;

    const src = res.assets[0].uri;
    const dir = `${FileSystem.documentDirectory}avatars/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
    const dest = `${dir}${personId}_${Date.now()}.jpg`;
    await FileSystem.copyAsync({ from: src, to: dest });
    return dest;
  } catch {
    return null;
  }
}
