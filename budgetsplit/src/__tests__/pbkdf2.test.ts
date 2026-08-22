import CryptoJS from 'crypto-js';
import { pbkdf2Sha256 } from '../lib/pbkdf2';

/**
 * The equivalence test, and why it is the whole point.
 *
 * Every `.bsbackup` already written is sealed with a key from `CryptoJS.PBKDF2`.
 * A chunked reimplementation that differs by a single byte does not fail loudly —
 * it produces a wrong key, the GCM tag fails, and the user is told their
 * passphrase is wrong for a file that is perfectly fine. They retry, fail, and
 * delete their only copy.
 *
 * So this asserts against CryptoJS itself rather than a recorded fixture: if
 * either implementation ever changes, the comparison still catches it.
 */

const ref = (pw: string, salt: CryptoJS.lib.WordArray, iters: number) =>
  CryptoJS.PBKDF2(pw, salt, { keySize: 256 / 32, iterations: iters, hasher: CryptoJS.algo.SHA256 })
    .toString(CryptoJS.enc.Base64);

const hex = (s: string) => CryptoJS.enc.Hex.parse(s);

describe('chunked PBKDF2 matches CryptoJS exactly', () => {
  it('agrees at one iteration — the degenerate case the loop skips', async () => {
    const salt = hex('0011223344556677');
    const out = await pbkdf2Sha256('pw', salt, 1);
    expect(out.toString(CryptoJS.enc.Base64)).toBe(ref('pw', salt, 1));
  });

  it('agrees at a chunk boundary, where an off-by-one would hide', async () => {
    // 1000 is exactly CHUNK, so this lands on the yield. A loop that yielded
    // before XOR-ing, or counted the chunk as an extra round, breaks here.
    const salt = hex('a1b2c3d4e5f60718');
    for (const n of [999, 1000, 1001]) {
      const out = await pbkdf2Sha256('correct horse', salt, n);
      expect(out.toString(CryptoJS.enc.Base64)).toBe(ref('correct horse', salt, n));
    }
  });

  it('agrees across several chunks', async () => {
    const salt = hex('ffeeddccbbaa99887766554433221100');
    const out = await pbkdf2Sha256('a longer passphrase, with spaces', salt, 5_000);
    expect(out.toString(CryptoJS.enc.Base64))
      .toBe(ref('a longer passphrase, with spaces', salt, 5_000));
  });

  it('agrees on a non-ASCII passphrase', async () => {
    // People pick passphrases in their own language, and a byte-encoding
    // difference here would be invisible until exactly those users restored.
    const salt = hex('0123456789abcdef');
    const pw = 'गुप्त वाक्यांश ₹';
    const out = await pbkdf2Sha256(pw, salt, 2_000);
    expect(out.toString(CryptoJS.enc.Base64)).toBe(ref(pw, salt, 2_000));
  });

  it('produces a 256-bit key', async () => {
    const out = await pbkdf2Sha256('pw', hex('00'), 10);
    expect(out.sigBytes).toBe(32);
  });

  it('gives different keys for different salts', async () => {
    const a = await pbkdf2Sha256('pw', hex('1111111111111111'), 100);
    const b = await pbkdf2Sha256('pw', hex('2222222222222222'), 100);
    expect(a.toString()).not.toBe(b.toString());
  });

  it('does not consume the salt it was given', async () => {
    // The concat is destructive on a WordArray, so a caller reusing the salt for
    // a second derivation would silently get a different key from the same input.
    const salt = hex('0011223344556677');
    const before = salt.toString();
    await pbkdf2Sha256('pw', salt, 10);
    expect(salt.toString()).toBe(before);
  });
});

describe('progress', () => {
  it('reports on the way and always finishes at 1', async () => {
    const seen: number[] = [];
    await pbkdf2Sha256('pw', hex('00112233'), 3_000, f => seen.push(f));
    expect(seen.length).toBeGreaterThan(1);
    expect(seen[seen.length - 1]).toBe(1);
    // Monotonic — a bar that goes backwards is worse than no bar.
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  });

  it('is optional', async () => {
    await expect(pbkdf2Sha256('pw', hex('00'), 50)).resolves.toBeDefined();
  });
});
