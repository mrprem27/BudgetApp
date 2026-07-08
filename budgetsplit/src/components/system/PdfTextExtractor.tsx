import React from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

/**
 * Off-screen WebView that extracts text from a PDF using Mozilla's pdf.js.
 * On-device RN can't read a compressed (FlateDecode) PDF's text directly, so we
 * run pdf.js in a WebView: pass the PDF as base64, walk every page's
 * getTextContent(), and post the reconstructed text back. The GPay parser is
 * tolerant of the (scrambled) line order pdf.js produces.
 *
 * pdf.js loads from a CDN on first use (needs network once); if it fails, the
 * caller falls back to paste. Bundling pdf.js locally is a later hardening step.
 */

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168';

function buildHtml(base64: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body>
<script type="module">
  import * as pdfjsLib from '${PDFJS}/pdf.min.mjs';
  pdfjsLib.GlobalWorkerOptions.workerSrc = '${PDFJS}/pdf.worker.min.mjs';
  const post = (type, payload) => window.ReactNativeWebView.postMessage(JSON.stringify({ type, payload }));
  (async () => {
    try {
      const b64 = "${base64}";
      const raw = atob(b64);
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
    } catch (e) { post('error', String((e && e.message) || e)); }
  })();
</script></body></html>`;
}

type Props = {
  /** base64 of the picked PDF (no data: prefix). */
  base64: string;
  onText: (text: string) => void;
  onError: (message: string) => void;
};

export function PdfTextExtractor({ base64, onText, onError }: Props) {
  return (
    <View style={styles.offscreen} pointerEvents="none">
      <WebView
        originWhitelist={['*']}
        javaScriptEnabled
        source={{ html: buildHtml(base64) }}
        onMessage={(e: { nativeEvent: { data: string } }) => {
          try {
            const m = JSON.parse(e.nativeEvent.data);
            if (m.type === 'text' && typeof m.payload === 'string') onText(m.payload);
            else onError(typeof m.payload === 'string' ? m.payload : 'Could not read the PDF.');
          } catch {
            onError('Could not read the PDF.');
          }
        }}
        onError={() => onError('Could not load the PDF reader.')}
        onHttpError={() => onError('Could not load the PDF reader.')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // 1×1 and pushed off-screen — mounted only while extracting.
  offscreen: { position: 'absolute', width: 1, height: 1, left: -1000, top: -1000, opacity: 0 },
});
