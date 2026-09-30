/**
 * A phone number as a country code and the rest, so a number is stored with its code
 * (`+91 98765 43210`) instead of one being guessed when WhatsApp needs it (`U-44`).
 * Numbers are still stored as a human reads them; `waNumber` makes them machine-readable.
 */

/** The pilot is India-only. */
export const DEFAULT_DIAL_CODE = '91';

export type PhoneParts = { code: string; local: string };

/**
 * Stored text → code + number. A number saved before the code box existed (no `+`) reads as
 * the default code, so it gains one the next time it is saved. A `+` number we cannot split
 * keeps everything in `local` with no code, and is saved back unchanged.
 */
export function splitPhone(stored: string | null | undefined): PhoneParts {
  const s = (stored ?? '').trim();
  if (!s) return { code: DEFAULT_DIAL_CODE, local: '' };
  const spaced = /^\+(\d{1,3})[\s-]+(.+)$/.exec(s);
  if (spaced) return { code: spaced[1], local: spaced[2].trim() };
  const india = /^\+91(\d{10})$/.exec(s.replace(/[\s-]/g, ''));
  if (india) return { code: '91', local: india[1] };
  if (s.startsWith('+')) return { code: '', local: s };
  return { code: DEFAULT_DIAL_CODE, local: s };
}

/** Code + number → what gets stored. Empty number is no number; a trunk 0 is dropped. */
export function joinPhone({ code, local }: PhoneParts): string {
  const rest = local.trim().replace(/^0+/, '');
  if (!rest) return '';
  const c = code.replace(/\D/g, '');
  return c ? `+${c} ${rest}` : rest;
}
