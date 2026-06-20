import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { colors } from '../../src/constants/colors';
import { type } from '../../src/constants/typography';
import { space, radius, layout, shadow } from '../../src/constants/layout';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { BudgetBar } from '../../src/components/finance/BudgetBar';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { TransactionRow } from '../../src/components/finance/TransactionRow';
import { getTransactionsInRange, type TxnWithSplits } from '../../src/db/queries/transactions';
import { getCategoryBudgets } from '../../src/db/queries/categoryBudgets';
import { getMe } from '../../src/db/queries/persons';
import { getAllGroups } from '../../src/db/queries/groups';
import { categoryVisual } from '../../src/constants/categories';
import { formatRupees, formatCompact } from '../../src/lib/money';

export default function CategoryDetailScreen() {
  const { name } = useLocalSearchParams<{ name?: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const categoryName = name ? decodeURIComponent(name) : '';

  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState('');
  const [monthSpent, setMonthSpent] = useState(0);
  const [monthTotalAll, setMonthTotalAll] = useState(0);
  const [yearSpent, setYearSpent] = useState(0);
  const [monthBudget, setMonthBudget] = useState(0);
  const [txns, setTxns] = useState<TxnWithSplits[]>([]);
  const [txnCount, setTxnCount] = useState(0);

  const visual = categoryVisual(categoryName);
  const now = new Date();
  const monthStart = startOfMonth(now).getTime();
  const monthEnd = endOfMonth(now).getTime();
  const yearStart = startOfYear(now).getTime();
  const yearEnd = endOfYear(now).getTime();

  useEffect(() => {
    (async () => {
      if (!categoryName) return;

      const me = await getMe(db);
      if (me) setMyId(me.id);

      const groups = await getAllGroups(db);
      const [monthTxns, yearTxns, ...budgetArrays] = await Promise.all([
        getTransactionsInRange(db, null, monthStart, monthEnd),
        getTransactionsInRange(db, null, yearStart, yearEnd),
        ...groups.map(g => getCategoryBudgets(db, g.id)),
      ]);
      const budgets = budgetArrays.flat();

      const monthExpenses = monthTxns.filter(t => t.kind === 'expense' && !t.is_deleted);
      const monthCat = monthExpenses.filter(t => t.category === categoryName);
      const yearCat = yearTxns.filter(t => t.category === categoryName && t.kind === 'expense' && !t.is_deleted);
      const monthBudgetCat = budgets.find(b => b.category === categoryName && b.cadence === 'monthly');

      const sumShares = (arr: TxnWithSplits[]) =>
        arr.reduce((s, t) => s + t.shares.reduce((x, sh) => x + sh.amount, 0), 0);
      const monthTotal = sumShares(monthCat);
      const yearTotal = sumShares(yearCat);

      setMonthSpent(monthTotal);
      setMonthTotalAll(sumShares(monthExpenses));
      setYearSpent(yearTotal);
      setMonthBudget(monthBudgetCat?.amount ?? 0);
      setTxns(monthCat.sort((a, b) => b.date - a.date));
      setTxnCount(yearCat.length);
      setLoading(false);
    })();
  }, [db, categoryName, monthStart, monthEnd, yearStart, yearEnd]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title={categoryName} onBack={() => router.back()} />
        <ScrollView style={styles.scroll}>
          <SkeletonCard height={120} />
          <SkeletonCard height={180} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={categoryName} onBack={() => router.back()} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Hero — horizontal: icon + amount/stats column */}
        <View style={styles.heroCard}>
          <View style={styles.heroRow}>
            <View style={[styles.heroIcon, { backgroundColor: visual.color + '22' }]}>
              <Feather name={visual.icon} size={24} color={visual.color} />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.heroAmount}>{formatRupees(monthSpent)}</Text>
              <Text style={styles.heroSub}>
                {monthTotalAll > 0 ? `${Math.round((monthSpent / monthTotalAll) * 100)}% of spending` : 'This month'}
                {` · ${txns.length} ${txns.length === 1 ? 'txn' : 'txns'}`}
                {txnCount > 0 ? ` · avg ${formatCompact(Math.round(yearSpent / txnCount))}` : ''}
              </Text>
            </View>
          </View>

          {/* Budget bar inline in hero (if budget exists) */}
          {monthBudget > 0 && (
            <View style={styles.heroBudget}>
              <BudgetBar allocated={monthBudget} spent={monthSpent} />
              <View style={styles.budgetRow}>
                <Text style={styles.budgetSub}>
                  {`${Math.round((monthSpent / monthBudget) * 100)}% of ${formatCompact(monthBudget)} budget`}
                </Text>
                <Text style={[styles.budgetSub, { color: monthBudget - monthSpent >= 0 ? colors.income : colors.expense }]}>
                  {monthBudget - monthSpent >= 0 ? `${formatRupees(monthBudget - monthSpent)} left` : `Over by ${formatRupees(monthSpent - monthBudget)}`}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Transactions this month */}
        {txns.length > 0 ? (
          <View>
            <Text style={styles.txnLabel}>Transactions</Text>
            {txns.map((txn, i) => (
              <React.Fragment key={txn.id}>
                <TransactionRow txn={txn} myId={myId} />
                {i < txns.length - 1 && <View style={styles.txnDivider} />}
              </React.Fragment>
            ))}
          </View>
        ) : (
          <EmptyState icon="inbox" title="No transactions" body="No expenses recorded in this category this month." />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: { padding: layout.screenPaddingH, gap: space.md, paddingBottom: space.lg },
  heroCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: colors.border, gap: space.md, ...shadow.md },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  heroIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  heroText: { flex: 1, gap: 2 },
  heroAmount: { fontFamily: 'SpaceMono_400Regular', fontSize: 30, letterSpacing: -0.6, color: colors.textPrimary },
  heroSub: { ...type.caption, color: colors.textMuted },
  heroBudget: { gap: space.xs },
  budgetRow: { flexDirection: 'row', justifyContent: 'space-between' },
  budgetSub: { ...type.caption, color: colors.textMuted },
  txnLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: space.xs },
  txnDivider: { height: 1, backgroundColor: colors.border, marginLeft: 56 },
});
