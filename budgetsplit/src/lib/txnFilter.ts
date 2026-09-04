import { parseTags } from './tags';
import { txnTotal } from './splitMath';
import { formatRupees } from './money';
import type { TxnKind } from '../constants/enums';

/**
 * One filter for every transaction ledger.
 *
 * There were three, and they disagreed about what filtering even means. Personal
 * offered group scope and **no text search at all**; the group ledger offered kind
 * and text over `category + note`; Search offered source, kind and text over a much
 * wider haystack that folded in tags and both spellings of the amount. So the same
 * word found a row on one screen and not on another, and neither said why.
 *
 * `OV-34`. The collapse is behavioural, not just visual — `ui/FilterBar` becoming
 * `ui/Chip` fixes how it looks, and this fixes what it does.
 *
 * Pure: no React, no db, no RN. Every surface already filtered in memory, so this
 * changes no query.
 */

/** The `kind` filter, with the extra member meaning "don't filter". */
export const KIND_ANY = 'all' as const;
export type KindFilter = TxnKind | typeof KIND_ANY;

export type TxnFilters = {
  /** Free text. Matched against the haystack below, case- and comma-insensitive. */
  query: string;
  kind: KindFilter;
  /** Inclusive epoch-ms bounds. `null` = unbounded on that side. */
  from: number | null;
  to: number | null;
  /** Someone who paid for or consumed part of the entry. `null` = anyone. */
  personId: string | null;
};

export const NO_FILTERS: TxnFilters = { query: '', kind: KIND_ANY, from: null, to: null, personId: null };

/** The shape a row must expose to be filtered. A superset of what each screen has. */
export type FilterableTxn = {
  kind: string;
  date: number;
  category: string;
  note: string | null;
  tags: string | null;
  payments: ReadonlyArray<{ personId: string; amount: number }>;
  shares: ReadonlyArray<{ personId: string; amount: number }>;
};

/** True when anything is narrowing the list — drives "clear filters" affordances. */
export function filtersActive(f: TxnFilters): boolean {
  return !!(f.query.trim() || f.kind !== KIND_ANY || f.from !== null || f.to !== null || f.personId);
}

/**
 * Everything a free-text query is matched against.
 *
 * Taken from Search, which had the widest of the three and was right to: someone
 * hunting a row types whatever they remember about it, and that is as often "1200"
 * or a tag as it is the merchant. Both spellings of the amount are included so
 * "1,200" and "1200" each hit, and the rupee figure is folded in alongside the
 * whole-rupee integer.
 *
 * Tags join the haystack rather than getting a filter row of their own — the point
 * of a text field is that you do not have to know which control a word lives in.
 */
function haystack(t: FilterableTxn): string {
  const total = txnTotal(t);
  const tags = parseTags(t.tags).join(' ');
  return `${t.category} ${t.note ?? ''} ${tags} ${formatRupees(total)} ${Math.round(total / 100)}`
    .toLowerCase()
    .replace(/,/g, '');
}

/**
 * Does this person appear on the entry at all — as a payer or as a sharer?
 *
 * Deliberately either side. "Show me everything involving Aarav" means the dinner
 * he paid for *and* the one he ate; splitting those into two filters would ask the
 * user to know which side of a transaction someone was on before they can find it.
 * That is also why it is not `myShareOf`-shaped: this narrows a list, it does not
 * compute money, and `IV-08` is untouched.
 */
function involves(t: FilterableTxn, personId: string): boolean {
  return t.payments.some(p => p.personId === personId)
    || t.shares.some(s => s.personId === personId);
}

/** One row against one filter set. */
export function matchesFilters(t: FilterableTxn, f: TxnFilters): boolean {
  if (f.kind !== KIND_ANY && t.kind !== f.kind) return false;
  if (f.from !== null && t.date < f.from) return false;
  if (f.to !== null && t.date > f.to) return false;
  if (f.personId && !involves(t, f.personId)) return false;

  const q = f.query.trim().toLowerCase().replace(/,/g, '');
  if (!q) return true;
  return haystack(t).includes(q);
}

/** Convenience for the screens, which all do exactly this. */
export function applyFilters<T extends FilterableTxn>(rows: readonly T[], f: TxnFilters): T[] {
  return filtersActive(f) ? rows.filter(t => matchesFilters(t, f)) : [...rows];
}

/**
 * A named date range, as offsets from "now".
 *
 * Presets rather than two date pickers for the common cases, because "last month"
 * is what people ask for and expressing it as two dates is arithmetic they should
 * not have to do. `custom` hands off to the pickers for everything else.
 */
export type RangePreset = 'any' | '7d' | '30d' | 'thisMonth' | 'lastMonth' | 'custom';

export const RANGE_LABEL: Record<RangePreset, string> = {
  any: 'Any time',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  thisMonth: 'This month',
  lastMonth: 'Last month',
  custom: 'Custom',
};

/**
 * Resolve a preset to inclusive bounds.
 *
 * `now` is injectable because every date-sensitive thing in this repo is tested
 * across seven pinned dates (`npm run test:calendar`), and a function reading the
 * clock directly cannot be.
 */
export function resolveRange(preset: RangePreset, now: number = Date.now()): { from: number | null; to: number | null } {
  if (preset === 'any' || preset === 'custom') return { from: null, to: null };

  const d = new Date(now);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate(), 0, 0, 0, 0).getTime();
  const endOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate(), 23, 59, 59, 999).getTime();

  switch (preset) {
    case '7d':
      // Six days back plus today = seven days inclusive. "Last 7 days" that showed
      // eight would be wrong in the direction nobody checks.
      return { from: startOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 6)), to: endOfDay(d) };
    case '30d':
      return { from: startOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 29)), to: endOfDay(d) };
    case 'thisMonth':
      return { from: startOfDay(new Date(d.getFullYear(), d.getMonth(), 1)), to: endOfDay(d) };
    case 'lastMonth': {
      const first = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      // Day 0 of this month is the last day of the previous one — and it is correct
      // in December, where `getMonth() - 1` rolls the year back for you.
      const last = new Date(d.getFullYear(), d.getMonth(), 0);
      return { from: startOfDay(first), to: endOfDay(last) };
    }
  }
}
