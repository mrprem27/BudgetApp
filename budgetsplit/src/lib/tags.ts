/**
 * Transaction tags — the axis categories can't express.
 *
 * A transaction has exactly one category ("Food") and any number of tags ("needs",
 * "goa-trip", "reimbursable"). They are deliberately orthogonal: the moment tags start
 * answering "what kind of spend is this", they've become a second category system, and
 * the app already has one of those.
 *
 * `txn.tags` is a `TEXT` column holding a JSON array — the format `insertTxn` has always
 * written (matching `adjustments`, the other JSON-in-TEXT column). It has been declared
 * since the first schema and written whenever a caller supplied it, but nothing ever
 * supplied it and nothing ever read it back, so every stored value is `NULL` today. That
 * makes the parse side pure upside: there's no legacy shape to be compatible with, but it
 * still has to survive a hand-edited or corrupted database.
 */

/** Longest a single tag may be. Long enough for "reimbursable", short enough to chip. */
export const TAG_MAX_LENGTH = 24;

/**
 * Most tags one transaction may carry. Not a storage limit — a legibility one: a row of
 * chips stops being scannable long before this, and an unbounded list would let one
 * transaction's tags dominate every tag picker in the app.
 */
export const TAG_MAX_COUNT = 8;

/**
 * Clean one tag for storage: trim, collapse inner whitespace, cap the length.
 *
 * Case is **preserved** — "Goa Trip" should read back as the user typed it — but see
 * `normalizeTags`, which de-duplicates case-*insensitively* so "goa" and "Goa" can't
 * both end up on the same transaction.
 */
export function cleanTag(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, TAG_MAX_LENGTH);
}

/** The comparison key for "is this the same tag?" — case- and whitespace-insensitive. */
export function tagKey(tag: string): string {
  return cleanTag(tag).toLowerCase();
}

/**
 * Clean, de-duplicate (case-insensitively, first spelling wins) and cap a tag list.
 * Empty entries are dropped, so a stray blank chip can never be stored.
 */
export function normalizeTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tags) {
    const cleaned = cleanTag(t);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= TAG_MAX_COUNT) break;
  }
  return out;
}

/**
 * Read the `txn.tags` column back into a list.
 *
 * Deliberately total — it never throws and never returns null. A malformed value in one
 * row must not break a whole transaction list, so anything unparseable degrades to `[]`.
 * Non-string members are dropped rather than coerced: `String(someObject)` would put
 * "[object Object]" on screen as though the user had typed it.
 */
export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizeTags(parsed.filter((t): t is string => typeof t === 'string'));
  } catch {
    return [];
  }
}

/**
 * Serialize a tag list for storage, or `null` when it's empty.
 *
 * `null` rather than `'[]'` on purpose: it keeps "no tags" indistinguishable from the
 * pre-tags rows already in the database, so nothing has to be migrated and
 * `tags IS NOT NULL` stays a meaningful filter.
 */
export function serializeTags(tags: readonly string[]): string | null {
  const norm = normalizeTags(tags);
  return norm.length > 0 ? JSON.stringify(norm) : null;
}

/**
 * Rank tags by how often they appear, most-used first, ties broken alphabetically so the
 * order is stable between calls (an unstable picker reshuffles under the user's thumb).
 *
 * Takes the raw column values because the caller is a DB query that can select one column
 * cheaply; keeping the counting here makes it testable without a database.
 */
export function rankTagsByFrequency(rawValues: readonly (string | null)[]): string[] {
  const counts = new Map<string, { display: string; n: number }>();
  for (const raw of rawValues) {
    for (const tag of parseTags(raw)) {
      const key = tagKey(tag);
      const cur = counts.get(key);
      if (cur) cur.n++;
      else counts.set(key, { display: tag, n: 1 });
    }
  }
  return Array.from(counts.values())
    .sort((a, b) => (b.n - a.n) || a.display.localeCompare(b.display))
    .map(v => v.display);
}
