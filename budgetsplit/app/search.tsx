import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { format, startOfMonth } from 'date-fns';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout, shadow } from '../src/constants/layout';
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
  const [kind, setKind] = useState<KindFilter>('all');
  const [source, setSource] = useState<SearchSource>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, error, reload } = useScreenData(async (db) => {
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
    const q = query.trim().toLowerCase();
    const filtered = all.filter(t => {
      if (kind !== 'all' && t.kind !== kind) return false;
      if (source === 'personal' && personalGroupId && t.group_id !== personalGroupId) return false;
      if (source === 'groups' && personalGroupId && t.group_id === personalGroupId) return false;
      if (!q) return true;
      const total = txnTotal(t);
      const hay = `${t.category} ${t.note ?? ''} ${formatRupees(total)} ${Math.round(total / 100)}`.toLowerCase();
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
  }, [all, query, kind, source, personalGroupId, expanded]);

  const hasQuery = query.trim().length > 0;

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

          {/* Filters: source · kind (centralized enums) */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
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

          {totalCount > 0 && (
            <View style={styles.resultHeader}>
              <Text style={styles.resultCount}>
                {totalCount} {totalCount === 1 ? 'result' : 'results'}
                {totalAmount > 0 ? <Text style={styles.resultAmt}> · {formatCompact(totalAmount)} total</Text> : null}
              </Text>
            </View>
          )}

          {sections.length === 0 ? (
            <EmptyState
              icon="search"
              title={hasQuery ? 'No matches' : 'Search your transactions'}
              body={hasQuery ? 'Try a different word or amount.' : 'Find any past expense, income or settlement by category, note or amount.'}
              tint={colors.textSecondary}
            />
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={(item) => isMore(item) ? `more-${item.section}` : item.id}
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              stickySectionHeadersEnabled={false}
              renderSectionHeader={({ section }) => <Text style={styles.monthLabel}>{section.title}</Text>}
              renderItem={({ item }) => {
                if (isMore(item)) {
                  return (
                    <TouchableOpacity
                      style={styles.moreRow}
                      onPress={() => setExpanded(prev => new Set(prev).add(item.section))}
                      accessibilityRole="button"
                      accessibilityLabel={`Show ${item.count} more in ${item.monthName}`}
                    >
                      <Text style={styles.moreText}>Show {item.count} more in {item.monthName.charAt(0) + item.monthName.slice(1).toLowerCase()}</Text>
                      <Feather name="chevron-down" size={16} color={colors.accent} />
                    </TouchableOpacity>
                  );
                }
                const isPersonalTxn = item.group_id === personalGroupId;
                return (
                  <View style={styles.rowCard}>
                    <TransactionRow
                      txn={item}
                      myId={myId}
                      showDate
                      highlight={query.trim()}
                      groupName={isPersonalTxn ? 'Personal' : groupNames[item.group_id]}
                      onPress={() => router.push(`/txn/${item.id}`)}
                    />
                  </View>
                );
              }}
            />
          )}
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
  chips: { flexDirection: 'row', gap: space.sm, paddingHorizontal: layout.screenPaddingH, paddingBottom: space.sm, alignItems: 'center' },
  chipDivider: { width: 1, height: 20, backgroundColor: colors.border, marginHorizontal: 2 },
  chip: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: colors.bgMuted },
  chipActive: { backgroundColor: colors.accent },
  chipText: { ...type.label, color: colors.textSecondary },
  chipTextActive: { color: colors.bg },
  resultHeader: { paddingHorizontal: layout.screenPaddingH, paddingBottom: space.xs },
  resultCount: { ...type.caption, color: colors.textMuted },
  resultAmt: { color: colors.textSecondary, fontFamily: 'SpaceMono_400Regular' },
  list: { paddingHorizontal: layout.screenPaddingH, paddingBottom: space.lg },
  monthLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: space.md, marginBottom: space.xs },
  rowCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: space.sm, overflow: 'hidden', ...shadow.sm },
  moreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingVertical: space.sm, marginBottom: space.sm },
  moreText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
});
