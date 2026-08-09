/**
 * Telling one write failure from another.
 *
 * Every DB write in the app funnels into a `catch` that says *"Could not save. Try again."*
 * On a full disk that sentence is a lie twice over: it hides the real cause, and "try again"
 * cannot possibly work. Retrying is exactly the wrong advice — the user needs to free space.
 *
 * Pure string matching, because that is all SQLite gives us: `expo-sqlite` surfaces the
 * driver's message rather than a structured code, and the wording varies by platform and by
 * whether the failure came from SQLite or from the filesystem underneath it. So all the
 * known spellings live here, in one list, instead of being re-guessed at each call site.
 */

/**
 * The spellings that mean "there is no room left".
 *
 * - `SQLITE_FULL` / `database or disk is full` — SQLite's own result code and message.
 * - `disk I/O error` is deliberately **absent**: it is genuinely ambiguous (corruption,
 *   permissions, a full disk), and telling someone to delete photos when their database is
 *   corrupt would send them the wrong way.
 * - `ENOSPC` / `no space left on device` — the POSIX error, which is what surfaces when the
 *   failure happens in the filesystem layer rather than in SQLite.
 */
const DISK_FULL_PATTERNS = [
  'sqlite_full',
  'database or disk is full',
  'disk is full',
  'enospc',
  'no space left on device',
  'out of disk space',
];

/** Everything an unknown thrown value might be hiding a message inside. */
function messageOf(e: unknown): string {
  if (e == null) return '';
  if (typeof e === 'string') return e;
  if (e instanceof Error) return `${e.name} ${e.message}`;
  if (typeof e === 'object') {
    const o = e as Record<string, unknown>;
    // expo-sqlite/NativeModules errors often carry `code`/`message` without being Errors.
    return [o.code, o.name, o.message].filter(v => typeof v === 'string').join(' ');
  }
  return String(e);
}

/**
 * True when this error means the device is out of storage.
 *
 * Deliberately conservative: an unrecognised error returns `false` and keeps the generic
 * message. Claiming "your storage is full" for an unrelated bug would send the user off to
 * delete their photos for nothing.
 */
export function isDiskFull(e: unknown): boolean {
  const msg = messageOf(e).toLowerCase();
  if (!msg) return false;
  return DISK_FULL_PATTERNS.some(p => msg.includes(p));
}

/** Title + body for an `Alert`, honest about which failure actually happened. */
export function saveFailureMessage(e: unknown): { title: string; body: string } {
  if (isDiskFull(e)) {
    return {
      title: 'Storage full',
      body: 'Your device has no room left, so this couldn\'t be saved. Free up some space and it will save normally.',
    };
  }
  return { title: 'Error', body: 'Could not save. Try again.' };
}
