import * as FileSystem from 'expo-file-system';

/**
 * Caches Mozilla pdf.js (UMD build) into the app's document directory so PDF
 * text extraction works OFFLINE after the first successful download. We inline
 * the cached source into the extractor WebView, so there's no runtime CDN
 * dependency once cached (and no fragile vendored megabyte files in the repo).
 */

// v3.x ships a real UMD build (global `pdfjsLib`) that we can inline into a
// classic <script>; v4 is ES-module only (.mjs), which is why the earlier build
// failed to load. Keep this a UMD-shipping version.
const PDFJS_VERSION = '3.11.174';
const CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;
// `?? ''` keeps this safe under the newer expo-file-system API surface.
const DIR = ((FileSystem as any).documentDirectory ?? '') + 'pdfjs/';
const MAIN = DIR + `pdf-${PDFJS_VERSION}.min.js`;
const WORKER = DIR + `pdf-worker-${PDFJS_VERSION}.min.js`;

async function ensureFile(localUri: string, url: string): Promise<void> {
  const info = await (FileSystem as any).getInfoAsync(localUri);
  if (!info?.exists) await (FileSystem as any).downloadAsync(url, localUri);
}

/**
 * Returns the pdf.js main + worker source (from cache, downloading once if
 * needed). Throws if it isn't cached and can't be fetched (offline first run)
 * — the caller then falls back to paste.
 */
export async function ensurePdfJsSource(): Promise<{ main: string; worker: string }> {
  await (FileSystem as any).makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
  await ensureFile(MAIN, `${CDN}/pdf.min.js`);
  await ensureFile(WORKER, `${CDN}/pdf.worker.min.js`);
  const [main, worker] = await Promise.all([
    (FileSystem as any).readAsStringAsync(MAIN),
    (FileSystem as any).readAsStringAsync(WORKER),
  ]);
  if (!main || !worker) throw new Error('pdf.js not available');
  return { main, worker };
}
