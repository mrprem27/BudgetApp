import { withDeviceFallback } from '../lib/ocrProviders';
import type { ReceiptExtractor, ReceiptScanResult } from '../lib/ocrProviders/types';

// `index.ts` imports gemini at module load, which pulls in `expo-file-system/legacy`
// (untransformed ESM). The real cloud extractor is never exercised here — every test
// injects its own primary — so stubbing the module is enough to keep the import graph
// loadable without adding a global mapping for one file.
jest.mock('../lib/ocrProviders/gemini', () => ({
  geminiExtractor: { extractLineItems: jest.fn() },
}));

jest.mock('../lib/ocrProviders/device', () => ({
  deviceExtractor: {
    extractLineItems: jest.fn(async () => ({ rawText: 'local text', candidates: [{ name: 'Idli', price: '40' }] })),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { deviceExtractor } = require('../lib/ocrProviders/device') as {
  deviceExtractor: { extractLineItems: jest.Mock };
};

const ok = (over: Partial<ReceiptScanResult> = {}): ReceiptExtractor => ({
  extractLineItems: jest.fn(async () => ({ rawText: null, candidates: [{ name: 'Dosa', price: '90' }], ...over } as ReceiptScanResult)),
});

const failing = (msg = 'Cloud scan failed (429)'): ReceiptExtractor => ({
  extractLineItems: jest.fn(async () => { throw new Error(msg); }),
});

beforeEach(() => {
  deviceExtractor.extractLineItems.mockClear();
  deviceExtractor.extractLineItems.mockImplementation(async () => ({
    rawText: 'local text', candidates: [{ name: 'Idli', price: '40' }],
  }));
});

describe('withDeviceFallback — the cloud path succeeds', () => {
  it('returns the cloud result and never touches the device extractor', async () => {
    const r = await withDeviceFallback(ok()).extractLineItems('file://x.jpg');
    expect(r.candidates[0].name).toBe('Dosa');
    expect(r.provider).toBe('gemini');
    expect(r.fellBack).toBeUndefined();
    expect(deviceExtractor.extractLineItems).not.toHaveBeenCalled();
  });

  it('preserves whatever the cloud returned, only stamping the provider', async () => {
    const r = await withDeviceFallback(ok({ rawText: 'cloud raw' })).extractLineItems('file://x.jpg');
    expect(r.rawText).toBe('cloud raw');
  });
});

describe('withDeviceFallback — the cloud path fails', () => {
  it('falls back to the device and flags that it did', async () => {
    const r = await withDeviceFallback(failing()).extractLineItems('file://x.jpg');
    expect(r.candidates[0].name).toBe('Idli');
    expect(r.provider).toBe('device');
    expect(r.fellBack).toBe(true);
  });

  it('covers every failure shape, not just a quota code', async () => {
    // From the phone, a 429, a 500, an unset proxy URL and a dead network are the
    // same event — the cloud didn't answer — and the useful response is identical.
    for (const msg of ['Cloud scan failed (429)', 'Cloud scan failed (500)', 'Network request failed', 'Cloud scan is not configured']) {
      const r = await withDeviceFallback(failing(msg)).extractLineItems('file://x.jpg');
      expect(r.fellBack).toBe(true);
    }
  });

  it('passes the same image through to the device extractor', async () => {
    await withDeviceFallback(failing()).extractLineItems('file://receipt-42.jpg');
    expect(deviceExtractor.extractLineItems).toHaveBeenCalledWith('file://receipt-42.jpg');
  });

  it('still reports a fallback when the device finds nothing', async () => {
    // An empty result is a real answer, not a failure — it must not rethrow.
    deviceExtractor.extractLineItems.mockImplementationOnce(async () => ({ rawText: '', candidates: [] }));
    const r = await withDeviceFallback(failing()).extractLineItems('file://x.jpg');
    expect(r.candidates).toEqual([]);
    expect(r.fellBack).toBe(true);
  });
});

describe('withDeviceFallback — both paths fail', () => {
  it('rethrows the CLOUD error, because that is the provider the user chose', async () => {
    deviceExtractor.extractLineItems.mockImplementationOnce(async () => { throw new Error('Vision unavailable'); });
    await expect(withDeviceFallback(failing('Cloud scan failed (429)')).extractLineItems('file://x.jpg'))
      .rejects.toThrow('Cloud scan failed (429)');
  });
});
