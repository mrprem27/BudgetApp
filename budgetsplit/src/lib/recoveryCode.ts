import { getRandomBytesAsync } from 'expo-crypto';

/**
 * The key to your off-device copy, generated rather than invented.
 *
 * ## Why not ask for a passphrase
 *
 * The passphrase has exactly one job: keep the server blind. Thirty-two random
 * bytes do that better than anything a person types, and asking somebody to
 * invent — and remember — a secret they can never recover is a wall most people
 * simply do not climb. They leave the switch off, and then "all my data comes
 * with me" is quietly false for most users, which is worse than the thing the
 * passphrase was protecting against.
 *
 * ## What it costs, said plainly
 *
 * Lose the phone AND never save the code, and the copy is unreadable. That is not
 * a regression: it is exactly the situation today for anybody with no account at
 * all. It is the status quo with an upside.
 *
 * ## What this is NOT
 *
 * A cipher change. `canReadCipher()` remains the single source of truth for "can
 * this build open that file", and nothing here touches it — a copy of that list
 * once said v1-only while writes were v2, and restore was dead for everybody.
 * This only changes where the passphrase COMES FROM: the same PBKDF2, the same
 * AES-256-GCM, the same envelope. A code minted here is a passphrase like any
 * other, and a file sealed with one opens with `decryptEnvelope` unchanged.
 */

/**
 * 20 characters, shown in 5 groups of 4 — about 100 bits.
 *
 * One character per random byte, and 32 divides 256 exactly, so the modulo below
 * is uniform. A 31- or 33-letter alphabet would quietly bias the first few
 * symbols, which is the sort of thing that is never noticed and never fine.
 */
const CODE_LENGTH = 20;

/**
 * Crockford base32: no I, L, O or U.
 *
 * The first three because they are unreadable next to 1 and 0 in most fonts, and
 * this is a string people copy off one screen and type into another. U is
 * excluded so the alphabet cannot accidentally spell things.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** `7K2M-9QXV-4BTN-HR8D-PW3L` */
export async function newRecoveryCode(): Promise<string> {
  const bytes = await getRandomBytesAsync(CODE_LENGTH);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return formatRecoveryCode(out);
}

/**
 * What actually seals the file.
 *
 * The grouping dashes are presentation, and the alphabet is upper-case, so both
 * are normalised away before the code is used as a key — otherwise typing it back
 * without the dashes would produce a different key and a "wrong passphrase" error
 * on a file that is perfectly fine. That failure mode is the one `backup.ts`
 * warns leads people to delete a good backup.
 */
export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

/** Whether a typed string could be one, before spending 50,000 PBKDF2 rounds on it. */
export function looksLikeRecoveryCode(code: string): boolean {
  const normalized = normalizeRecoveryCode(code);
  return normalized.length === CODE_LENGTH
    && [...normalized].every(c => ALPHABET.includes(c));
}

/** Grouped for reading and typing back. Presentation only. */
export function formatRecoveryCode(code: string): string {
  const normalized = normalizeRecoveryCode(code);
  return (normalized.match(/.{1,4}/g) ?? []).join('-');
}
