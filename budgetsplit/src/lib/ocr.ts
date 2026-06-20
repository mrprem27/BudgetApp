import * as ImagePicker from 'expo-image-picker';
import { recognizeText } from 'expo-ocr';

export type ReceiptScanResult = {
  imageUri: string;
  amount: number | null;
  note: string | null;
  category: string | null;
  rawText: string | null;
};

const AMOUNT_REGEX = /(?:total|amount|grand\s*total|net|balance|due)[:\s]*(?:₹|rs\.?|inr)?\s*([\d,]+\.?\d{0,2})/i;
const AMOUNT_FALLBACK = /₹\s*([\d,]+\.?\d{0,2})/;

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

  let rawText: string | null = null;
  try {
    rawText = await recognizeText(asset.uri, { languages: ['en'], accurate: true });
  } catch (error) {
    console.warn('[OCR] Recognition failed:', error);
  }

  if (!rawText) {
    return { imageUri: asset.uri, amount: null, note: null, category: null, rawText: null };
  }

  const parsed = parseReceiptText(rawText);

  return {
    imageUri: asset.uri,
    amount: parsed.amount,
    note: parsed.note,
    category: null,
    rawText,
  };
}

export function parseReceiptText(text: string): { amount: number | null; note: string | null } {
  if (!text) return { amount: null, note: null };

  let match = text.match(AMOUNT_REGEX);
  if (!match) match = text.match(AMOUNT_FALLBACK);

  let amount: number | null = null;
  if (match?.[1]) {
    const cleaned = match[1].replace(/,/g, '');
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed) && parsed > 0) {
      amount = Math.round(parsed * 100);
    }
  }

  const firstLine = text.split('\n').find(l => l.trim().length > 2 && !/^(total|amount|tax|receipt)/i.test(l.trim()));
  const note = firstLine?.trim().slice(0, 60) ?? null;

  return { amount, note };
}
