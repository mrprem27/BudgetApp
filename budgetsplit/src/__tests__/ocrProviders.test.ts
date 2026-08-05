import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(),
}));
jest.mock('../lib/ocr', () => ({
  recognizeText: jest.fn(),
  parseReceiptLineItems: jest.fn(),
}));

import * as FileSystem from 'expo-file-system/legacy';
import { recognizeText, parseReceiptLineItems } from '../lib/ocr';
import { settings } from '../lib/settings';
import { getReceiptExtractor } from '../lib/ocrProviders';
import { deviceExtractor } from '../lib/ocrProviders/device';
import { geminiExtractor } from '../lib/ocrProviders/gemini';

const store = AsyncStorage as unknown as { __reset: () => void };
const mockReadAsString = FileSystem.readAsStringAsync as jest.MockedFunction<typeof FileSystem.readAsStringAsync>;
const mockRecognizeText = recognizeText as jest.MockedFunction<typeof recognizeText>;
const mockParseLineItems = parseReceiptLineItems as jest.MockedFunction<typeof parseReceiptLineItems>;

const ORIGINAL_PROXY_URL = process.env.EXPO_PUBLIC_RECEIPT_OCR_PROXY_URL;

beforeEach(() => {
  store.__reset();
  jest.clearAllMocks();
  global.fetch = jest.fn() as unknown as typeof fetch;
});

afterEach(() => {
  process.env.EXPO_PUBLIC_RECEIPT_OCR_PROXY_URL = ORIGINAL_PROXY_URL;
});

describe('getReceiptExtractor (factory)', () => {
  // The cloud path is no longer the bare gemini extractor: it is wrapped so a failed
  // cloud call falls back to on-device rather than dead-ending (`V2-13`). Identity
  // against `geminiExtractor` is therefore the wrong assertion — behaviour is the
  // contract. `ocrFallback.test.ts` covers the wrapper itself.
  it('defaults to the cloud path when no provider setting is stored', async () => {
    const e = await getReceiptExtractor();
    expect(e).not.toBe(deviceExtractor);
    expect(typeof e.extractLineItems).toBe('function');
  });

  it('returns the device extractor UNWRAPPED when explicitly set', async () => {
    // Choosing on-device is a privacy choice: there is nothing to fall back to, and
    // wrapping it would imply a cloud attempt that must never happen.
    await settings.setOcrProvider('device');
    expect(await getReceiptExtractor()).toBe(deviceExtractor);
  });

  it('treats any stored value other than "device" as the cloud path', async () => {
    await settings.setOcrProvider('gemini');
    expect(await getReceiptExtractor()).not.toBe(deviceExtractor);
  });
});

describe('deviceExtractor', () => {
  it('delegates to recognizeText + parseReceiptLineItems and returns the real raw text', async () => {
    mockRecognizeText.mockResolvedValue('SOME RAW TEXT');
    mockParseLineItems.mockReturnValue([{ name: 'Coffee', qty: '1', unitPrice: '150.00' }]);

    const result = await deviceExtractor.extractLineItems('file:///receipt.jpg');

    expect(mockRecognizeText).toHaveBeenCalledWith('file:///receipt.jpg', { languages: ['en'], accurate: true });
    expect(mockParseLineItems).toHaveBeenCalledWith('SOME RAW TEXT');
    expect(result).toEqual({ rawText: 'SOME RAW TEXT', candidates: [{ name: 'Coffee', qty: '1', unitPrice: '150.00' }] });
  });

  it('propagates a recognizeText failure so the caller can surface it', async () => {
    mockRecognizeText.mockRejectedValue(new Error('native OCR failure'));
    await expect(deviceExtractor.extractLineItems('file:///receipt.jpg')).rejects.toThrow('native OCR failure');
  });
});

describe('geminiExtractor', () => {
  it('throws a clear error when the proxy URL is not configured', async () => {
    delete process.env.EXPO_PUBLIC_RECEIPT_OCR_PROXY_URL;
    await expect(geminiExtractor.extractLineItems('file:///receipt.jpg')).rejects.toThrow(/not configured/);
  });

  it('posts base64 image data to the proxy and returns validated items (rawText is always null)', async () => {
    process.env.EXPO_PUBLIC_RECEIPT_OCR_PROXY_URL = 'https://proxy.example.com/scan';
    mockReadAsString.mockResolvedValue('ZmFrZS1iYXNlNjQ=');
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ name: 'Coffee', qty: '1', unitPrice: '150.00' }] }),
    });

    const result = await geminiExtractor.extractLineItems('file:///receipt.png');

    expect(mockReadAsString).toHaveBeenCalledWith('file:///receipt.png', { encoding: 'base64' });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://proxy.example.com/scan');
    expect(JSON.parse(init.body)).toEqual({ imageBase64: 'ZmFrZS1iYXNlNjQ=', mimeType: 'image/png' });
    expect(result).toEqual({ rawText: null, candidates: [{ name: 'Coffee', qty: '1', unitPrice: '150.00' }] });
  });

  it('drops malformed items instead of throwing or passing them through', async () => {
    process.env.EXPO_PUBLIC_RECEIPT_OCR_PROXY_URL = 'https://proxy.example.com/scan';
    mockReadAsString.mockResolvedValue('ZmFrZQ==');
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ name: 'Coffee', qty: '1', unitPrice: '150.00' }, { name: 'Bad', qty: 2 }, null, 'garbage'] }),
    });

    const result = await geminiExtractor.extractLineItems('file:///receipt.jpg');

    expect(result.candidates).toEqual([{ name: 'Coffee', qty: '1', unitPrice: '150.00' }]);
  });

  it('throws with the status code when the proxy responds with a non-2xx status', async () => {
    process.env.EXPO_PUBLIC_RECEIPT_OCR_PROXY_URL = 'https://proxy.example.com/scan';
    mockReadAsString.mockResolvedValue('ZmFrZQ==');
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => 'upstream Gemini error',
    });

    await expect(geminiExtractor.extractLineItems('file:///receipt.jpg')).rejects.toThrow(/502/);
  });
});
