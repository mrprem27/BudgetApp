import { settings } from '../settings';
import { deviceExtractor } from './device';
import { geminiExtractor } from './gemini';
import type { ReceiptExtractor } from './types';

export type { ReceiptExtractor, ReceiptScanResult, ParsedLineItem } from './types';

/**
 * Receipt-OCR provider comparison (ranked). Toggle via settings.setOcrProvider
 * (src/lib/settings.ts) — no settings-screen row yet, call it directly.
 *
 * 1. gemini (default) — sends the photo directly to Gemini Flash's free tier
 *    via server/receipt-ocr-proxy. Best free accuracy: the model sees the
 *    real 2-D layout instead of flattened OCR text, so it doesn't inherit
 *    the column-scrambling failures the regex heuristic can't fix. Free tier
 *    is shared across the whole app (not per-user) and was cut 50-80% in
 *    late 2025 — still far more than personal/small-scale use needs, but
 *    watch quota (or move to a paid tier) before any real user-base growth.
 * 2. mistral (documented, NOT implemented) — free "Experiment" tier ships a
 *    dedicated OCR model + Pixtral vision with a very generous 1B
 *    tokens/month, but caps at 2 requests/minute — too tight to be primary.
 *    Worth wiring up later as an automatic fallback when gemini's quota is
 *    exhausted, not as a user-facing toggle option.
 * 3. device — Apple Vision + regex heuristic (lib/ocr.ts). Free, fully
 *    offline, most private (photo never leaves the phone). Weakest accuracy
 *    on two-line item layouts — the raw-text debug panel exists specifically
 *    to make that failure visible and fixable by hand rather than silently
 *    wrong.
 */
export async function getReceiptExtractor(): Promise<ReceiptExtractor> {
  const provider = await settings.ocrProvider();
  return provider === 'device' ? deviceExtractor : geminiExtractor;
}
