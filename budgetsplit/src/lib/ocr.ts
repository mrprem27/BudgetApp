import * as ImagePicker from 'expo-image-picker';

export type ReceiptScanResult = {
  imageUri: string;
  amount: number | null;       // paise
  note: string | null;
  category: string | null;
};

const AMOUNT_REGEX = /(?:total|amount|grand\s*total|net|balance|due)[:\s]*(?:₹|rs\.?|inr)?\s*([\d,]+\.?\d{0,2})/i;
const AMOUNT_FALLBACK = /₹\s*([\d,]+\.?\d{0,2})/;

/**
 * Launch camera or gallery to pick a receipt image.
 * On iOS 16+, Live Text API recognition happens automatically in the camera view.
 * The extracted data is parsed for amounts via common receipt patterns.
 */
export async function scanReceipt(source: 'camera' | 'gallery' = 'camera'): Promise<ReceiptScanResult | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.8,
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

  const asset = result.assets[0];

  // On-device OCR would go here — for now return the image for manual entry
  // In production: use expo-modules to bridge Apple Vision's VNRecognizeTextRequest
  return {
    imageUri: asset.uri,
    amount: null,
    note: null,
    category: null,
  };
}

/**
 * Parse amount from recognized text (when OCR text is available).
 * Uses common receipt patterns to extract the total.
 */
export function parseReceiptText(text: string): { amount: number | null; note: string | null } {
  if (!text) return { amount: null, note: null };

  // Try to find "Total: ₹1,234.56" or similar patterns
  let match = text.match(AMOUNT_REGEX);
  if (!match) match = text.match(AMOUNT_FALLBACK);

  let amount: number | null = null;
  if (match?.[1]) {
    const cleaned = match[1].replace(/,/g, '');
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed) && parsed > 0) {
      amount = Math.round(parsed * 100); // convert to paise
    }
  }

  // Extract first line as potential note/merchant name
  const firstLine = text.split('\n').find(l => l.trim().length > 2 && !/^(total|amount|tax|receipt)/i.test(l.trim()));
  const note = firstLine?.trim().slice(0, 60) ?? null;

  return { amount, note };
}
