import CryptoJS from 'crypto-js';

/**
 * base64 ⇄ bytes, in one place.
 *
 * Both crypto paths need this and neither can use the obvious tool: `btoa`/`atob`
 * work on a *binary string*, so any byte above 0x7f is mangled — and this converts
 * ciphertext, where every byte is arbitrary. `backup.ts` carries a comment about
 * exactly that mangling, and duplicating the workaround per module is how one copy
 * eventually gets the easy version.
 *
 * `expo-crypto`'s own API does accept base64 strings directly, which is the
 * tempting alternative. It is not usable: the AES test double reads bytes only, so
 * passing a string typechecks, works on device, and silently produces an empty
 * buffer under test — a divergence that hides real failures.
 */

export function bytesToBase64(bytes: Uint8Array): string {
  return CryptoJS.lib.WordArray.create(bytes as unknown as number[]).toString(CryptoJS.enc.Base64);
}

export function base64ToBytes(b64: string): Uint8Array {
  const words = CryptoJS.enc.Base64.parse(b64);
  const out = new Uint8Array(words.sigBytes);
  for (let i = 0; i < words.sigBytes; i++) {
    out[i] = (words.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
