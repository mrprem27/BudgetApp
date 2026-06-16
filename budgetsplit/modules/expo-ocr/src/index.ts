import { requireNativeModule } from 'expo-modules-core';
import type { RecognitionOptions } from './ExpoOcr.types';

export type { RecognitionOptions };

const ExpoOcr = requireNativeModule('ExpoOcr');

/**
 * Recognize text in an image using on-device OCR.
 * iOS: Apple Vision (VNRecognizeTextRequest)
 * Android: Google ML Kit (future)
 */
export async function recognizeText(
  imageUri: string,
  options?: RecognitionOptions,
): Promise<string> {
  return ExpoOcr.recognizeText(imageUri, options ?? {});
}
