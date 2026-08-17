import { Paths, File, Directory } from 'expo-file-system';

/**
 * The native side of storage awareness: what the device has left, and what this app is
 * using. All decisions about what those numbers *mean* live in `storage.ts`, which is pure
 * and tested — this file is deliberately logic-free so that nothing untestable makes a
 * judgement call.
 *
 * Same arrangement as `attachment.ts`: a `src/lib` module that imports `expo-file-system`
 * is fine because no test imports it (jest has no mapping for that package).
 *
 * **Nothing here throws.** A storage probe that can crash is worse than no probe, because
 * the first one runs during app launch. Failures report `null` — never `0`, which
 * `storageVerdict` would otherwise read as "the phone is full".
 */

export type DirUsage = { count: number; bytes: number };

const EMPTY: DirUsage = { count: 0, bytes: 0 };

/**
 * Free bytes on the device, or `null` when it can't be read.
 *
 * `Paths.availableDiskSpace` is a synchronous getter (verified against the SDK 56 docs),
 * so this costs nothing to call on a render — but it is still wrapped, because a getter
 * that hits the filesystem can fail.
 */
export function freeBytes(): number | null {
  try {
    const n = Paths.availableDiskSpace;
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
  } catch { return null; }
}

/** Total device capacity, or `null`. Used only to show free space as a proportion. */
export function totalBytes(): number | null {
  try {
    const n = Paths.totalDiskSpace;
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
  } catch { return null; }
}

/**
 * Count and total size of the files in a directory.
 *
 * Recurses, because the caches this reports on are nested (DocumentPicker keeps its copies
 * in a subfolder). Depth-bounded so a symlink loop can't hang a launch.
 */
export function dirUsage(dir: Directory, depth = 3): DirUsage {
  try {
    if (!dir.exists) return EMPTY;
    let count = 0, bytes = 0;
    for (const entry of dir.list()) {
      try {
        if (entry instanceof File) {
          count++;
          bytes += entry.size ?? 0;
        } else if (depth > 0) {
          const inner = dirUsage(entry, depth - 1);
          count += inner.count;
          bytes += inner.bytes;
        }
      } catch { /* one unreadable entry shouldn't void the whole total */ }
    }
    return { count, bytes };
  } catch { return EMPTY; }
}

/**
 * Everything this app has cached: shared CSVs, exported PDFs, encrypted backups, and the
 * copies `DocumentPicker` makes of every file you import.
 *
 * **None of it is ever deleted today** — `shareCsv` reuses a name so CSVs at least
 * overwrite, but `Print.printToFileAsync` writes a new randomly-named PDF on every export
 * and imports accumulate one copy per pick. It is the fastest-growing invisible thing in
 * the app, which is why it gets a user-facing number and a button.
 */
export function getCacheStorage(): DirUsage {
  return dirUsage(new Directory(Paths.cache));
}

/**
 * Delete the app's own cached exports and import copies.
 *
 * Only **top-level files** are removed, plus the contents of directories we know we caused.
 * Everything this app writes to the cache — `shareCsv`, the report PDF, the backup file —
 * lands at the root, so the cautious rule loses nothing. Untouched subdirectories belong to
 * libraries that manage their own caches, and clearing those out from under them is not our
 * call.
 *
 * Safe by definition: a cache is regenerable. Returns how many files went, so the caller
 * can say something true.
 */
export function clearExportCache(): number {
  const OURS = ['DocumentPicker'];
  let removed = 0;
  try {
    const cache = new Directory(Paths.cache);
    if (!cache.exists) return 0;
    for (const entry of cache.list()) {
      try {
        if (entry instanceof File) {
          entry.delete();
          removed++;
        } else if (OURS.includes(entry.name)) {
          for (const inner of entry.list()) {
            try { if (inner instanceof File) { inner.delete(); removed++; } } catch { /* skip */ }
          }
        }
      } catch { /* a file in use stays; not worth failing the whole sweep */ }
    }
  } catch { /* best-effort */ }
  return removed;
}

/** Profile photos for you and your friends (`avatar.ts`). Small, but real. */
export function getAvatarStorage(): DirUsage {
  return dirUsage(new Directory(Paths.document, 'avatars'));
}
