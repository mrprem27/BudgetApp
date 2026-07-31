import { recognizeText, parseReceiptLineItems } from '../ocr';
import type { ReceiptExtractor, ReceiptScanResult } from './types';

/**
 * On-device: Apple Vision OCR (expo-ocr) + the regex line-item heuristic in
 * lib/ocr.ts, both unchanged. Free, fully offline, most private — the photo
 * never leaves the phone. See ocrProviders/index.ts for the full comparison
 * against the cloud provider.
 */
export const deviceExtractor: ReceiptExtractor = {
  async extractLineItems(imageUri: string): Promise<ReceiptScanResult> {
    const rawText = await recognizeText(imageUri, { languages: ['en'], accurate: true });
    return { rawText, candidates: parseReceiptLineItems(rawText) };
  },
};
