import { createHash } from 'crypto';
import pdfMinJs from '../assets/pdfjs/pdfMinJs';
import pdfWorkerMinJs from '../assets/pdfjs/pdfWorkerMinJs';
import { ensurePdfJsSource, PDFJS_SHA256 } from '../lib/pdfjsCache';

// pdf.js used to be downloaded from a CDN on first use and cached to disk —
// the vendored files in src/assets/pdfjs/ replace that, so this pins the one
// property that mattered before and still matters now: the source handed to
// the extractor WebView actually matches its pinned, vetted hash.

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

describe('ensurePdfJsSource', () => {
  it('resolves the vendored main + worker source', async () => {
    const { main, worker } = await ensurePdfJsSource();
    expect(typeof main).toBe('string');
    expect(typeof worker).toBe('string');
    expect(main.length).toBeGreaterThan(1000);
    expect(worker.length).toBeGreaterThan(1000);
  });

  it('the vendored files actually match their pinned hash', () => {
    // The real regression this guards: a vendored file edited (or re-vendored
    // from a different version) without updating PDFJS_SHA256 to match.
    expect(sha256(pdfMinJs)).toBe(PDFJS_SHA256['pdf.min.js']);
    expect(sha256(pdfWorkerMinJs)).toBe(PDFJS_SHA256['pdf.worker.min.js']);
  });

  it('throws PdfJsIntegrityError if a vendored file stops matching its pinned hash', async () => {
    jest.resetModules();
    jest.doMock('../assets/pdfjs/pdfMinJs', () => ({ __esModule: true, default: 'tampered content' }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ensurePdfJsSource: reloaded, PdfJsIntegrityError } = require('../lib/pdfjsCache');
    await expect(reloaded()).rejects.toBeInstanceOf(PdfJsIntegrityError);
    jest.dontMock('../assets/pdfjs/pdfMinJs');
    jest.resetModules();
  });
});
