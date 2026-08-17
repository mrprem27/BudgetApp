import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { startOfMonth, endOfMonth, addMonths, subMonths, format } from 'date-fns';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, layout } from '../src/constants/layout';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ErrorState } from '../src/components/ui/ErrorState';
import { Card } from '../src/components/ui/Card';
import { Chip } from '../src/components/ui/Chip';
import { TabPills } from '../src/components/ui/TabPills';
import { AmountText } from '../src/components/ui/AmountText';
import { TransactionRow } from '../src/components/finance/TransactionRow';
import { TxnCell } from '../src/components/finance/TxnCell';
import { useScreenData } from '../src/hooks/useScreenData';
import { useContentInset } from '../src/hooks/useContentInset';
import { getAllGroups } from '../src/db/queries/groups';
import { getCategories } from '../src/db/queries/categories';
import { getMe } from '../src/db/queries/persons';
import { getTransactionsInRange, type TxnWithSplits } from '../src/db/queries/transactions';
import { OTHERS_LABEL } from '../src/lib/categoryFold';
import { txnTotal } from '../src/lib/splitMath';
import { haptic } from '../src/lib/haptics';
import { AppRefreshControl } from '../src/components/ui/AppRefreshControl';

type SortKey = 'date' | 'amount';

/**
 * All three kinds, because this is a **ledger** — a record of what happened — not an
 * analysis. Transfers were silently excluded: the filter dropped every settlement while
 * the tab said "All", so a settlement you made was invisible here and this screen's total
 * quietly disagreed with Reports.
 *
 * (Reports' *breakdowns* still exclude transfers, and should: settling a debt isn't
 * consumption — the original purchase was already expensed, so counting both double-counts.
 * Analysis is two-sided; the ledger is three-sided.)
 */
const TYPE_TABS = [
  { key: 'all', label: 'All' },
  { key: 'expense', label: 'Expenses' },
  { key: 'income', label: 'Income' },
  { key: 'settlement', label: 'Transfers' },
];

// Full transaction magnitude via the canonical txnTotal, used for the
// "Largest" sort and the header totals — matches Reports and Search.
const txnAmount = txnTotal;

function parseMonth(m?: string): Date {
  const parts = (m ?? '').split('-');
  if (parts.length === 2) {
    const y = Number(parts[0]); const mo = Number(parts[1]);
    if (Number.isFinite(y) && Number.isFinite(mo)) return new Date(y, mo - 1, 1);
  }
  return new Date();
}

/**
 * Month-scoped transaction list — the drill-down opened from a Reports pie segment.
 *
 * Rebuilt around three things it was missing:
 *
 * 1. **The total is the hero.** It used to be the tail of one 11px muted caption line
 *    ("MARCH 2026 · 14 transactions · ₹12.4k"), i.e. the most important number on the
 *    screen was also the smallest text on it (AGENTS §1).
 * 2. **The month is navigable.** Reports has ‹ › arrows; this screen inherited a month
 *    and couldn't move, so changing month meant going back and drilling in again.
 * 3. **It respects where you came from.** Arriving from a pie segment the category is
 *    already applied, yet the old screen rendered the whole category list as chips — so
 *    its first offer was to undo the tap that opened it — *and* repeated the category as
 *    the screen title. It's now one removable chip. Sort moved to the header, because
 *    sorting isn't filtering and putting it in the filter bar made neither legible.
 *
 * That takes the chrome above the list from up to four chip rows down to at most two.
 */
export default function ReportTransactionsScreen() {
  const router = useRouter();
  const { month: monthParam, category } = useLocalSearchParams<{ month?: string; category?: string }>();

  // Local, so the ‹ › arrows work; seeded from the deep link.
  const [month, setMonth] = useState<Date>(() => parseMonth(monthParam));
  const monthKey = format(month, 'yyyy-MM');
  const isCurrentMonth = monthKey === format(new Date(), 'yyyy-MM');

  const [cat, setCat] = useState<string>(category ?? 'all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [group, setGroup] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('date');
  const listPad = useContentInset();

  const { data, loading, error: loadError, refreshing, onRefresh, reload } = useScreenData(async (db) => {
    const grps = await getAllGroups(db);
    const me = await getMe(db);
    const from = startOfMonth(month).getTime();
    const to = endOfMonth(month).getTime();
    const [txns, knownCats] = await Promise.all([
      getTransactionsInRange(db, null, from, to),
      getCategories(db, 'expense'),
    ]);
    // Only needed to resolve the folded "Others" filter — the category *list* is gone,
    // because the pie chart you arrived from is the category picker. Offering every
    // alternative here was what made the screen's first action "undo your last tap".
    const known = new Set(knownCats.map(c => c.name));

    return {
      myId: me?.id ?? '',
      personalId: grps.find(g => g.is_personal === 1)?.id ?? null,
      groupNames: Object.fromEntries(grps.map(g => [g.id, g.name])) as Record<string, string>,
      known,
      txns,
    };
  }, [monthKey]);

  const myId = data?.myId ?? '';
  const personalId = data?.personalId ?? null;
  const groupNames = data?.groupNames ?? {};
  const known = data?.known ?? new Set<string>();
  const txns = data?.txns ?? [];

  // A folded-name filter ("Others") matches any category not in the catalog.
  const matchesCat = (t: TxnWithSplits, c: string): boolean => {
    if (c === 'all') return true;
    if (c === OTHERS_LABEL && !known.has(OTHERS_LABEL)) return !known.has(t.category);
    return t.category === c;
  };

  const { rows, byKind } = useMemo(() => {
    const filtered = txns.filter(t => {
      if (typeFilter !== 'all' && t.kind !== typeFilter) return false;
      if (group !== 'all' && t.group_id !== group) return false;
      if (!matchesCat(t, cat)) return false;
      return true;
    });
    filtered.sort((a, b) => sort === 'amount' ? txnAmount(b) - txnAmount(a) : b.date - a.date);
    // Summed PER KIND. A single total across income + expense + transfers answers no
    // question anyone has: money in and money out don't belong in one figure, and a
    // settlement is neither. This is the crux of "should the three kinds be treated
    // differently" — in a total, yes, always.
    const by = { expense: 0, income: 0, settlement: 0 } as Record<string, number>;
    for (const t of filtered) by[t.kind] = (by[t.kind] ?? 0) + txnAmount(t);
    return { rows: filtered, byKind: by };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txns, cat, typeFilter, group, sort, known]);

  const groupName = group === 'all' ? null : (group === personalId ? 'Personal' : groupNames[group]);
  const hasActiveChips = cat !== 'all' || group !== 'all';

  const shiftMonth = (delta: number) => {
    haptic.selection();
    setMonth(m => (delta > 0 ? addMonths(m, 1) : subMonths(m, 1)));
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={cat !== 'all' ? cat : 'Transactions'}
        onBack={() => router.back()}
        right={
          <TouchableOpacity
            onPress={() => { haptic.selection(); setSort(s => (s === 'date' ? 'amount' : 'date')); }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={sort === 'date' ? 'Sorted by newest. Switch to largest' : 'Sorted by largest. Switch to newest'}
          >
            <View style={styles.sortBtn}>
              <Feather name={sort === 'date' ? 'clock' : 'bar-chart-2'} size={14} color={colors.accent} />
              <Text style={styles.sortText}>{sort === 'date' ? 'Newest' : 'Largest'}</Text>
            </View>
          </TouchableOpacity>
        }
      />
      {loadError ? (
        <ErrorState onRetry={reload} />
      ) : (
      <FlatList
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        data={rows}
        keyExtractor={(t) => t.id}
        style={styles.fill}
        contentContainerStyle={[styles.scroll, { paddingBottom: listPad }]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.head}>
            <Card padded>
              <View style={styles.monthNav}>
                <TouchableOpacity onPress={() => shiftMonth(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous month">
                  <Feather name="chevron-left" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
                <Text style={styles.monthLabel}>{format(month, 'MMMM yyyy')}</Text>
                <TouchableOpacity
                  onPress={() => !isCurrentMonth && shiftMonth(1)}
                  disabled={isCurrentMonth}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Next month"
                  accessibilityState={{ disabled: isCurrentMonth }}
                >
                  <Feather name="chevron-right" size={20} color={isCurrentMonth ? colors.border : colors.textSecondary} />
                </TouchableOpacity>
              </View>
              {/* The hero. With one kind selected it's that kind's total; with "All" it
                  is two-sided, because money in and money out are not one number. */}
              {typeFilter === 'all' ? (
                <View style={styles.twoSided}>
                  <View>
                    <Text style={styles.sideLabel}>Out</Text>
                    <AmountText paise={byKind.expense} size="lg" forceColor={colors.expense} />
                  </View>
                  <View>
                    <Text style={styles.sideLabel}>In</Text>
                    <AmountText paise={byKind.income} size="lg" forceColor={colors.income} />
                  </View>
                  {byKind.settlement > 0 && (
                    <View>
                      <Text style={styles.sideLabel}>Moved</Text>
                      <AmountText paise={byKind.settlement} size="lg" forceColor={colors.settle} />
                    </View>
                  )}
                </View>
              ) : (
                <AmountText
                  paise={byKind[typeFilter] ?? 0}
                  size="xl"
                  forceColor={typeFilter === 'income' ? colors.income : typeFilter === 'settlement' ? colors.settle : colors.textPrimary}
                />
              )}
              <Text style={styles.countLine}>
                {rows.length} {rows.length === 1 ? 'transaction' : 'transactions'}
                {typeFilter === 'settlement' ? ' · settled between people, not spending' : ''}
              </Text>
            </Card>

            {/* Whatever you arrived with, as removable chips — not a list of every
                alternative, which would offer to undo the tap that opened this. */}
            {hasActiveChips && (
              <View style={styles.chipRow}>
                {cat !== 'all' && (
                  <Chip label={cat} icon="tag" selected onRemove={() => setCat('all')} maxWidth={180} />
                )}
                {groupName && (
                  <Chip label={groupName} icon="users" selected onRemove={() => setGroup('all')} maxWidth={160} />
                )}
              </View>
            )}

            <View style={styles.typeRow}>
              <TabPills tabs={TYPE_TABS} active={typeFilter} onChange={setTypeFilter} />
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <TxnCell first={index === 0} last={index === rows.length - 1}>
            <TransactionRow
              txn={item}
              myId={myId}
              showDate
              groupName={item.group_id === personalId ? 'Personal' : groupNames[item.group_id]}
              onPress={() => router.push(`/txn/${item.id}`)}
            />
          </TxnCell>
        )}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon="inbox"
              title="No transactions"
              body={hasActiveChips || typeFilter !== 'all'
                ? 'Nothing matches these filters this month. Clear one, or try another month.'
                : `Nothing recorded in ${format(month, 'MMMM')}.`}
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
  fill: { flex: 1 },
  scroll: { paddingHorizontal: layout.screenPaddingH },
  head: { paddingTop: space.sm },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  monthLabel: { ...type.bodySemi, color: colors.textPrimary },
  countLine: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  twoSided: { flexDirection: 'row', gap: space.lg, flexWrap: 'wrap' },
  sideLabel: { ...type.caption, color: colors.textMuted, marginBottom: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  typeRow: { marginTop: space.md, marginBottom: space.md },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  sortText: { ...type.labelSemi, color: colors.accent },
});
