import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { format, startOfMonth } from 'date-fns';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout } from '../src/constants/layout';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ErrorState } from '../src/components/ui/ErrorState';
import { TransactionRow } from '../src/components/finance/TransactionRow';
import { getTransactionsInRange } from '../src/db/queries/transactions';
import { getMe } from '../src/db/queries/persons';
import { getAllGroups } from '../src/db/queries/groups';
import { formatRupees, formatCompact } from '../src/lib/money';
import { useScreenData } from '../src/hooks/useScreenData';
import { TXN_KIND, TXN_KIND_LABEL_PLURAL, SEARCH_SOURCE, SEARCH_SOURCE_LABEL, type TxnKind, type SearchSource } from '../src/constants/enums';
import type { TxnWithSplits } from '../src/db/queries/transactions';

type KindFilter = TxnKind | 'all';

const THREE_YEARS_MS = 3 * 365 * 24 * 60 * 60 * 1000;
const SECTION_CAP = 6;

type MoreRow = { _more: true; section: string; count: number; monthName: string };
type Row = TxnWithSplits | MoreRow;
type MonthSection = { title: string; data: Row[] };
const isMore = (r: Row): r is MoreRow => (r as MoreRow)._more === true;

function txnTotal(t: TxnWithSplits): number {
  return t.payments.reduce((s, p) => s + p.amount, 0);
}

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
  const [kind, setKind] = useState<KindFilter>('all');
  const [source, setSource] = useState<SearchSource>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, loading, error, reload } = useScreenData(async (db) => {
    const now = Date.now();
    const [txns, me, grps] = await Promise.all([
      getTransactionsInRange(db, null, now - THREE_YEARS_MS, now),
      getMe(db),
      getAllGroups(db),
    ]);
    return {
      all: txns,
      myId: me?.id ?? '',
      personalGroupId: grps.find(g => g.is_personal === 1)?.id ?? '',
      groupNames: Object.fromEntries(grps.map(g => [g.id, g.name])) as Record<string, string>,
    };
  }, []);

  const all = data?.all ?? [];
  const myId = data?.myId ?? '';
  const personalGroupId = data?.personalGroupId ?? '';
  const groupNames = data?.groupNames ?? {};

  const { sections, totalCount, totalAmount } = useMemo(() => {
    // Strip commas so "1,200" and "1200" match either way against the amount.
    const q = debouncedQuery.trim().toLowerCase().replace(/,/g, '');
    const filtered = all.filter(t => {
      if (kind !== 'all' && t.kind !== kind) return false;
      if (source === 'personal' && personalGroupId && t.group_id !== personalGroupId) return false;
      if (source === 'groups' && personalGroupId && t.group_id === personalGroupId) return false;
      if (!q) return true;
      const total = txnTotal(t);
      const hay = `${t.category} ${t.note ?? ''} ${formatRupees(total)} ${Math.round(total / 100)}`.toLowerCase().replace(/,/g, '');
      return hay.includes(q);
    });

    const map = new Map<string, TxnWithSplits[]>();
    for (const t of filtered) {
      const d = new Date(t.created_at);
      const key = isFinite(d.getTime()) ? format(startOfMonth(d), 'MMMM yyyy').toUpperCase() : 'OLDER';
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
    const totalAmt = filtered.filter(t => t.kind === 'expense').reduce((s, t) => s + txnTotal(t), 0);
    return { sections: secs, totalCount: filtered.length, totalAmount: totalAmt };
  }, [all, debouncedQuery, kind, source, personalGroupId, expanded]);

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

          {/* Filters: source · kind (centralized enums). `flexGrow:0` is critical —
              a horizontal ScrollView in a flex column otherwise stretches to fill the
              whole screen and shoves the results off. */}
          <View style={styles.chipsWrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
              {SEARCH_SOURCE.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, source === s && styles.chipActive]}
                  onPress={() => setSource(s)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: source === s }}
                >
                  <Text style={[styles.chipText, source === s && styles.chipTextActive]}>{SEARCH_SOURCE_LABEL[s]}</Text>
                </TouchableOpacity>
              ))}
              <View style={styles.chipDivider} />
              {TXN_KIND.map(k => (
                <TouchableOpacity
                  key={k}
                  style={[styles.chip, kind === k && styles.chipActive]}
                  onPress={() => setKind(kind === k ? 'all' : k)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: kind === k }}
                >
                  <Text style={[styles.chipText, kind === k && styles.chipTextActive]}>{TXN_KIND_LABEL_PLURAL[k]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {/* Fade hints the row keeps scrolling past the last visible chip. */}
            <LinearGradient
              colors={[colors.bg + '00', colors.bg]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.chipsFade}
              pointerEvents="none"
            />
          </View>

          {/* Results fill the remaining space so the list scrolls and the empty
              state sits in a stable region below the filters. */}
          <View style={styles.results}>
            {totalCount > 0 && (
              <View style={styles.resultHeader}>
                <Text style={styles.resultCount}>
                  {totalCount} {totalCount === 1 ? 'result' : 'results'}
                  {totalAmount > 0 ? <Text style={styles.resultAmt}> · {formatCompact(totalAmount)} total</Text> : null}
                </Text>
              </View>
            )}

            {sections.length === 0 ? (loading ? null : (
              <EmptyState
                icon="search"
                title={hasSearched ? 'No matches' : 'Search your transactions'}
                body={hasSearched ? 'Try a different word or amount.' : 'Find any past expense, income or settlement by category, note or amount.'}
                tint={colors.textSecondary}
              />
            )) : (
              <SectionList
                sections={sections}
                style={styles.listFlex}
                keyExtractor={(item) => isMore(item) ? `more-${item.section}` : item.id}
                contentContainerStyle={styles.list}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                stickySectionHeadersEnabled={false}
                renderSectionHeader={({ section }) => <Text style={styles.monthLabel}>{section.title}</Text>}
                renderItem={({ item, index, section }) => {
                  // Rows in a month join into ONE card: top row rounds the top, last
                  // row rounds the bottom, hairline dividers sit between them.
                  const isFirst = index === 0;
                  const isLast = index === section.data.length - 1;
                  const cell = [styles.cell, isFirst && styles.cellFirst, isLast && styles.cellLast];
                  if (isMore(item)) {
                    return (
                      <View style={cell}>
                        <TouchableOpacity
                          style={styles.moreRow}
                          onPress={() => setExpanded(prev => new Set(prev).add(item.section))}
                          accessibilityRole="button"
                          accessibilityLabel={`Show ${item.count} more in ${item.monthName}`}
                        >
                          <Text style={styles.moreText}>Show {item.count} more in {item.monthName.charAt(0) + item.monthName.slice(1).toLowerCase()}</Text>
                          <Feather name="chevron-down" size={16} color={colors.accent} />
                        </TouchableOpacity>
                      </View>
                    );
                  }
                  const isPersonalTxn = item.group_id === personalGroupId;
                  return (
                    <View style={cell}>
                      <View style={styles.cellInner}>
                        <TransactionRow
                          txn={item}
                          myId={myId}
                          showDate
                          highlight={query.trim()}
                          groupName={isPersonalTxn ? 'Personal' : groupNames[item.group_id]}
                          onPress={() => router.push(`/txn/${item.id}`)}
                        />
                      </View>
                      {!isLast && <View style={styles.rowDivider} />}
                    </View>
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
  chipsWrap: { position: 'relative' },
  chipsScroll: { flexGrow: 0, flexShrink: 0 },
  chips: { flexDirection: 'row', gap: space.sm, paddingHorizontal: layout.screenPaddingH, paddingBottom: space.sm, alignItems: 'center' },
  chipsFade: { position: 'absolute', right: 0, top: 0, bottom: space.sm, width: 28 },
  chipDivider: { width: 1, height: 18, backgroundColor: colors.border, marginHorizontal: space.xs, alignSelf: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.bgMuted },
  chipActive: { backgroundColor: colors.accent },
  chipText: { ...type.label, color: colors.textSecondary },
  chipTextActive: { color: colors.onAccent },
  results: { flex: 1 },
  resultHeader: { paddingHorizontal: layout.screenPaddingH, paddingBottom: space.xs },
  resultCount: { ...type.caption, color: colors.textMuted },
  resultAmt: { color: colors.textSecondary, fontFamily: 'SpaceMono_400Regular' },
  listFlex: { flex: 1 },
  list: { paddingHorizontal: layout.screenPaddingH, paddingBottom: space.lg },
  monthLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: space.lg, marginBottom: space.sm },
  // A month's rows share ONE card: side borders always; the first row rounds the
  // top, the last rounds the bottom; hairline dividers (indented past the icon)
  // separate rows within the card.
  cell: { backgroundColor: colors.bgCard, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
  cellFirst: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  cellLast: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  cellInner: { paddingHorizontal: space.md },
  rowDivider: { height: 1, backgroundColor: colors.border, marginLeft: 64, marginRight: space.md },
  moreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingVertical: space.md, paddingHorizontal: space.md },
  moreText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
});
