import { parseToPaise } from './money';
import { wordsOf } from './smartCategoryLearn';
import { TXN_SOURCE, type TxnSource } from '../constants/enums';

/**
 * Pure filter engine for the Review focus-workspace. No React / DB / RN — the
 * screen builds a `FilterRow` from each pending row's effective values and asks
 * `rowMatches`. Kept here (not inline in the screen) so it's unit-testable.
 */

/**
 * Every filter narrows the list further — there is no AND/OR switch. "Match any" made
 * a category *and* an amount widen the list instead of narrowing it, which no one
 * reading two filters expects; within one filter (several categories) it is "any of".
 *
 * Amount is one range, not a four-way mode: leave both ends empty for no filter, fill
 * one for "at least"/"at most", fill both for "between".
 */
export type ReviewFilters = {
  query: string;
  categories: string[];  // [] = any; otherwise a row matches any of them
  amountMin: string;     // rupees; '' = no lower bound
  amountMax: string;     // rupees; '' = no upper bound
  dateFrom: string;      // yyyy-MM-dd [HH:mm]
  dateTo: string;
};

export const DEFAULT_FILTERS: ReviewFilters = {
  query: '', categories: [], amountMin: '', amountMax: '', dateFrom: '', dateTo: '',
};

/**
 * Bring a filter saved by an older build up to the current shape. Saved views persist
 * their filters in AsyncStorage, so the old `category` / `amountMode` / `amtA` / `amtB` /
 * `combine` fields are still out there and must not crash or silently vanish.
 */
export function normalizeFilters(raw: unknown): ReviewFilters {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  let amountMin = str(o.amountMin), amountMax = str(o.amountMax);
  if (o.amountMode !== undefined) {
    const a = str(o.amtA), b = str(o.amtB);
    if (o.amountMode === 'gt') amountMin = a;
    else if (o.amountMode === 'lt') amountMax = a;
    else if (o.amountMode === 'between') { amountMin = a; amountMax = b; }
  }
  const categories = Array.isArray(o.categories)
    ? o.categories.filter((c): c is string => typeof c === 'string' && c !== '')
    : str(o.category) ? [str(o.category)] : [];
  return { query: str(o.query), categories, amountMin, amountMax, dateFrom: str(o.dateFrom), dateTo: str(o.dateTo) };
}

/** The normalized row shape the filter needs (decoupled from PendingTxn). */
export type FilterRow = { description: string; category: string; amountPaise: number; date: number };

/** True when any filter is set (i.e. the working set is narrowed). */
export function filtersActive(f: ReviewFilters): boolean {
  return !!(f.query.trim() || f.categories.length > 0 || f.amountMin.trim() || f.amountMax.trim() || f.dateFrom.trim() || f.dateTo.trim());
}

/**
 * Parse a `yyyy-MM-dd` (optional ` HH:mm` / `THH:mm`) bound to epoch ms. When
 * `end` is true and no time is given, snaps to the end of that day so a date
 * range is inclusive of the whole "to" day. Returns null when unparseable.
 */
export function parseFilterDate(s: string, end: boolean): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(s.trim());
  if (!m) return null;
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  const hasTime = m[4] != null;
  const hour = hasTime ? Number(m[4]) : (end ? 23 : 0);
  const min = hasTime ? Number(m[5]) : (end ? 59 : 0);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || min > 59) return null;
  const d = new Date(year, month - 1, day, hour, min, end && !hasTime ? 59 : 0, end && !hasTime ? 999 : 0);
  // Reject overflow (e.g. 2026-02-30 → JS rolls into March): the parts must round-trip.
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return isNaN(d.getTime()) ? null : d.getTime();
}

/** Does a row satisfy every active filter? */
export function rowMatches(row: FilterRow, f: ReviewFilters): boolean {
  if (f.query.trim() && !row.description.toLowerCase().includes(f.query.trim().toLowerCase())) return false;
  if (f.categories.length > 0 && !f.categories.includes(row.category)) return false;

  const hasMin = f.amountMin.trim() !== '', hasMax = f.amountMax.trim() !== '';
  if (hasMin || hasMax) {
    let lo = hasMin ? parseToPaise(f.amountMin) : null;
    let hi = hasMax ? parseToPaise(f.amountMax) : null;
    // Both ends given in the wrong order still means "between the two".
    if (lo != null && hi != null && lo > hi) [lo, hi] = [hi, lo];
    if (lo != null && row.amountPaise < lo) return false;
    if (hi != null && row.amountPaise > hi) return false;
  }

  if (f.dateFrom.trim()) { const t = parseFilterDate(f.dateFrom, false); if (t != null && row.date < t) return false; }
  if (f.dateTo.trim()) { const t = parseFilterDate(f.dateTo, true); if (t != null && row.date > t) return false; }
  return true;
}

/**
 * Two descriptions look like the same merchant if they share a salient word
 * (drives the "apply category to similar rows?" prompt). Empty/word-less
 * descriptions never match.
 */
/**
 * The working set: focus subset first, then filters, plus what the screen needs to
 * describe the result.
 *
 * `distinctCats` comes from `baseRows`, **not** `visibleRows` — deriving the category
 * chips from the filtered set would delete the chip you just used, leaving no way back.
 */
export function deriveWorkingSet<T extends { id: string }>(
  all: T[],
  focusIds: Set<string> | null,
  filters: ReviewFilters,
  toFilterRow: (row: T) => FilterRow,
  categoryOf: (row: T) => string,
): { visibleRows: T[]; baseRows: T[]; focusActive: boolean; hasFilters: boolean; narrowed: boolean; distinctCats: string[] } {
  const focusActive = focusIds !== null;
  const hasFilters = filtersActive(filters);
  const baseRows = focusActive ? all.filter(r => focusIds!.has(r.id)) : all;
  return {
    baseRows,
    visibleRows: hasFilters ? baseRows.filter(r => rowMatches(toFilterRow(r), filters)) : baseRows,
    focusActive,
    hasFilters,
    narrowed: focusActive || hasFilters,
    distinctCats: Array.from(new Set(baseRows.map(categoryOf).filter(Boolean))),
  };
}

// --- Source grouping ---------------------------------------------------------

/** Anything carrying a `source` column — kept structural so this stays DB-free. */
export type SourceBearing = { source?: string | null };

export function sourceOf(r: SourceBearing): TxnSource {
  return (r.source ?? 'manual') as TxnSource;
}

/**
 * Group the working set by source in one pass, for the tab strip, its counts and
 * the section list. Those were three unmemoised scans over the whole inbox, on a
 * screen that re-renders on every checkbox tap.
 */
export function groupBySource<T extends SourceBearing>(rows: readonly T[]): Map<TxnSource, T[]> {
  const m = new Map<TxnSource, T[]>();
  for (const r of rows) {
    const s = sourceOf(r);
    const list = m.get(s);
    if (list) list.push(r); else m.set(s, [r]);
  }
  return m;
}

/** Sources actually present, in `TXN_SOURCE` order — never an empty tab. */
export function presentSourcesOf(bySource: Map<TxnSource, unknown>): TxnSource[] {
  return TXN_SOURCE.filter(src => bySource.has(src));
}

/**
 * Sections for the list: one per present source on the All tab, or the single
 * active source. Empty sources are dropped so a header never sits over nothing.
 */
export function sourceSections<T>(
  active: TxnSource | null,
  bySource: Map<TxnSource, T[]>,
): { source: TxnSource; data: T[] }[] {
  if (active) {
    const data = bySource.get(active) ?? [];
    return data.length ? [{ source: active, data }] : [];
  }
  return TXN_SOURCE.filter(src => bySource.has(src)).map(src => ({ source: src, data: bySource.get(src)! }));
}

export function isSimilarMerchant(a: string, b: string): boolean {
  const wa = new Set(wordsOf(a));
  if (wa.size === 0) return false;
  return wordsOf(b).some(w => wa.has(w));
}
