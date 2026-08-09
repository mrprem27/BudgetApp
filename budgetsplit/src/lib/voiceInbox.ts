import type { VoiceDraft } from './voiceParse';

/**
 * Where a phrase captured *outside* the app should end up.
 *
 * The capture path is an iOS Shortcut: you dictate to Siri, the Shortcut drops the phrase
 * into `Documents/voice-inbox/<epoch-ms>.txt`, and the app turns it into something real the
 * next time it opens or comes to the foreground (`voiceDrain.ts`). The app never launches to
 * record it.
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
 * A name that isn't a timestamp falls back rather than throwing: a mis-named capture should
 * still become a transaction, just with a less precise date.
 */
export function captureTimeFromName(fileName: string, fallbackMs: number): number {
  const stem = fileName.replace(/\.[a-z0-9]+$/i, '');
  if (!/^\d{10,16}$/.test(stem)) return fallbackMs;
  const n = Number(stem);
  if (!Number.isFinite(n) || n <= 0) return fallbackMs;
  // 10-digit values are seconds (a plausible thing for a hand-built Shortcut to produce);
  // 13-digit values are milliseconds.
  const ms = stem.length <= 10 ? n * 1000 : n;
  // Anything outside a sane window is more likely a coincidence than a date. 2001-09-09 is
  // where 10-digit epochs begin; the upper bound is ~2286.
  if (ms < 1_000_000_000_000 || ms > 9_999_999_999_999) return fallbackMs;
  return ms;
}

/**
 * Should this draft post itself, or wait to be looked at?
 *
 * `Ledger` requires **all three**:
 *  - an amount above zero — there is no transaction without one;
 *  - a category that actually matched — an unmatched phrase filed under a fallback heading
 *    quietly skews every report and nothing ever prompts you to fix it;
 *  - no group hint — a split needs people and shares chosen, and nobody has chosen them.
 *
 * A group-ish phrase goes to Review **even with a perfect amount and category**. That is the
 * point: the missing piece isn't confidence, it's a decision. It also means a Shortcut that
 * failed to spot the keyword (and so wrote a file instead of opening the app) still lands
 * somewhere correct — the keyword is a convenience, never a correctness requirement.
 */
export function routeVoiceDraft(draft: VoiceDraft, phrase: string): VoiceDestination {
  if (draft.amountPaise <= 0) return VoiceDestination.Review;
  if (!draft.category) return VoiceDestination.Review;
  if (isGroupish(phrase)) return VoiceDestination.Review;
  return VoiceDestination.Ledger;
}

/**
 * Why a capture is waiting, in words a Review row can show.
 *
 * Review already groups by source; this explains the individual row, so "why is this here
 * and not in my ledger" never needs guessing. Returns null for a draft that posted itself.
 */
export function reviewReason(draft: VoiceDraft, phrase: string): string | null {
  if (draft.amountPaise <= 0) return 'No amount heard';
  if (isGroupish(phrase)) return 'Sounded like a split — pick who shares it';
  if (!draft.category) return 'Not sure which category';
  return null;
}

/**
 * Sort capture filenames oldest-first, so the ledger receives them in the order they were
 * spoken.
 *
 * Sorts on the *parsed instant* rather than the raw name for two reasons that a plain
 * `names.sort()` gets wrong: a seconds-precision name and a millisecond-precision name must
 * be compared on one scale, and a name that carries no timestamp has to sort **last** rather
 * than wherever its letters happen to fall — otherwise one mis-named capture jumps the queue
 * and its "yesterday" resolves against the wrong neighbour's drain.
 */
export function sortCaptureNames(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const ta = captureTimeFromName(a, Number.MAX_SAFE_INTEGER);
    const tb = captureTimeFromName(b, Number.MAX_SAFE_INTEGER);
    return ta === tb ? a.localeCompare(b) : ta - tb;
  });
}
