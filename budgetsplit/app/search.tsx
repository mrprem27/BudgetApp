import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, ScrollView } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { format, startOfMonth } from 'date-fns';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout, shadow } from '../src/constants/layout';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { Input } from '../src/components/ui/Input';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ErrorState } from '../src/components/ui/ErrorState';
import { TransactionRow } from '../src/components/finance/TransactionRow';
import { getTransactionsInRange } from '../src/db/queries/transactions';
import { getMe } from '../src/db/queries/persons';
import { getAllGroups } from '../src/db/queries/groups';
import { formatRupees, formatCompact } from '../src/lib/money';
import type { TxnWithSplits } from '../src/db/queries/transactions';

type KindFilter = 'all' | 'expense' | 'income' | 'settlement';
type SourceFilter = 'all' | 'personal' | 'groups';
const KINDS: { key: KindFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'expense', label: 'Expenses' },
  { key: 'income', label: 'Income' },
  { key: 'settlement', label: 'Settlements' },
];

const THREE_YEARS_MS = 3 * 365 * 24 * 60 * 60 * 1000;

type MoreRow = { _more: true; section: string; count: number; monthName: string };
type Row = TxnWithSplits | MoreRow;
type MonthSection = { title: string; data: Row[] };
const isMore = (r: Row): r is MoreRow => (r as MoreRow)._more === true;

function txnTotal(t: TxnWithSplits): number {
  return t.payments.reduce((s, p) => s + p.amount, 0);
}

export default function SearchScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [all, setAll] = useState<TxnWithSplits[]>([]);
  const [myId, setMyId] = useState('');
  const [personalGroupId, setPersonalGroupId] = useState('');
  const [groupNames, setGroupNames] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [source, setSource] = useState<SourceFilter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState(false);

  const SECTION_CAP = 6;

  const load = useCallback(async () => {
    try {
      const now = Date.now();
      const [txns, me, grps] = await Promise.all([
        getTransactionsInRange(db, null, now - THREE_YEARS_MS, now),
        getMe(db),
        getAllGroups(db),
      ]);
      setAll(txns);
      setMyId(me?.id ?? '');
      setPersonalGroupId(grps.find(g => g.is_personal === 1)?.id ?? '');
      setGroupNames(Object.fromEntries(grps.map(g => [g.id, g.name])));
      setLoadError(false);
    } catch { setLoadError(true); }
  }, [db]);

  useEffect(() => { load(); }, [load]);

  const SOURCE_CHIPS: { key: SourceFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'personal', label: 'Personal' },
    { key: 'groups', label: 'Groups' },
  ];

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

    // Group by month key (YYYY-MM)
    const map = new Map<string, TxnWithSplits[]>();
    for (const t of filtered) {
      const d = new Date(t.created_at);
      const key = isFinite(d.getTime()) ? format(startOfMonth(d), 'MMMM yyyy').toUpperCase() : 'OLDER';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }

    // Cap each month at SECTION_CAP rows unless expanded; the overflow collapses
    // into a "+ N more in {month}" row (design Screen 7).
    const secs: MonthSection[] = Array.from(map.entries()).map(([title, data]) => {
      if (data.length > SECTION_CAP && !expanded.has(title)) {
        const monthName = title.split(' ')[0]; // "JUNE 2026" → "JUNE"
        return {
          title,
          data: [...data.slice(0, SECTION_CAP), { _more: true as const, section: title, count: data.length - SECTION_CAP, monthName }] as Row[],
        };
      }
      return { title, data };
    });
    const totalAmt = filtered
      .filter(t => t.kind === 'expense')
      .reduce((s, t) => s + txnTotal(t), 0);

    return { sections: secs, totalCount: filtered.length, totalAmount: totalAmt };
  }, [all, query, kind, source, personalGroupId, expanded]);

  const hasQuery = query.trim().length > 0;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Search" onBack={() => router.back()} />
      {loadError ? (
        <ErrorState onRetry={load} />
      ) : (
        <>
          <View style={styles.searchWrap}>
            <Input value={query} onChangeText={setQuery} placeholder="Category, note or amount…" icon="search" autoFocus />
          </View>

          {/* Single scrollable filter row — source + kind (design Screen 7) */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
            {SOURCE_CHIPS.map(s => (
              <TouchableOpacity
                key={s.key}
                style={[styles.chip, source === s.key && styles.chipActive]}
                onPress={() => setSource(s.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: source === s.key }}
              >
                <Text style={[styles.chipText, source === s.key && styles.chipTextActive]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
            <View style={styles.chipDivider} />
            {KINDS.filter(k => k.key !== 'all').map(k => (
              <TouchableOpacity
                key={k.key}
                style={[styles.chip, kind === k.key && styles.chipActive]}
                onPress={() => setKind(kind === k.key ? 'all' : k.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: kind === k.key }}
              >
                <Text style={[styles.chipText, kind === k.key && styles.chipTextActive]}>{k.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Result count header — only when there are results */}
          {totalCount > 0 && (
            <View style={styles.resultHeader}>
              <Text style={styles.resultCount}>
                {totalCount} {totalCount === 1 ? 'transaction' : 'transactions'}
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
              renderSectionHeader={({ section }) => (
                <Text style={styles.monthLabel}>{section.title}</Text>
              )}
              renderItem={({ item }) => {
                if (isMore(item)) {
                  return (
                    <TouchableOpacity
                      style={styles.moreRow}
                      onPress={() => setExpanded(prev => new Set(prev).add(item.section))}
                      accessibilityRole="button"
                      accessibilityLabel={`Show ${item.count} more in ${item.monthName}`}
                    >
                      <Text style={styles.moreText}>+ {item.count} more in {item.monthName.charAt(0) + item.monthName.slice(1).toLowerCase()}</Text>
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
  searchWrap: { paddingHorizontal: layout.screenPaddingH, paddingBottom: space.sm },
  chips: { flexDirection: 'row', gap: space.sm, paddingHorizontal: layout.screenPaddingH, paddingBottom: space.sm, alignItems: 'center' },
  chipDivider: { width: 1, height: 20, backgroundColor: colors.border, marginHorizontal: 2 },
  chip: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: colors.bgMuted },
  chipActive: { backgroundColor: colors.accent },
  chipText: { ...type.label, color: colors.textSecondary },
  chipTextActive: { color: colors.bg },
  resultHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: layout.screenPaddingH, paddingBottom: space.xs },
  resultCount: { ...type.caption, color: colors.textMuted },
  resultAmt: { color: colors.textSecondary, fontFamily: 'SpaceMono_400Regular' },
  list: { paddingHorizontal: layout.screenPaddingH, paddingBottom: space.lg },
  monthLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: space.md, marginBottom: space.xs },
  rowCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: space.sm, overflow: 'hidden', ...shadow.sm },
  moreRow: { alignItems: 'center', paddingVertical: space.sm, marginBottom: space.sm },
  moreText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
});
