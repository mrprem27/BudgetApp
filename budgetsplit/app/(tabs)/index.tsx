import React, { useState, useCallback, useEffect } from 'react';
import { settings } from '../../src/lib/settings';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDate, getDaysInMonth } from 'date-fns';
import { colors } from '../../src/constants/colors';
import { type } from '../../src/constants/typography';
import { space, layout, radius } from '../../src/constants/layout';
import { useStore } from '../../src/store';

import { getAllGroups } from '../../src/db/queries/groups';

import { getRecurringForGroup } from '../../src/db/queries/recurring';

import { FadeIn } from '../../src/components/ui/FadeIn';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { TabPills } from '../../src/components/ui/TabPills';

import { useFeatureFlags } from '../../src/components/system/FeatureFlagsProvider';
import { useScreenData } from '../../src/hooks/useScreenData';

import { AppRefreshControl } from '../../src/components/ui/AppRefreshControl';
import { HeroCard } from '../../src/components/finance/home/HeroCard';
import { BalanceStrip } from '../../src/components/finance/home/BalanceStrip';
import { CategoryRankList } from '../../src/components/finance/home/CategoryRankList';
import { ForecastCard } from '../../src/components/finance/home/ForecastCard';
import { StreakCard } from '../../src/components/finance/home/StreakCard';
import { HealthSheet } from '../../src/components/finance/HealthSheet';
import { MemberAvatar } from '../../src/components/finance/MemberAvatar';
import { greeting, healthBandColor } from '../../src/components/finance/home/helpers';
import { loadHomeData, PREV_LABEL, PERIOD_LABEL, TXN_COUNT_PERIOD_LABEL, type TabKey } from '../../src/lib/homeData';
import { alpha } from '../../src/theme';

// Month is the default and sits in the centre (Today · Month · Year).
const TABS: { key: TabKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'month', label: 'Month' },
  { key: 'year',  label: 'Year' },
];

export default function DashboardScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const groups = useStore(s => s.groups);
  const { flags } = useFeatureFlags();
  const [tab, setTab] = useState<TabKey>('month');
  // Once the user has any spend, keep the category card mounted across period
  // switches so it never collapses (a period with no spend shows an empty slot).
  const [everHadCats, setEverHadCats] = useState(false);
  const [catExpanded, setCatExpanded] = useState(false);
  const [showHealth, setShowHealth] = useState(false);
  const [hideAmounts, setHideAmounts] = useState(false);
  const [catchUpBanner, setCatchUpBanner] = useState<{ days: number; ruleCount: number } | null>(null);

  // Data load. Groups come from the store (StoreHydrator hydrates them at the root
  // and re-hydrates on every cross-screen write), so Home no longer queries/sets
  // them here. useScreenData owns loading/error/refreshing + focus/cross-screen refetch.
  const { data, loading, error, refreshing, onRefresh, reload } = useScreenData(
    (db) => loadHomeData(db, groups, tab, { forecast: flags.forecast, dashboardInsights: flags.dashboardInsights }),
    [groups, tab, flags.forecast, flags.dashboardInsights],
  );

  const personalGroupId = data?.personalGroupId ?? null;
  const meInfo = data?.meInfo ?? null;
  const spending = data?.spending ?? 0;
  const income = data?.income ?? 0;
  const prevSpending = data?.prevSpending ?? 0;
  const oweTotal = data?.oweTotal ?? 0;
  const owedTotal = data?.owedTotal ?? 0;
  const reviewCount = data?.reviewCount ?? 0;
  const budget = data?.budget ?? { allocated: 0, spent: 0 };
  const catRows = data?.catRows ?? [];
  const catTotal = data?.catTotal ?? 0;
  // Flag-gated here rather than at each use: nulling the result hides the ring in
  // HeroCard and the sheet it opens, in one place.
  const health = flags.healthScore ? (data?.health ?? null) : null;
  const healthInputs = flags.healthScore ? (data?.healthInputs ?? null) : null;
  const healthTxnCount = data?.healthTxnCount ?? 0;
  const upcoming = data?.upcoming ?? [];
  const forecast = data?.forecast ?? null;
  const topShift = data?.topShift ?? null;
  const streak = data?.streak ?? 0;
  const streakLoggedDays = data?.streakLoggedDays ?? new Set<string>();

  // Sticky: once any period has shown spend, keep the category card mounted across
  // period switches (preserves the prior `if (sorted.length > 0) setEverHadCats(true)`).
  useEffect(() => { if ((data?.catRows.length ?? 0) > 0) setEverHadCats(true); }, [data]);

  // On-focus maintenance, kept OUT of the data loader: read the hide-amounts
  // setting and run the recurring catch-up check (a maintenance WRITE, not a read).
  useFocusEffect(useCallback(() => {
    settings.hideAmounts().then(setHideAmounts);
    checkCatchUp();
  }, []));

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
            {reviewCount > 0 && (
              <TouchableOpacity onPress={() => router.push('/review')} hitSlop={8} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel={`Review ${reviewCount} imported transactions`}>
                <Feather name="inbox" size={18} color={colors.textSecondary} />
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{reviewCount > 9 ? '9+' : reviewCount}</Text>
                </View>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => router.push('/search')} hitSlop={8} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel="Search">
              <Feather name="search" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/reminders')} hitSlop={8} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel={`Reminders${upcoming.length > 0 ? `, ${upcoming.length} upcoming` : ''}`}>
              <Feather name="bell" size={18} color={colors.textSecondary} />
              {upcoming.length > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{upcoming.length > 9 ? '9+' : upcoming.length}</Text>
                </View>
              )}
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
        {error ? (
          <ErrorState
            title="Couldn't load your data"
            body="Something went wrong reading your data. It's safe on your device — try again."
            onRetry={() => reload()}
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
                  <TouchableOpacity onPress={() => router.push('/history')} accessibilityRole="button" style={styles.catchUpBtn}>
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
                  <TouchableOpacity style={styles.startTile} onPress={() => personalGroupId && router.push(`/group/${personalGroupId}/budget`)} accessibilityRole="button">
                    <View style={[styles.startIcon, { backgroundColor: alpha(colors.healthAmber, 13) }]}><Feather name="target" size={18} color={colors.healthAmber} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.startTitle}>Set a monthly budget</Text>
                      <Text style={styles.startSub}>Know your limits before you hit them</Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                  {/* Both first-run tiles are about splitting — pointless for someone
                      who told us they only track their own money. */}
                  {flags.splitting && (
                    <>
                      <TouchableOpacity style={styles.startTile} onPress={() => router.push('/groups')} accessibilityRole="button">
                        <View style={[styles.startIcon, { backgroundColor: alpha(colors.settle, 13) }]}><Feather name="users" size={18} color={colors.settle} /></View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.startTitle}>Create a group</Text>
                          <Text style={styles.startSub}>Flatmates, trips, or any shared tab</Text>
                        </View>
                        <Feather name="chevron-right" size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.startTile} onPress={() => router.push('/friends')} accessibilityRole="button">
                        <View style={[styles.startIcon, { backgroundColor: alpha(colors.income, 13) }]}><Feather name="user-plus" size={18} color={colors.income} /></View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.startTitle}>Add people you split with</Text>
                          <Text style={styles.startSub}>Name-only — no account needed</Text>
                        </View>
                        <Feather name="chevron-right" size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                    </>
                  )}
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
              <TabPills tabs={TABS} active={tab} onChange={(key) => { setTab(key as TabKey); setCatExpanded(false); }} />
            </View>

            {everHadCats && (
              <CategoryRankList
                rows={catRows}
                total={catTotal}
                topN={3}
                expanded={catExpanded}
                onPressCategory={(name) => router.push(`/category/${encodeURIComponent(name)}?period=${tab}`)}
                onMore={() => setCatExpanded(e => !e)}
              />
            )}

            {/* Settle-up sits below the bars. */}
            {flags.splitting && (oweTotal > 0 || owedTotal > 0) && (
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

      <HealthSheet
        visible={showHealth}
        onClose={() => setShowHealth(false)}
        result={health}
        inputs={healthInputs}
        txnCount={healthTxnCount}
        periodLabel={TXN_COUNT_PERIOD_LABEL[tab]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.lg },
  // Dedicated first-run empty home (design Screen 6)
  emptyHero: { backgroundColor: colors.bgCard, borderRadius: 20, paddingVertical: space.xl, paddingHorizontal: space.lg, marginBottom: space.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
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
  notifBadge: { position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, borderRadius: radius.sm, paddingHorizontal: space.xs, backgroundColor: colors.expense, alignItems: 'center', justifyContent: 'center', borderWidth: 0 },
  notifBadgeText: { fontSize: 9, lineHeight: 12, fontFamily: 'Inter_600SemiBold', color: colors.onAccent },
  tabRow: { marginBottom: space.md },
  catchUpBanner: { backgroundColor: alpha(colors.healthAmber, 9), borderRadius: 14, borderWidth: 1, borderColor: alpha(colors.healthAmber, 33), padding: space.md, gap: space.sm, marginBottom: space.sm },
  catchUpRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  catchUpTitle: { ...type.label, color: colors.healthAmber, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  catchUpText: { ...type.caption, color: colors.textSecondary, lineHeight: 17 },
  catchUpActions: { flexDirection: 'row', gap: space.sm },
  catchUpBtn: { paddingHorizontal: space.md, paddingVertical: space.xs, backgroundColor: alpha(colors.healthAmber, 20), borderRadius: 20, borderWidth: 1, borderColor: alpha(colors.healthAmber, 40) },
  catchUpBtnText: { ...type.label, color: colors.healthAmber, fontFamily: 'Inter_600SemiBold' },
  catchUpDismiss: { paddingHorizontal: space.md, paddingVertical: space.xs },
  catchUpDismissText: { ...type.label, color: colors.textMuted },
});
