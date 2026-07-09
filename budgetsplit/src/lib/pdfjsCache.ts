import { File, Directory, Paths } from 'expo-file-system';

/**
 * Caches Mozilla pdf.js (UMD build) into the app's document directory so PDF
 * text extraction works OFFLINE after the first successful download. We inline
 * the cached source into the extractor WebView, so there's no runtime CDN
 * dependency once cached (and no vendored megabyte files in the repo).
 *
 * Uses the new expo-file-system `File`/`Directory` API (the legacy
 * readAsStringAsync/downloadAsync throw at runtime in SDK 56).
 */

// v3.x ships a real UMD build (global `pdfjsLib`) we can inline into a classic
// <script>; v4 is ES-module only (.mjs). Keep a UMD-shipping version.
const PDFJS_VERSION = '3.11.174';
export const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

const CACHE_DIR = new Directory(Paths.document, 'pdfjs');

async function ensureFileSource(name: string, url: string): Promise<string> {
  const file = new File(CACHE_DIR, name);
  if (!file.exists) {
    if (!CACHE_DIR.exists) CACHE_DIR.create({ intermediates: true });
    await File.downloadFileAsync(url, file);
  }
  return file.text();
}

/**
 * Returns the pdf.js main + worker source (from cache, downloading once if
 * needed). Throws if it isn't cached and can't be fetched (offline first run)
 * — the caller then falls back to the CDN <script> or to paste.
 */
export async function ensurePdfJsSource(): Promise<{ main: string; worker: string }> {
  const main = await ensureFileSource(`pdf-${PDFJS_VERSION}.min.js`, `${PDFJS_CDN}/pdf.min.js`);
  const worker = await ensureFileSource(`pdf-worker-${PDFJS_VERSION}.min.js`, `${PDFJS_CDN}/pdf.worker.min.js`);
  if (!main || !worker) throw new Error('pdf.js not available');
  return { main, worker };
}
