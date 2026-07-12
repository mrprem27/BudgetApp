import { parseToPaise } from './money';
import { wordsOf } from './smartCategoryLearn';

/**
 * Pure filter engine for the Review focus-workspace. No React / DB / RN — the
 * screen builds a `FilterRow` from each pending row's effective values and asks
 * `rowMatches`. Kept here (not inline in the screen) so it's unit-testable.
 */

export type AmountMode = 'any' | 'lt' | 'gt' | 'between';

export type ReviewFilters = {
  query: string;
  category: string;      // '' = any
  amountMode: AmountMode;
  amtA: string;          // rupees
  amtB: string;          // rupees (Between upper bound)
  dateFrom: string;      // yyyy-MM-dd [HH:mm]
  dateTo: string;
  combine: 'and' | 'or';
};

export const DEFAULT_FILTERS: ReviewFilters = {
  query: '', category: '', amountMode: 'any', amtA: '', amtB: '', dateFrom: '', dateTo: '', combine: 'and',
};

/** The normalized row shape the filter needs (decoupled from PendingTxn). */
export type FilterRow = { description: string; category: string; amountPaise: number; date: number };

/** True when any filter is set (i.e. the working set is narrowed). */
export function filtersActive(f: ReviewFilters): boolean {
  return !!(f.query.trim() || f.category || f.amountMode !== 'any' || f.dateFrom.trim() || f.dateTo.trim());
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

/** Does a row satisfy the active filters? Predicates combine with AND or OR. */
export function rowMatches(row: FilterRow, f: ReviewFilters): boolean {
  const preds: boolean[] = [];
  if (f.query.trim()) preds.push(row.description.toLowerCase().includes(f.query.trim().toLowerCase()));
  if (f.category) preds.push(row.category === f.category);
  if (f.amountMode !== 'any') {
    const a = parseToPaise(f.amtA || '0');
    if (f.amountMode === 'lt') preds.push(row.amountPaise < a);
    else if (f.amountMode === 'gt') preds.push(row.amountPaise > a);
    else { const b = parseToPaise(f.amtB || '0'); const lo = Math.min(a, b), hi = Math.max(a, b); preds.push(row.amountPaise >= lo && row.amountPaise <= hi); }
  }
  if (f.dateFrom.trim()) { const t = parseFilterDate(f.dateFrom, false); if (t != null) preds.push(row.date >= t); }
  if (f.dateTo.trim()) { const t = parseFilterDate(f.dateTo, true); if (t != null) preds.push(row.date <= t); }
  if (preds.length === 0) return true;
  return f.combine === 'and' ? preds.every(Boolean) : preds.some(Boolean);
}

/**
 * Two descriptions look like the same merchant if they share a salient word
 * (drives the "apply category to similar rows?" prompt). Empty/word-less
 * descriptions never match.
 */
export function isSimilarMerchant(a: string, b: string): boolean {
  const wa = new Set(wordsOf(a));
  if (wa.size === 0) return false;
  return wordsOf(b).some(w => wa.has(w));
}
