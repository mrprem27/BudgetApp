import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { getTransactionsInRange, type TxnWithSplits } from '../../src/db/queries/transactions';
import { getCategoryBudgets, type CategoryBudget } from '../../src/db/queries/categoryBudgets';
import { getMe } from '../../src/db/queries/persons';
import { getAllGroups } from '../../src/db/queries/groups';
import { categoryVisual } from '../../src/constants/categories';
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

const sumShares = (arr: TxnWithSplits[]) =>
  arr.reduce((s, t) => s + t.shares.reduce((x, sh) => x + sh.amount, 0), 0);

export default function CategoryDetailScreen() {
  const { name, period: periodParam } = useLocalSearchParams<{ name?: string; period?: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const categoryName = name ? decodeURIComponent(name) : '';

  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState('');
  // Pre-select whatever was active on the Dashboard when a category bar was tapped.
  const [period, setPeriod] = useState<Period>(() => paramToPeriod(periodParam));
  const [groupNames, setGroupNames] = useState<Record<string, string>>({});
  // All of this year's expenses (every category) — period subsets are derived client-side
  // so switching tabs is instant and needs no re-query.
  const [yearExpenses, setYearExpenses] = useState<TxnWithSplits[]>([]);
  const [catBudgets, setCatBudgets] = useState<CategoryBudget[]>([]);
  const [personalGroupId, setPersonalGroupId] = useState<string | null>(null);

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

  useEffect(() => {
    (async () => {
      if (!categoryName) { setLoading(false); return; }
      const me = await getMe(db);
      if (me) setMyId(me.id);

      const groups = await getAllGroups(db);
      const personal = groups.find(g => g.is_personal === 1)?.id ?? groups[0]?.id ?? null;
      setPersonalGroupId(personal);
      setGroupNames(Object.fromEntries(groups.map(g => [g.id, g.name])));
      const [yearTxns, ...budgetArrays] = await Promise.all([
        getTransactionsInRange(db, null, ranges.year[0], ranges.year[1]),
        ...groups.map(g => getCategoryBudgets(db, g.id)),
      ]);
      const budgets = budgetArrays.flat();

      setYearExpenses(yearTxns.filter(t => t.kind === 'expense' && !t.is_deleted));
      setCatBudgets(budgets.filter(b => b.category === categoryName));
      setLoading(false);
    })();
  }, [db, categoryName, ranges]);

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
  const view = useMemo(() => {
    const now = new Date();
    const [ps, pe] = ranges[period];
    const inPeriod = yearExpenses.filter(t => t.date >= ps && t.date <= pe);
    const cat = inPeriod.filter(t => t.category === categoryName).sort((a, b) => b.date - a.date);
    const spent = sumShares(cat);
    const totalAll = sumShares(inPeriod);
    const daysInPeriod = period === 'day' ? 1 : period === 'month' ? getDaysInMonth(now) : getDaysInYear(now);
    const budget = Math.round(dailyRate * daysInPeriod);
    return { txns: cat, spent, totalAll, count: cat.length, budget };
  }, [ranges, period, yearExpenses, categoryName, dailyRate]);

  const showBudgetCard = view.budget > 0;
  // No recurring budget set at all → prompt to set one (applies to every period).
  const showSetBudget = dailyRate === 0;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + space.xs }]}
        showsVerticalScrollIndicator={false}
      >
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

            {/* Transactions */}
            {view.txns.length > 0 ? (
              <View>
                <Text style={styles.txnLabel}>Transactions</Text>
                {view.txns.map((txn, i) => (
                  <React.Fragment key={txn.id}>
                    <TransactionRow
                      txn={txn}
                      myId={myId}
                      onPress={() => router.push(`/txn/${txn.id}` as any)}
                      groupName={txn.group_id && txn.group_id !== personalGroupId ? groupNames[txn.group_id] : undefined}
                    />
                    {i < view.txns.length - 1 && <View style={styles.txnDivider} />}
                  </React.Fragment>
                ))}
              </View>
            ) : (
              <EmptyState icon="inbox" title="No transactions" body={`No expenses in this category ${PERIOD_NOUN[period]}.`} />
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
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
});
