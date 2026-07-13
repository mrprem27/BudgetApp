import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScreenData } from '../../src/hooks/useScreenData';
import { Feather } from '@expo/vector-icons';
import {
  startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear,
  getDaysInMonth, getDaysInYear,
} from 'date-fns';
import { colors } from '../../src/constants/colors';
import { type } from '../../src/constants/typography';
import { space, radius, layout, shadow } from '../../src/constants/layout';
import { BudgetBar } from '../../src/components/finance/BudgetBar';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { TransactionRow } from '../../src/components/finance/TransactionRow';
import { getTransactionsInRange, getActiveRecurringRules, type TxnWithSplits } from '../../src/db/queries/transactions';
import { getCategoryBudgets, type CategoryBudget } from '../../src/db/queries/categoryBudgets';
import { getMe } from '../../src/db/queries/persons';
import { getAllGroups } from '../../src/db/queries/groups';
import { getGoals, type SavingsGoal } from '../../src/db/queries/savings';
import { categoryVisual } from '../../src/constants/categories';
import { recurringMonthlyEquivalent } from '../../src/lib/recurrence';
import { formatRupees, formatCompact } from '../../src/lib/money';

type Period = 'day' | 'month' | 'year';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'day', label: 'Today' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
];
const PERIOD_NOUN: Record<Period, string> = { day: 'today', month: 'this month', year: 'this year' };
// Dashboard uses 'today' for the day tab — accept it (and a couple of aliases) from the deep link.
function paramToPeriod(p?: string): Period {
  if (p === 'today' || p === 'day') return 'day';
  if (p === 'year') return 'year';
  return 'month';
}

// My share of each expense (personal entries: full; group entries: my split).
const myShareOf = (t: TxnWithSplits, myId: string) => t.shares.find(sh => sh.personId === myId)?.amount ?? 0;
const sumMyShare = (arr: TxnWithSplits[], myId: string) =>
  arr.reduce((s, t) => s + myShareOf(t, myId), 0);

export default function CategoryDetailScreen() {
  const { name, period: periodParam } = useLocalSearchParams<{ name?: string; period?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const categoryName = name ? decodeURIComponent(name) : '';

  // Pre-select whatever was active on the Dashboard when a category bar was tapped.
  const [period, setPeriod] = useState<Period>(() => paramToPeriod(periodParam));

  const visual = categoryVisual(categoryName);

  // Period boundaries (week starts Monday — common in India).
  const ranges = useMemo(() => {
    const now = new Date();
    return {
      day: [startOfDay(now).getTime(), endOfDay(now).getTime()] as const,
      month: [startOfMonth(now).getTime(), endOfMonth(now).getTime()] as const,
      year: [startOfYear(now).getTime(), endOfYear(now).getTime()] as const,
    };
  }, []);

  // Refetch on focus (via useScreenData) so returning after adding/editing a txn shows fresh data.
  // All of this year's expenses (every category) are fetched — period subsets are derived
  // client-side so switching tabs is instant and needs no re-query.
  const { data, loading } = useScreenData(async (db): Promise<{
    myId: string;
    personalGroupId: string | null;
    groupNames: Record<string, string>;
    yearExpenses: TxnWithSplits[];
    catBudgets: CategoryBudget[];
    recurRules: TxnWithSplits[];
    goals: SavingsGoal[];
  }> => {
    if (!categoryName) {
      return { myId: '', personalGroupId: null, groupNames: {}, yearExpenses: [], catBudgets: [], recurRules: [], goals: [] };
    }
    const me = await getMe(db);
    const groups = await getAllGroups(db);
    const personal = groups.find(g => g.is_personal === 1)?.id ?? groups[0]?.id ?? null;
    const [yearTxns, rules, allGoals, ...budgetArrays] = await Promise.all([
      getTransactionsInRange(db, null, ranges.year[0], ranges.year[1]),
      getActiveRecurringRules(db),
      getGoals(db),
      ...groups.map(g => getCategoryBudgets(db, g.id)),
    ]);
    const budgets = budgetArrays.flat();
    return {
      myId: me?.id ?? '',
      personalGroupId: personal,
      groupNames: Object.fromEntries(groups.map(g => [g.id, g.name])),
      yearExpenses: yearTxns.filter(t => t.kind === 'expense' && !t.is_deleted),
      catBudgets: budgets.filter(b => b.category === categoryName),
      recurRules: rules.filter(r => r.category === categoryName),
      goals: allGoals.filter(g => g.category === categoryName),
    };
  }, [categoryName, ranges]);

  const myId = data?.myId ?? '';
  const personalGroupId = data?.personalGroupId ?? null;
  const groupNames = data?.groupNames ?? {};
  const yearExpenses = data?.yearExpenses ?? [];
  const catBudgets = data?.catBudgets ?? [];
  const recurRules = data?.recurRules ?? [];
  const goals = data?.goals ?? [];

  // The category's recurring budget, normalized to a per-day rate so it can be
  // prorated onto any period. Prefer monthly, then yearly, then daily; a
  // one-time ('once') budget isn't a periodic limit, so it's ignored here.
  const dailyRate = useMemo(() => {
    const now = new Date();
    const primary =
      catBudgets.find(b => b.cadence === 'monthly') ??
      catBudgets.find(b => b.cadence === 'yearly') ??
      catBudgets.find(b => b.cadence === 'daily');
    if (!primary) return 0;
    if (primary.cadence === 'daily') return primary.amount;
    if (primary.cadence === 'monthly') return primary.amount / getDaysInMonth(now);
    return primary.amount / getDaysInYear(now); // yearly
  }, [catBudgets]);

  // Derived view for the selected period — budget is always prorated to it.
  // All money figures are MY share (consistent with the rest of Personal).
  const view = useMemo(() => {
    const now = new Date();
    const [ps, pe] = ranges[period];
    const inPeriod = yearExpenses.filter(t => t.date >= ps && t.date <= pe);
    const cat = inPeriod.filter(t => t.category === categoryName).sort((a, b) => b.date - a.date);
    const spent = sumMyShare(cat, myId);
    const totalAll = sumMyShare(inPeriod, myId);
    const daysInPeriod = period === 'day' ? 1 : period === 'month' ? getDaysInMonth(now) : getDaysInYear(now);
    const budget = Math.round(dailyRate * daysInPeriod);

    // Where my spend in this category goes — personal vs each group.
    const byGroup = new Map<string, number>();
    for (const t of cat) {
      const amt = myShareOf(t, myId);
      if (amt > 0) byGroup.set(t.group_id, (byGroup.get(t.group_id) ?? 0) + amt);
    }
    const perGroup = Array.from(byGroup.entries())
      .map(([gid, amt]) => ({ gid, name: gid === personalGroupId ? 'Personal' : (groupNames[gid] ?? 'Group'), amt }))
      .sort((a, b) => b.amt - a.amt);

    // Top places for this category (location-tagged entries).
    const byPlace = new Map<string, { amt: number; count: number }>();
    for (const t of cat) {
      const label = t.place_label?.trim();
      if (!label) continue;
      const cur = byPlace.get(label) ?? { amt: 0, count: 0 };
      byPlace.set(label, { amt: cur.amt + myShareOf(t, myId), count: cur.count + 1 });
    }
    const places = Array.from(byPlace.entries())
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.amt - a.amt)
      .slice(0, 5);

    return { txns: cat, spent, totalAll, count: cat.length, budget, perGroup, places };
  }, [ranges, period, yearExpenses, categoryName, dailyRate, myId, personalGroupId, groupNames]);

  const showBudgetCard = view.budget > 0;
  // No recurring budget set at all → prompt to set one (applies to every period).
  const showSetBudget = dailyRate === 0;

  const renderTxn = useCallback(({ item: txn }: { item: typeof view.txns[number] }) => (
    <TransactionRow
      txn={txn}
      myId={myId}
      onPress={() => router.push(`/txn/${txn.id}` as any)}
      groupName={txn.group_id && txn.group_id !== personalGroupId ? groupNames[txn.group_id] : undefined}
    />
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [myId, personalGroupId, groupNames]);

  // Everything above the transaction list — rendered as the FlatList header so the
  // list itself can virtualize (a heavy category over "year" can have hundreds of rows).
  const listHeader = (
    <>
      {/* Minimal back-link */}
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.back} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="chevron-left" size={18} color={colors.accent} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        {/* Header: icon tile + name + count */}
        <View style={styles.header}>
          <View style={[styles.headerIcon, { backgroundColor: visual.color + '22' }]}>
            <Feather name={visual.icon} size={26} color={visual.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{categoryName}</Text>
            <Text style={styles.headerSub}>
              {view.count} {view.count === 1 ? 'transaction' : 'transactions'} {PERIOD_NOUN[period]}
            </Text>
          </View>
        </View>

        {/* Period selector — Today / Month / Year, mirroring the Dashboard */}
        <View style={styles.periodRow}>
          <View style={styles.segment}>
            {PERIODS.map(p => (
              <TouchableOpacity
                key={p.key}
                style={[styles.segmentBtn, period === p.key && styles.segmentBtnActive]}
                onPress={() => setPeriod(p.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: period === p.key }}
              >
                <Text style={[styles.segmentText, period === p.key && styles.segmentTextActive]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {loading ? (
          <>
            <SkeletonCard height={120} />
            <SkeletonCard height={180} />
          </>
        ) : (
          <>
            {/* Summary: Budget card if a budget exists, else amount (+ set-budget prompt on Month) */}
            {showBudgetCard ? (
              <View style={styles.card}>
                <View style={styles.budgetTop}>
                  <Text style={styles.cardLabel}>BUDGET</Text>
                  <Text style={[styles.budgetPct, { color: view.spent > view.budget ? colors.expense : colors.healthAmber }]}>
                    {Math.round((view.spent / view.budget) * 100)}% used
                  </Text>
                </View>
                <BudgetBar allocated={view.budget} spent={view.spent} />
                <View style={styles.budgetFooter}>
                  <View>
                    <Text style={styles.budgetAmt}>{formatRupees(view.spent)}</Text>
                    <Text style={styles.budgetCaption}>spent</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.budgetAmt, { color: colors.textSecondary }]}>{formatRupees(view.budget)}</Text>
                    <Text style={styles.budgetCaption}>budget</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>SPENT {PERIOD_NOUN[period].toUpperCase()}</Text>
                <Text style={styles.amount}>{formatRupees(view.spent)}</Text>
                <Text style={styles.amountSub}>
                  {view.totalAll > 0 ? `${Math.round((view.spent / view.totalAll) * 100)}% of all spending` : 'No spending yet'}
                  {view.count > 0 ? ` · avg ${formatCompact(Math.round(view.spent / view.count))}` : ''}
                </Text>
              </View>
            )}

            {/* Set-budget prompt — shown prominently when no monthly budget is set */}
            {showSetBudget && (
              <TouchableOpacity style={styles.setBudget} onPress={() => personalGroupId && router.push(`/group/${personalGroupId}/budget?category=${encodeURIComponent(categoryName)}` as any)} accessibilityRole="button">
                <View style={styles.setBudgetIcon}>
                  <Feather name="target" size={18} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.setBudgetTitle}>Set a budget for {categoryName}</Text>
                  <Text style={styles.setBudgetSub}>Track spending against a limit you set</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}

            {/* Where it goes — my spend split across personal + groups */}
            {view.perGroup.length > 1 && (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>WHERE IT GOES</Text>
                {view.perGroup.map(g => {
                  const pct = view.spent > 0 ? Math.round((g.amt / view.spent) * 100) : 0;
                  return (
                    <View key={g.gid} style={styles.insRow}>
                      <Text style={[styles.insName, { flex: 1 }]} numberOfLines={1}>{g.name}</Text>
                      <Text style={styles.insMeta}>{pct}%</Text>
                      <Text style={styles.insAmt}>{formatCompact(g.amt)}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Top places */}
            {view.places.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>TOP PLACES</Text>
                {view.places.map(p => (
                  <View key={p.label} style={styles.insRow}>
                    <Feather name="map-pin" size={13} color={colors.textMuted} />
                    <Text style={[styles.insName, { flex: 1 }]} numberOfLines={1}>{p.label}</Text>
                    <Text style={styles.insMeta}>{p.count}×</Text>
                    <Text style={styles.insAmt}>{formatCompact(p.amt)}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Recurring in this category */}
            {recurRules.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>RECURRING</Text>
                {recurRules.map(r => {
                  const mine = myShareOf(r, myId) || r.shares.reduce((s, x) => s + x.amount, 0);
                  const name = (r.note && r.note.trim()) || r.category;
                  return (
                    <TouchableOpacity key={r.id} style={styles.insRow} onPress={() => router.push(`/group/${r.group_id}/recurring?focus=${r.id}` as any)} accessibilityRole="button">
                      <Feather name="repeat" size={13} color={colors.settle} />
                      <Text style={[styles.insName, { flex: 1 }]} numberOfLines={1}>{name}</Text>
                      <Text style={styles.insMeta}>{r.recur_freq}</Text>
                      <Text style={styles.insAmt}>{formatCompact(mine)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Savings goals tagged to this category */}
            {goals.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>GOALS</Text>
                {goals.map(g => (
                  <TouchableOpacity key={g.id} style={styles.insRow} onPress={() => router.push(`/savings/${g.id}` as any)} accessibilityRole="button">
                    <Feather name="target" size={13} color={g.color ?? colors.accent} />
                    <Text style={[styles.insName, { flex: 1 }]} numberOfLines={1}>{g.name}</Text>
                    <Text style={styles.insAmt}>{formatCompact(g.target)}</Text>
                    <Feather name="chevron-right" size={14} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Transactions header — the rows themselves are the FlatList data below */}
            {view.txns.length > 0 && <Text style={styles.txnLabel}>Transactions</Text>}
          </>
        )}
    </>
  );

  return (
    <View style={styles.container}>
      <FlatList
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + space.xs }]}
        showsVerticalScrollIndicator={false}
        data={loading ? [] : view.txns}
        keyExtractor={(txn) => txn.id}
        renderItem={renderTxn}
        ItemSeparatorComponent={TxnDivider}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={11}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState icon="inbox" title="No transactions" body={`No expenses in this category ${PERIOD_NOUN[period]}.`} />
          )
        }
      />
    </View>
  );
}

function TxnDivider() {
  return <View style={styles.txnDivider} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: layout.screenPaddingH, gap: space.md, paddingBottom: space.xl },

  back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', paddingVertical: space.xs, marginLeft: -4 },
  backText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },

  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headerIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  headerTitle: { ...type.title, fontSize: 22, color: colors.textPrimary, letterSpacing: -0.4 },
  headerSub: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  cardLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Inter_600SemiBold' },

  budgetTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space.sm },
  budgetPct: { ...type.caption, fontFamily: 'Inter_600SemiBold' },
  budgetFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm },
  budgetAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 20, letterSpacing: -0.5, color: colors.textPrimary },
  budgetCaption: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  amount: { fontFamily: 'SpaceMono_400Regular', fontSize: 30, letterSpacing: -0.6, color: colors.textPrimary, marginTop: space.xs },
  amountSub: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  setBudget: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.accentMuted, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: colors.accent + '44' },
  setBudgetIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.accent + '22', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  setBudgetTitle: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  setBudgetSub: { ...type.caption, color: colors.textSecondary, marginTop: 2 },

  periodRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  segment: { flex: 1, flexDirection: 'row', backgroundColor: colors.bgMuted, borderRadius: radius.md, padding: 3 },
  segmentBtn: { flex: 1, paddingVertical: 7, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  segmentBtnActive: { backgroundColor: colors.accent },
  segmentText: { ...type.label, color: colors.textSecondary },
  segmentTextActive: { color: colors.bg, fontFamily: 'Inter_600SemiBold' },

  txnLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: space.xs },
  txnDivider: { height: 1, backgroundColor: colors.border, marginLeft: 56 },

  sectionLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Inter_600SemiBold', marginBottom: space.xs },
  insRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 7 },
  insName: { ...type.body, color: colors.textPrimary },
  insMeta: { ...type.caption, color: colors.textMuted, textTransform: 'capitalize' },
  insAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 13, color: colors.textSecondary, minWidth: 52, textAlign: 'right' },
});
