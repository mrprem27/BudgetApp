import { Paths, File, Directory } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';

const ATTACHMENT_DIR = new Directory(Paths.document, 'attachments');

async function ensureDir() {
  if (!ATTACHMENT_DIR.exists) ATTACHMENT_DIR.create();
}

export async function pickAttachment(source: 'camera' | 'gallery'): Promise<string | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.7,
    allowsEditing: false,
  };

  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return null;
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return null;
    result = await ImagePicker.launchImageLibraryAsync(options);
  }

  if (result.canceled || !result.assets?.[0]) return null;

  await ensureDir();
  const ext = result.assets[0].uri.split('.').pop() ?? 'jpg';
  const dest = new File(ATTACHMENT_DIR, uuid() + '.' + ext);
  const src = new File(result.assets[0].uri);
  src.copy(dest);
  return dest.uri;
}

export async function deleteAttachment(uri: string): Promise<void> {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch { /* best-effort */ }
}
