import { scanFromURLAsync } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';

export type PickQrResult =
  | { status: 'ok'; data: string }
  | { status: 'cancelled' }
  | { status: 'no-permission' }
  | { status: 'no-code' }
  | { status: 'error' };

/**
 * Pick an image from the library and read a QR out of it. Needs no new
 * dependency: `scanFromURLAsync` ships with expo-camera and expo-image-picker is
 * already installed for receipts.
 */
export async function pickQrFromLibrary(): Promise<PickQrResult> {
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return { status: 'no-permission' };

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsMultipleSelection: false,
    });
    if (picked.canceled || !picked.assets?.[0]?.uri) return { status: 'cancelled' };

    const found = await scanFromURLAsync(picked.assets[0].uri, ['qr']);
    const data = found?.[0]?.data;
    return data ? { status: 'ok', data } : { status: 'no-code' };
  } catch {
    return { status: 'error' };
  }
}

/** User-facing message for every non-success outcome. */
export function qrPickMessage(status: Exclude<PickQrResult['status'], 'ok'>): string | null {
  switch (status) {
    case 'cancelled': return null;
    case 'no-permission': return 'Photo access is off for BudgetSplit. Turn it on in Settings to scan a saved QR.';
    case 'no-code': return 'No QR code found in that image. Try a clearer screenshot.';
    default: return 'Couldn’t read that image. Try another one.';
  }
}
