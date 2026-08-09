import type { VoiceDraft } from './voiceParse';

/**
 * Where a phrase captured *outside* the app should end up.
 *
 * The capture path is an iOS Shortcut: you dictate to Siri, the Shortcut drops the phrase into
 * a file in `Documents/voice-inbox/`, and the app turns it into something real the next time it
 * opens or comes to the foreground (`voiceDrain.ts`). The app never launches to record it.
 *
 * The filename does not have to carry anything — `resolveCaptureTime` prefers a timestamp in it
 * but falls back to the file's own creation time, which is why the Shortcut is two actions.
 *
 * This module is the decision layer, and it is pure: no filesystem, no database, no React.
 * Everything about *whether a spoken phrase is trustworthy enough to post to the ledger*
 * is testable here without a microphone or a device.
 */

/**
 * The two destinations. Not a Review-vs-nothing choice — both are legitimate homes for a
 * transaction, which is what makes the routing safe to get wrong.
 */
export enum VoiceDestination {
  /** Confident enough to save silently. */
  Ledger = 'ledger',
  /** Needs a human decision first; lands in the Review inbox. */
  Review = 'review',
}

/**
 * Words that mean "this involves other people".
 *
 * These are also the words the **Shortcut** matches on to decide whether to open the app
 * instead of writing a file — Shortcuts can do a plain "text contains" test but cannot run
 * `parseVoice`. Keeping the list here, and keeping it short and literal, is what lets the
 * two sides agree.
 *
 * `with` earns its place despite being a common English word: in a spend phrase ("dinner
 * with Rohan") it almost always means a shared cost, and the cost of a false positive is
 * only that the row waits in Review instead of posting itself.
 */
export const GROUP_HINTS = ['split', 'splitting', 'group', 'with', 'owe', 'owes', 'shared', 'share'] as const;

/** Word-boundary matched, so "within" isn't "with" and "groups" still counts. */
export function isGroupish(phrase: string): boolean {
  const words = phrase.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return words.some(w => (GROUP_HINTS as readonly string[]).includes(w));
}

/**
 * When the phrase was actually spoken, taken from the capture filename.
 *
 * This is load-bearing, not bookkeeping. `parseVoice` resolves relative dates ("yesterday",
 * "last Friday") against a `nowMs` we supply — so if that were the *drain* time, saying
 * "yesterday" at 11pm and opening the app the next morning would file the spend two days
 * back. The Shortcut names each file with the capture timestamp precisely so the parse can
 * be anchored to when you spoke.
 *
 * Naming the file this way is **optional** — `resolveCaptureTime` falls back to the file's own
 * creation time — so a name that isn't a timestamp returns the caller's fallback rather than
 * throwing. A mis-named capture should still become a transaction.
 */
export function captureTimeFromName(fileName: string, fallbackMs: number): number {
  const stem = fileName.replace(/\.[a-z0-9]+$/i, '');
  if (!/^\d+$/.test(stem)) return fallbackMs;

  // Calendar form first, because it is the one the Shortcuts app can actually produce.
  const calendar = calendarStamp(stem);
  if (calendar !== null) return calendar;

  if (stem.length < 10 || stem.length > 16) return fallbackMs;
  const n = Number(stem);
  if (!Number.isFinite(n) || n <= 0) return fallbackMs;
  // 10-digit values are seconds; 13-digit values are milliseconds.
  const ms = stem.length <= 10 ? n * 1000 : n;
  // Anything outside a sane window is more likely a coincidence than a date. 2001-09-09 is
  // where 10-digit epochs begin; the upper bound is ~2286.
  if (ms < 1_000_000_000_000 || ms > 9_999_999_999_999) return fallbackMs;
  return ms;
}

/**
 * When the phrase was spoken, from whichever source actually knows.
 *
 * **The filesystem's own creation time is the primary answer**, because the Shortcut writes the
 * file at the moment you finish dictating — so iOS records the capture time for free, and the
 * shortcut needs no date actions at all. That removes two of its four steps and the entire
 * class of "Shortcuts couldn't convert from Text to Date" errors that comes with wiring
 * `Format Date` by hand.
 *
 * A timestamped filename still wins when there is one: it is an explicit statement of intent,
 * it keeps shortcuts built the older way working unchanged, and it survives a file being copied
 * (which resets `creationTime`).
 *
 * `creationTime` is `number | null` — not every platform reports it — which is why the drain
 * time remains the floor.
 */
export function resolveCaptureTime(
  fileName: string,
  creationTimeMs: number | null | undefined,
  fallbackMs: number,
): number {
  // A sentinel the filename parser can't return, so "no timestamp in the name" is detectable.
  const NONE = -1;
  const fromName = captureTimeFromName(fileName, NONE);
  if (fromName !== NONE) return fromName;

  if (typeof creationTimeMs === 'number' && Number.isFinite(creationTimeMs)
      && creationTimeMs >= 1_000_000_000_000 && creationTimeMs <= 9_999_999_999_999) {
    return creationTimeMs;
  }

  return fallbackMs;
}

/**
 * Read a `yyyyMMddHHmmss`-style filename.
 *
 * **This is the format the Shortcuts app can actually emit.** Its *Format Date* action has no
 * Unix-timestamp option — only a Custom pattern (Unicode UTS#35) — so asking a user for an
 * epoch means bolting on a "Get Time Between Dates" calculation against 1 Jan 1970. A single
 * Custom format string is one field and no extra action, so the code meets the tool where it
 * is. It also sorts correctly and is readable in the Files app, which an epoch is not.
 *
 * Length disambiguates it from an epoch with no overlap: an epoch in milliseconds is 13
 * digits, and 12 or 14 digits as an epoch would land in 2001 or in the year 2286+ — neither
 * is a capture. Accepts second, minute and day precision.
 *
 * Parsed as **local** time, because Shortcuts formats in the device's timezone.
 */
function calendarStamp(digits: string): number | null {
  const n = (from: number, len: number) => Number(digits.slice(from, from + len));
  let y: number, mo: number, d: number, h = 0, mi = 0, s = 0;

  if (digits.length === 14) {
    [y, mo, d, h, mi, s] = [n(0, 4), n(4, 2), n(6, 2), n(8, 2), n(10, 2), n(12, 2)];
  } else if (digits.length === 12) {
    [y, mo, d, h, mi] = [n(0, 4), n(4, 2), n(6, 2), n(8, 2), n(10, 2)];
  } else if (digits.length === 8) {
    [y, mo, d] = [n(0, 4), n(4, 2), n(6, 2)];
  } else {
    return null;
  }

  // A plausible capture, not any arithmetically valid date.
  if (y < 2000 || y > 2100) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if (h > 23 || mi > 59 || s > 59) return null;

  const date = new Date(y, mo - 1, d, h, mi, s, 0);
  // Rejects 30 February, which Date would silently roll into March.
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date.getTime();
}

/**
 * Does the phrase name one of the user's actual groups?
 *
 * The keyword list catches *"split with Rohan"*; this catches *"two thousand Goa trip"*, which
 * names a shared group and contains no keyword at all. Without it that phrase would post
 * silently to Personal — the one failure mode of dropping the strict category bar, and worth
 * closing precisely rather than by making the keyword list longer and blunter.
 *
 * Only groups with a real name are considered, and single-character names are ignored: a group
 * called "A" would otherwise divert every phrase containing that letter as a word.
 */
export function mentionsGroupName(phrase: string, groupNames: string[]): boolean {
  const words = new Set(phrase.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  if (words.size === 0) return false;
  return groupNames.some(raw => {
    const parts = raw.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 1);
    // Every word of the group's name has to appear, so "Goa trip" needs both — otherwise a
    // group called "Trip to Goa" would match any phrase containing "to".
    return parts.length > 0 && parts.every(w => words.has(w));
  });
}

/**
 * Should this draft post itself, or wait to be looked at?
 *
 * `Ledger` requires exactly two things:
 *  - an amount above zero — there is no transaction without one;
 *  - no sign that other people are involved — a split needs people and shares chosen, and
 *    nobody has chosen them.
 *
 * **A matched category is deliberately NOT required.** An earlier version demanded one, which
 * gave voice a stricter bar than the keyboard: type "zomato biryani" into Add and
 * smart-category infers a category, falling back to `Other` — it does not refuse the
 * transaction. Voice is dictating the same words, so it gets the same treatment. The words
 * survive in the title either way (`voiceFields`), so an inferred category is always visible
 * and one tap from being corrected, and an unmatched one lands in `Other` — which shows up in
 * reports as uncategorised rather than hiding inside the wrong category.
 *
 * A group-ish phrase goes to Review **even with a perfect parse**. The missing piece there
 * isn't confidence, it's a decision. It also means a Shortcut that failed to spot the keyword
 * (and so wrote a file instead of opening the app) still lands somewhere correct — the
 * keyword is a convenience, never a correctness requirement.
 */
export function routeVoiceDraft(
  draft: VoiceDraft,
  phrase: string,
  /** The user's real group names, so a phrase naming one is never filed as personal. */
  groupNames: string[] = [],
): VoiceDestination {
  if (draft.amountPaise <= 0) return VoiceDestination.Review;
  if (isGroupish(phrase) || mentionsGroupName(phrase, groupNames)) return VoiceDestination.Review;
  return VoiceDestination.Ledger;
}

/**
 * Why a capture is waiting, in words a Review row can show.
 *
 * Review already groups by source; this explains the individual row, so "why is this here
 * and not in my ledger" never needs guessing. Returns null for a draft that posted itself.
 */
export function reviewReason(
  draft: VoiceDraft,
  phrase: string,
  groupNames: string[] = [],
): string | null {
  if (draft.amountPaise <= 0) return 'No amount heard';
  if (isGroupish(phrase)) return 'Sounded like a split — pick who shares it';
  if (mentionsGroupName(phrase, groupNames)) return 'Named a group — confirm who shares it';
  return null;
}

/**
 * How many words of a phrase become the title before the rest spills into the note.
 *
 * The title is a single-line field, and it is what smart-category reads. Six words is about
 * what fits without truncating, and about as much as carries any signal — past that it's a
 * sentence, and a sentence belongs in the note.
 */
export const VOICE_TITLE_MAX_WORDS = 6;
export const VOICE_TITLE_MAX_CHARS = 40;

/**
 * Split what was said into a title and a note.
 *
 * Mirrors how the Add screen treats a typed entry: the short descriptive bit is the **title**
 * (which is what drives smart-category), and anything longer overflows into the **note**.
 * Three shapes, all reachable:
 *
 *  - `"450 groceries"` → the leftover is just the category word, so there is nothing to title.
 *    Category alone; no title, no note.
 *  - `"450 zomato biryani"` → title `"zomato biryani"`, and smart-category reads it.
 *  - a long rambling phrase → the first few words title it, the remainder becomes the note,
 *    so nothing said is ever thrown away.
 *
 * `categoryWords` is what the matched category was called, so the word that *became* the
 * category isn't also repeated as the title — "450 groceries" should not read "Groceries ·
 * groceries".
 */
export function voiceFields(draft: VoiceDraft): { title: string; note: string } {
  const leftover = draft.note.trim();
  if (!leftover) return { title: '', note: '' };

  // When the whole leftover IS the category name, it has already been captured as the
  // category and repeating it adds nothing.
  if (draft.category && leftover.toLowerCase() === draft.category.toLowerCase()) {
    return { title: '', note: '' };
  }

  const words = leftover.split(/\s+/);
  const title: string[] = [];
  let length = 0;
  for (const w of words) {
    const next = length === 0 ? w.length : length + 1 + w.length;
    // The first word always goes in, however long — an empty title with a full note would
    // bury the one thing the row is about.
    if (title.length > 0 && (title.length >= VOICE_TITLE_MAX_WORDS || next > VOICE_TITLE_MAX_CHARS)) break;
    title.push(w);
    length = next;
  }

  return { title: title.join(' '), note: words.slice(title.length).join(' ') };
}

/**
 * The category to file under, guaranteed to be one that exists.
 *
 * `parseVoice` has already run the same two-step the Add screen uses (what the user taught
 * us, then the built-in rules). This only supplies the floor: an unmatched phrase gets
 * `Other` — the same fallback `useAddTxnForm` uses for a typed title — and if a catalog
 * somehow has no `Other`, the first category rather than nothing.
 */
export function resolveVoiceCategory(
  draft: VoiceDraft,
  categories: { name: string }[],
  /** When smart-category is switched off, an inferred category is not wanted. */
  useInferred = true,
): string | null {
  if (useInferred && draft.category && categories.some(c => c.name === draft.category)) {
    return draft.category;
  }
  return categories.find(c => c.name === 'Other')?.name ?? categories[0]?.name ?? null;
}

/**
 * Oldest capture first, by resolved time rather than by name.
 *
 * Sorting on the filename alone stopped being enough once the timestamp became optional: left
 * to itself, Shortcuts names files things like `Dictated Text.txt` and `Dictated Text 2.txt`,
 * which sort lexicographically — and `Dictated Text 10.txt` would come before
 * `Dictated Text 2.txt`. Order matters because two spends said seconds apart must be filed in
 * the order they happened, so this sorts on the time each capture actually resolved to and
 * uses the name only to break exact ties.
 */
export function sortCaptures<T extends { name: string; capturedAt: number }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    a.capturedAt === b.capturedAt ? a.name.localeCompare(b.name) : a.capturedAt - b.capturedAt);
}
