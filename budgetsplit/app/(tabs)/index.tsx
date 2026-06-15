import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  startOfDay, endOfDay, startOfMonth, endOfMonth,
  startOfYear, endOfYear, format, eachDayOfInterval,
  eachWeekOfInterval, eachMonthOfInterval,
  subDays, subMonths, subYears,
} from 'date-fns';
import { PieChart, BarChart } from 'react-native-gifted-charts';
import { colors } from '../../src/constants/colors';
import { type } from '../../src/constants/typography';
import { space, layout, radius, shadow } from '../../src/constants/layout';
import { useStore } from '../../src/store';
import { getAllPersons } from '../../src/db/queries/persons';
import { getAllGroups } from '../../src/db/queries/groups';
import { getGlobalNet } from '../../src/db/queries/balances';
import { getTransactionsInRange } from '../../src/db/queries/transactions';
import { AmountText } from '../../src/components/AmountText';
import { BudgetBar } from '../../src/components/BudgetBar';
import { FAB } from '../../src/components/FAB';
import { FadeIn } from '../../src/components/FadeIn';
import { SkeletonCard } from '../../src/components/Skeleton';
import { PressableScale } from '../../src/components/PressableScale';
import { getBudgetUsage } from '../../src/lib/budget';
import { getBudgetAnalytics } from '../../src/lib/analytics';
import { simplify } from '../../src/lib/settle';
import { formatRupees } from '../../src/lib/money';

type TabKey = 'today' | 'month' | 'year';

function getRange(tab: TabKey): { from: number; to: number } {
  const now = new Date();
  switch (tab) {
    case 'today': return { from: startOfDay(now).getTime(), to: endOfDay(now).getTime() };
    case 'month': return { from: startOfMonth(now).getTime(), to: endOfMonth(now).getTime() };
    case 'year':  return { from: startOfYear(now).getTime(), to: endOfYear(now).getTime() };
  }
}

function getPrevRange(tab: TabKey): { from: number; to: number } {
  const now = new Date();
  switch (tab) {
    case 'today': { const d = subDays(now, 1);   return { from: startOfDay(d).getTime(), to: endOfDay(d).getTime() }; }
    case 'month': { const d = subMonths(now, 1); return { from: startOfMonth(d).getTime(), to: endOfMonth(d).getTime() }; }
    case 'year':  { const d = subYears(now, 1);  return { from: startOfYear(d).getTime(), to: endOfYear(d).getTime() }; }
  }
}

const PREV_LABEL: Record<TabKey, string> = { today: 'yesterday', month: 'last month', year: 'last year' };

const CHART_COLORS = [
  '#F0A500', '#3ECF8E', '#7C6AF7', '#F06060', '#60A5FA',
  '#FB923C', '#F472B6', '#34D399', '#A78BFA', '#8B8A99',
];

export default function DashboardScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setPersons, setGroups } = useStore();
  const [tab, setTab] = useState<TabKey>('month');
  const [spending, setSpending] = useState(0);
  const [prevSpending, setPrevSpending] = useState(0);
  const [income, setIncome] = useState(0);
  const [oweTotal, setOweTotal] = useState(0);
  const [owedTotal, setOwedTotal] = useState(0);
  const [groupHealth, setGroupHealth] = useState<Array<{ id: string; name: string; pct: number | null; health: 'green' | 'amber' | 'red' | 'none' }>>([]);
  const [pieData, setPieData] = useState<Array<{ value: number; color: string; text: string }>>([]);
  const [barData, setBarData] = useState<Array<{ value: number; label: string; frontColor: string }>>([]);
  const [budgetSummary, setBudgetSummary] = useState<{ allocated: number; spent: number; over: number; near: number }>({ allocated: 0, spent: 0, over: 0, near: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [meId, setMeId] = useState('');
  const groups = useStore(s => s.groups);

  async function load() {
    try {
      await loadInner();
    } finally {
      setLoading(false);
    }
  }

  async function loadInner() {
    const persons = await getAllPersons(db);
    setPersons(persons);
    const grps = await getAllGroups(db);
    setGroups(grps);

    const me = persons.find(p => p.is_me === 1);
    if (!me) return;
    setMeId(me.id);

    const { from, to } = getRange(tab);

    // Single source of truth: materialization-aware query feeds the headline
    // numbers, the pie, and the bar chart so they always agree (incl. recurring).
    const txns = await getTransactionsInRange(db, null, from, to);

    let sp = 0;
    let inc = 0;
    const catMap: Record<string, number> = {};
    for (const txn of txns) {
      if (txn.is_deleted) continue;
      if (txn.kind === 'expense') {
        const myShare = txn.shares.find(s => s.personId === me.id)?.amount ?? 0;
        sp += myShare;
        if (myShare > 0) catMap[txn.category] = (catMap[txn.category] ?? 0) + myShare;
      } else if (txn.kind === 'income') {
        inc += txn.payments.find(p => p.personId === me.id)?.amount ?? 0;
      }
    }
    setSpending(sp);
    setIncome(inc);

    // Previous-period spending (my share) for period-over-period comparison.
    const prev = getPrevRange(tab);
    const prevTxns = await getTransactionsInRange(db, null, prev.from, prev.to);
    let prevSp = 0;
    for (const t of prevTxns) {
      if (t.is_deleted || t.kind !== 'expense') continue;
      prevSp += t.shares.find(s => s.personId === me.id)?.amount ?? 0;
    }
    setPrevSpending(prevSp);

    const net = await getGlobalNet(db);
    const myNet = net[me.id] ?? 0;
    setOweTotal(myNet < 0 ? -myNet : 0);
    setOwedTotal(myNet > 0 ? myNet : 0);

    const health = await Promise.all(
      grps.map(async g => {
        const usage = await getBudgetUsage(db, g, 'monthly');
        return { id: g.id, name: g.name, pct: usage.pct, health: usage.health };
      }),
    );
    setGroupHealth(health);

    // Budget rollup across all groups for the dashboard tiles.
    const analyticsAll = await Promise.all(grps.map(g => getBudgetAnalytics(db, g)));
    let bAlloc = 0, bSpent = 0, over = 0, near = 0;
    for (const a of analyticsAll) { bAlloc += a.totalAllocated; bSpent += a.totalSpent; over += a.overBudget.length; near += a.nearLimit.length; }
    setBudgetSummary({ allocated: bAlloc, spent: bSpent, over, near });

    // Build pie chart data (spending by category)
    const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    setPieData(sorted.map(([cat, val], i) => ({
      value: val,
      color: CHART_COLORS[i % CHART_COLORS.length],
      text: cat,
    })));

    // Build bar chart data
    const bars = buildBarData(txns, me.id, tab, from, to);
    setBarData(bars);
    setLoading(false);
  }

  function buildBarData(
    txns: any[],
    myId: string,
    tab: TabKey,
    from: number,
    to: number,
  ): Array<{ value: number; label: string; frontColor: string }> {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (tab === 'today') {
      // 8 three-hour buckets (0–2, 3–5, … 21–23). Every txn lands in exactly
      // one bucket, so no spending is dropped.
      const buckets = Array.from({ length: 8 }, (_, b) => ({ label: `${b * 3}`, value: 0 }));
      for (const txn of txns) {
        if (txn.kind !== 'expense') continue;
        const h = new Date(txn.date).getHours();
        const share = txn.shares.find((s: any) => s.personId === myId)?.amount ?? 0;
        buckets[Math.floor(h / 3)].value += share;
      }
      return buckets.map(b => ({
        label: b.label,
        value: Math.round(b.value / 100),
        frontColor: colors.accent,
      }));
    }

    if (tab === 'month') {
      const weeks = eachWeekOfInterval({ start: fromDate, end: toDate });
      const buckets = weeks.map(w => ({ label: format(w, 'MMM d'), value: 0 }));
      for (const txn of txns) {
        if (txn.kind !== 'expense') continue;
        const share = txn.shares.find((s: any) => s.personId === myId)?.amount ?? 0;
        const txnDate = new Date(txn.date);
        const idx = weeks.findIndex((w, i) => {
          const next = weeks[i + 1];
          return txnDate >= w && (!next || txnDate < next);
        });
        if (idx >= 0) buckets[idx].value += share;
      }
      return buckets.map(b => ({ ...b, value: Math.round(b.value / 100), frontColor: colors.accent }));
    }

    // year: monthly
    const months = eachMonthOfInterval({ start: fromDate, end: toDate });
    const buckets = months.map(m => ({ label: format(m, 'MMM'), value: 0 }));
    for (const txn of txns) {
      if (txn.kind !== 'expense') continue;
      const share = txn.shares.find((s: any) => s.personId === myId)?.amount ?? 0;
      const m = new Date(txn.date).getMonth();
      if (buckets[m]) buckets[m].value += share;
    }
    return buckets.map(b => ({ ...b, value: Math.round(b.value / 100), frontColor: colors.accent }));
  }

  useFocusEffect(useCallback(() => { load(); }, [tab]));

  const net = income - spending;
  const savingsRate = income > 0 ? Math.round((net / income) * 100) : 0;

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'month', label: 'Month' },
    { key: 'year',  label: 'Year' },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + space.sm }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.appName}>BudgetSplit</Text>
        </View>

        <View style={styles.tabRow}>
          {TABS.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabPill, tab === t.key && styles.tabActive]}
              onPress={() => setTab(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t.key }}
            >
              <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={{ gap: space.md }}>
            <SkeletonCard height={148} />
            <SkeletonCard height={64} />
            <SkeletonCard height={210} />
            <SkeletonCard height={120} />
          </View>
        ) : (
        <FadeIn>
        {/* Spending card */}
        <View style={styles.spendingCard}>
          <Text style={styles.spendingLabel}>My spending</Text>
          <AmountText paise={spending} size="xl" forceColor={colors.textPrimary} />
          {(spending > 0 || prevSpending > 0) && (() => {
            const delta = spending - prevSpending;
            const pct = prevSpending > 0 ? Math.round((delta / prevSpending) * 100) : null;
            const up = delta > 0;
            const color = delta === 0 ? colors.textMuted : up ? colors.expense : colors.income;
            return (
              <View style={styles.deltaRow}>
                <Feather name={delta === 0 ? 'minus' : up ? 'arrow-up-right' : 'arrow-down-right'} size={13} color={color} />
                <Text style={[styles.deltaText, { color }]}>
                  {pct === null ? formatRupees(Math.abs(delta)) : `${Math.abs(pct)}%`} vs {PREV_LABEL[tab]}
                </Text>
              </View>
            );
          })()}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Income</Text>
              <AmountText paise={income} size="md" forceColor={colors.income} />
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Net</Text>
              <AmountText paise={net} size="md" />
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Savings</Text>
              <Text style={[styles.savingsRate, { color: savingsRate >= 0 ? colors.income : colors.expense }]}>
                {savingsRate}%
              </Text>
            </View>
          </View>
        </View>

        {/* Budget rollup tiles */}
        {budgetSummary.allocated > 0 && (
          <View style={styles.budgetCard}>
            <View style={styles.budgetTiles}>
              <View style={styles.budgetTile}>
                <Text style={styles.budgetTileLabel}>Budget</Text>
                <AmountText paise={budgetSummary.allocated} size="sm" forceColor={colors.textPrimary} />
              </View>
              <View style={styles.budgetTileDivider} />
              <View style={styles.budgetTile}>
                <Text style={styles.budgetTileLabel}>Spent</Text>
                <AmountText paise={budgetSummary.spent} size="sm" forceColor={colors.textPrimary} />
              </View>
              <View style={styles.budgetTileDivider} />
              <View style={styles.budgetTile}>
                <Text style={styles.budgetTileLabel}>Left</Text>
                <AmountText paise={Math.max(0, budgetSummary.allocated - budgetSummary.spent)} size="sm" forceColor={colors.income} />
              </View>
            </View>
            {(budgetSummary.over > 0 || budgetSummary.near > 0) && (
              <View style={styles.budgetFlags}>
                {budgetSummary.over > 0 && (
                  <View style={[styles.flagPill, { backgroundColor: '#3A1414' }]}>
                    <Feather name="alert-triangle" size={12} color={colors.expense} />
                    <Text style={[styles.flagText, { color: colors.expense }]}>{budgetSummary.over} over budget</Text>
                  </View>
                )}
                {budgetSummary.near > 0 && (
                  <View style={[styles.flagPill, { backgroundColor: colors.bgMuted }]}>
                    <Feather name="clock" size={12} color={colors.healthAmber} />
                    <Text style={[styles.flagText, { color: colors.healthAmber }]}>{budgetSummary.near} near limit</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Owe/Owed */}
        {(oweTotal > 0 || owedTotal > 0) && (
          <TouchableOpacity
            style={styles.balanceChip}
            onPress={() => router.push('/settle')}
            accessibilityRole="button"
            accessibilityLabel="Settle up"
          >
            <Text style={styles.balanceText}>
              {oweTotal > 0 ? `You owe ${formatRupees(oweTotal)}` : ''}
              {oweTotal > 0 && owedTotal > 0 ? ' · ' : ''}
              {owedTotal > 0 ? `Owed ${formatRupees(owedTotal)}` : ''}
            </Text>
            <Text style={styles.settleLink}>Settle Up</Text>
          </TouchableOpacity>
        )}

        {/* Donut chart */}
        {pieData.length > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Spending by category</Text>
            <View style={styles.pieRow}>
              <PieChart
                key={`pie-${tab}`}
                data={pieData}
                donut
                radius={70}
                innerRadius={44}
                centerLabelComponent={() => (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={styles.pieCenterNum}>{pieData.length}</Text>
                    <Text style={styles.pieCenterLabel}>{pieData.length === 1 ? 'category' : 'categories'}</Text>
                  </View>
                )}
              />
              <View style={styles.legend}>
                {(() => {
                  const totalPie = pieData.reduce((s, d) => s + d.value, 0) || 1;
                  return pieData.slice(0, 5).map((d, i) => (
                    <View key={i} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: d.color }]} />
                      <Text style={styles.legendText} numberOfLines={1}>{d.text}</Text>
                      <Text style={styles.legendPct}>{Math.round((d.value / totalPie) * 100)}%</Text>
                      <Text style={styles.legendAmt}>{formatRupees(d.value)}</Text>
                    </View>
                  ));
                })()}
              </View>
            </View>
          </View>
        )}

        {/* Bar chart */}
        {barData.length > 0 && barData.some(b => b.value > 0) && (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Spending over time</Text>
            <BarChart
              key={`bar-${tab}`}
              data={barData}
              barWidth={18}
              spacing={8}
              roundedTop
              hideRules
              xAxisThickness={0}
              yAxisThickness={0}
              yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
              yAxisLabelPrefix="₹"
              xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 9 }}
              noOfSections={3}
              barBorderRadius={3}
              isAnimated
              focusBarOnPress
              renderTooltip={(item: any) => (
                <View style={styles.barTooltip}>
                  <Text style={styles.barTooltipText}>₹{Number(item?.value ?? 0).toLocaleString('en-IN')}</Text>
                </View>
              )}
            />
          </View>
        )}

        {/* Group health */}
        {groupHealth.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Groups</Text>
            <View style={styles.groupList}>
              {groupHealth.map((g, gi) => (
                <PressableScale
                  key={g.id}
                  style={[styles.groupListItem, gi === groupHealth.length - 1 && { borderBottomWidth: 0 }]}
                  onPress={() => router.push(`/group/${g.id}`)}
                  accessibilityLabel={g.name}
                >
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={styles.groupName}>{g.name}</Text>
                    {g.pct !== null && (
                      <View style={styles.groupBudgetRow}>
                        <View style={{ flex: 1 }}>
                          <BudgetBar pct={g.pct} health={g.health} height={4} />
                        </View>
                        <Text style={styles.groupPct}>{g.pct}%</Text>
                      </View>
                    )}
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.textMuted} />
                </PressableScale>
              ))}
            </View>
          </View>
        )}

        {spending === 0 && income === 0 && (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Feather name="edit-3" size={26} color={colors.accent} />
            </View>
            <Text style={styles.emptyTitle}>Nothing logged yet</Text>
            <Text style={styles.emptyLabel}>Tap + to add your first expense or income</Text>
          </View>
        )}
        </FadeIn>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      <FAB
        actions={[
          { label: 'Expense', icon: 'minus-circle', tint: colors.expense, description: 'Record spending', onPress: () => router.push('/add/quick?kind=expense') },
          { label: 'Income',  icon: 'plus-circle',  tint: colors.income, description: 'Money you received', onPress: () => router.push('/add/quick?kind=income') },
          { label: 'Transfer', icon: 'repeat', tint: colors.settle, description: 'Move money between people', onPress: () => router.push('/add/transfer') },
          { label: 'Itemized Bill', icon: 'list', tint: colors.accent, description: 'Split a bill line by line', onPress: () => router.push('/add/itemized') },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.lg },
  appName: { ...type.title, color: colors.textPrimary },
  tabRow: { flexDirection: 'row', gap: space.xs, marginBottom: space.lg },
  tabPill: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: 999, backgroundColor: colors.bgMuted },
  tabActive: { backgroundColor: colors.accent },
  tabLabel: { ...type.label, color: colors.textSecondary },
  tabLabelActive: { color: colors.bg, fontFamily: 'Inter_600SemiBold' },
  spendingCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.lg, marginBottom: space.md, borderWidth: 1, borderColor: colors.border, ...shadow.md },
  spendingLabel: { ...type.label, color: colors.textSecondary, marginBottom: space.xs },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: space.xs },
  deltaText: { ...type.label },
  barTooltip: { backgroundColor: colors.bgElevated, paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, marginBottom: 4 },
  barTooltipText: { fontFamily: 'SpaceMono_400Regular', fontSize: 12, color: colors.textPrimary },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md, gap: space.sm },
  stat: { flex: 1, alignItems: 'center' },
  statLabel: { ...type.caption, color: colors.textMuted, marginBottom: 2 },
  savingsRate: { fontFamily: 'SpaceMono_400Regular', fontSize: 18 },
  budgetCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.md, marginBottom: space.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm, gap: space.sm },
  budgetTiles: { flexDirection: 'row', alignItems: 'center' },
  budgetTile: { flex: 1, alignItems: 'center', gap: 2 },
  budgetTileLabel: { ...type.caption, color: colors.textMuted },
  budgetTileDivider: { width: 1, height: 28, backgroundColor: colors.border },
  budgetFlags: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
  flagPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.pill },
  flagText: { ...type.caption, fontFamily: 'Inter_600SemiBold' },
  balanceChip: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.md, marginBottom: space.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  balanceText: { ...type.body, color: colors.textSecondary, flex: 1 },
  settleLink: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  chartCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.md, marginBottom: space.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  chartTitle: { ...type.label, color: colors.textSecondary, marginBottom: space.md },
  pieRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  pieCenterNum: { fontFamily: 'Inter_600SemiBold', fontSize: 22, color: colors.textPrimary },
  pieCenterLabel: { ...type.caption, color: colors.textMuted },
  legend: { flex: 1, gap: space.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { ...type.caption, color: colors.textSecondary, flex: 1 },
  legendPct: { ...type.caption, color: colors.textMuted, width: 34, textAlign: 'right' },
  legendAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 11, color: colors.textPrimary, width: 64, textAlign: 'right' },
  section: { marginBottom: space.md },
  sectionTitle: { ...type.subheading, color: colors.textPrimary, marginBottom: space.sm },
  groupList: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.sm },
  groupListItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: space.md, gap: space.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  groupName: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  groupBudgetRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  groupPct: { ...type.caption, color: colors.textMuted, minWidth: 28, textAlign: 'right' },
  empty: { alignItems: 'center', paddingVertical: space.xxl, gap: space.sm },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  emptyTitle: { ...type.subheading, color: colors.textPrimary },
  emptyLabel: { ...type.body, color: colors.textSecondary, textAlign: 'center' },
});
