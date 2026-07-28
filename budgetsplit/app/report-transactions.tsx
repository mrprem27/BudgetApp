import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout } from '../src/constants/layout';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ErrorState } from '../src/components/ui/ErrorState';
import { FilterBar, type ChipGroup } from '../src/components/ui/FilterBar';
import { TransactionRow } from '../src/components/finance/TransactionRow';
import { useScreenData } from '../src/hooks/useScreenData';
import { getAllGroups } from '../src/db/queries/groups';
import { getCategories } from '../src/db/queries/categories';
import { getMe } from '../src/db/queries/persons';
import { getTransactionsInRange, type TxnWithSplits } from '../src/db/queries/transactions';
import { foldUncategorized, OTHERS_LABEL } from '../src/lib/categoryFold';
import { formatCompact } from '../src/lib/money';
import { AppRefreshControl } from '../src/components/ui/AppRefreshControl';

// Full transaction magnitude (all shares/payments), used for the "Largest" sort
// and the header total — matches how Reports totals categories.
function txnAmount(t: TxnWithSplits): number {
  return t.kind === 'income'
    ? t.payments.reduce((s, p) => s + p.amount, 0)
    : t.shares.reduce((s, sh) => s + sh.amount, 0);
}

function parseMonth(m?: string): Date {
  const parts = (m ?? '').split('-');
  if (parts.length === 2) {
    const y = Number(parts[0]); const mo = Number(parts[1]);
    if (Number.isFinite(y) && Number.isFinite(mo)) return new Date(y, mo - 1, 1);
  }
  return new Date();
}

/**
 * Month-scoped transaction list — the drill-down opened from Reports when a
 * category is selected. Shows every transaction in the selected month, filterable
 * by category, type, group, and sort order.
 */
export default function ReportTransactionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { month, category } = useLocalSearchParams<{ month?: string; category?: string }>();
  const monthDate = useMemo(() => parseMonth(month), [month]);
  const monthKey = format(monthDate, 'yyyy-MM');

  const [filters, setFilters] = useState<Record<string, string>>({
    cat: category ?? 'all',
    type: 'all',
    group: 'all',
    sort: 'date',
  });

  const { data, loading, error: loadError, refreshing, onRefresh, reload } = useScreenData(async (db) => {
    const grps = await getAllGroups(db);
    const me = await getMe(db);
    const from = startOfMonth(monthDate).getTime();
    const to = endOfMonth(monthDate).getTime();
    const [txns, knownCats] = await Promise.all([
      getTransactionsInRange(db, null, from, to),
      getCategories(db, 'expense'),
    ]);
    const known = new Set(knownCats.map(c => c.name));

    // Category chips = the folded expense categories present this month (so the
    // picker mirrors what Reports shows, "Others" included).
    const catAmount: Record<string, number> = {};
    for (const t of txns) if (t.kind === 'expense') {
      catAmount[t.category] = (catAmount[t.category] ?? 0) + txnAmount(t);
    }
    const catOptions = Object.entries(foldUncategorized(catAmount, known))
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

    return {
      myId: me?.id ?? '',
      personalId: grps.find(g => g.is_personal === 1)?.id ?? null,
      groups: grps,
      groupNames: Object.fromEntries(grps.map(g => [g.id, g.name])) as Record<string, string>,
      known,
      txns,
      catOptions,
    };
  }, [monthKey]);

  const myId = data?.myId ?? '';
  const personalId = data?.personalId ?? null;
  const groups = data?.groups ?? [];
  const groupNames = data?.groupNames ?? {};
  const known = data?.known ?? new Set<string>();
  const txns = data?.txns ?? [];
  const catOptions = data?.catOptions ?? [];

  // A folded-name filter ("Others") matches any category not in the catalog.
  const matchesCat = (t: TxnWithSplits, cat: string): boolean => {
    if (cat === 'all') return true;
    if (cat === OTHERS_LABEL && !known.has(OTHERS_LABEL)) return !known.has(t.category);
    return t.category === cat;
  };

  const { rows, total } = useMemo(() => {
    const filtered = txns.filter(t => {
      if (t.kind !== 'expense' && t.kind !== 'income') return false;
      if (filters.type !== 'all' && t.kind !== filters.type) return false;
      if (filters.group !== 'all' && t.group_id !== filters.group) return false;
      if (!matchesCat(t, filters.cat)) return false;
      return true;
    });
    filtered.sort((a, b) => filters.sort === 'amount' ? txnAmount(b) - txnAmount(a) : b.date - a.date);
    const tot = filtered.reduce((s, t) => s + txnAmount(t), 0);
    return { rows: filtered, total: tot };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txns, filters, known]);

  const groupChips: ChipGroup | null = groups.length > 1 ? {
    key: 'group',
    options: [
      { label: 'All', value: 'all' },
      ...groups.map(g => ({ label: g.is_personal === 1 ? 'Personal' : g.name, value: g.id })),
    ],
  } : null;

  const filterGroups: ChipGroup[] = [
    ...(catOptions.length > 1 ? [{ key: 'cat', options: [{ label: 'All', value: 'all' }, ...catOptions.map(c => ({ label: c, value: c }))] }] : []),
    { key: 'type', options: [{ label: 'All', value: 'all' }, { label: 'Expenses', value: 'expense' }, { label: 'Income', value: 'income' }] },
    ...(groupChips ? [groupChips] : []),
    { key: 'sort', options: [{ label: 'Newest', value: 'date' }, { label: 'Largest', value: 'amount' }] },
  ];

  const headerTitle = filters.cat !== 'all' ? filters.cat : 'Transactions';

  return (
    <View style={styles.container}>
      <ScreenHeader title={headerTitle} onBack={() => router.back()} />
      {loadError ? (
        <ErrorState onRetry={reload} />
      ) : (
      <FlatList
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        data={rows}
        keyExtractor={(t) => t.id}
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + space.lg }]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.head}>
            <Text style={styles.eyebrow}>
              {format(monthDate, 'MMMM yyyy')} · {rows.length} {rows.length === 1 ? 'transaction' : 'transactions'}
              {total > 0 ? ` · ${formatCompact(total)}` : ''}
            </Text>
            <View style={styles.filters}>
              <FilterBar groups={filterGroups} selected={filters} onSelect={(k, v) => setFilters(f => ({ ...f, [k]: v }))} />
            </View>
          </View>
        }
        renderItem={({ item, index }) => {
          const isFirst = index === 0;
          const isLast = index === rows.length - 1;
          const isPersonalTxn = item.group_id === personalId;
          return (
            <View style={[styles.cell, isFirst && styles.cellFirst, isLast && styles.cellLast]}>
              <View style={styles.cellInner}>
                <TransactionRow
                  txn={item}
                  myId={myId}
                  showDate
                  groupName={isPersonalTxn ? 'Personal' : groupNames[item.group_id]}
                  onPress={() => router.push(`/txn/${item.id}`)}
                />
              </View>
              {!isLast && <View style={styles.rowDivider} />}
            </View>
          );
        }}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon="inbox"
              title="No transactions"
              body="No transactions match these filters this month."
              tint={colors.textSecondary}
            />
          )
        }
      />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: layout.screenPaddingH, paddingBottom: space.lg },
  head: { paddingTop: space.xs },
  eyebrow: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: space.sm },
  filters: { marginBottom: space.md },
  // A single card for the month's rows: side borders always; first row rounds the
  // top, last rounds the bottom; hairline dividers (indented past the icon) between.
  cell: { backgroundColor: colors.bgCard, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
  cellFirst: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  cellLast: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  cellInner: { paddingHorizontal: space.md },
  rowDivider: { height: 1, backgroundColor: colors.border, marginLeft: 64, marginRight: space.md },
});
