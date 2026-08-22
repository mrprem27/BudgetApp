// Real SHA-256 and real AES-256-GCM (via Node's crypto), not empty stubs — same
// reasoning as the other mocks in this folder: a stub would make the pdf.js
// integrity check (pdfjsCache.ts) and the backup cipher untestable rather than
// tested, which is how bugs ship green. This repo has the scar: the expo-sqlite
// stub "made every module in src/db/queries unexecutable, which is how nine
// wrong-money bugs shipped green".
//
// expo-crypto's own web implementation is `crypto.subtle`, so backing this with
// Node's WebCrypto is not an approximation — it is the same algorithm the app
// runs on the web target, and byte-compatible with the native one.
const crypto = require('crypto');

const CryptoDigestAlgorithm = { SHA256: 'SHA-256' };

async function digestStringAsync(_algorithm, data) {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

async function getRandomBytesAsync(n) {
  return new Uint8Array(crypto.randomBytes(n));
}

function getRandomBytes(n) {
  return new Uint8Array(crypto.randomBytes(n));
}

/** Mirrors expo-crypto's AESEncryptionKey: import from bytes or an encoded string. */
class AESEncryptionKey {
  constructor(bytes) {
    this.raw = bytes;
    this.size = bytes.length * 8;
  }

  static async generate(size = 256) {
    return new AESEncryptionKey(new Uint8Array(crypto.randomBytes(size / 8)));
  }

  static async import(input, encoding) {
    if (typeof input === 'string') {
      return new AESEncryptionKey(new Uint8Array(Buffer.from(input, encoding === 'hex' ? 'hex' : 'base64')));
    }
    return new AESEncryptionKey(new Uint8Array(input));
  }

  async bytes() { return this.raw; }
  async encoded(encoding) { return Buffer.from(this.raw).toString(encoding === 'hex' ? 'hex' : 'base64'); }
}

/**
 * Mirrors AESSealedData. `combined` is iv || ciphertext || tag, which is the
 * layout `fromCombined` reads back — the app relies on that ordering, so the mock
 * has to reproduce it exactly rather than inventing its own.
 */
class AESSealedData {
  constructor(iv, ciphertext, tag) {
    this._iv = iv; this._ct = ciphertext; this._tag = tag;
  }

  static fromCombined(bytes, { ivLength = 12, tagLength = 16 } = {}) {
    const b = new Uint8Array(bytes);
    return new AESSealedData(
      b.slice(0, ivLength),
      b.slice(ivLength, b.length - tagLength),
      b.slice(b.length - tagLength),
    );
  }

  static fromParts(iv, ct, tag) { return new AESSealedData(iv, ct, tag); }

  iv() { return this._iv; }
  ciphertext() { return this._ct; }
  tag() { return this._tag; }

  async combined(encoding) {
    const all = Buffer.concat([Buffer.from(this._iv), Buffer.from(this._ct), Buffer.from(this._tag)]);
    return encoding === 'base64' ? all.toString('base64') : new Uint8Array(all);
  }
}

async function aesEncryptAsync(plaintext, key, options = {}) {
  const iv = options.nonce ? Buffer.from(options.nonce) : crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key.raw), iv);
  if (options.additionalData) cipher.setAAD(Buffer.from(options.additionalData));
  const data = typeof plaintext === 'string' ? Buffer.from(plaintext, 'base64') : Buffer.from(plaintext);
  const ct = Buffer.concat([cipher.update(data), cipher.final()]);
  return new AESSealedData(new Uint8Array(iv), new Uint8Array(ct), new Uint8Array(cipher.getAuthTag()));
}

async function aesDecryptAsync(sealed, key, options = {}) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key.raw), Buffer.from(sealed.iv()));
  decipher.setAuthTag(Buffer.from(sealed.tag()));
  if (options.additionalData) decipher.setAAD(Buffer.from(options.additionalData));
  // Throws on a bad tag — which is the point of GCM, and what makes a wrong
  // passphrase and a tampered file both fail loudly instead of returning garbage.
  const out = Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext())), decipher.final()]);
  return options.output === 'base64' ? out.toString('base64') : new Uint8Array(out);
}

module.exports = {
  digestStringAsync, CryptoDigestAlgorithm,
  getRandomBytes, getRandomBytesAsync,
  AESEncryptionKey, AESSealedData, aesEncryptAsync, aesDecryptAsync,
};
