import { Paths, File, Directory } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';

const ATTACHMENT_DIR = new Directory(Paths.document, 'attachments');

/** Thrown when the receipt can't be saved to disk (e.g. device out of storage). */
export class AttachmentStorageError extends Error {
  constructor() {
    super('Could not save the receipt photo — device storage may be full.');
    this.name = 'AttachmentStorageError';
  }
}

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

  try {
    await ensureDir();
    const ext = result.assets[0].uri.split('.').pop() ?? 'jpg';
    const dest = new File(ATTACHMENT_DIR, uuid() + '.' + ext);
    const src = new File(result.assets[0].uri);
    src.copy(dest);
    return dest.uri;
  } catch {
    // Copy failed — most commonly the device is out of storage. Surface a typed
    // error so the caller can let the user save the expense without the photo.
    throw new AttachmentStorageError();
  }
}

export async function deleteAttachment(uri: string): Promise<void> {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch { /* best-effort */ }
}

/** Total on-device storage used by attachment files. */
export function getAttachmentStorage(): { count: number; bytes: number } {
  try {
    if (!ATTACHMENT_DIR.exists) return { count: 0, bytes: 0 };
    let count = 0, bytes = 0;
    for (const entry of ATTACHMENT_DIR.list()) {
      if (entry instanceof File) { count++; bytes += entry.size ?? 0; }
    }
    return { count, bytes };
  } catch { return { count: 0, bytes: 0 }; }
}

/** Delete every attachment file from disk (the DB columns are cleared separately). */
export function clearAllAttachmentFiles(): void {
  try {
    if (!ATTACHMENT_DIR.exists) return;
    for (const entry of ATTACHMENT_DIR.list()) {
      try { if (entry instanceof File) entry.delete(); } catch { /* skip */ }
    }
  } catch { /* best-effort */ }
}
