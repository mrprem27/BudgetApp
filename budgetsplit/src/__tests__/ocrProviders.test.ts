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
  it('defaults to gemini when no provider setting is stored', async () => {
    expect(await getReceiptExtractor()).toBe(geminiExtractor);
  });

  it('returns the device extractor when explicitly set', async () => {
    await settings.setOcrProvider('device');
    expect(await getReceiptExtractor()).toBe(deviceExtractor);
  });

  it('falls back to gemini for any stored value other than "device"', async () => {
    await settings.setOcrProvider('gemini');
    expect(await getReceiptExtractor()).toBe(geminiExtractor);
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
