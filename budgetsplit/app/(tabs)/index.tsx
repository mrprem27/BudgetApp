import React, { useState, useCallback, useRef } from 'react';
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
  const [income, setIncome] = useState(0);
  const [oweTotal, setOweTotal] = useState(0);
  const [owedTotal, setOwedTotal] = useState(0);
  const [groupHealth, setGroupHealth] = useState<Array<{ id: string; name: string; pct: number | null; health: 'green' | 'amber' | 'red' | 'none' }>>([]);
  const [pieData, setPieData] = useState<Array<{ value: number; color: string; text: string }>>([]);
  const [barData, setBarData] = useState<Array<{ value: number; label: string; frontColor: string }>>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [meId, setMeId] = useState('');
  const groups = useStore(s => s.groups);

  const firstLoad = useRef(true);

  async function load() {
    try {
      await loadInner();
    } finally {
      // Let the skeleton breathe on the very first load only — focus
      // refreshes (loading already false) stay instant.
      if (firstLoad.current) {
        firstLoad.current = false;
        await new Promise(r => setTimeout(r, 450));
      }
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
                {pieData.slice(0, 5).map((d, i) => (
                  <View key={i} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: d.color }]} />
                    <Text style={styles.legendText} numberOfLines={1}>{d.text}</Text>
                  </View>
                ))}
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
              xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 9 }}
              noOfSections={3}
              barBorderRadius={3}
              isAnimated
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
          { label: 'Expense', icon: 'minus-circle', onPress: () => router.push('/add/quick?kind=expense') },
          { label: 'Income',  icon: 'plus-circle',  onPress: () => router.push('/add/quick?kind=income') },
          { label: 'Itemized Bill', icon: 'list', onPress: () => router.push('/add/itemized') },
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
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md, gap: space.sm },
  stat: { flex: 1, alignItems: 'center' },
  statLabel: { ...type.caption, color: colors.textMuted, marginBottom: 2 },
  savingsRate: { fontFamily: 'SpaceMono_400Regular', fontSize: 18 },
  balanceChip: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.md, marginBottom: space.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  balanceText: { ...type.body, color: colors.textSecondary, flex: 1 },
  settleLink: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  chartCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.md, marginBottom: space.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  chartTitle: { ...type.label, color: colors.textSecondary, marginBottom: space.md },
  pieRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  pieCenterNum: { fontFamily: 'Inter_600SemiBold', fontSize: 22, color: colors.textPrimary },
  pieCenterLabel: { ...type.caption, color: colors.textMuted },
  legend: { flex: 1, gap: space.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { ...type.caption, color: colors.textSecondary, flex: 1 },
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
