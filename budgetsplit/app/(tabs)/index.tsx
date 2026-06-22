import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, InteractionManager, Alert,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  startOfDay, endOfDay, startOfMonth, endOfMonth,
  startOfYear, endOfYear,
  subDays, subMonths, subYears,
  getDate, getDaysInMonth,
} from 'date-fns';
import { colors } from '../../src/constants/colors';
import { type } from '../../src/constants/typography';
import { space, layout, radius, shadow } from '../../src/constants/layout';
import { useStore } from '../../src/store';
import { getAllPersons } from '../../src/db/queries/persons';
import { getAllGroups } from '../../src/db/queries/groups';
import { getGlobalNet } from '../../src/db/queries/balances';
import { getPoolSummary, getGoals, getCashPosition } from '../../src/db/queries/savings';
import { getTransactionsInRange, getTrackingStreak, type TxnWithSplits } from '../../src/db/queries/transactions';
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
import type { GroupInsight, CategoryTrend } from '../../src/lib/analytics';
import { categoryVisual } from '../../src/constants/categories';
import { asFeather } from '../../src/constants/palette';
import { formatCompact } from '../../src/lib/money';
import { useFeatureFlags } from '../../src/components/system/FeatureFlagsProvider';
import { CategoryDonut, type DonutSeg } from '../../src/components/finance/CategoryDonut';
import { InsightText } from '../../src/components/finance/InsightText';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { computeHealthScore, type HealthResult, type HealthDimension } from '../../src/lib/financialHealth';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { AppRefreshControl, useRefresh } from '../../src/components/ui/AppRefreshControl';

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

function utilLabel(pct: number | null): string {
  if (pct === null) return '—';
  if (pct > 100) return `${(pct / 100).toFixed(1)}X`;
  return `${pct}%`;
}

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
  const [budgetSummary, setBudgetSummary] = useState<{ allocated: number; spent: number; over: number; near: number; onTrack: number }>({ allocated: 0, spent: 0, over: 0, near: 0, onTrack: 0 });
  const [budgetTopCats, setBudgetTopCats] = useState<CategoryTrend[]>([]);
  const [showBudgetSheet, setShowBudgetSheet] = useState(false);
  const [savings, setSavings] = useState<{ total: number; unallocated: number; goals: number }>({ total: 0, unallocated: 0, goals: 0 });
  const [cashAvailable, setCashAvailable] = useState<number | null>(null);
  const [streak, setStreak] = useState<{ count: number; loggedToday: boolean } | null>(null);
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [selectedDim, setSelectedDim] = useState<HealthDimension | null>(null);
  const [insights, setInsights] = useState<GroupInsight[]>([]);
  const { refreshing, onRefresh } = useRefresh(() => load());
  const [loading, setLoading] = useState(true);
  const [chartsReady, setChartsReady] = useState(false);
  const [meId, setMeId] = useState('');
  const [meInfo, setMeInfo] = useState<{ name: string; color: string; image: string | null } | null>(null);
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
    setMeInfo({ name: me.name, color: me.avatar_color, image: me.image_uri });

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

    // Budget rollup across all groups for the dashboard tiles + health score.
    const analyticsAll = await Promise.all(grps.map(g => getBudgetAnalytics(db, g)));
    let bAlloc = 0, bSpent = 0, over = 0, near = 0, totalBudgeted = 0;
    for (const a of analyticsAll) {
      bAlloc += a.totalAllocated;
      bSpent += a.totalSpent;
      over += a.overBudget.length;
      near += a.nearLimit.length;
      totalBudgeted += a.overBudget.length + a.nearLimit.length + a.underBudget.length;
    }
    const onTrack = analyticsAll.reduce((s, a) => s + a.underBudget.length, 0);
    setBudgetSummary({ allocated: bAlloc, spent: bSpent, over, near, onTrack });
    const topBudgetCats = [...analyticsAll.flatMap(a => a.overBudget), ...analyticsAll.flatMap(a => a.nearLimit)]
      .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
      .slice(0, 5);
    setBudgetTopCats(topBudgetCats);

    // Worst single category across all groups (for the health engine).
    const allBudgetedCats = analyticsAll.flatMap(a => [...a.overBudget, ...a.nearLimit]);
    allBudgetedCats.sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
    const worstCat = allBudgetedCats[0] ?? null;

    const now2 = new Date();
    setHealth(computeHealthScore({
      spendPaise: sp,
      incomePaise: inc,
      prevSpendPaise: prevSp,
      budgetAllocated: bAlloc,
      budgetSpent: bSpent,
      categoriesOver: over,
      categoriesNear: near,
      totalBudgeted,
      worstCategoryPct: worstCat?.pct ?? null,
      worstCategoryName: worstCat?.category ?? null,
      netOwedPaise: oweTotal - owedTotal,
      dayOfMonth: getDate(now2),
      daysInMonth: getDaysInMonth(now2),
    }));

    // Reuse the analytics we just computed — rank the top cross-group insights.
    setInsights(rankInsights(grps.map((g, i) => ({ group: g, analytics: analyticsAll[i] }))));

    // Savings pool snapshot for the dashboard card.
    const [savePool, saveGoals, cashPos, strk] = await Promise.all([getPoolSummary(db), getGoals(db), getCashPosition(db), getTrackingStreak(db)]);
    setSavings({ total: savePool.total, unallocated: savePool.unallocated, goals: saveGoals.length });
    setCashAvailable(cashPos.available);
    setStreak(strk);

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

  // One-shot: if onboarding ended with "Add my first expense", open the add flow.
  useEffect(() => {
    (async () => {
      try {
        if ((await AsyncStorage.getItem('pending_first_add')) === 'true') {
          await AsyncStorage.removeItem('pending_first_add');
          setTimeout(() => router.push('/add/quick'), 350);
        }
      } catch { /* best-effort */ }
    })();
  }, []);

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
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting()}</Text>
            <Text style={styles.appName}>{meInfo?.name?.split(' ')[0] ?? 'BudgetSplit'}</Text>
          </View>
          <View style={styles.headerRight}>
            {flags.streak && streak && streak.count > 0 && (
              <TouchableOpacity
                onPress={() => Alert.alert(
                  `${streak.count}-day tracking streak`,
                  `${streak.loggedToday ? 'You’ve logged today — nice.' : 'You haven’t logged today yet.'}\n\nYour streak counts each day in a row that you log at least one entry. Miss a day and it resets. A gentle nudge to keep your money picture current — never a guilt trip.`,
                  [{ text: 'Got it' }],
                )}
                hitSlop={8}
                style={[styles.streakChip, !streak.loggedToday && styles.streakChipDim]}
                accessibilityRole="button"
                accessibilityLabel={`${streak.count} day tracking streak`}
              >
                <Feather name="zap" size={13} color={colors.accent} />
                <Text style={styles.streakChipText}>{streak.count}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => router.push('/reports')} hitSlop={8} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel="Reports">
              <Feather name="bar-chart-2" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            {meInfo && <MemberAvatar name={meInfo.name} color={meInfo.color} size={40} imageUri={meInfo.image} />}
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

        {/* Cash + Balances — side by side mini cards */}
        {((flags.dashboardCash && cashAvailable !== null) || (flags.dashboardBalances && (oweTotal > 0 || owedTotal > 0))) && (
          <View style={styles.cashBalRow}>
            {flags.dashboardCash && cashAvailable !== null && (
              <TouchableOpacity
                style={styles.miniCard}
                activeOpacity={0.85}
                onPress={() => router.push('/savings' as any)}
                accessibilityRole="button"
                accessibilityLabel="Cash available"
              >
                <Text style={styles.miniCardLabel}>Cash</Text>
                <AmountText paise={cashAvailable} size="md" forceColor={cashAvailable >= 0 ? colors.income : colors.expense} compact />
                <Text style={styles.miniCardSub}>liquid funds</Text>
              </TouchableOpacity>
            )}
            {flags.dashboardBalances && (oweTotal > 0 || owedTotal > 0) && (
              <TouchableOpacity
                style={styles.miniCard}
                onPress={() => router.push('/settle')}
                accessibilityRole="button"
                accessibilityLabel="Settle up"
              >
                <Text style={styles.miniCardLabel}>Balances</Text>
                {oweTotal > 0 && <Text style={[styles.miniCardAmt, { color: colors.expense }]}>Owe {formatCompact(oweTotal)}</Text>}
                {owedTotal > 0 && <Text style={[styles.miniCardAmt, { color: colors.income }]}>Owed {formatCompact(owedTotal)}</Text>}
                <Text style={styles.miniCardSettle}>Settle Up →</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Financial health — 3 circular rings, each grouping related signals */}
        {flags.healthScore && health && (() => {
          const h = health;
          const hColor = h.band === 'great' ? colors.income : h.band === 'good' ? colors.accent : h.band === 'fair' ? colors.healthAmber : colors.expense;
          const hLabel = h.band === 'great' ? 'Great shape' : h.band === 'good' ? 'On track' : h.band === 'fair' ? 'Needs care' : 'Needs attention';
          const sevColor = (sev: string) =>
            sev === 'good' ? colors.income : sev === 'bad' ? colors.expense : sev === 'warn' ? colors.healthAmber : colors.textMuted;
          const R = 30;
          const CIRC = 2 * Math.PI * R;
          return (
            <View style={styles.healthCard}>
              <View style={styles.healthCardHead}>
                <Text style={styles.healthLabel}>Financial health</Text>
                <View style={[styles.healthBandChip, { backgroundColor: hColor + '22' }]}>
                  <Text style={[styles.healthBandText, { color: hColor }]}>{hLabel}</Text>
                </View>
              </View>
              <View style={styles.healthDimRow}>
                {h.dimensions.map(dim => {
                  const dc = sevColor(dim.severity);
                  const offset = CIRC * (1 - dim.pct / 100);
                  return (
                    <TouchableOpacity
                      key={dim.label}
                      style={styles.healthDimWrap}
                      onPress={() => setSelectedDim(dim)}
                      accessibilityRole="button"
                      accessibilityLabel={`${dim.label}: ${dim.score} of ${dim.max}`}
                    >
                      <View style={styles.healthDimRing}>
                        <Svg width={76} height={76} viewBox="0 0 76 76">
                          <Circle cx={38} cy={38} r={R} stroke={colors.bgMuted} strokeWidth={6} fill="none" />
                          <Circle
                            cx={38} cy={38} r={R}
                            stroke={dc} strokeWidth={6} fill="none"
                            strokeDasharray={`${CIRC} ${CIRC}`}
                            strokeDashoffset={offset}
                            strokeLinecap="round"
                            rotation={-90}
                            origin="38, 38"
                          />
                        </Svg>
                        <View style={[StyleSheet.absoluteFill, styles.healthDimCenter]}>
                          <Text style={[styles.healthDimScore, { color: dc }]}>{dim.score}</Text>
                        </View>
                      </View>
                      <Text style={styles.healthDimLabel}>{dim.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })()}

        {/* Budget rollup — prominent, before the donut */}
        {flags.dashboardBudget && budgetSummary.allocated > 0 && (() => {
          const bUtil = Math.round((budgetSummary.spent / budgetSummary.allocated) * 100);
          const bLeft = budgetSummary.allocated - budgetSummary.spent;
          const bHealth = bUtil >= 100 ? colors.expense : bUtil >= 80 ? colors.healthAmber : colors.income;
          return (
          <TouchableOpacity
            style={styles.budgetHero}
            activeOpacity={0.85}
            onPress={() => setShowBudgetSheet(true)}
            accessibilityRole="button"
            accessibilityLabel="Budget details"
          >
            <View style={styles.budgetCardHead}>
              <Text style={styles.budgetCardTitle}>Budget</Text>
              <Feather name="chevron-right" size={16} color={colors.textMuted} />
            </View>
            <View style={styles.budgetHeroRow}>
              <Text style={[styles.budgetUtil, { color: bHealth }]}>{utilLabel(bUtil)}</Text>
              <View style={{ flex: 1 }}>
                <BudgetBar allocated={budgetSummary.allocated} spent={budgetSummary.spent} height={8} />
                <Text style={styles.budgetLeft}>
                  {bLeft >= 0 ? `${formatCompact(bLeft)} left of ${formatCompact(budgetSummary.allocated)}` : `Over by ${formatCompact(-bLeft)}`}
                </Text>
              </View>
            </View>
            {(budgetSummary.over > 0 || budgetSummary.near > 0) && (
              <View style={styles.budgetBadgeRow}>
                {budgetSummary.over > 0 && (
                  <View style={[styles.budgetBadge, { backgroundColor: colors.expense + '22' }]}>
                    <Text style={[styles.budgetBadgeText, { color: colors.expense }]}>{budgetSummary.over} over</Text>
                  </View>
                )}
                {budgetSummary.near > 0 && (
                  <View style={[styles.budgetBadge, { backgroundColor: colors.healthAmber + '22' }]}>
                    <Text style={[styles.budgetBadgeText, { color: colors.healthAmber }]}>{budgetSummary.near} near limit</Text>
                  </View>
                )}
              </View>
            )}
          </TouchableOpacity>
          );
        })()}

        {/* Where it went — interactive SVG donut */}
        {flags.dashboardDonut && chartsReady && donutData.length > 0 && (
          <View style={styles.donutCard}>
            <Text style={styles.chartTitle}>Where it went</Text>
            <CategoryDonut
              data={donutData}
              total={donutTotal}
              onOpen={(seg) => router.push(`/category/${encodeURIComponent(seg.name)}` as any)}
            />
          </View>
        )}


        {/* Savings pool */}
        {flags.dashboardSavings && (savings.total > 0 || savings.goals > 0) && (
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
            <View style={styles.savingsTiles}>
              <View style={styles.savingsTile}>
                <Text style={styles.savingsTileLabel}>Pool</Text>
                <AmountText paise={savings.total} size="sm" forceColor={colors.textPrimary} compact />
              </View>
              <View style={styles.savingsTileDivider} />
              <View style={styles.savingsTile}>
                <Text style={styles.savingsTileLabel}>Available</Text>
                <AmountText paise={savings.unallocated} size="sm" forceColor={colors.income} compact />
              </View>
              <View style={styles.savingsTileDivider} />
              <View style={styles.savingsTile}>
                <Text style={styles.savingsTileLabel}>Goals</Text>
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
                      <InsightText text={ins.text} color={tint} style={styles.insightText} />
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
                        <Text style={[styles.groupPct, g.pct > 100 && { color: colors.expense }]}>
                          {g.pct > 100 ? `${(g.pct / 100).toFixed(1)}X` : `${g.pct}%`}
                        </Text>
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

      {/* Budget detail sheet */}
      <SheetModal visible={showBudgetSheet} onClose={() => setShowBudgetSheet(false)} title="Budget">
        {(() => {
          const bUtil = budgetSummary.allocated > 0 ? Math.round((budgetSummary.spent / budgetSummary.allocated) * 100) : 0;
          const bHealth = bUtil >= 100 ? colors.expense : bUtil >= 80 ? colors.healthAmber : colors.income;
          const bLeft = budgetSummary.allocated - budgetSummary.spent;
          return (
            <>
              <View style={styles.bsUtilRow}>
                <Text style={[styles.bsUtilBig, { color: bHealth }]}>{utilLabel(bUtil)}</Text>
                <View style={{ flex: 1 }}>
                  <BudgetBar allocated={budgetSummary.allocated} spent={budgetSummary.spent} height={8} />
                  <Text style={styles.bsUtilSub}>
                    {bLeft >= 0 ? `${formatCompact(bLeft)} left of ${formatCompact(budgetSummary.allocated)}` : `Over by ${formatCompact(-bLeft)}`}
                  </Text>
                </View>
              </View>
              <View style={styles.bsChips}>
                {budgetSummary.over > 0 && (
                  <View style={[styles.bsChip, { backgroundColor: colors.expense + '22' }]}>
                    <Text style={[styles.bsChipText, { color: colors.expense }]}>{budgetSummary.over} over</Text>
                  </View>
                )}
                {budgetSummary.near > 0 && (
                  <View style={[styles.bsChip, { backgroundColor: colors.healthAmber + '22' }]}>
                    <Text style={[styles.bsChipText, { color: colors.healthAmber }]}>{budgetSummary.near} near limit</Text>
                  </View>
                )}
                {budgetSummary.onTrack > 0 && (
                  <View style={[styles.bsChip, { backgroundColor: colors.income + '22' }]}>
                    <Text style={[styles.bsChipText, { color: colors.income }]}>{budgetSummary.onTrack} on track</Text>
                  </View>
                )}
              </View>
              {budgetTopCats.length > 0 && (
                <View style={styles.bsCatList}>
                  {budgetTopCats.map(c => {
                    const vis = categoryVisual(c.category);
                    const fc = c.status === 'over' ? colors.expense : colors.healthAmber;
                    return (
                      <View key={c.category} style={styles.bsCatRow}>
                        <View style={[styles.bsCatIcon, { backgroundColor: vis.color + '22' }]}>
                          <Feather name={asFeather(vis.icon, 'tag')} size={13} color={vis.color} />
                        </View>
                        <Text style={styles.bsCatName} numberOfLines={1}>{c.category}</Text>
                        <Text style={[styles.bsCatPct, { color: fc }]}>{utilLabel(c.pct)}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
              <TouchableOpacity
                style={styles.bsReportLink}
                onPress={() => { setShowBudgetSheet(false); router.push('/reports' as any); }}
                accessibilityRole="button"
              >
                <Text style={styles.bsReportLinkText}>View full report</Text>
                <Feather name="chevron-right" size={14} color={colors.accent} />
              </TouchableOpacity>
            </>
          );
        })()}
      </SheetModal>

      {/* Health dimension detail sheet — shown when user taps a ring */}
      <SheetModal
        visible={!!selectedDim}
        onClose={() => setSelectedDim(null)}
        title={selectedDim?.label ?? ''}
      >
        {selectedDim?.factors.map(f => {
          const fc = f.severity === 'good' ? colors.income : f.severity === 'bad' ? colors.expense : f.severity === 'warn' ? colors.healthAmber : colors.textMuted;
          const fi: keyof typeof Feather.glyphMap = f.severity === 'good' ? 'check-circle' : f.severity === 'bad' ? 'x-circle' : f.severity === 'warn' ? 'alert-triangle' : 'minus';
          return (
            <View key={f.label} style={styles.dimFactorRow}>
              <View style={[styles.dimFactorIcon, { backgroundColor: fc + '22' }]}>
                <Feather name={fi} size={14} color={fc} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dimFactorLabel}>{f.label}</Text>
                <Text style={styles.dimFactorDetail}>{f.detail}</Text>
              </View>
              <Text style={[styles.dimFactorPts, { color: fc }]}>{f.points}/{f.max}</Text>
            </View>
          );
        })}
      </SheetModal>
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
  budgetHero: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.md, marginBottom: space.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm, gap: space.sm },
  budgetHeroRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  budgetCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  budgetCardTitle: { ...type.subheading, color: colors.textPrimary },
  budgetUtil: { fontFamily: 'SpaceMono_400Regular', fontSize: 28, letterSpacing: -0.5 },
  budgetLeft: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  budgetBadgeRow: { flexDirection: 'row', gap: space.sm },
  budgetBadge: { paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill },
  budgetBadgeText: { ...type.caption, fontFamily: 'Inter_600SemiBold' },
  savingsCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm, gap: space.sm, marginBottom: space.md },
  savingsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  savingsGoalCount: { fontFamily: 'SpaceMono_400Regular', fontSize: 16, color: colors.textPrimary },
  savingsTiles: { flexDirection: 'row', alignItems: 'center' },
  savingsTile: { flex: 1, alignItems: 'center', gap: 2 },
  savingsTileLabel: { ...type.caption, color: colors.textMuted },
  savingsTileDivider: { width: 1, height: 28, backgroundColor: colors.border },
  donutCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.md, marginBottom: space.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  insightIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  insightText: { ...type.body, color: colors.textPrimary, lineHeight: 19 },
  insightGroup: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  healthCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm, marginBottom: space.md },
  healthCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
  healthLabel: { ...type.label, color: colors.textSecondary },
  healthBandChip: { paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill },
  healthBandText: { ...type.caption, fontFamily: 'Inter_600SemiBold' },
  healthDimRow: { flexDirection: 'row', justifyContent: 'space-around' },
  healthDimWrap: { alignItems: 'center', gap: space.xs },
  healthDimRing: { width: 76, height: 76, position: 'relative' },
  healthDimCenter: { alignItems: 'center', justifyContent: 'center' },
  healthDimScore: { fontFamily: 'SpaceMono_400Regular', fontSize: 18 },
  healthDimLabel: { ...type.caption, color: colors.textSecondary, textAlign: 'center' },
  dimFactorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingVertical: space.xs },
  dimFactorIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  dimFactorLabel: { ...type.label, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  dimFactorDetail: { ...type.caption, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
  dimFactorPts: { ...type.caption, fontFamily: 'SpaceMono_400Regular', fontSize: 11, marginTop: 3 },
  streakChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: space.sm, height: 30, borderRadius: radius.pill, backgroundColor: colors.accentMuted },
  streakChipDim: { opacity: 0.6 },
  streakChipText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  cashBalRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  miniCard: { flex: 1, backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm, gap: space.xs },
  miniCardLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  miniCardSub: { ...type.caption, color: colors.textMuted },
  miniCardAmt: { ...type.body, fontFamily: 'Inter_600SemiBold' },
  miniCardSettle: { ...type.caption, color: colors.accent, fontFamily: 'Inter_600SemiBold', marginTop: space.xs },
  insightsCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.md, marginBottom: space.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  chartTitle: { ...type.label, color: colors.textSecondary, marginBottom: space.md },
  section: { marginBottom: space.md },
  sectionTitle: { ...type.subheading, color: colors.textPrimary, marginBottom: space.sm },
  groupList: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.sm },
  groupListItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: space.md, gap: space.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  groupName: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  groupBudgetRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  groupPct: { ...type.caption, color: colors.textMuted, minWidth: 28, textAlign: 'right' },
  groupIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  groupIconText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: colors.accent },
  bsUtilRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.sm },
  bsUtilBig: { fontFamily: 'SpaceMono_400Regular', fontSize: 32, letterSpacing: -0.5 },
  bsUtilSub: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  bsChips: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', marginBottom: space.md },
  bsChip: { paddingHorizontal: space.md, paddingVertical: space.xs + 2, borderRadius: radius.pill },
  bsChipText: { ...type.caption, fontFamily: 'Inter_600SemiBold' },
  bsCatList: { gap: space.xs, marginBottom: space.md },
  bsCatRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
  bsCatIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  bsCatName: { ...type.body, color: colors.textPrimary, flex: 1 },
  bsCatPct: { ...type.label, fontFamily: 'Inter_600SemiBold' },
  bsReportLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: space.xs, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
  bsReportLinkText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
});
