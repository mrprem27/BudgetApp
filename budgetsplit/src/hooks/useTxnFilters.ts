import { useCallback, useMemo, useState } from 'react';
import {
  applyFilters, filtersActive, totalsRowLabel, reportsHref as reportsHrefFor, KIND_ANY,
  type FilterableTxn, type KindFilter, type RangePreset, type TxnFilters,
} from '../lib/txnFilter';

/**
 * A ledger's filters, held by the screen so the row above the list can add up what the list
 * shows. Personal and every group ledger use it: they held the same seven states, the same
 * "this month unless dated" rule and the same "Last month · 2 filters" label apart, and the
 * group's sat in its tab, where the row under the header could not see them.
 *
 * `extra` is how many of the screen's own filters are on (Personal's scope), for the label.
 */
export function useTxnFilters(extra = 0) {
  const [kind, setKind] = useState<KindFilter>(KIND_ANY);
  const [search, setSearch] = useState('');
  const [range, setRangePreset] = useState<RangePreset>('any');
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);

  const setRange = useCallback((r: RangePreset, f: number | null, t: number | null) => { setRangePreset(r); setFrom(f); setTo(t); }, []);
  const clear = useCallback(() => {
    setKind(KIND_ANY); setSearch(''); setRangePreset('any'); setFrom(null); setTo(null); setPersonId(null); setTags([]);
  }, []);
  const filters: TxnFilters = useMemo(() => ({ query: search, kind, from, to, personId, tags }), [search, kind, from, to, personId, tags]);

  /*
   * The rows a totals row adds up: the filters without the search text, and this month while no
   * date is chosen (an all-time "spent" answers nothing). Search finds rows; it does not change
   * what the figures are about (`U-62`), and it has no place in the label, so a typed word would
   * have narrowed the totals with nothing on screen saying so.
   */
  const monthStart = useMemo(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); }, []);
  const dated = from != null || to != null;
  const totalsRows = useCallback(<T extends FilterableTxn>(rows: T[]): T[] => {
    const narrowed = applyFilters(rows, { query: '', kind, from, to, personId, tags });
    return dated ? narrowed : narrowed.filter(t => t.date >= monthStart);
  }, [kind, from, to, personId, tags, dated, monthStart]);

  const count = extra + (kind !== KIND_ANY ? 1 : 0) + (personId ? 1 : 0) + tags.length;
  const label = totalsRowLabel({ from, to, range }, count);
  const reportsHref = useCallback((group?: string) => reportsHrefFor({ from, to, range }, group), [from, to, range]);

  return {
    filters, label, totalsRows, reportsHref,
    /** Anything but the search text is set. */
    narrowed: filtersActive({ query: '', kind, from, to, personId, tags }),
    kind, setKind, search, setSearch, range, from, to, setRange, personId, setPersonId, tags, setTags, clear,
  };
}

export type TxnFilterState = ReturnType<typeof useTxnFilters>;
