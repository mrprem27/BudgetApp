import { digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';
import pdfMinJs from '../assets/pdfjs/pdfMinJs';
import pdfWorkerMinJs from '../assets/pdfjs/pdfWorkerMinJs';

/**
 * Mozilla pdf.js (UMD build), vendored into the app bundle rather than fetched
 * from a CDN on first use — text extraction works fully offline from the first
 * launch, and doesn't depend on cdnjs's uptime. We inline the source into the
 * extractor WebView (see `PdfTextExtractor.tsx`), so there's no runtime network
 * dependency at all on this path now.
 *
 * This used to download and cache the two files into the document directory
 * instead. That made the *first* PDF import on a fresh install require
 * network access, and made the whole feature depend on a third party's CDN
 * staying up. Vendoring costs ~1.4MB in the bundle (two plain JS text files,
 * `src/assets/pdfjs/`) in exchange for removing both dependencies entirely.
 */

// v3.x ships a real UMD build (global `pdfjsLib`) we can inline into a classic
// <script>; v4 is ES-module only (.mjs). Keep a UMD-shipping version.
const PDFJS_VERSION = '3.11.174';
// Kept only for the CDN `<script>` fallback in `PdfTextExtractor.tsx` — the
// bundled source below can't itself fail to be "available", so that fallback
// now only matters if the vendored file were ever hand-edited without
// updating `PDFJS_SHA256` (see `PdfJsIntegrityError` below).
export const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

/**
 * SHA-256 of each vendored file, as published by cdnjs for PDFJS_VERSION at
 * the time it was vendored (verified against `curl -s $PDFJS_CDN/<file> |
 * shasum -a 256` before committing `src/assets/pdfjs/`).
 *
 * This source is inlined into a WebView and executed, and that WebView is
 * handed the user's financial PDF — so this checks the vendored file still
 * matches what was actually vetted, the same guarantee the old
 * download-and-verify path gave, just against the bundle instead of the network.
 */
export const PDFJS_SHA256: Record<string, string> = {
  'pdf.min.js':        '5b5799e6f8c680663207ac5b42ee14eed2a406fa7af48f50c154f0c0b1566946',
  'pdf.worker.min.js': 'feabdf309770ed24bba31a5467836cdc8cf639c705af27d52b585b041bb8527b',
};

/**
 * The same digests, base64-encoded for a Subresource Integrity attribute. Used by
 * the CDN <script> fallback, which loads the bundle directly instead of inlining
 * it — the browser enforces these, so that path is verified too.
 *   curl -s $PDFJS_CDN/pdf.min.js | openssl dgst -sha256 -binary | openssl base64 -A
 */
export const PDFJS_SRI: Record<string, string> = {
  'pdf.min.js':        'sha256-W1eZ5vjGgGYyB6xbQu4U7tKkBvp69I9QwVTwwLFWaUY=',
  'pdf.worker.min.js': 'sha256-/qvfMJdw7SS7oxpUZ4Ns3Iz2OccFryfVK1hbBBu4Uns=',
};

/** Thrown when a vendored bundle doesn't match its pinned hash. */
export class PdfJsIntegrityError extends Error {
  constructor(remoteName: string) {
    super(`pdf.js integrity check failed for ${remoteName}`);
    this.name = 'PdfJsIntegrityError';
  }
}

async function verifiedSource(source: string, remoteName: string): Promise<string> {
  const expected = PDFJS_SHA256[remoteName];
  const actual = await digestStringAsync(CryptoDigestAlgorithm.SHA256, source);
  if (expected && actual !== expected) throw new PdfJsIntegrityError(remoteName);
  return source;
}

/**
 * Returns the pdf.js main + worker source, straight from the bundle. Still
 * `async` and still throws on a hash mismatch — same public shape as the old
 * download-based version, so `PdfTextExtractor.tsx`'s fallback logic needs no
 * changes.
 */
export async function ensurePdfJsSource(): Promise<{ main: string; worker: string }> {
  const main = await verifiedSource(pdfMinJs, 'pdf.min.js');
  const worker = await verifiedSource(pdfWorkerMinJs, 'pdf.worker.min.js');
  if (!main || !worker) throw new Error('pdf.js not available');
  return { main, worker };
}
