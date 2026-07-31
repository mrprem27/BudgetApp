import * as FileSystem from 'expo-file-system/legacy';
import type { ParsedLineItem, ReceiptExtractor, ReceiptScanResult } from './types';

function mimeTypeFor(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'heic' || ext === 'heif') return 'image/heic';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function isParsedLineItem(v: unknown): v is ParsedLineItem {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.name === 'string' && typeof o.qty === 'string' && typeof o.unitPrice === 'string';
}

/**
 * Cloud: sends the photo directly to a thin server-side proxy
 * (server/receipt-ocr-proxy), which forwards it to Gemini Flash's free tier
 * and returns structured line items in one call. The model sees the real 2-D
 * receipt layout instead of flattened OCR text, which is what fixes the
 * column-scrambling failures the on-device regex heuristic can't recover
 * from. No raw-text step exists on this path (rawText is always null) — see
 * ocrProviders/index.ts for the full provider comparison.
 */
export const geminiExtractor: ReceiptExtractor = {
  async extractLineItems(imageUri: string): Promise<ReceiptScanResult> {
    // Read inside the call (not a module-level const) so Jest can flip this
    // between tests without a module-registry reset; Expo's build-time babel
    // transform inlines EXPO_PUBLIC_* references wherever they appear, so
    // this costs nothing in the real app bundle.
    const proxyUrl = process.env.EXPO_PUBLIC_RECEIPT_OCR_PROXY_URL;
    if (!proxyUrl) {
      throw new Error('Cloud scan is not configured (EXPO_PUBLIC_RECEIPT_OCR_PROXY_URL is unset).');
    }

    const imageBase64 = await FileSystem.readAsStringAsync(imageUri, { encoding: 'base64' });

    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ imageBase64, mimeType: mimeTypeFor(imageUri) }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Cloud scan failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`);
    }

    const data = await response.json();
    const items = Array.isArray(data?.items) ? data.items.filter(isParsedLineItem) : [];
    return { rawText: null, candidates: items };
  },
};
