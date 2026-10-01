import { requireOptionalNativeModule } from 'expo-modules-core';
import type { RecognitionOptions } from './ExpoOcr.types';

export type { RecognitionOptions };

// Optional: the module is Apple-only (`expo-module.config.json`). `requireNativeModule` throws
// where it is missing, and it ran at import, so on Android every screen that reaches this file
// (Split by items, through the receipt reader) crashed before it drew anything.
const ExpoOcr = requireOptionalNativeModule('ExpoOcr');

/** Whether this phone can read text from a photo on its own (iOS: Apple Vision; Android: not yet). */
export const ocrAvailable: boolean = ExpoOcr != null;

/**
 * Recognize text in an image using on-device OCR.
 * iOS: Apple Vision (VNRecognizeTextRequest)
 * Android: Google ML Kit (future); until then this rejects, and callers check `ocrAvailable`.
 */
export async function recognizeText(
  imageUri: string,
  options?: RecognitionOptions,
): Promise<string> {
  if (!ExpoOcr) throw new Error('Reading text on this phone is not available yet.');
  return ExpoOcr.recognizeText(imageUri, options ?? {});
}
