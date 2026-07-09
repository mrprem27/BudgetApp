import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { ensurePdfJsSource, PDFJS_CDN } from '../../lib/pdfjsCache';

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

function cdnHtml(base64: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body>
<script src="${PDFJS_CDN}/pdf.min.js" onerror="window.__pdfLoadErr=1"></script>
<script>${EXTRACT(base64, `
  if (window.__pdfLoadErr) { post('error', 'Could not download pdf.js from ${PDFJS_CDN}/pdf.min.js (offline or blocked).'); return; }
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
    // Prefer the offline cache; on any cache/FileSystem error, fall back to CDN
    // (so a broken cache path still extracts when online).
    ensurePdfJsSource()
      .then(({ main, worker }) => { if (alive) setHtml(inlineHtml(base64, main, worker)); })
      .catch(() => { if (alive) setHtml(cdnHtml(base64)); });
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
        onError={(e: any) => onError('WebView error: ' + (e?.nativeEvent?.description ?? 'unknown') + (e?.nativeEvent?.code != null ? ' (code ' + e.nativeEvent.code + ')' : ''))}
        onHttpError={(e: any) => onError('WebView HTTP ' + (e?.nativeEvent?.statusCode ?? '?') + ' loading ' + (e?.nativeEvent?.url ?? 'pdf.js'))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  offscreen: { position: 'absolute', width: 1, height: 1, left: -1000, top: -1000, opacity: 0 },
});
