import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewErrorEvent, WebViewHttpErrorEvent } from 'react-native-webview/lib/WebViewTypes';
import { ensurePdfJsSource, PDFJS_CDN, PDFJS_SRI, PdfJsIntegrityError } from '../../lib/pdfjsCache';

/**
 * Off-screen WebView that extracts text from a PDF using Mozilla's pdf.js.
 * On-device RN can't read a compressed (FlateDecode) PDF's text directly, so we
 * run pdf.js in a WebView: pass the PDF as base64, walk every page's
 * getTextContent(), and post the reconstructed text back. The GPay parser is
 * tolerant of the (scrambled) line order pdf.js produces.
 *
 * Primary path INLINES pdf.js from the local cache ([[pdfjsCache]]) so it works
 * offline after first use; if caching fails (e.g. no network on first run) it
 * FALLS BACK to loading pdf.js from the CDN in the page. Every failure posts a
 * real, specific message so the caller can show it (no generic swallowing).
 */

// Minified JS can't contain a literal </script> — neutralise before inlining.
const safe = (js: string) => js.replace(/<\/script/gi, '<\\/script');

// The extraction routine, shared by both load strategies. `bootstrap` sets up
// pdfjsLib.GlobalWorkerOptions.workerSrc for its strategy.
const EXTRACT = (base64: string, bootstrap: string) => `
  (async () => {
    const post = (type, payload) => window.ReactNativeWebView.postMessage(JSON.stringify({ type, payload }));
    try {
      if (typeof pdfjsLib === 'undefined') { post('error', 'pdf.js did not load (script blocked or no network on first run).'); return; }
      ${bootstrap}
      const raw = atob("${base64}");
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      let out = '';
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        for (const it of tc.items) { out += it.str; out += it.hasEOL ? '\\n' : ' '; }
        out += '\\n';
      }
      post('text', out);
    } catch (e) { post('error', 'pdf.js: ' + ((e && (e.message || e.name)) || e)); }
  })();`;

function inlineHtml(base64: string, main: string, worker: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body>
<script>${safe(main)}</script>
<script>${EXTRACT(base64, `
  const workerBlob = new Blob([${JSON.stringify(worker)}], { type: 'text/javascript' });
  pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);`)}</script>
</body></html>`;
}

// Fallback when the cache path is unusable. `integrity` makes the WebView itself
// reject a bundle whose bytes don't match the pin, so this route is verified too
// — without it, a cache failure would silently downgrade to executing whatever
// the CDN served. `onerror` fires on an integrity mismatch as well as a network
// failure, so the existing error path already covers both.
function cdnHtml(base64: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body>
<script src="${PDFJS_CDN}/pdf.min.js" integrity="${PDFJS_SRI['pdf.min.js']}" crossorigin="anonymous" onerror="window.__pdfLoadErr=1"></script>
<script>${EXTRACT(base64, `
  if (window.__pdfLoadErr || typeof pdfjsLib === 'undefined') { post('error', 'Could not load pdf.js from ${PDFJS_CDN}/pdf.min.js — it was unreachable, or failed its integrity check.'); return; }
  pdfjsLib.GlobalWorkerOptions.workerSrc = '${PDFJS_CDN}/pdf.worker.min.js';`)}</script>
</body></html>`;
}

type Props = {
  base64: string;
  onText: (text: string) => void;
  onError: (message: string) => void;
};

export function PdfTextExtractor({ base64, onText, onError }: Props) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // Prefer the offline cache; on a cache/FileSystem error fall back to the CDN
    // (so a broken cache path still extracts when online).
    ensurePdfJsSource()
      .then(({ main, worker }) => { if (alive) setHtml(inlineHtml(base64, main, worker)); })
      .catch((e) => {
        if (!alive) return;
        // An integrity failure is NOT a cache problem — the bytes were wrong.
        // Falling back would re-fetch the same suspect source, so stop instead.
        if (e instanceof PdfJsIntegrityError) {
          onError('pdf.js failed its integrity check, so it was not run. Import the statement as CSV or paste the text instead.');
          return;
        }
        setHtml(cdnHtml(base64));
      });
    return () => { alive = false; };
  }, [base64]);

  if (!html) return null;

  return (
    <View style={styles.offscreen} pointerEvents="none">
      <WebView
        originWhitelist={['*']}
        javaScriptEnabled
        source={{ html }}
        onMessage={(e: { nativeEvent: { data: string } }) => {
          try {
            const m = JSON.parse(e.nativeEvent.data);
            if (m.type === 'text' && typeof m.payload === 'string') onText(m.payload);
            else onError(typeof m.payload === 'string' ? m.payload : 'Unknown pdf.js error.');
          } catch {
            onError('Could not parse the PDF reader response.');
          }
        }}
        onError={(e: WebViewErrorEvent) => onError('WebView error: ' + (e?.nativeEvent?.description ?? 'unknown') + (e?.nativeEvent?.code != null ? ' (code ' + e.nativeEvent.code + ')' : ''))}
        onHttpError={(e: WebViewHttpErrorEvent) => onError('WebView HTTP ' + (e?.nativeEvent?.statusCode ?? '?') + ' loading ' + (e?.nativeEvent?.url ?? 'pdf.js'))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  offscreen: { position: 'absolute', width: 1, height: 1, left: -1000, top: -1000, opacity: 0 },
});
