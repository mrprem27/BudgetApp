/**
 * How much room is left on the device, and what the app is allowed to do about it.
 *
 * Pure on purpose — no `expo-file-system`, no React Native — so jest can reach every
 * boundary. The native probe lives in `deviceStorage.ts`, which this file knows nothing
 * about. Same split (and same reason) as `onboardingPayoff.ts`: the advice below returns a
 * semantic `tone`, never a colour, so the theme stays on the other side of the line.
 *
 * The ordering rule is the whole point of this module, so it is written down once here and
 * read from everywhere: **recording a transaction is the last thing that may ever fail.**
 * A receipt photo is a nice-to-have that costs megabytes; a transaction row costs bytes and
 * is the reason the app exists. So attachments are refused well before the ledger is.
 */

/**
 * A string enum rather than a numeric one because the dismissed tier is persisted to
 * AsyncStorage, and a readable value there survives refactoring. Ordering comes from
 * `storageVerdictRank`, not from the member order.
 */
export enum StorageVerdict {
  /** Nothing to say. */
  Ample = 'ample',
  /** Worth a heads-up while there's still room to act on it. */
  Low = 'low',
  /** Attachments refused. The ledger still works. */
  Critical = 'critical',
  /** Writes are expected to fail. Say so before the user tries. */
  Full = 'full',
}

/**
 * Free-space floors, in bytes. Chosen for what the *app* does at each point, not from a
 * generic table: `critical` is where a 2–4 MB receipt photo stops being a safe thing to
 * copy, and `full` is roughly where iOS itself starts refusing writes.
 *
 * Binary units (1 GB = 1024³) to match `Paths.availableDiskSpace`, which reports bytes.
 */
export const STORAGE_THRESHOLDS = {
  low: 1024 ** 3,        // 1 GB
  critical: 250 * 1024 ** 2,
  full: 50 * 1024 ** 2,
} as const;

/** Worst-first, so a plain `>` comparison means "worse than". */
const RANK: Record<StorageVerdict, number> = {
  [StorageVerdict.Ample]: 0,
  [StorageVerdict.Low]: 1,
  [StorageVerdict.Critical]: 2,
  [StorageVerdict.Full]: 3,
};

export function storageVerdictRank(v: StorageVerdict): number {
  return RANK[v];
}

/** True when `v` is a worse state than `previous` — what re-shows a dismissed warning. */
export function isWorseThan(v: StorageVerdict, previous: StorageVerdict | null): boolean {
  if (previous === null) return true;
  return RANK[v] > RANK[previous];
}

/**
 * Classify the free-space reading.
 *
 * **`null` means "we couldn't measure it", and that is treated as `Ample`.** This matters
 * more than it looks: the native probe cannot throw, so it reports failure by returning
 * `null` — and if an unknown reading collapsed to `0`, a probe that merely broke would tell
 * the user their phone was full and refuse their receipts. Unknown is not full.
 */
export function storageVerdict(freeBytes: number | null | undefined): StorageVerdict {
  if (freeBytes == null || !Number.isFinite(freeBytes)) return StorageVerdict.Ample;
  // A negative reading is nonsense rather than catastrophe; clamp instead of ranking it
  // as the worst possible state.
  const free = Math.max(0, freeBytes);
  if (free < STORAGE_THRESHOLDS.full) return StorageVerdict.Full;
  if (free < STORAGE_THRESHOLDS.critical) return StorageVerdict.Critical;
  if (free < STORAGE_THRESHOLDS.low) return StorageVerdict.Low;
  return StorageVerdict.Ample;
}

/**
 * May the app copy a receipt photo into its own storage right now?
 *
 * The single expression of the degrade order. Both the pre-flight check in
 * `useAttachmentPicker` and the Storage screen's explanatory copy read it from here, so
 * they cannot drift into disagreeing about when photos stop working.
 */
export function allowsAttachments(v: StorageVerdict): boolean {
  return v === StorageVerdict.Ample || v === StorageVerdict.Low;
}

/** Is a transaction write expected to fail? Only ever true at the very bottom. */
export function writesAtRisk(v: StorageVerdict): boolean {
  return v === StorageVerdict.Full;
}

export type StorageTone = 'neutral' | 'warn' | 'bad';

export type StorageAdvice = {
  tone: StorageTone;
  /** One short line — the Home banner truncates to a single line. */
  headline: string;
  /** The longer form, for the Storage screen. */
  body: string;
};

/**
 * What to say, given the verdict. `null` at `Ample` — there is no such thing as a useful
 * "you have plenty of space" message, and a banner that is always present is furniture.
 */
export function storageAdvice(v: StorageVerdict): StorageAdvice | null {
  switch (v) {
    case StorageVerdict.Ample:
      return null;
    case StorageVerdict.Low:
      return {
        tone: 'neutral',
        headline: 'Your device is running low on storage',
        body: 'Everything still works. Clearing some space now means receipt photos keep saving later.',
      };
    case StorageVerdict.Critical:
      return {
        tone: 'warn',
        headline: 'Receipt photos are paused — storage is nearly full',
        body: 'Your transactions still save normally. Photos are held back because each one needs a few megabytes, and recording the spend matters more than the picture.',
      };
    case StorageVerdict.Full:
      return {
        tone: 'bad',
        headline: 'Storage is full — saving may fail',
        body: 'There is no room left on this device, so new transactions may not save. Free up space and anything captured by voice will be filed automatically.',
      };
  }
}

/**
 * Human-readable byte size. Moved here from `app/storage.tsx`, where it could not be
 * tested, and extended past MB — device free space is a GB-scale figure.
 *
 * Anything unmeasurable reads as `0 KB` rather than `NaN KB`.
 */
export function formatBytes(b: number | null | undefined): string {
  if (b == null || !Number.isFinite(b) || b <= 0) return '0 KB';
  const KB = 1024, MB = KB * 1024, GB = MB * 1024;
  if (b < MB) return `${Math.max(1, Math.round(b / KB))} KB`;
  if (b < GB) return `${(b / MB).toFixed(1)} MB`;
  return `${(b / GB).toFixed(1)} GB`;
}
