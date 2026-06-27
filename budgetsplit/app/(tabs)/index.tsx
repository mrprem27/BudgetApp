import React, { useState, useCallback, useEffect, useRef } from 'react';
import { settings } from '../../src/lib/settings';
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
import { space, layout, radius } from '../../src/constants/layout';
import { useStore } from '../../src/store';
import { getAllPersons } from '../../src/db/queries/persons';
import { getAllGroups } from '../../src/db/queries/groups';
import { getGlobalNet } from '../../src/db/queries/balances';
import { getTransactionsInRange, getRecurringForGroup } from '../../src/db/queries/transactions';
import { FadeIn } from '../../src/components/ui/FadeIn';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { TabPills } from '../../src/components/ui/TabPills';
import { getBudgetAnalytics } from '../../src/lib/analytics';
import { useFeatureFlags } from '../../src/components/system/FeatureFlagsProvider';
import { useRefreshOnDataChange } from '../../src/components/system/DataRefreshProvider';
import { computeHealthScore, type HealthResult, type HealthInputs } from '../../src/lib/financialHealth';
import { forecastMonthEnd, type Forecast } from '../../src/lib/forecast';
import { buildUpcoming, type UpcomingItem } from '../../src/lib/upcoming';
import { AppRefreshControl, useRefresh } from '../../src/components/ui/AppRefreshControl';
import { HeroCard } from '../../src/components/finance/home/HeroCard';
import { BalanceStrip } from '../../src/components/finance/home/BalanceStrip';
import { CategoryRankList, type CategoryRow } from '../../src/components/finance/home/CategoryRankList';
import { ForecastCard, type ForecastShift } from '../../src/components/finance/home/ForecastCard';
import { ComingUpList } from '../../src/components/finance/home/ComingUpList';
import { HealthBand } from '../../src/components/finance/home/HealthBand';
import { StreakCard } from '../../src/components/finance/home/StreakCard';
import { HealthSheet } from '../../src/components/finance/HealthSheet';
import { MemberAvatar } from '../../src/components/finance/MemberAvatar';
import { greeting, healthBandColor } from '../../src/components/finance/home/helpers';

type TabKey = 'today' | 'month' | 'year';

function getRange(tab: TabKey): { from: number; to: number } {
  const now = new Date();
  switch (tab) {
    case 'today': return { from: startOfDay(now).getTime(), to: endOfDay(now).getTime() };
    case 'month': return { from: startOfMonth(now).getTime(), to: endOfMonth(now).getTime() };
    case 'year':  return { from: startOfYear(now).getTime(), to: endOfYear(now).getTime() };
  }
}

// "Till now" comparison: the prior period only up to the SAME elapsed point we're
// at in the current one (e.g. month-to-date vs same-day-last-month-to-date), so the
// delta isn't unfairly low early in a period. Capped at the prior period's real end.
function getPrevRange(tab: TabKey): { from: number; to: number } {
  const now = new Date();
  const elapsed = now.getTime() - getRange(tab).from;
  switch (tab) {
    case 'today': { const d = subDays(now, 1);   const from = startOfDay(d).getTime();   return { from, to: Math.min(from + elapsed, endOfDay(d).getTime()) }; }
    case 'month': { const d = subMonths(now, 1); const from = startOfMonth(d).getTime(); return { from, to: Math.min(from + elapsed, endOfMonth(d).getTime()) }; }
    case 'year':  { const d = subYears(now, 1);  const from = startOfYear(d).getTime();  return { from, to: Math.min(from + elapsed, endOfYear(d).getTime()) }; }
  }
}

const PREV_LABEL: Record<TabKey, string> = { today: 'yesterday', month: 'last month', year: 'last year' };
const PERIOD_LABEL: Record<TabKey, string> = { today: 'SPENT TODAY', month: 'SPENT THIS MONTH', year: 'SPENT THIS YEAR' };

const TABS: { key: TabKey; label: string }[] = [
  { key: 'month', label: 'Month' },
  { key: 'today', label: 'Today' },
  { key: 'year',  label: 'Year' },
];

export default function DashboardScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setGroups } = useStore();
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
  // Once the user has any spend, keep the category card mounted across period
  // switches so it never collapses (a period with no spend shows an empty slot).
  const [everHadCats, setEverHadCats] = useState(false);
  const [catExpanded, setCatExpanded] = useState(false);
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [healthInputs, setHealthInputs] = useState<HealthInputs | null>(null);
  const [showHealth, setShowHealth] = useState(false);
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [topShift, setTopShift] = useState<ForecastShift | null>(null);
  const [meInfo, setMeInfo] = useState<{ name: string; color: string; image: string | null } | null>(null);
  const [personalGroupId, setPersonalGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [hideAmounts, setHideAmounts] = useState(false);
  const [streak, setStreak] = useState(0);
  const [streakLoggedDays, setStreakLoggedDays] = useState<Set<string>>(new Set());
  const [catchUpBanner, setCatchUpBanner] = useState<{ days: number; ruleCount: number } | null>(null);
  const { refreshing, onRefresh } = useRefresh(() => load());

  async function load() {
    // No loading UI on period switch — data is local, so only the VALUES change;
    // positions/sections stay put (nothing vanishes and re-appears).
    try {
      await loadInner();
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  async function loadInner() {
    const persons = await getAllPersons(db);
    const grps = await getAllGroups(db);
    setGroups(grps);
    setPersonalGroupId(grps.find(g => g.is_personal === 1)?.id ?? grps[0]?.id ?? null);

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

    // Compute daily streak from month transactions
    const loggedDays = new Set<string>();
    for (const t of txns) {
      if (t.is_deleted) continue;
      const d = new Date(t.date);
      if (!isFinite(d.getTime())) continue;
      loggedDays.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    setStreakLoggedDays(loggedDays);
    // Count consecutive days backwards from today
    const today3 = new Date();
    let s = 0;
    for (let i = 0; i < 31; i++) {
      const check = new Date(today3.getFullYear(), today3.getMonth(), today3.getDate() - i);
      const key = `${check.getFullYear()}-${String(check.getMonth() + 1).padStart(2, '0')}-${String(check.getDate()).padStart(2, '0')}`;
      if (loggedDays.has(key)) s++;
      else break;
    }
    setStreak(s);

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
    const healthInputsNow: HealthInputs = {
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
    };
    setHealth(computeHealthScore(healthInputsNow));
    setHealthInputs(healthInputsNow);

    // Category breakdown for "Where it went" (largest first).
    const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    setCatRows(sorted.map(([name, paise]) => ({ name, paise })));
    setCatTotal(sorted.reduce((s, [, v]) => s + v, 0));
    if (sorted.length > 0) setEverHadCats(true);

    // Coming up: next recurring bills across all groups.
    const recurringByGroup = await Promise.all(grps.map(g => getRecurringForGroup(db, g.id)));
    // "Coming up" = only what's due in the next 4 days (imminent), not the whole month.
    setUpcoming(buildUpcoming(recurringByGroup.flat(), me.id, Date.now(), 6, 4));

    // Month-end forecast + biggest category shift vs last month (Month view only).
    if (tab === 'month' && (flags.forecast || flags.dashboardInsights)) {
      const now = new Date();
      const lmStart = startOfMonth(subMonths(now, 1)).getTime();
      const lmEnd = endOfMonth(subMonths(now, 1)).getTime();
      const lmTxns = await getTransactionsInRange(db, null, lmStart, lmEnd);
      let lmSpend = 0;
      const lmCat: Record<string, number> = {};
      for (const t of lmTxns) {
        if (t.is_deleted || t.kind !== 'expense') continue;
        const share = t.shares.find(s => s.personId === me.id)?.amount ?? 0;
        if (share <= 0) continue;
        lmSpend += share;
        lmCat[t.category] = (lmCat[t.category] ?? 0) + share;
      }
      setForecast(forecastMonthEnd(sp, getDate(now), getDaysInMonth(now), lmSpend));
      // Biggest shift among categories present in BOTH months (avoids "new"/∞%).
      const shift = Object.entries(catMap)
        .filter(([cat]) => lmCat[cat])
        .map(([cat, thisAmt]) => ({ cat, thisAmt, pct: lmCat[cat] > 0 ? Math.round(((thisAmt - lmCat[cat]) / lmCat[cat]) * 100) : 0 }))
        .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0] ?? null;
      setTopShift(shift);
    } else {
      setForecast(null);
      setTopShift(null);
    }

    setLoading(false);
  }

  useFocusEffect(useCallback(() => {
    load();
    settings.hideAmounts().then(setHideAmounts);
    checkCatchUp();
  }, [tab]));
  // Reflect writes from other screens (e.g. saving a budget) without needing a re-focus.
  useRefreshOnDataChange(load);

  // Onboarding's "add my first expense" hand-off: open Add once, then clear the
  // one-shot flag so it never re-fires.
  useEffect(() => {
    (async () => {
      if (await settings.pendingFirstAdd()) {
        await settings.clearPendingFirstAdd();
        router.push('/add/quick?kind=expense');
      }
    })();
  }, []);

  async function checkCatchUp() {
    const now = Date.now();
    const lastOpen = (await settings.appLastOpen()) ?? now;
    // Record current open time immediately so the next open can compare.
    await settings.setAppLastOpen(now);
    const gapDays = Math.floor((now - lastOpen) / (1000 * 60 * 60 * 24));
    if (gapDays < 30) return;
    // Count active recurring rules across all groups.
    const grps = await getAllGroups(db);
    const rulesPerGroup = await Promise.all(grps.map(g => getRecurringForGroup(db, g.id)));
    const ruleCount = rulesPerGroup.flat().filter(r => r.recur_freq && r.recur_state !== 'paused').length;
    if (ruleCount > 0) {
      setCatchUpBanner({ days: gapDays, ruleCount });
    }
  }

  // Budgets are stored monthly; scale to the active period so the pace line
  // shows on every tab when a budget exists (Today = per-day, Year = ×12).
  const paceAllocated = budget.allocated <= 0 ? 0
    : tab === 'today' ? Math.round(budget.allocated / getDaysInMonth(new Date()))
    : tab === 'year' ? budget.allocated * 12
    : budget.allocated;

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
            <TouchableOpacity onPress={() => router.push('/history')} hitSlop={8} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel="Notifications">
              <Feather name="bell" size={18} color={colors.textSecondary} />
              <View style={styles.notifDot} />
            </TouchableOpacity>
            <MemberAvatar
              name={meInfo?.name ?? ''}
              color={meInfo?.color ?? colors.accent}
              imageUri={meInfo?.image}
              size={36}
              onPress={() => router.push('/settings')}
            />
          </View>
        </View>

        {/* No loading skeleton — local data loads instantly; render nothing until
            ready so we never flash the empty-home at a user who has data. */}
        {loadError ? (
          <ErrorState
            title="Couldn't load your data"
            body="Something went wrong reading your data. It's safe on your device — try again."
            onRetry={() => { setLoadError(false); setLoading(true); load(); }}
          />
        ) : loading ? null : (
          <FadeIn>
            {/* Recurring catch-up — surfaces when rules ran while the app was closed 30+ days */}
            {catchUpBanner && (
              <View style={styles.catchUpBanner}>
                <View style={styles.catchUpRow}>
                  <Feather name="refresh-cw" size={16} color={colors.healthAmber} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.catchUpTitle}>Recurring catch-up complete</Text>
                    <Text style={styles.catchUpText}>
                      {catchUpBanner.ruleCount} recurring {catchUpBanner.ruleCount === 1 ? 'rule' : 'rules'} ran while the app was closed ({catchUpBanner.days} days). Review the new entries.
                    </Text>
                  </View>
                </View>
                <View style={styles.catchUpActions}>
                  <TouchableOpacity onPress={() => router.push('/history' as any)} accessibilityRole="button" style={styles.catchUpBtn}>
                    <Text style={styles.catchUpBtnText}>Review entries</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setCatchUpBanner(null)} accessibilityRole="button" style={styles.catchUpDismiss}>
                    <Text style={styles.catchUpDismissText}>Dismiss</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {(spending === 0 && income === 0 && budget.allocated <= 0 && !everHadCats) ? (
              <>
                {/* Dedicated first-run empty home (design Screen 6) */}
                <View style={styles.emptyHero}>
                  <View style={styles.emptyHeroTile}><Text style={styles.emptyHeroZero}>₹0</Text></View>
                  <Text style={styles.emptyHeroTitle}>Nothing logged yet</Text>
                  <Text style={styles.emptyHeroBody}>Log your first expense to see where your money's going.</Text>
                  <TouchableOpacity style={styles.emptyHeroCta} onPress={() => router.push('/add/quick?kind=expense')} accessibilityRole="button" accessibilityLabel="Log first expense">
                    <Text style={styles.emptyHeroCtaText}>Log first expense</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.getStartedLabel}>GET STARTED</Text>
                <View style={{ gap: space.sm }}>
                  <TouchableOpacity style={styles.startTile} onPress={() => personalGroupId && router.push(`/group/${personalGroupId}/budget` as any)} accessibilityRole="button">
                    <View style={[styles.startIcon, { backgroundColor: colors.healthAmber + '22' }]}><Feather name="target" size={18} color={colors.healthAmber} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.startTitle}>Set a monthly budget</Text>
                      <Text style={styles.startSub}>Know your limits before you hit them</Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.startTile} onPress={() => router.push('/groups')} accessibilityRole="button">
                    <View style={[styles.startIcon, { backgroundColor: colors.settle + '22' }]}><Feather name="users" size={18} color={colors.settle} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.startTitle}>Create a group</Text>
                      <Text style={styles.startSub}>Flatmates, trips, or any shared tab</Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.startTile} onPress={() => router.push('/friends')} accessibilityRole="button">
                    <View style={[styles.startIcon, { backgroundColor: colors.income + '22' }]}><Feather name="user-plus" size={18} color={colors.income} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.startTitle}>Add people you split with</Text>
                      <Text style={styles.startSub}>Name-only — no account needed</Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </>
            ) : (
            <>
            <HeroCard
              spent={spending}
              periodLabel={PERIOD_LABEL[tab]}
              budgetAllocated={paceAllocated}
              prevSpending={prevSpending}
              prevLabel={PREV_LABEL[tab]}
              obfuscate={hideAmounts}
              healthScore={health ? health.score : null}
              healthColor={health ? healthBandColor(health.band) : colors.accent}
              onPressHealth={() => setShowHealth(true)}
            />

            <View style={styles.tabRow}>
              <TabPills tabs={TABS} active={tab} onChange={(key) => setTab(key as TabKey)} />
            </View>

            {everHadCats && (
              <CategoryRankList
                rows={catRows}
                total={catTotal}
                topN={catExpanded ? Math.max(3, catRows.length) : 3}
                expanded={catExpanded}
                onPressCategory={(name) => router.push(`/category/${encodeURIComponent(name)}?period=${tab}` as any)}
                onMore={() => setCatExpanded(e => !e)}
              />
            )}

            {/* Settle-up sits below the bars. */}
            {(oweTotal > 0 || owedTotal > 0) && (
              <BalanceStrip oweTotal={oweTotal} owedTotal={owedTotal} onSettle={() => router.push('/add/quick?kind=transfer')} />
            )}

            {/* Month-end forecast (+ insight teaser) — below the owe/owed strip, Month view only */}
            {tab === 'month' && flags.forecast && forecast?.ready && (
              <ForecastCard
                projected={forecast.projected}
                budget={budget.allocated}
                spentSoFar={spending}
                dayOfMonth={getDate(new Date())}
                daysInMonth={getDaysInMonth(new Date())}
                topShift={flags.dashboardInsights ? topShift : null}
                obfuscate={hideAmounts}
                onPressInsights={() => router.push('/insights')}
              />
            )}

            {upcoming.length > 0 && <ComingUpList items={upcoming} />}

            {/* Tracking streak — opt-in (Settings › Sections); StreakCard self-hides under 3 days. */}
            {flags.streak && (
              <StreakCard
                streak={streak}
                daysInMonth={getDaysInMonth(new Date())}
                loggedDays={streakLoggedDays}
              />
            )}

            </>
            )}
          </FadeIn>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* FAB now lives in the custom tab bar (centered, docked). */}

      <HealthSheet visible={showHealth} onClose={() => setShowHealth(false)} result={health} inputs={healthInputs} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.lg },
  emptyHints: { gap: space.xs, marginTop: space.sm },
  emptyHintRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: space.sm + 2 },
  emptyHintText: { ...type.label, color: colors.textSecondary },
  // Dedicated first-run empty home (design Screen 6)
  emptyHero: { backgroundColor: colors.bgCard, borderRadius: 20, paddingVertical: 32, paddingHorizontal: space.lg, marginBottom: space.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  emptyHeroTile: { width: 72, height: 72, borderRadius: 20, backgroundColor: colors.accentMuted, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: space.md },
  emptyHeroZero: { fontFamily: 'SpaceMono_400Regular', fontSize: 26, color: colors.accent, letterSpacing: -1 },
  emptyHeroTitle: { ...type.subheading, color: colors.textPrimary, marginBottom: 6 },
  emptyHeroBody: { ...type.label, color: colors.textMuted, textAlign: 'center', lineHeight: 20, maxWidth: 240, marginBottom: space.lg },
  emptyHeroCta: { alignSelf: 'stretch', backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  emptyHeroCtaText: { ...type.button, color: colors.bg },
  getStartedLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Inter_600SemiBold', marginBottom: space.sm },
  startTile: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bgCard, borderRadius: 14, padding: space.md, borderWidth: 1, borderColor: colors.border },
  startIcon: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  startTitle: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  startSub: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  greeting: { ...type.caption, color: colors.textMuted, marginBottom: 2 },
  appName: { fontSize: 24, fontFamily: 'Inter_600SemiBold', color: colors.textPrimary, letterSpacing: -0.3 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  headerBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bgMuted, alignItems: 'center', justifyContent: 'center' },
  notifDot: { position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.expense, borderWidth: 1.5, borderColor: colors.bgMuted },
  tabRow: { marginBottom: space.md },
  catchUpBanner: { backgroundColor: colors.healthAmber + '18', borderRadius: 14, borderWidth: 1, borderColor: colors.healthAmber + '55', padding: space.md, gap: space.sm, marginBottom: space.sm },
  catchUpRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  catchUpTitle: { ...type.label, color: colors.healthAmber, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  catchUpText: { ...type.caption, color: colors.textSecondary, lineHeight: 17 },
  catchUpActions: { flexDirection: 'row', gap: space.sm },
  catchUpBtn: { paddingHorizontal: space.md, paddingVertical: space.xs, backgroundColor: colors.healthAmber + '33', borderRadius: 20, borderWidth: 1, borderColor: colors.healthAmber + '66' },
  catchUpBtnText: { ...type.label, color: colors.healthAmber, fontFamily: 'Inter_600SemiBold' },
  catchUpDismiss: { paddingHorizontal: space.md, paddingVertical: space.xs },
  catchUpDismissText: { ...type.label, color: colors.textMuted },
});
