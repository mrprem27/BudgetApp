import {
  newRecoveryCode, normalizeRecoveryCode, formatRecoveryCode, looksLikeRecoveryCode,
} from '../lib/recoveryCode';
import { encryptPayload, decryptEnvelope, buildBackupPayload, BACKUP_TABLES, canReadCipher, CIPHER_CURRENT, type BackupTables } from '../lib/backup';

/**
 * The recovery code is a passphrase SOURCE, not a cipher change.
 *
 * That distinction is the whole safety argument. `canReadCipher()` is the single
 * source of truth for "can this build open that file", and a copy of that list
 * once said v1-only while writes were v2 — restore was dead for everyone and
 * nothing said so. Nothing here goes near it: same PBKDF2, same AES-256-GCM, same
 * envelope. A code is just a very good passphrase.
 */

// Real key derivation at 50,000 iterations, twice per round trip.
jest.setTimeout(60_000);

const emptyTables = (): BackupTables => {
  const t = {} as BackupTables;
  for (const name of BACKUP_TABLES) t[name] = [];
  return t;
};

describe('a generated code', () => {
  it('is 20 characters in 5 groups, and different every time', async () => {
    const a = await newRecoveryCode();
    const b = await newRecoveryCode();
    expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){4}$/);
    expect(normalizeRecoveryCode(a)).toHaveLength(20);
    expect(a).not.toBe(b);
  });

  it('never contains the characters people misread', async () => {
    // I, L, O and U are out: the first three are unreadable next to 1 and 0 in
    // most fonts, and this is a string copied off one screen and typed into
    // another.
    for (let i = 0; i < 40; i++) {
      expect(await newRecoveryCode()).not.toMatch(/[ILOU]/);
    }
  });

  it('recognises itself, and rejects a passphrase', async () => {
    expect(looksLikeRecoveryCode(await newRecoveryCode())).toBe(true);
    expect(looksLikeRecoveryCode('correct horse battery staple')).toBe(false);
    expect(looksLikeRecoveryCode('')).toBe(false);
  });
});

describe('typing it back', () => {
  /**
   * The failure this prevents is the expensive one: a key derived from a string
   * that differs only in dashes or case produces "wrong passphrase" on a file
   * that is perfectly fine — which `backup.ts` warns is what leads people to
   * delete a good backup.
   */
  it('is the same key without the dashes, or in lower case', async () => {
    const code = await newRecoveryCode();
    const messy = code.toLowerCase().replace(/-/g, ' ');
    expect(normalizeRecoveryCode(messy)).toBe(normalizeRecoveryCode(code));
  });

  it('re-groups a code somebody pasted as one run of characters', async () => {
    const code = await newRecoveryCode();
    expect(formatRecoveryCode(normalizeRecoveryCode(code))).toBe(code);
  });
});

describe('it is an ordinary passphrase to the cipher', () => {
  it('round-trips a backup, at the current cipher', async () => {
    const code = await newRecoveryCode();
    const envelope = await encryptPayload(buildBackupPayload(emptyTables()), normalizeRecoveryCode(code));

    // Not a new format: whatever this build writes, it writes here too.
    expect(envelope.v).toBe(CIPHER_CURRENT);
    expect(canReadCipher(envelope.v)).toBe(true);

    const opened = await decryptEnvelope(envelope, normalizeRecoveryCode(code));
    expect(opened.tables).toEqual(emptyTables());
  });

  it('opens when typed back messily, because normalising happens first', async () => {
    const code = await newRecoveryCode();
    const envelope = await encryptPayload(buildBackupPayload(emptyTables()), normalizeRecoveryCode(code));

    const asTyped = normalizeRecoveryCode(code.toLowerCase().replace(/-/g, ''));
    await expect(decryptEnvelope(envelope, asTyped)).resolves.toBeDefined();
  });
});
