jest.mock('expo-file-system', () => require('./__mocks__/expoFileSystem'));

import {
  collectPhotoUris, rewritePhotoUris, photoKey, isLocalPhoto, base64Bytes,
} from '../lib/backupPhotos';
import { buildBackupPayload, validateBackupPayload, type BackupTables } from '../lib/backup';
import { readPhotoFiles, restorePhotoFiles } from '../db/queries/backup';
import { state, __reset, File } from './__mocks__/expoFileSystem';

/**
 * Backups carried rows only, so every restore landed with `attachment_uri`
 * pointing at a file that no longer existed — and the UI announced "Receipt
 * attached" over it. Photos are now opt-in, and their URIs are rewritten on the
 * way back in, because the app's container path changes on every install.
 */
const tables = (over: Partial<BackupTables> = {}): BackupTables => ({
  person: [], budget_group: [], group_member: [], category: [], category_budget: [],
  txn: [], recur_skip: [], line_item: [], txn_share: [], txn_payment: [],
  savings_goal: [], savings_txn: [], pending_txn: [], audit_log: [], settings: [],
  ...over,
} as BackupTables);

beforeEach(() => __reset());

describe('collectPhotoUris', () => {
  it('finds receipts and avatars, deduped', () => {
    const t = tables({
      txn: [{ attachment_uri: 'file:///doc/attachments/a.jpg' }, { attachment_uri: 'file:///doc/attachments/a.jpg' }],
      person: [{ image_uri: 'file:///doc/avatars/p.jpg' }],
    });
    expect(collectPhotoUris(t).sort()).toEqual([
      'file:///doc/attachments/a.jpg', 'file:///doc/avatars/p.jpg',
    ]);
  });

  it('ignores rows with no photo and non-local URIs', () => {
    const t = tables({ txn: [{ attachment_uri: null }, { attachment_uri: 'https://x/y.jpg' }] });
    expect(collectPhotoUris(t)).toEqual([]);
    expect(isLocalPhoto('https://x/y.jpg')).toBe(false);
  });
});

describe('photoKey', () => {
  it('keeps only the basename — the directory is meaningless on the other device', () => {
    expect(photoKey('file:///var/mobile/Containers/x/attachments/abc.jpg')).toBe('abc.jpg');
  });

  it('strips anything that could escape the target directory', () => {
    // The key comes from a file that may not be ours; it must not be a path.
    expect(photoKey('file:///a/../../etc/passwd')).not.toContain('/');
    expect(photoKey('file:///a/we ird$.jpg')).toBe('we_ird_.jpg');
  });
});

describe('rewritePhotoUris', () => {
  const t = tables({
    txn: [{ id: 't1', attachment_uri: 'file:///old/attachments/a.jpg' }, { id: 't2', attachment_uri: null }],
    person: [{ id: 'p1', image_uri: 'file:///old/avatars/p.jpg' }],
  });

  it('repoints a photo the restore actually wrote', () => {
    const out = rewritePhotoUris(t, () => 'file:///new/x.jpg');
    expect(out.txn[0].attachment_uri).toBe('file:///new/x.jpg');
    expect(out.person[0].image_uri).toBe('file:///new/x.jpg');
  });

  it('NULLS a photo the backup did not carry, rather than leaving a dead path', () => {
    // This is the bug: a surviving path is what made the UI claim a receipt exists.
    const out = rewritePhotoUris(t, () => null);
    expect(out.txn[0].attachment_uri).toBeNull();
    expect(out.person[0].image_uri).toBeNull();
  });

  it('leaves rows without a photo untouched and does not mutate the input', () => {
    const out = rewritePhotoUris(t, () => 'file:///new/x.jpg');
    expect(out.txn[1].attachment_uri).toBeNull();
    expect(t.txn[0].attachment_uri).toBe('file:///old/attachments/a.jpg');
  });
});

describe('readPhotoFiles', () => {
  it('reads each referenced photo as base64', async () => {
    new File('/doc/attachments/a.jpg').write('RECEIPT-BYTES');
    const t = tables({ txn: [{ attachment_uri: 'file:///doc/attachments/a.jpg' }] });
    const photos = await readPhotoFiles(t);
    expect(Buffer.from(photos['a.jpg'], 'base64').toString()).toBe('RECEIPT-BYTES');
  });

  it('skips a photo already missing rather than failing the whole backup', async () => {
    const t = tables({ txn: [{ attachment_uri: 'file:///doc/attachments/gone.jpg' }] });
    await expect(readPhotoFiles(t)).resolves.toEqual({});
  });

  it('skips an unreadable file for the same reason', async () => {
    new File('/doc/attachments/bad.jpg').write('x');
    state.unreadable.add('/doc/attachments/bad.jpg');
    const t = tables({ txn: [{ attachment_uri: 'file:///doc/attachments/bad.jpg' }] });
    await expect(readPhotoFiles(t)).resolves.toEqual({});
  });
});

describe('restorePhotoFiles', () => {
  const t = tables({ txn: [{ id: 't1', attachment_uri: 'file:///OLD-INSTALL/attachments/a.jpg' }] });

  it('writes the bytes and repoints the row at THIS install', async () => {
    const photos = { 'a.jpg': Buffer.from('RECEIPT').toString('base64') };
    const out = await restorePhotoFiles(t, photos);
    const uri = out.txn[0].attachment_uri as string;
    // The old absolute path cannot survive — iOS reissues the container each install.
    expect(uri).not.toContain('OLD-INSTALL');
    expect(await new File(uri.replace('file://', '')).text()).toBe('RECEIPT');
  });

  it('nulls the column when the backup carried no photos at all', async () => {
    const out = await restorePhotoFiles(t, undefined);
    expect(out.txn[0].attachment_uri).toBeNull();
  });

  it('nulls the column for a photo missing from an otherwise photo-carrying backup', async () => {
    const out = await restorePhotoFiles(t, { 'somethingelse.jpg': 'AAA=' });
    expect(out.txn[0].attachment_uri).toBeNull();
  });
});

describe('payload shape', () => {
  it('omits `photos` entirely when none were included', () => {
    expect(buildBackupPayload(tables()).photos).toBeUndefined();
    expect(buildBackupPayload(tables(), {}).photos).toBeUndefined();
  });

  it('round-trips a photo-carrying payload through validation', () => {
    const p = buildBackupPayload(tables(), { 'a.jpg': 'AAA=' });
    expect(validateBackupPayload(JSON.parse(JSON.stringify(p))).photos).toEqual({ 'a.jpg': 'AAA=' });
  });

  it('accepts an old backup that predates photos', () => {
    const p = buildBackupPayload(tables());
    expect(() => validateBackupPayload(JSON.parse(JSON.stringify(p)))).not.toThrow();
  });

  it('rejects a malformed photo section', () => {
    const p = { ...buildBackupPayload(tables()), photos: ['not', 'an', 'object'] };
    expect(() => validateBackupPayload(JSON.parse(JSON.stringify(p)))).toThrow();
  });
});

describe('base64Bytes', () => {
  it('estimates the decoded size, padding included', () => {
    const b64 = Buffer.from('hello world').toString('base64');
    expect(base64Bytes(b64)).toBe(11);
  });
});
