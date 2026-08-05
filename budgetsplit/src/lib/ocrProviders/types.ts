import type { ParsedLineItem } from '../ocr';

export type { ParsedLineItem };

export interface ReceiptScanResult {
  /** Raw OCR text, shown as a debug/verification panel. Null when the
   *  provider extracts structured items directly from the image with no
   *  intermediate flattened-text step (e.g. a cloud vision model). */
  rawText: string | null;
  candidates: ParsedLineItem[];
  /**
   * Which provider actually produced this — not which one was configured.
   *
   * These differ when the cloud call fails and the device extractor covers for it
   * (`V2-13`). The user has to be told: on-device reading misses items on cramped
   * receipts far more often, so "check the list" is honest advice in that case and
   * noise otherwise. Optional so a provider that never falls back can omit it.
   */
  provider?: 'gemini' | 'device';
  /** True when the configured cloud provider failed and `device` covered for it. */
  fellBack?: boolean;
}

export interface ReceiptExtractor {
  extractLineItems(imageUri: string): Promise<ReceiptScanResult>;
}
