import { useCallback, useMemo, useState } from 'react';
import {
  filtersActive, totalsRowLabel, totalsRows as totalsRowsOf, reportsHref as reportsHrefFor, KIND_ANY,
  type FilterableTxn, type KindFilter, type RangePreset, type TxnFilters,
} from '../lib/txnFilter';

/**
 * A ledger's filters, held by the screen so the row above the list can add up what the list
 * shows. Personal and every group ledger use it: they held the same states, the same "this month
 * unless dated" rule and the same "Last month · 2 filters" label apart, and the group's sat in
 * its tab, where the row under the header could not see them. The rules themselves are pure
 * functions in `lib/txnFilter`; this holds the state.
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
  /** Everything but the search text: what the totals row and its label are about. */
  const noSearch: TxnFilters = useMemo(() => ({ query: '', kind, from, to, personId, tags }), [kind, from, to, personId, tags]);
  const filters: TxnFilters = useMemo(() => ({ ...noSearch, query: search }), [noSearch, search]);
  const totalsRows = useCallback(<T extends FilterableTxn>(rows: readonly T[]) => totalsRowsOf(rows, noSearch), [noSearch]);

  const dates = { from, to, range };
  const count = extra + (kind !== KIND_ANY ? 1 : 0) + (personId ? 1 : 0) + tags.length;
  const reportsHref = useCallback((group?: string) => reportsHrefFor({ from, to, range }, group), [from, to, range]);

  return {
    filters, totalsRows, reportsHref,
    label: totalsRowLabel(dates, count),
    /** Anything but the search text is set. */
    narrowed: filtersActive(noSearch),
    kind, setKind, search, setSearch, range, from, to, setRange, personId, setPersonId, tags, setTags, clear,
  };
}

export type TxnFilterState = ReturnType<typeof useTxnFilters>;
