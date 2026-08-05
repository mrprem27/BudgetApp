import { settings } from '../settings';
import { deviceExtractor } from './device';
import { geminiExtractor } from './gemini';
import type { ReceiptExtractor } from './types';

export type { ReceiptExtractor, ReceiptScanResult, ParsedLineItem } from './types';

/**
 * Receipt-OCR provider comparison (ranked). The user picks between 1 and 3 via
 * Feature management → Smart capture → "Cloud Receipt Scanning", which writes
 * settings.setOcrProvider (src/lib/settings.ts). This is the only setting in the
 * app that decides whether user content leaves the device, so the switch's caption
 * says so outright rather than leaving it to this comment.
 *
 * 1. gemini (default) — sends the photo directly to Gemini Flash's free tier
 *    via server/receipt-ocr-proxy. Best free accuracy: the model sees the
 *    real 2-D layout instead of flattened OCR text, so it doesn't inherit
 *    the column-scrambling failures the regex heuristic can't fix. Free tier
 *    is shared across the whole app (not per-user) and was cut 50-80% in
 *    late 2025 — still far more than personal/small-scale use needs, but
 *    watch quota (or move to a paid tier) before any real user-base growth.
 * 2. mistral — considered as the quota fallback and **deliberately not built**
 *    (`V2-13`). Its free tier is generous on volume but caps at 2 requests/minute,
 *    and adding it would mean a second vendor, key and proxy route to solve a
 *    problem `device` already solves offline, for free, with code that exists.
 *    A second cloud provider also inherits the same per-app quota problem later.
 *    If accuracy on cramped receipts ever justifies the operational cost, this is
 *    where it slots in.
 * 3. device — Apple Vision + regex heuristic (lib/ocr.ts). Free, fully
 *    offline, most private (photo never leaves the phone). Weakest accuracy
 *    on two-line item layouts — the raw-text debug panel exists specifically
 *    to make that failure visible and fixable by hand rather than silently
 *    wrong.
 */
export async function getReceiptExtractor(): Promise<ReceiptExtractor> {
  const provider = await settings.ocrProvider();
  return provider === 'device' ? deviceExtractor : withDeviceFallback(geminiExtractor);
}

/**
 * Cloud first, device if the cloud call fails for any reason (`V2-13`).
 *
 * The quota that matters is **app-wide, not per-user** — Gemini's free tier is shared
 * across every install and was cut 50-80% in late 2025 — so exhaustion is a certainty
 * at some scale, and it arrives as a failed request for everyone at once. Before this,
 * that surfaced as a scan error and a dead end with a receipt already photographed.
 *
 * The fallback is unconditional rather than quota-specific on purpose: from the phone's
 * side a 429, a 500, an expired proxy URL and a dead network are the same event — the
 * cloud didn't answer — and the useful response to all of them is identical. Matching on
 * status codes would mean guessing which failures are worth covering, and being wrong
 * silently.
 *
 * If **both** fail, the cloud error is rethrown, not the device one: the user chose cloud,
 * so that's the failure that explains what went wrong.
 */
export function withDeviceFallback(primary: ReceiptExtractor): ReceiptExtractor {
  return {
    async extractLineItems(imageUri: string) {
      try {
        return { ...(await primary.extractLineItems(imageUri)), provider: 'gemini' as const };
      } catch (cloudError) {
        try {
          const local = await deviceExtractor.extractLineItems(imageUri);
          return { ...local, provider: 'device' as const, fellBack: true };
        } catch {
          throw cloudError;
        }
      }
    },
  };
}
