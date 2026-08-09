import { isDiskFull, saveFailureMessage } from '../lib/dbErrors';

describe('isDiskFull — recognising the real thing', () => {
  it('catches SQLite\'s own wording, in either form', () => {
    expect(isDiskFull(new Error('SQLITE_FULL'))).toBe(true);
    expect(isDiskFull(new Error('Error code 13: database or disk is full'))).toBe(true);
    expect(isDiskFull('database or disk is full')).toBe(true);
  });

  it('catches the filesystem-layer wording too', () => {
    // The same underlying condition surfaces differently depending on which layer noticed.
    expect(isDiskFull(new Error('ENOSPC: no space left on device, write'))).toBe(true);
    expect(isDiskFull({ code: 'ENOSPC' })).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isDiskFull(new Error('sqlite_full'))).toBe(true);
    expect(isDiskFull(new Error('Database Or Disk Is Full'))).toBe(true);
  });

  it('reads a message off a non-Error throw', () => {
    // expo-sqlite and native modules routinely reject with plain objects.
    expect(isDiskFull({ message: 'SQLITE_FULL: database or disk is full' })).toBe(true);
    expect(isDiskFull({ name: 'SQLITE_FULL' })).toBe(true);
  });
});

describe('isDiskFull — refusing to guess', () => {
  it('leaves unrelated failures alone', () => {
    for (const e of [
      new Error('UNIQUE constraint failed: txn.id'),
      new Error('no such column: source'),
      new Error('Network request failed'),
      new TypeError('undefined is not a function'),
    ]) {
      expect(isDiskFull(e)).toBe(false);
    }
  });

  it('does NOT claim a disk-IO error means a full disk', () => {
    // "disk I/O error" can be corruption or permissions. Telling someone to delete photos
    // when their database is corrupt sends them the wrong way entirely.
    expect(isDiskFull(new Error('disk I/O error'))).toBe(false);
  });

  it('survives every shape of nothing', () => {
    for (const e of [null, undefined, '', 0, false, {}, [], NaN]) {
      expect(isDiskFull(e)).toBe(false);
    }
  });
});

describe('saveFailureMessage', () => {
  it('never tells someone to retry a write that cannot succeed', () => {
    const m = saveFailureMessage(new Error('SQLITE_FULL'));
    expect(m.title).toBe('Storage full');
    expect(m.body).toMatch(/free up/i);
    expect(m.body).not.toMatch(/try again/i);
  });

  it('keeps the generic message for a genuine unknown', () => {
    const m = saveFailureMessage(new Error('UNIQUE constraint failed'));
    expect(m.title).toBe('Error');
    expect(m.body).toMatch(/try again/i);
  });

  it('always produces real copy, whatever it was handed', () => {
    for (const e of [null, undefined, {}, 'boom', new Error('SQLITE_FULL')]) {
      const m = saveFailureMessage(e);
      expect(m.title.length).toBeGreaterThan(0);
      expect(m.body.length).toBeGreaterThan(0);
      expect(`${m.title} ${m.body}`).not.toMatch(/undefined|NaN|\[object/);
    }
  });
});
