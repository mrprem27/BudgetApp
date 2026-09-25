import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { startOfMonth } from 'date-fns';
import { monthLabel } from '../src/lib/dateFormat';
import { colors, type, space, radius, layout } from '../src/theme';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ErrorState } from '../src/components/ui/ErrorState';
import { TransactionRow } from '../src/components/finance/TransactionRow';
import { TxnCell } from '../src/components/finance/TxnCell';
import { SectionHeader } from '../src/components/ui/SectionHeader';
import { getTransactionsInRange } from '../src/db/queries/transactions';
import { getMe } from '../src/db/queries/persons';
import { getAllGroups } from '../src/db/queries/groups';
import { formatCompact } from '../src/lib/money';
import { txnTotal } from '../src/lib/splitMath';
import { FilterBar } from '../src/components/ui/FilterBar';
import { applyFilters, resolveRange, KIND_ANY, type KindFilter, type RangePreset } from '../src/lib/txnFilter';
import { getAllPersons } from '../src/db/queries/persons';
import { useScreenData } from '../src/hooks/useScreenData';
import { SEARCH_SOURCE, SEARCH_SOURCE_LABEL, type SearchSource } from '../src/constants/enums';
import type { TxnWithSplits } from '../src/db/queries/transactions';
import { keyboardAwareScroll } from '../src/components/ui/KeyboardForm';

// `KindFilter` was declared here, one of three private copies of the same idea.
// It lives in `lib/txnFilter.ts` now, with the predicate that reads it.

/** Stable identity — `FilterBar` memoises its chips on it (see the note there). */
const SOURCE_GROUP = [{
  key: 'source',
  options: SEARCH_SOURCE.map(v => ({ label: SEARCH_SOURCE_LABEL[v], value: v })),
}];

const THREE_YEARS_MS = 3 * 365 * 24 * 60 * 60 * 1000;
const SECTION_CAP = 6;

type MoreRow = { _more: true; section: string; count: number; monthName: string };
type Row = TxnWithSplits | MoreRow;
type MonthSection = { title: string; data: Row[] };
const isMore = (r: Row): r is MoreRow => (r as MoreRow)._more === true;

const searchScroll = keyboardAwareScroll();

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  // Debounced copy drives filtering so we don't re-scan up to 3 years of txns on
  // every keystroke; the TextInput and clear button stay bound to `query` (instant).
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(id);
  }, [query]);
  const [kind, setKind] = useState<KindFilter>(KIND_ANY);
  const [source, setSource] = useState<SearchSource>('all');
  // Date range and person, which no ledger surface offered before `OV-34`.
  const [range, setRange] = useState<RangePreset>('any');
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, loading, error, reload } = useScreenData(async (db) => {
    const now = Date.now();
    const [txns, me, grps, persons] = await Promise.all([
      getTransactionsInRange(db, null, now - THREE_YEARS_MS, now),
      getMe(db),
      getAllGroups(db),
      getAllPersons(db),
    ]);
    return {
      all: txns,
      myId: me?.id ?? '',
      personalGroupId: grps.find(g => g.is_personal === 1)?.id ?? '',
      groupNames: Object.fromEntries(grps.map(g => [g.id, g.name])) as Record<string, string>,
      // Everyone, so the person chip can narrow to any of them. `me` included —
      // "only the ones I'm on" is a real question on a screen spanning every group.
      people: persons.map(x => ({ id: x.id, name: x.name })),
    };
  }, []);

  const all = data?.all ?? [];
  const myId = data?.myId ?? '';
  const personalGroupId = data?.personalGroupId ?? '';
  const groupNames = data?.groupNames ?? {};

  const { sections, totalCount, totalAmount } = useMemo(() => {
    /*
     * Kind, text, date range and person come from `lib/txnFilter.ts` — the same
     * predicate the Personal ledger and the group ledger now run, so a word that
     * finds a row here finds it there too. This screen's haystack was the widest of
     * the three and became the shared one: tags and both spellings of the amount
     * are folded in, because someone hunting a row types whatever they remember
     * about it rather than reaching for the right control first.
     *
     * `source` stays local: it is not a property of a transaction, it is which
     * ledger you are looking at.
     */
    const filtered = applyFilters(all, { query: debouncedQuery, kind, from, to, personId })
      .filter(t => {
        if (source === 'personal' && personalGroupId && t.group_id !== personalGroupId) return false;
        if (source === 'groups' && personalGroupId && t.group_id === personalGroupId) return false;
        return true;
      });

    /*
     * Grouped by `date` — WHEN IT HAPPENED — like every other ledger surface.
     *
     * This grouped by `created_at`, the moment the row was written, while the
     * query that produced these rows both filters and orders by `date`. Three
     * things went wrong at once: a bill dated in March but entered today sat
     * under SEPTEMBER here and under March everywhere else, so searching for it
     * found it in the wrong place; rows inside a section arrived in `date` order
     * under a header derived from a different column, so a section could read out
     * of order against itself; and an imported statement, whose rows are all
     * created within the same minute, collapsed three years of history into one
     * month.
     */
    const map = new Map<string, TxnWithSplits[]>();
    for (const t of filtered) {
      const d = new Date(t.date);
      const key = isFinite(d.getTime()) ? monthLabel(startOfMonth(d)).toUpperCase() : 'OLDER';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }

    // Cap each month at SECTION_CAP rows unless expanded; overflow collapses into a
    // "+ N more in {month}" row.
    const secs: MonthSection[] = Array.from(map.entries()).map(([title, rows]) => {
      if (rows.length > SECTION_CAP && !expanded.has(title)) {
        const monthName = title.split(' ')[0];
        return {
          title,
          data: [...rows.slice(0, SECTION_CAP), { _more: true as const, section: title, count: rows.length - SECTION_CAP, monthName }] as Row[],
        };
      }
      return { title, data: rows };
    });
    // Summed for the SELECTED kind only. It used to sum expenses whatever was listed, so
    // "24 results · ₹12,400 total" was measuring something other than the 24 rows above it
    // — and on "All" a single figure across money-in, money-out and settlements answers no
    // question at all, so there is none.
    const totalAmt = kind === 'all'
      ? 0
      : filtered.reduce((s, t) => s + txnTotal(t), 0);
    return { sections: secs, totalCount: filtered.length, totalAmount: totalAmt };
  }, [all, debouncedQuery, kind, from, to, personId, source, personalGroupId, expanded]);

  const hasQuery = query.trim().length > 0;
  // Results reflect the debounced query — key the empty-state copy off it too.
  const hasSearched = debouncedQuery.trim().length > 0;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Search" onBack={() => router.back()} />
      {error ? (
        <ErrorState onRetry={reload} />
      ) : (
        <>
          {/* Search bar — clearable, design-system surface */}
          <View style={styles.searchWrap}>
            <View style={styles.searchBar}>
              <Feather name="search" size={18} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search expenses, income, settlements…"
                placeholderTextColor={colors.textMuted}
                autoFocus
                autoCorrect={false}
                returnKeyType="search"
                accessibilityLabel="Search transactions"
              />
              {hasQuery && (
                <TouchableOpacity onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
                  <Feather name="x" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* One filter bar, shared with the Personal and group ledgers. This screen
              used to hand-roll its own chip row over `TouchableOpacity` — one of four
              such implementations, including inside `ui/FilterBar` itself (`OV-34`).
              `source` is passed as a scope group because it names a ledger, not a
              property of a transaction. */}
          <FilterBar
            selected={{ source }}
            onSelect={(_, v) => setSource(v as SearchSource)}
            groups={SOURCE_GROUP}
            kind={kind}
            onKind={setKind}
            range={range}
            customFrom={from}
            customTo={to}
            onRange={(r, f2, t2) => { setRange(r); setFrom(f2); setTo(t2); }}
            people={data?.people ?? []}
            personId={personId}
            onPerson={setPersonId}
          />

          {/* Results fill the remaining space so the list scrolls and the empty
              state sits in a stable region below the filters. */}
          <View style={styles.results}>
            {totalCount > 0 && (
              <View style={styles.resultHeader}>
                <Text style={styles.resultCount}>
                  {totalCount} {totalCount === 1 ? 'result' : 'results'}
                  {totalAmount > 0 ? (
                    <Text style={styles.resultAmt}>
                      {' · '}{formatCompact(totalAmount)}
                      {kind === 'expense' ? ' spent' : kind === 'income' ? ' received' : ' moved'}
                    </Text>
                  ) : null}
                </Text>
              </View>
            )}

            {sections.length === 0 ? (loading ? null : (
              <EmptyState
                icon="search"
                title={hasSearched ? 'No matches' : 'Search your transactions'}
                body={hasSearched ? 'Try a different word or amount.' : 'Find any past expense, income or settlement by category, note or amount.'}
                tint={colors.textSecondary}
                fill
              />
            )) : (
              <SectionList
                sections={sections}
                style={styles.listFlex}
                keyExtractor={(item) => isMore(item) ? `more-${item.section}` : item.id}
                contentContainerStyle={styles.list}
                // Keyboard-aware (AGENTS.md §6b): results scroll clear of the
                // keyboard instead of ending behind it.
                renderScrollComponent={searchScroll}
                stickySectionHeadersEnabled={false}
                renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
                renderItem={({ item, index, section }) => {
                  const isFirst = index === 0;
                  const isLast = index === section.data.length - 1;
                  if (isMore(item)) {
                    return (
                      <TxnCell first={isFirst} last={isLast} padded={false}>
                        <TouchableOpacity
                          style={styles.moreRow}
                          onPress={() => setExpanded(prev => new Set(prev).add(item.section))}
                          accessibilityRole="button"
                          accessibilityLabel={`Show ${item.count} more in ${item.monthName}`}
                        >
                          <Text style={styles.moreText}>Show {item.count} more in {item.monthName.charAt(0) + item.monthName.slice(1).toLowerCase()}</Text>
                          <Feather name="chevron-down" size={16} color={colors.accent} />
                        </TouchableOpacity>
                      </TxnCell>
                    );
                  }
                  const isPersonalTxn = item.group_id === personalGroupId;
                  return (
                    <TxnCell first={isFirst} last={isLast}>
                      <TransactionRow
                        txn={item}
                        myId={myId}
                        showDate
                        highlight={query.trim()}
                        groupName={isPersonalTxn ? 'Personal' : groupNames[item.group_id]}
                        onPress={() => router.push(`/txn/${item.id}`)}
                      />
                    </TxnCell>
                  );
                }}
              />
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  searchWrap: { paddingHorizontal: layout.screenPaddingH, paddingTop: space.xs, paddingBottom: space.sm },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: colors.bgInput, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    height: 48, paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15, color: colors.textPrimary, paddingVertical: 0 },
  results: { flex: 1 },
  resultHeader: { paddingHorizontal: layout.screenPaddingH, paddingBottom: space.xs },
  resultCount: { ...type.caption, color: colors.textMuted },
  resultAmt: { color: colors.textSecondary, fontFamily: 'SpaceMono_400Regular' },
  listFlex: { flex: 1 },
  list: { paddingHorizontal: layout.screenPaddingH, paddingBottom: space.lg },
  moreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingVertical: space.md, paddingHorizontal: space.md },
  moreText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
});
