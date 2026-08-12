import { File, Directory, Paths } from 'expo-file-system';
import { digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';

/**
 * Caches Mozilla pdf.js (UMD build) into the app's document directory so PDF
 * text extraction works OFFLINE after the first successful download. We inline
 * the cached source into the extractor WebView, so there's no runtime CDN
 * dependency once cached (and no vendored megabyte files in the repo).
 *
 * Uses the new expo-file-system `File`/`Directory` API because it is the current
 * one, not because the legacy API is broken.
 *
 * This comment used to claim the legacy `readAsStringAsync`/`downloadAsync` throw
 * at runtime in SDK 56. **That is not supported by the version we ship against.**
 * `expo-file-system@56.0.8` exports `./legacy` from its package exports map,
 * `src/legacy/FileSystem.ts` genuinely implements `documentDirectory`,
 * `readAsStringAsync`, `copyAsync` and `makeDirectoryAsync`, the native
 * `FileSystemLegacyModule` is registered in `expo-module.config.json`, and the
 * shim used when that module is absent nulls the directory constants rather than
 * throwing. `src/lib/avatar.ts` and `ocrProviders/gemini.ts` still use the legacy
 * API and there is no evidence here that they are broken.
 *
 * Left as a note rather than deleted because a false claim of this shape invites
 * someone to rewrite two working modules. Reading source cannot prove *native*
 * behaviour, so one device smoke test still closes it out — see §5 of the launch
 * checklist.
 */

// v3.x ships a real UMD build (global `pdfjsLib`) we can inline into a classic
// <script>; v4 is ES-module only (.mjs). Keep a UMD-shipping version.
const PDFJS_VERSION = '3.11.174';
export const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

/**
 * SHA-256 of each pinned file, as published by cdnjs for PDFJS_VERSION.
 *
 * This source is inlined into a WebView and executed, and that WebView is handed
 * the user's financial PDF — so pinning the version is not enough on its own,
 * because the *content* at that URL could change. Verified on every download and
 * on every cache read, so a tampered or truncated cache file can't be executed
 * either. Regenerate when bumping PDFJS_VERSION:
 *   curl -s $PDFJS_CDN/pdf.min.js | shasum -a 256
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

const CACHE_DIR = new Directory(Paths.document, 'pdfjs');

/** Thrown when a cached/downloaded bundle doesn't match its pinned hash. */
export class PdfJsIntegrityError extends Error {
  constructor(remoteName: string) {
    super(`pdf.js integrity check failed for ${remoteName}`);
    this.name = 'PdfJsIntegrityError';
  }
}

async function ensureFileSource(name: string, remoteName: string): Promise<string> {
  const file = new File(CACHE_DIR, name);
  if (!file.exists) {
    if (!CACHE_DIR.exists) CACHE_DIR.create({ intermediates: true });
    await File.downloadFileAsync(`${PDFJS_CDN}/${remoteName}`, file);
  }

  const source = await file.text();
  const expected = PDFJS_SHA256[remoteName];
  const actual = await digestStringAsync(CryptoDigestAlgorithm.SHA256, source);
  if (expected && actual !== expected) {
    // Drop it so the next attempt re-downloads rather than failing forever on a
    // poisoned cache entry.
    try { file.delete(); } catch { /* best-effort */ }
    throw new PdfJsIntegrityError(remoteName);
  }
  return source;
}

/**
 * Returns the pdf.js main + worker source (from cache, downloading once if
 * needed). Throws if it isn't cached and can't be fetched (offline first run)
 * — the caller then falls back to the CDN <script> or to paste.
 */
export async function ensurePdfJsSource(): Promise<{ main: string; worker: string }> {
  const main = await ensureFileSource(`pdf-${PDFJS_VERSION}.min.js`, 'pdf.min.js');
  const worker = await ensureFileSource(`pdf-worker-${PDFJS_VERSION}.min.js`, 'pdf.worker.min.js');
  if (!main || !worker) throw new Error('pdf.js not available');
  return { main, worker };
}
