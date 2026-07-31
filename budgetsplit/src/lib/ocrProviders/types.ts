import type { ParsedLineItem } from '../ocr';

export type { ParsedLineItem };

export interface ReceiptScanResult {
  /** Raw OCR text, shown as a debug/verification panel. Null when the
   *  provider extracts structured items directly from the image with no
   *  intermediate flattened-text step (e.g. a cloud vision model). */
  rawText: string | null;
  candidates: ParsedLineItem[];
}

export interface ReceiptExtractor {
  extractLineItems(imageUri: string): Promise<ReceiptScanResult>;
}
