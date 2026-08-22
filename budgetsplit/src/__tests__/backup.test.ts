import CryptoJS from 'crypto-js';
import {
  BACKUP_VERSION, BACKUP_TABLES, buildBackupPayload, backupFileName,
  encryptPayload, decryptEnvelope, validateBackupPayload, assertSafeColumnNames,
  BackupWrongPassphraseError, BackupCorruptError,
  type BackupTables,
} from '../lib/backup';

function emptyTables(): BackupTables {
  const t = {} as BackupTables;
  for (const name of BACKUP_TABLES) t[name] = [];
  return t;
}

describe('buildBackupPayload', () => {
  it('stamps the current version and a createdAt timestamp', () => {
    const payload = buildBackupPayload(emptyTables());
    expect(payload.v).toBe(BACKUP_VERSION);
    expect(typeof payload.createdAt).toBe('number');
    expect(payload.tables).toEqual(emptyTables());
  });
});

describe('backupFileName', () => {
  it('formats as budgetsplit-backup-<yyyy-MM-dd>.bsbackup', () => {
    expect(backupFileName(new Date(2026, 6, 28))).toBe('budgetsplit-backup-2026-07-28.bsbackup');
  });
});

describe('encryptPayload / decryptEnvelope', () => {
  it('round-trips a payload through the same passphrase', () => {
    const tables = emptyTables();
    tables.person = [{ id: 'p1', name: 'Alice', avatar_color: '#20C4B8', is_me: 1 }];
    const payload = buildBackupPayload(tables);

    const envelope = encryptPayload(payload, 'correct horse battery staple');
    expect(envelope.v).toBe(BACKUP_VERSION);
    expect(typeof envelope.ciphertext).toBe('string');
    expect(envelope.ciphertext).not.toContain('Alice'); // actually encrypted, not just encoded

    const decrypted = decryptEnvelope(envelope, 'correct horse battery staple');
    expect(decrypted).toEqual(payload);
  });

  it('throws BackupWrongPassphraseError on the wrong passphrase', () => {
    const envelope = encryptPayload(buildBackupPayload(emptyTables()), 'right-passphrase');
    expect(() => decryptEnvelope(envelope, 'wrong-passphrase')).toThrow(BackupWrongPassphraseError);
  });

  it('throws BackupWrongPassphraseError (not a crash) on garbage ciphertext', () => {
    const envelope = { v: BACKUP_VERSION, createdAt: Date.now(), ciphertext: 'not-real-ciphertext-at-all' };
    expect(() => decryptEnvelope(envelope, 'any passphrase')).toThrow(BackupWrongPassphraseError);
  });

  it('throws BackupCorruptError when the passphrase is right but the shape is tampered', () => {
    // Encrypt something that isn't a valid backup payload at all.
    const ciphertext = CryptoJS.AES.encrypt(JSON.stringify({ not: 'a backup' }), 'pass').toString();
    expect(() => decryptEnvelope({ v: BACKUP_VERSION, createdAt: Date.now(), ciphertext }, 'pass'))
      .toThrow(BackupCorruptError);
  });
});

describe('validateBackupPayload', () => {
  it('accepts a well-formed payload', () => {
    const payload = buildBackupPayload(emptyTables());
    expect(validateBackupPayload(payload)).toEqual(payload);
  });

  it('rejects a non-object', () => {
    expect(() => validateBackupPayload(null)).toThrow(BackupCorruptError);
    expect(() => validateBackupPayload('a string')).toThrow(BackupCorruptError);
  });

  it('rejects a wrong/future version', () => {
    const payload = buildBackupPayload(emptyTables());
    expect(() => validateBackupPayload({ ...payload, v: 999 })).toThrow(BackupCorruptError);
  });

  it('rejects a payload missing a table', () => {
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
  it('accepts a file written before a later table existed', () => {
    const payload = buildBackupPayload(emptyTables());
    const tables = payload.tables as unknown as Record<string, unknown>;
    const { txn_approval, ...older } = tables;
    expect(txn_approval).toBeDefined(); // the fixture really does carry it now

    const restored = validateBackupPayload({ ...payload, tables: older });
    expect(restored.tables.txn_approval).toEqual([]);
  });

  it('still rejects a table present but not an array', () => {
    const payload = buildBackupPayload(emptyTables());
    const tables = payload.tables as unknown as Record<string, unknown>;
    expect(() => validateBackupPayload({ ...payload, tables: { ...tables, txn_approval: 'nope' } }))
      .toThrow(BackupCorruptError);
  });
});

describe('assertSafeColumnNames', () => {
  it('passes for normal column names', () => {
    const tables = emptyTables();
    tables.person = [{ id: 'p1', name: 'Alice', avatar_color: '#fff' }];
    expect(() => assertSafeColumnNames(tables)).not.toThrow();
  });

  it('rejects a column name that looks like a SQL-injection attempt', () => {
    const tables = emptyTables();
    tables.person = [{ 'id; DROP TABLE person;--': 'p1' }];
    expect(() => assertSafeColumnNames(tables)).toThrow(BackupCorruptError);
  });
});
