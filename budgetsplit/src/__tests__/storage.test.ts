import {
  StorageVerdict,
  STORAGE_THRESHOLDS,
  storageVerdict,
  storageVerdictRank,
  isWorseThan,
  allowsAttachments,
  writesAtRisk,
  storageAdvice,
  formatBytes,
} from '../lib/storage';

const MB = 1024 ** 2;
const GB = 1024 ** 3;

describe('storageVerdict — the boundaries', () => {
  it('classifies the middle of each band', () => {
    expect(storageVerdict(4 * GB)).toBe(StorageVerdict.Ample);
    expect(storageVerdict(600 * MB)).toBe(StorageVerdict.Low);
    expect(storageVerdict(120 * MB)).toBe(StorageVerdict.Critical);
    expect(storageVerdict(10 * MB)).toBe(StorageVerdict.Full);
  });

  it('treats each threshold as the floor of the better band', () => {
    // Exactly on the number is the *better* verdict; one byte under tips it.
    expect(storageVerdict(STORAGE_THRESHOLDS.low)).toBe(StorageVerdict.Ample);
    expect(storageVerdict(STORAGE_THRESHOLDS.low - 1)).toBe(StorageVerdict.Low);

    expect(storageVerdict(STORAGE_THRESHOLDS.critical)).toBe(StorageVerdict.Low);
    expect(storageVerdict(STORAGE_THRESHOLDS.critical - 1)).toBe(StorageVerdict.Critical);

    expect(storageVerdict(STORAGE_THRESHOLDS.full)).toBe(StorageVerdict.Critical);
    expect(storageVerdict(STORAGE_THRESHOLDS.full - 1)).toBe(StorageVerdict.Full);
  });

  it('reads an unmeasurable value as Ample, never as Full', () => {
    // The native probe reports failure with null. If that collapsed to 0, a broken probe
    // would tell the user their phone was full and refuse their receipts.
    for (const unknown of [null, undefined, NaN, Infinity, -Infinity]) {
      expect(storageVerdict(unknown as number | null)).toBe(StorageVerdict.Ample);
    }
  });

  it('survives zero, negative and absurd readings', () => {
    expect(storageVerdict(0)).toBe(StorageVerdict.Full);
    expect(storageVerdict(-1)).toBe(StorageVerdict.Full);          // clamped to 0
    expect(storageVerdict(-999 * GB)).toBe(StorageVerdict.Full);
    expect(storageVerdict(Number.MAX_SAFE_INTEGER)).toBe(StorageVerdict.Ample);
  });
});

describe('the degrade order — the rule this module exists for', () => {
  it('refuses attachments strictly before it doubts the ledger', () => {
    // Every state where writes are at risk must ALSO have stopped taking photos, and
    // there must be at least one state that stops photos while writes are still fine.
    const all = [StorageVerdict.Ample, StorageVerdict.Low, StorageVerdict.Critical, StorageVerdict.Full];
    for (const v of all) {
      if (writesAtRisk(v)) expect(allowsAttachments(v)).toBe(false);
    }
    expect(allowsAttachments(StorageVerdict.Critical)).toBe(false);
    expect(writesAtRisk(StorageVerdict.Critical)).toBe(false);
  });

  it('keeps photos working while there is comfortable room', () => {
    expect(allowsAttachments(StorageVerdict.Ample)).toBe(true);
    expect(allowsAttachments(StorageVerdict.Low)).toBe(true);
  });

  it('only ever declares writes at risk at the very bottom', () => {
    expect(writesAtRisk(StorageVerdict.Full)).toBe(true);
    expect(writesAtRisk(StorageVerdict.Critical)).toBe(false);
    expect(writesAtRisk(StorageVerdict.Low)).toBe(false);
    expect(writesAtRisk(StorageVerdict.Ample)).toBe(false);
  });
});

describe('isWorseThan — what re-shows a dismissed warning', () => {
  it('shows anything when nothing has been dismissed yet', () => {
    expect(isWorseThan(StorageVerdict.Low, null)).toBe(true);
    expect(isWorseThan(StorageVerdict.Ample, null)).toBe(true);
  });

  it('re-shows only on a genuine worsening', () => {
    expect(isWorseThan(StorageVerdict.Critical, StorageVerdict.Low)).toBe(true);
    expect(isWorseThan(StorageVerdict.Full, StorageVerdict.Critical)).toBe(true);
    expect(isWorseThan(StorageVerdict.Low, StorageVerdict.Low)).toBe(false);
    expect(isWorseThan(StorageVerdict.Low, StorageVerdict.Critical)).toBe(false);
  });

  it('ranks the four states in one strict order', () => {
    const ranks = [StorageVerdict.Ample, StorageVerdict.Low, StorageVerdict.Critical, StorageVerdict.Full]
      .map(storageVerdictRank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(ranks).size).toBe(4);
  });
});

describe('storageAdvice', () => {
  it('says nothing when there is plenty of room', () => {
    expect(storageAdvice(StorageVerdict.Ample)).toBeNull();
  });

  it('has real copy for every state worth warning about', () => {
    for (const v of [StorageVerdict.Low, StorageVerdict.Critical, StorageVerdict.Full]) {
      const a = storageAdvice(v)!;
      expect(a.headline.length).toBeGreaterThan(0);
      expect(a.body.length).toBeGreaterThan(0);
      // No placeholder leaked into user-visible copy.
      for (const text of [a.headline, a.body]) {
        expect(text).not.toMatch(/undefined|NaN|Infinity|\{\}/);
      }
    }
  });

  it('escalates its tone with the verdict', () => {
    expect(storageAdvice(StorageVerdict.Low)!.tone).toBe('neutral');
    expect(storageAdvice(StorageVerdict.Critical)!.tone).toBe('warn');
    expect(storageAdvice(StorageVerdict.Full)!.tone).toBe('bad');
  });

  it('promises the ledger still works right up until it does not', () => {
    // The Critical message is the one a user reads while being denied a photo — it has to
    // say the expense itself is safe, or it reads as "the app is broken".
    expect(storageAdvice(StorageVerdict.Critical)!.body).toMatch(/transactions still save/i);
  });

  it('returns a semantic tone, never a colour', () => {
    for (const v of [StorageVerdict.Low, StorageVerdict.Critical, StorageVerdict.Full]) {
      expect(['neutral', 'warn', 'bad']).toContain(storageAdvice(v)!.tone);
      expect(JSON.stringify(storageAdvice(v))).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
  });
});

describe('formatBytes', () => {
  it('scales through KB, MB and GB', () => {
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * MB)).toBe('5.0 MB');
    expect(formatBytes(1536 * 1024)).toBe('1.5 MB');
    expect(formatBytes(2 * GB)).toBe('2.0 GB');
    expect(formatBytes(1536 * MB)).toBe('1.5 GB');
  });

  it('never renders a fraction of a KB as zero', () => {
    // A 200-byte file is not "0 KB" — it exists, and saying otherwise looks like a bug.
    expect(formatBytes(200)).toBe('1 KB');
    expect(formatBytes(1)).toBe('1 KB');
  });

  it('reads nothing and nonsense as 0 KB rather than NaN', () => {
    for (const junk of [0, -1, null, undefined, NaN, Infinity]) {
      expect(formatBytes(junk as number)).toBe('0 KB');
    }
  });

  it('switches unit exactly at the boundary', () => {
    expect(formatBytes(MB - 1)).toMatch(/KB$/);
    expect(formatBytes(MB)).toBe('1.0 MB');
    expect(formatBytes(GB - 1)).toMatch(/MB$/);
    expect(formatBytes(GB)).toBe('1.0 GB');
  });
});
