import { useCallback, useMemo, useState } from 'react';
import { KIND_ANY, RANGE_LABEL, type KindFilter, type RangePreset, type TxnFilters } from '../lib/txnFilter';

/**
 * A ledger's filters, held by the screen so the row above the list can add up what the list
 * shows. They were the group ledger tab's own state, so the row under the group's header could
 * not see them and stayed on this month whatever was filtered (yours, 2026-10-01).
 */
export function useTxnFilters() {
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

  // What changed the row from its default (this month, everything): "Last month · 2 filters".
  const count = (kind !== KIND_ANY ? 1 : 0) + (personId ? 1 : 0) + tags.length;
  const period = from == null && to == null ? null : range === 'custom' ? 'Chosen dates' : RANGE_LABEL[range];
  const label = [period, count > 0 ? `${count} ${count === 1 ? 'filter' : 'filters'}` : null].filter(Boolean).join(' · ') || null;

  return { filters, label, dated: from != null || to != null, kind, setKind, search, setSearch, range, from, to, setRange, personId, setPersonId, tags, setTags, clear };
}

export type TxnFilterState = ReturnType<typeof useTxnFilters>;
