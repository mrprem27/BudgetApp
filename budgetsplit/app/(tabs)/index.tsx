import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
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
import { space, layout } from '../../src/constants/layout';
import { useStore } from '../../src/store';
import { getAllPersons } from '../../src/db/queries/persons';
import { getAllGroups } from '../../src/db/queries/groups';
import { getGlobalNet } from '../../src/db/queries/balances';
import { getTransactionsInRange, getRecurringForGroup } from '../../src/db/queries/transactions';
import { MemberAvatar } from '../../src/components/finance/MemberAvatar';
import { FAB } from '../../src/components/ui/FAB';
import { FadeIn } from '../../src/components/ui/FadeIn';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { TabPills } from '../../src/components/ui/TabPills';
import { getBudgetAnalytics } from '../../src/lib/analytics';
import { useFeatureFlags } from '../../src/components/system/FeatureFlagsProvider';
import { computeHealthScore, type HealthResult } from '../../src/lib/financialHealth';
import { buildUpcoming, type UpcomingItem } from '../../src/lib/upcoming';
import { AppRefreshControl, useRefresh } from '../../src/components/ui/AppRefreshControl';
import { HeroCard } from '../../src/components/finance/home/HeroCard';
import { BalanceStrip } from '../../src/components/finance/home/BalanceStrip';
import { CategoryRankList, type CategoryRow } from '../../src/components/finance/home/CategoryRankList';
import { ComingUpList } from '../../src/components/finance/home/ComingUpList';
import { HealthBand } from '../../src/components/finance/home/HealthBand';
import { HealthSheet } from '../../src/components/finance/HealthSheet';
import { greeting } from '../../src/components/finance/home/helpers';

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
const PERIOD_LABEL: Record<TabKey, string> = { today: 'SPENT TODAY', month: 'SPENT THIS MONTH', year: 'SPENT THIS YEAR' };

const TABS: { key: TabKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'month', label: 'Month' },
  { key: 'year',  label: 'Year' },
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
  const [budget, setBudget] = useState<{ allocated: number; spent: number }>({ allocated: 0, spent: 0 });
  const [catRows, setCatRows] = useState<CategoryRow[]>([]);
  const [catTotal, setCatTotal] = useState(0);
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [showHealth, setShowHealth] = useState(false);
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [meInfo, setMeInfo] = useState<{ name: string; color: string; image: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const { refreshing, onRefresh } = useRefresh(() => load());

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
    setMeInfo({ name: me.name, color: me.avatar_color, image: me.image_uri });

    const { from, to } = getRange(tab);
    // Single source of truth: materialization-aware query feeds the hero number
    // and the category breakdown so they always agree (incl. recurring).
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

    // Prior-period spend (my share) for the hero delta.
    const prev = getPrevRange(tab);
    const prevTxns = await getTransactionsInRange(db, null, prev.from, prev.to);
    let prevSp = 0;
    for (const t of prevTxns) {
      if (t.is_deleted || t.kind !== 'expense') continue;
      prevSp += t.shares.find(s => s.personId === me.id)?.amount ?? 0;
    }
    setPrevSpending(prevSp);

    // Who owes whom (global net), split into owe / owed totals for the strip.
    const net = await getGlobalNet(db);
    const myNet = net[me.id] ?? 0;
    const owe = myNet < 0 ? -myNet : 0;
    const owed = myNet > 0 ? myNet : 0;
    setOweTotal(owe);
    setOwedTotal(owed);

    // Budget rollup (monthly) for the hero pace bar + the health engine.
    const analyticsAll = await Promise.all(grps.map(g => getBudgetAnalytics(db, g)));
    let bAlloc = 0, bSpent = 0, over = 0, near = 0, totalBudgeted = 0;
    for (const a of analyticsAll) {
      bAlloc += a.totalAllocated;
      bSpent += a.totalSpent;
      over += a.overBudget.length;
      near += a.nearLimit.length;
      totalBudgeted += a.overBudget.length + a.nearLimit.length + a.underBudget.length;
    }
    setBudget({ allocated: bAlloc, spent: bSpent });
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
      netOwedPaise: owe - owed,
      dayOfMonth: getDate(now2),
      daysInMonth: getDaysInMonth(now2),
    }));

    // Category breakdown for "Where it went" (largest first).
    const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    setCatRows(sorted.map(([name, paise]) => ({ name, paise })));
    setCatTotal(sorted.reduce((s, [, v]) => s + v, 0));

    // Coming up: next recurring bills across all groups.
    const recurringByGroup = await Promise.all(grps.map(g => getRecurringForGroup(db, g.id)));
    setUpcoming(buildUpcoming(recurringByGroup.flat(), me.id, Date.now(), 3));

    setLoading(false);
  }

  useFocusEffect(useCallback(() => { load(); }, [tab]));

  // Pace bar is only meaningful on the Month tab (budgets are monthly).
  const paceAllocated = tab === 'month' ? budget.allocated : 0;

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
            <TouchableOpacity onPress={() => router.push('/search')} hitSlop={8} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel="Search">
              <Feather name="search" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/history')} hitSlop={8} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel="History">
              <Feather name="clock" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            {meInfo && <MemberAvatar name={meInfo.name} color={meInfo.color} size={40} imageUri={meInfo.image} />}
          </View>
        </View>

        {loading ? (
          <View style={{ gap: space.md }}>
            <SkeletonCard height={148} />
            <SkeletonCard height={64} />
            <SkeletonCard height={160} />
            <SkeletonCard height={96} />
          </View>
        ) : (
          <FadeIn>
            <HeroCard
              spent={spending}
              periodLabel={PERIOD_LABEL[tab]}
              budgetAllocated={paceAllocated}
              budgetSpent={budget.spent}
              prevSpending={prevSpending}
              prevLabel={PREV_LABEL[tab]}
            />

            <View style={styles.tabRow}>
              <TabPills tabs={TABS} active={tab} onChange={(key) => setTab(key as TabKey)} />
            </View>

            {(oweTotal > 0 || owedTotal > 0) && (
              <BalanceStrip oweTotal={oweTotal} owedTotal={owedTotal} onSettle={() => router.push('/settle')} />
            )}

            {catRows.length > 0 && (
              <CategoryRankList
                rows={catRows}
                total={catTotal}
                onPressCategory={(name) => router.push(`/category/${encodeURIComponent(name)}` as any)}
                onMore={() => router.push('/reports' as any)}
              />
            )}

            {upcoming.length > 0 && <ComingUpList items={upcoming} />}

            {flags.healthScore && health && (
              <HealthBand result={health} onPress={() => setShowHealth(true)} />
            )}

            {spending === 0 && income === 0 && (
              <EmptyState
                icon="edit-3"
                title="Start tracking"
                body="Tap + to log your first expense. BudgetSplit will show you exactly where your money goes."
                actionLabel="Add your first expense"
                onAction={() => router.push('/add/quick?kind=expense')}
              />
            )}
          </FadeIn>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      <FAB onPress={() => router.push('/add/quick?kind=expense')} />

      <HealthSheet visible={showHealth} onClose={() => setShowHealth(false)} result={health} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.lg },
  greeting: { ...type.caption, color: colors.textMuted, marginBottom: 2 },
  appName: { ...type.title, color: colors.textPrimary },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  headerBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bgMuted, alignItems: 'center', justifyContent: 'center' },
  tabRow: { marginBottom: space.md },
});
