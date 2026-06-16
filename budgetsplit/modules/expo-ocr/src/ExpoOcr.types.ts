export type RecognitionOptions = {
  /** ISO 639-1 language codes for recognition. Defaults to ['en']. */
  languages?: string[];
  /** Use accurate (slower, better for receipts) vs fast recognition. Default true. */
  accurate?: boolean;
};
