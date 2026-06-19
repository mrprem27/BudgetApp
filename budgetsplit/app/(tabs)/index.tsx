import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, InteractionManager,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  startOfDay, endOfDay, startOfMonth, endOfMonth,
  startOfYear, endOfYear,
  subDays, subMonths, subYears,
} from 'date-fns';
import { colors } from '../../src/constants/colors';
import { type } from '../../src/constants/typography';
import { space, layout, radius, shadow } from '../../src/constants/layout';
import { useStore } from '../../src/store';
import { getAllPersons } from '../../src/db/queries/persons';
import { getAllGroups } from '../../src/db/queries/groups';
import { getGlobalNet } from '../../src/db/queries/balances';
import { getPoolSummary, getGoals } from '../../src/db/queries/savings';
import { getTransactionsInRange, type TxnWithSplits } from '../../src/db/queries/transactions';
import { AmountText } from '../../src/components/ui/AmountText';
import { BudgetBar } from '../../src/components/finance/BudgetBar';
import { MemberAvatar } from '../../src/components/finance/MemberAvatar';
import { FAB, type Action } from '../../src/components/ui/FAB';
import { FadeIn } from '../../src/components/ui/FadeIn';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { PressableScale } from '../../src/components/ui/PressableScale';
import { TabPills } from '../../src/components/ui/TabPills';
import { getBudgetUsage } from '../../src/lib/budget';
import { getBudgetAnalytics, rankInsights } from '../../src/lib/analytics';
import type { GroupInsight } from '../../src/lib/analytics';
import { formatCompact } from '../../src/lib/money';
import { useFeatureFlags } from '../../src/components/system/FeatureFlagsProvider';
import { CategoryDonut, type DonutSeg } from '../../src/components/finance/CategoryDonut';

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

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
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
  const { flags } = useFeatureFlags();
  const [tab, setTab] = useState<TabKey>('month');
  const [spending, setSpending] = useState(0);
  const [prevSpending, setPrevSpending] = useState(0);
  const [income, setIncome] = useState(0);
  const [oweTotal, setOweTotal] = useState(0);
  const [owedTotal, setOwedTotal] = useState(0);
  const [groupHealth, setGroupHealth] = useState<Array<{ id: string; name: string; pct: number | null; health: 'green' | 'amber' | 'red' | 'none' }>>([]);
  const [donutData, setDonutData] = useState<DonutSeg[]>([]);
  const [donutTotal, setDonutTotal] = useState(0);
  const [budgetSummary, setBudgetSummary] = useState<{ allocated: number; spent: number; over: number; near: number }>({ allocated: 0, spent: 0, over: 0, near: 0 });
  const [savings, setSavings] = useState<{ total: number; unallocated: number; goals: number }>({ total: 0, unallocated: 0, goals: 0 });
  const [insights, setInsights] = useState<GroupInsight[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chartsReady, setChartsReady] = useState(false);
  const [meId, setMeId] = useState('');
  const [meInfo, setMeInfo] = useState<{ name: string; color: string } | null>(null);
  const groups = useStore(s => s.groups);

  useEffect(() => {
    if (!loading) {
      const handle = InteractionManager.runAfterInteractions(() => setChartsReady(true));
      return () => handle.cancel();
    }
  }, [loading]);
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
    setMeInfo({ name: me.name, color: me.avatar_color });

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

    // Reuse the analytics we just computed — rank the top cross-group insights.
    setInsights(rankInsights(grps.map((g, i) => ({ group: g, analytics: analyticsAll[i] }))));

    // Savings pool snapshot for the dashboard card.
    const [savePool, saveGoals] = await Promise.all([getPoolSummary(db), getGoals(db)]);
    setSavings({ total: savePool.total, unallocated: savePool.unallocated, goals: saveGoals.length });

    // Build donut data (spending by category, sorted largest first)
    const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((s, [, v]) => s + v, 0);
    setDonutTotal(total);
    setDonutData(sorted.map(([name, paise], i) => ({
      name,
      paise,
      color: CHART_COLORS[i % CHART_COLORS.length],
    })));
    setLoading(false);
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
          <View>
            <Text style={styles.greeting}>{greeting()}</Text>
            <Text style={styles.appName}>{meInfo?.name?.split(' ')[0] ?? 'BudgetSplit'}</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={() => router.push('/reports')} hitSlop={8} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel="Reports">
              <Feather name="bar-chart-2" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            {meInfo && <MemberAvatar name={meInfo.name} color={meInfo.color} size={40} />}
          </View>
        </View>

        <View style={styles.tabRow}>
          <TabPills
            tabs={TABS}
            active={tab}
            onChange={(key) => { setTab(key as TabKey); }}
          />
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
          <AmountText paise={spending} size="xl" forceColor={colors.textPrimary} compact zeroDash />
          {(spending > 0 || prevSpending > 0) && (() => {
            const delta = spending - prevSpending;
            const pct = prevSpending > 0 ? Math.round((delta / prevSpending) * 100) : null;
            const up = delta > 0;
            const color = delta === 0 ? colors.textMuted : up ? colors.expense : colors.income;
            return (
              <View style={styles.deltaRow}>
                <Feather name={delta === 0 ? 'minus' : up ? 'arrow-up-right' : 'arrow-down-right'} size={13} color={color} />
                <Text style={[styles.deltaText, { color }]}>
                  {pct === null ? formatCompact(Math.abs(delta)) : `${Math.abs(pct)}%`} vs {PREV_LABEL[tab]}
                </Text>
              </View>
            );
          })()}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Income</Text>
              <AmountText paise={income} size="md" forceColor={colors.income} compact />
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Net</Text>
              <AmountText paise={net} size="md" compact />
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Savings</Text>
              <Text style={[styles.savingsRate, { color: savingsRate >= 0 ? colors.income : colors.expense }]}>
                {savingsRate}%
              </Text>
            </View>
          </View>
        </View>

        {/* Where it went — interactive SVG donut */}
        {chartsReady && donutData.length > 0 && (
          <View style={styles.donutCard}>
            <Text style={styles.chartTitle}>Where it went</Text>
            <CategoryDonut
              data={donutData}
              total={donutTotal}
              onOpen={(seg) => router.push(`/category/${encodeURIComponent(seg.name)}` as any)}
            />
          </View>
        )}

        {/* Compact tiles: Budget + Balances side-by-side */}
        <View style={styles.compactGrid}>
        {/* Budget rollup tile */}
        {budgetSummary.allocated > 0 && (() => {
          const bUtil = Math.round((budgetSummary.spent / budgetSummary.allocated) * 100);
          const bLeft = budgetSummary.allocated - budgetSummary.spent;
          return (
          <TouchableOpacity
            style={styles.budgetCard}
            activeOpacity={0.85}
            onPress={() => {
              const pid = groups.find(g => g.is_personal === 1)?.id ?? groups[0]?.id;
              if (pid) router.push(flags.budgetInsights ? `/group/${pid}/insights` : `/group/${pid}/budget`);
            }}
            accessibilityRole="button"
            accessibilityLabel="Manage budget"
          >
            <View style={styles.budgetCardHead}>
              <Text style={styles.budgetCardTitle}>Budget</Text>
              <Feather name="chevron-right" size={16} color={colors.textMuted} />
            </View>
            <Text style={styles.budgetUtil}>{bUtil}%</Text>
            <BudgetBar allocated={budgetSummary.allocated} spent={budgetSummary.spent} height={6} />
            <Text style={styles.budgetLeft}>
              {bLeft >= 0 ? `${formatCompact(bLeft)} left` : `Over by ${formatCompact(-bLeft)}`}
            </Text>
          </TouchableOpacity>
          );
        })()}

        {/* Balance tile */}
        {(oweTotal > 0 || owedTotal > 0) && (
          <TouchableOpacity
            style={styles.balanceChip}
            onPress={() => router.push('/settle')}
            accessibilityRole="button"
            accessibilityLabel="Settle up"
          >
            <Text style={styles.balanceLabel}>Balances</Text>
            <Text style={styles.balanceText}>
              {oweTotal > 0 ? `You owe ${formatCompact(oweTotal)}` : ''}
              {oweTotal > 0 && owedTotal > 0 ? '\n' : ''}
              {owedTotal > 0 ? `Owed ${formatCompact(owedTotal)}` : ''}
            </Text>
            <Text style={styles.settleLink}>Settle Up →</Text>
          </TouchableOpacity>
        )}
        </View>

        {/* Savings pool */}
        {(savings.total > 0 || savings.goals > 0) && (
          <TouchableOpacity
            style={styles.savingsCard}
            activeOpacity={0.85}
            onPress={() => router.push('/savings' as any)}
            accessibilityRole="button"
            accessibilityLabel="Savings"
          >
            <View style={styles.budgetCardHead}>
              <View style={styles.savingsTitleRow}>
                <Feather name="target" size={15} color={colors.accent} />
                <Text style={styles.budgetCardTitle}>Savings</Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.textMuted} />
            </View>
            <View style={styles.budgetTiles}>
              <View style={styles.budgetTile}>
                <Text style={styles.budgetTileLabel}>Pool</Text>
                <AmountText paise={savings.total} size="sm" forceColor={colors.textPrimary} compact />
              </View>
              <View style={styles.budgetTileDivider} />
              <View style={styles.budgetTile}>
                <Text style={styles.budgetTileLabel}>Available</Text>
                <AmountText paise={savings.unallocated} size="sm" forceColor={colors.income} compact />
              </View>
              <View style={styles.budgetTileDivider} />
              <View style={styles.budgetTile}>
                <Text style={styles.budgetTileLabel}>Goals</Text>
                <Text style={styles.savingsGoalCount}>{savings.goals}</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* Top Insights — top cross-group analytics, tap to manage that group's budget */}
        {flags.dashboardInsights && insights.length > 0 && (
          <View style={styles.insightsCard}>
            <Text style={styles.chartTitle}>Top insights</Text>
            <View style={{ gap: space.sm }}>
              {insights.map(ins => {
                const tint = ins.severity === 'warn' ? colors.expense
                  : ins.severity === 'good' ? colors.income : colors.accent;
                return (
                  <TouchableOpacity
                    key={ins.id + ins.groupId}
                    style={styles.insightRow}
                    activeOpacity={0.7}
                    onPress={() => router.push(`/group/${ins.groupId}/budget`)}
                    accessibilityRole="button"
                    accessibilityLabel={ins.text}
                  >
                    <View style={[styles.insightIcon, { backgroundColor: tint + '22' }]}>
                      <Feather name={ins.icon} size={14} color={tint} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.insightText}>{ins.text}</Text>
                      {!!ins.groupName && <Text style={styles.insightGroup}>{ins.groupName}</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
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
                  <View style={[styles.groupIcon, { backgroundColor: colors.accent + '22' }]}>
                    <Text style={styles.groupIconText}>{g.name.charAt(0).toUpperCase()}</Text>
                  </View>
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
          <EmptyState
            icon="edit-3"
            title="Nothing logged yet"
            body="Track your first expense or income to see your spending, budgets and insights here."
            actionLabel="Add expense"
            onAction={() => router.push('/add/quick?kind=expense')}
          />
        )}
        </FadeIn>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      <FAB
        actions={[
          { label: 'Expense', icon: 'minus-circle', tint: colors.expense, description: 'Record spending', onPress: () => router.push('/add/quick?kind=expense') },
          { label: 'Income',  icon: 'plus-circle',  tint: colors.income, description: 'Money you received', onPress: () => router.push('/add/income') },
          { label: 'Transfer', icon: 'repeat', tint: colors.settle, description: 'Move money between people', onPress: () => router.push('/add/transfer') },
          ...(flags.itemizedOcr ? [{ label: 'Itemized Bill', icon: 'list', tint: colors.accent, description: 'Split a bill line by line', onPress: () => router.push('/add/itemized') }] as Action[] : []),
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.md },
  greeting: { ...type.caption, color: colors.textMuted, marginBottom: 2 },
  appName: { ...type.title, color: colors.textPrimary },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  tabRow: { marginBottom: space.lg },
  spendingCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.lg, marginBottom: space.md, borderWidth: 1, borderColor: colors.border, ...shadow.md },
  spendingLabel: { ...type.label, color: colors.textSecondary, marginBottom: space.xs },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: space.xs },
  deltaText: { ...type.label },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md, gap: space.sm },
  stat: { flex: 1, alignItems: 'center' },
  statLabel: { ...type.caption, color: colors.textMuted, marginBottom: 2 },
  savingsRate: { fontFamily: 'SpaceMono_400Regular', fontSize: 18 },
  budgetCard: { flex: 1, backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm, gap: space.sm },
  budgetCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  budgetCardTitle: { ...type.subheading, color: colors.textPrimary },
  budgetUtil: { fontFamily: 'SpaceMono_400Regular', fontSize: 26, letterSpacing: -0.5, color: colors.textPrimary },
  budgetLeft: { ...type.caption, color: colors.textMuted },
  savingsCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm, gap: space.sm, marginBottom: space.md },
  savingsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  savingsGoalCount: { fontFamily: 'SpaceMono_400Regular', fontSize: 16, color: colors.textPrimary },
  budgetTiles: { flexDirection: 'row', alignItems: 'center' },
  budgetTile: { flex: 1, alignItems: 'center', gap: 2 },
  budgetTileLabel: { ...type.caption, color: colors.textMuted },
  budgetTileDivider: { width: 1, height: 28, backgroundColor: colors.border },
  insightsCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.md, marginBottom: space.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  insightIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  insightText: { ...type.body, color: colors.textPrimary, lineHeight: 19 },
  insightGroup: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  balanceChip: { flex: 1, backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm, gap: space.xs },
  balanceLabel: { ...type.subheading, color: colors.textPrimary },
  balanceText: { ...type.body, color: colors.textSecondary },
  settleLink: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold', marginTop: space.xs },
  donutCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.md, marginBottom: space.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  chartTitle: { ...type.label, color: colors.textSecondary, marginBottom: space.md },
  section: { marginBottom: space.md },
  sectionTitle: { ...type.subheading, color: colors.textPrimary, marginBottom: space.sm },
  groupList: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.sm },
  groupListItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: space.md, gap: space.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  groupName: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  groupBudgetRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  groupPct: { ...type.caption, color: colors.textMuted, minWidth: 28, textAlign: 'right' },
  compactGrid: { flexDirection: 'row', gap: 12, marginBottom: space.md },
  groupIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  groupIconText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: colors.accent },
});
