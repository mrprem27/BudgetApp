/**
 * How a title and a note become the one `note` column.
 *
 * `txn` has no title column — the Add screen collects a short title (which drives
 * smart-category) plus an optional longer note, and joins them for storage. That join lived
 * inline in `useAddTxnForm`, and voice capture needed the identical rule: two places
 * composing the same field two ways is how a transaction dictated to Siri ends up reading
 * differently from the same transaction typed in.
 *
 * The separator is an em-dash with spaces, matching every stored row written so far. Changing
 * it would make new rows inconsistent with old ones, so it is fixed here on purpose.
 */
export const TITLE_NOTE_SEPARATOR = ' — ';

/**
 * Join a title and a note for storage.
 *
 * Returns `undefined` rather than `''` when there is nothing to store, because that is what
 * the insert path expects for "no note" (it writes SQL NULL).
 *
 * `smartCategoryOn` mirrors the Add screen: with smart-category off there is no title field
 * in play, so only the note is kept. Passing `false` and a title would silently discard it,
 * which is why the caller decides rather than this function guessing.
 */
export function composeTitleNote(
  title: string,
  note: string,
  smartCategoryOn: boolean,
): string | undefined {
  const t = title.trim();
  const n = note.trim();
  if (!smartCategoryOn) return n || undefined;
  return [t, n].filter(Boolean).join(TITLE_NOTE_SEPARATOR) || undefined;
}
