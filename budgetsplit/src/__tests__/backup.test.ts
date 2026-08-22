import CryptoJS from 'crypto-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  BACKUP_VERSION, BACKUP_TABLES, buildBackupPayload, backupFileName,
  encryptPayload, decryptEnvelope, validateBackupPayload, assertSafeColumnNames,
  BackupWrongPassphraseError, BackupCorruptError,
  type BackupTables,
  BackupVersionError,
  CIPHER_V1_CRYPTOJS,
  CIPHER_CURRENT,
  CIPHER_V2_AESGCM,
  KDF_ITERATIONS,
  canReadCipher,
} from '../lib/backup';

function emptyTables(): BackupTables {
  const t = {} as BackupTables;
  for (const name of BACKUP_TABLES) t[name] = [];
  return t;
}

describe('buildBackupPayload', () => {
  it('stamps the current version and a createdAt timestamp', async () => {
    const payload = buildBackupPayload(emptyTables());
    expect(payload.v).toBe(BACKUP_VERSION);
    expect(typeof payload.createdAt).toBe('number');
    expect(payload.tables).toEqual(emptyTables());
  });
});

describe('backupFileName', () => {
  it('formats as budgetsplit-backup-<yyyy-MM-dd>.bsbackup', async () => {
    expect(backupFileName(new Date(2026, 6, 28))).toBe('budgetsplit-backup-2026-07-28.bsbackup');
  });
});

describe('encryptPayload / decryptEnvelope', () => {
  it('round-trips a payload through the same passphrase', async () => {
    const tables = emptyTables();
    tables.person = [{ id: 'p1', name: 'Alice', avatar_color: '#20C4B8', is_me: 1 }];
    const payload = buildBackupPayload(tables);

    const envelope = await encryptPayload(payload, 'correct horse battery staple');
    // New backups are written with the CURRENT cipher, not the payload version —
    // the two are separate constants precisely so a schema change cannot silently
    // move which decryptor runs.
    expect(envelope.v).toBe(CIPHER_CURRENT);
    expect(typeof envelope.ciphertext).toBe('string');
    expect(envelope.ciphertext).not.toContain('Alice'); // actually encrypted, not just encoded

    const decrypted = await decryptEnvelope(envelope, 'correct horse battery staple');
    expect(decrypted).toEqual(payload);
  });

  it('throws BackupWrongPassphraseError on the wrong passphrase', async () => {
    const envelope = await encryptPayload(buildBackupPayload(emptyTables()), 'right-passphrase');
    await expect(decryptEnvelope(envelope, 'wrong-passphrase')).rejects.toThrow(BackupWrongPassphraseError);
  });

  it('throws BackupWrongPassphraseError (not a crash) on garbage ciphertext', async () => {
    const envelope = { v: BACKUP_VERSION, createdAt: Date.now(), ciphertext: 'not-real-ciphertext-at-all' };
    await expect(decryptEnvelope(envelope, 'any passphrase')).rejects.toThrow(BackupWrongPassphraseError);
  });

  it('throws BackupCorruptError when the passphrase is right but the shape is tampered', async () => {
    // Encrypt something that isn't a valid backup payload at all.
    const ciphertext = CryptoJS.AES.encrypt(JSON.stringify({ not: 'a backup' }), 'pass').toString();
    // v1 envelope on purpose: this is the crypto-js path, which must stay readable.
    await expect(decryptEnvelope({ v: CIPHER_V1_CRYPTOJS, createdAt: Date.now(), ciphertext }, 'pass'))
      .rejects.toThrow(BackupCorruptError);
  });
});

describe('validateBackupPayload', () => {
  it('accepts a well-formed payload', async () => {
    const payload = buildBackupPayload(emptyTables());
    expect(validateBackupPayload(payload)).toEqual(payload);
  });

  it('rejects a non-object', async () => {
    expect(() => validateBackupPayload(null)).toThrow(BackupCorruptError);
    expect(() => validateBackupPayload('a string')).toThrow(BackupCorruptError);
  });

  it('rejects a wrong/future version', async () => {
    const payload = buildBackupPayload(emptyTables());
    expect(() => validateBackupPayload({ ...payload, v: 999 })).toThrow(BackupCorruptError);
  });

  it('rejects a payload missing a table', async () => {
    const payload = buildBackupPayload(emptyTables());
    const tables = payload.tables as unknown as Record<string, unknown>;
    const { person, ...rest } = tables;
    expect(() => validateBackupPayload({ ...payload, tables: rest })).toThrow(BackupCorruptError);
  });

  /**
   * Adding a name to BACKUP_TABLES would otherwise reject **every backup ever
   * written**, because validation demands all of them and a version bump is
   * rejected before the table check even runs. A post-v1 table restores empty
   * instead — which is right, since the data could not have existed in that file.
   *
   * Without this, the first user to restore a pre-feature backup loses everything.
   */
  it('accepts a file written before a later table existed', async () => {
    const payload = buildBackupPayload(emptyTables());
    const tables = payload.tables as unknown as Record<string, unknown>;
    const { txn_approval, ...older } = tables;
    expect(txn_approval).toBeDefined(); // the fixture really does carry it now

    const restored = validateBackupPayload({ ...payload, tables: older });
    expect(restored.tables.txn_approval).toEqual([]);
  });

  it('still rejects a table present but not an array', async () => {
    const payload = buildBackupPayload(emptyTables());
    const tables = payload.tables as unknown as Record<string, unknown>;
    expect(() => validateBackupPayload({ ...payload, tables: { ...tables, txn_approval: 'nope' } }))
      .toThrow(BackupCorruptError);
  });
});

describe('assertSafeColumnNames', () => {
  it('passes for normal column names', async () => {
    const tables = emptyTables();
    tables.person = [{ id: 'p1', name: 'Alice', avatar_color: '#fff' }];
    expect(() => assertSafeColumnNames(tables)).not.toThrow();
  });

  it('rejects a column name that looks like a SQL-injection attempt', async () => {
    const tables = emptyTables();
    tables.person = [{ 'id; DROP TABLE person;--': 'p1' }];
    expect(() => assertSafeColumnNames(tables)).toThrow(BackupCorruptError);
  });
});

/**
 * The version gate, and why it sits before the cipher rather than after.
 *
 * `envelope.v` has been written into every backup ever made and read by nothing.
 * The check that existed ran AFTER decryption, which is backwards in the one way
 * that costs a user their data: hand a file this build cannot read to the
 * decryptor and it fails as "wrong passphrase". The user retries, fails, concludes
 * they mistyped — and deletes the only copy of their data. The file was fine.
 *
 * This is the gate that has to exist BEFORE any cipher swap ships, not with it.
 */
describe('envelope version dispatch', () => {
  const payload = buildBackupPayload(emptyTables());

  it('reads a backup with no version field as v1', async () => {
    // Belt and braces: every real file carries v, but a hand-edited or
    // partially-written one must not be treated as from the future. A missing
    // version means the oldest cipher, because that is what predates the field.
    const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(payload), 'pw').toString();
    const noVersion = { createdAt: payload.createdAt, ciphertext } as BackupEnvelope;
    expect(await decryptEnvelope(noVersion, 'pw')).toEqual(payload);
  });

  it('refuses a newer envelope with its OWN error, not "wrong passphrase"', async () => {
    const env = { ...await encryptPayload(payload, 'pw'), v: 99 };
    await expect(decryptEnvelope(env, 'pw')).rejects.toThrow(BackupVersionError);
    // The distinction that matters: it must NOT look like a passphrase problem,
    // because that is the story that gets a good backup deleted.
    await expect(decryptEnvelope(env, 'pw')).rejects.not.toBeInstanceOf(BackupWrongPassphraseError);
  });

  it('says update the app, not try again', async () => {
    const env = { ...await encryptPayload(payload, 'pw'), v: 99 };
    try {
      await decryptEnvelope(env, 'pw');
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as Error).message).toMatch(/newer version/i);
      expect((e as Error).message).not.toMatch(/passphrase/i);
    }
  });

  it('rejects before the cipher runs, so a correct passphrase is never blamed', async () => {
    // The whole point: a v99 envelope with a WRONG passphrase still reports the
    // version, because the version is checked first. Getting this order wrong is
    // what made the failure indistinguishable from a typo.
    const env = { ...await encryptPayload(payload, 'pw'), v: 99 };
    await expect(decryptEnvelope(env, 'definitely-wrong')).rejects.toThrow(BackupVersionError);
  });

  /**
   * The test that has to keep passing forever. Every .bsbackup written before the
   * cipher swap is v1, there is no re-encryption pass, and a backup is the one
   * thing that survives losing the phone.
   */
  it('still opens a v1 backup, years after v2 became the default', async () => {
    const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(payload), 'pw').toString();
    const v1 = { v: CIPHER_V1_CRYPTOJS, createdAt: payload.createdAt, ciphertext } as BackupEnvelope;
    expect(await decryptEnvelope(v1, 'pw')).toEqual(payload);
  });

  it('writes v2, and a v2 envelope carries its own salt and cost', async () => {
    const env = await encryptPayload(payload, 'pw');
    expect(env.v).toBe(CIPHER_V2_AESGCM);
    expect(env.salt).toBeTruthy();
    expect(env.iterations).toBe(KDF_ITERATIONS);
  });

  it('gives every backup a different salt', async () => {
    // Reusing one would let a single derived key open every backup a person has.
    const a = await encryptPayload(payload, 'pw');
    const b = await encryptPayload(payload, 'pw');
    expect(a.salt).not.toBe(b.salt);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  /**
   * The one that was missing, and the outage it would have caught.
   *
   * `app/settings/backup.tsx` checked the version itself, before the passphrase
   * sheet, with its own hardcoded "must be v1". When `encryptPayload` moved to v2,
   * the screen was not updated — so **every backup this build wrote was refused by
   * this build**, on both the file and the server path, with "made by a newer
   * version". Restore was completely dead and the file was always fine.
   *
   * Nothing caught it because the guard lived in a screen and no test renders one.
   * So the assertion is made where it can be made: the predicate is shared, and it
   * must always accept what we ourselves write.
   */
  it('can always read what this build writes', async () => {
    expect(canReadCipher(CIPHER_CURRENT)).toBe(true);
    const env = await encryptPayload(payload, 'pw');
    expect(canReadCipher(env.v)).toBe(true);
  });

  it('can still read v1, and a missing version, at the picker', async () => {
    expect(canReadCipher(CIPHER_V1_CRYPTOJS)).toBe(true);
    expect(canReadCipher(undefined)).toBe(true); // predates the field
  });

  it('refuses a cipher from the future', async () => {
    expect(canReadCipher(99)).toBe(false);
  });

  /**
   * The screens must ASK, not keep their own copy of the list. A copied list is
   * what drifted, and it drifted silently because both copies typechecked.
   */
  it('the backup screen asks the library instead of comparing versions itself', async () => {
    const src = readFileSync(join(__dirname, '../../app/settings/backup.tsx'), 'utf8');
    expect(src).toContain('canReadCipher');
    // Both pick paths — a file, and a server backup.
    expect(src.match(/canReadCipher\(/g)?.length).toBeGreaterThanOrEqual(2);
    expect(src).not.toMatch(/json\.v\s*\?\?\s*CIPHER_/);
  });

  it('rejects a tampered v2 backup instead of returning garbage', async () => {
    // What GCM buys over v1's CBC: the tag fails, so tampering is caught rather
    // than decrypting to nonsense that then has to be spotted by JSON.parse.
    const env = await encryptPayload(payload, 'pw');
    const bytes = Buffer.from(env.ciphertext, 'base64');
    bytes[bytes.length - 3] ^= 0xff;
    const tampered = { ...env, ciphertext: bytes.toString('base64') };
    await expect(decryptEnvelope(tampered, 'pw')).rejects.toThrow(BackupWrongPassphraseError);
  });
});
