import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { getDate, getDaysInMonth } from 'date-fns';
import { colors } from '../../../src/constants/colors';
import { type } from '../../../src/constants/typography';
import { space, radius, layout, shadow } from '../../../src/constants/layout';
import { ScreenHeader } from '../../../src/components/ui/ScreenHeader';
import { BudgetBar } from '../../../src/components/finance/BudgetBar';
import { AmountText } from '../../../src/components/ui/AmountText';
import { Badge } from '../../../src/components/ui/Badge';
import { PressableScale } from '../../../src/components/ui/PressableScale';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../../src/components/ui/Skeleton';
import { getBudgetAnalytics, type BudgetAnalytics, type CategoryTrend } from '../../../src/lib/analytics';
import { getGroupById } from '../../../src/db/queries/groups';
import { categoryVisual } from '../../../src/constants/categories';
import { formatRupees } from '../../../src/lib/money';

export default function BudgetInsightsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [groupName, setGroupName] = useState('');
  const [analytics, setAnalytics] = useState<BudgetAnalytics | null>(null);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const group = await getGroupById(db, id);
      if (group) setGroupName(group.name);
      if (!group) { setLoading(false); return; }
      const a = await getBudgetAnalytics(db, group);
      setAnalytics(a);
      setLoading(false);
    })();
  }, [db, id]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Budget & Insights" onBack={() => router.back()} />
        <ScrollView style={styles.scroll}>
          <SkeletonCard height={120} />
          <SkeletonCard height={120} />
          <SkeletonCard height={180} />
        </ScrollView>
      </View>
    );
  }

  if (!analytics) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Budget & Insights" onBack={() => router.back()} />
        <EmptyState icon="pie-chart" title="No data yet" body="Add a budget to see insights." />
      </View>
    );
  }

  const health = analytics.utilizationPct !== null && analytics.utilizationPct <= 100 ? 'good'
    : analytics.overBudget.length > 0 ? 'warn' : 'info';

  const now = new Date();
  const dayOfMonth = getDate(now);
  const daysInMonth = getDaysInMonth(now);
  const projDelta = analytics.projectedMonthEnd - analytics.monthlyBudgetTotal;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Budget & Insights" onBack={() => router.back()} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Budget utilization hero */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Budget Utilization</Text>
          <View style={styles.heroRow}>
            <Text style={[styles.heroPercent, { color: health === 'good' ? colors.income : health === 'warn' ? colors.expense : colors.accent }]}>
              {analytics.utilizationPct !== null ? `${Math.round(analytics.utilizationPct)}%` : '—'}
            </Text>
            <View style={{ flex: 1 }}>
              <BudgetBar allocated={analytics.totalAllocated} spent={analytics.totalSpent} height={8} />
            </View>
          </View>
          <View style={styles.heroRow}>
            <View>
              <Text style={styles.heroSub}>Spent</Text>
              <AmountText paise={analytics.totalSpent} size="sm" compact />
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.heroSub}>Remaining</Text>
              <AmountText paise={analytics.remaining} size="sm" forceColor={analytics.remaining >= 0 ? colors.income : colors.expense} compact />
            </View>
          </View>
          {/* Status badges */}
          <View style={styles.badgeRow}>
            {analytics.overBudget.length > 0 && (
              <Badge label={`${analytics.overBudget.length} over`} tone="expense" icon="alert-triangle" />
            )}
            {analytics.nearLimit.length > 0 && (
              <Badge label={`${analytics.nearLimit.length} near`} tone="amber" icon="clock" />
            )}
            {analytics.onTrackCount > 0 && (
              <Badge label={`${analytics.onTrackCount} on track`} tone="income" icon="check" />
            )}
          </View>
        </View>

        {/* Projection card */}
        {analytics.projectedMonthEnd > 0 && analytics.monthlyBudgetTotal > 0 && (
          <View style={styles.projectionCard}>
            <View style={styles.projectionIcon}>
              <Feather name="trending-up" size={22} color={projDelta > 0 ? colors.expense : colors.income} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.projectionTitle}>Projected month-end {formatRupees(analytics.projectedMonthEnd)}</Text>
              <Text style={styles.projectionSub}>
                Day {dayOfMonth} of {daysInMonth} ·{' '}
                {projDelta > 0
                  ? `${formatRupees(projDelta)} over budget at this pace`
                  : projDelta < 0
                  ? `${formatRupees(-projDelta)} under budget at this pace`
                  : 'right on budget at this pace'}
              </Text>
            </View>
          </View>
        )}

        {/* Needs attention */}
        {(analytics.overBudget.length > 0 || analytics.nearLimit.length > 0) && (
          <View>
            <Text style={styles.sectionTitle}>Needs attention</Text>
            {analytics.overBudget.map(cat => (
              <CategoryBudgetRow key={cat.category} trend={cat} isOver />
            ))}
            {analytics.nearLimit.map(cat => (
              <CategoryBudgetRow key={cat.category} trend={cat} />
            ))}
          </View>
        )}

        {/* On track */}
        {analytics.onTrackCount > 0 && (
          <View>
            <Text style={styles.sectionTitle}>On track</Text>
            <Text style={styles.onTrackText}>{analytics.onTrackCount} categories within budget</Text>
          </View>
        )}

        {/* Top movers */}
        {(analytics.biggestIncrease || analytics.biggestDecrease) && (
          <View>
            <Text style={styles.sectionTitle}>Trends</Text>
            {analytics.biggestIncrease && (
              <View style={styles.trendCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs }}>
                  <Feather name="trending-up" size={16} color={colors.expense} />
                  <Text style={styles.trendLabel}>Biggest increase</Text>
                </View>
                <Text style={styles.trendCategory}>{analytics.biggestIncrease.category}</Text>
                <Text style={styles.trendDelta}>{analytics.biggestIncrease.deltaPct !== null ? `+${Math.round(analytics.biggestIncrease.deltaPct)}% vs last month` : '—'}</Text>
              </View>
            )}
            {analytics.biggestDecrease && (
              <View style={styles.trendCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs }}>
                  <Feather name="trending-down" size={16} color={colors.income} />
                  <Text style={styles.trendLabel}>Biggest decrease</Text>
                </View>
                <Text style={styles.trendCategory}>{analytics.biggestDecrease.category}</Text>
                <Text style={styles.trendDelta}>{analytics.biggestDecrease.deltaPct !== null ? `${Math.round(analytics.biggestDecrease.deltaPct)}% vs last month` : '—'}</Text>
              </View>
            )}
          </View>
        )}

        {/* Recommendations */}
        {analytics.overBudget.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Recommendations</Text>
            {analytics.overBudget.slice(0, 3).map(cat => (
              <View key={cat.category} style={styles.recoRow}>
                <View style={styles.recoIcon}>
                  <Feather name="alert-circle" size={14} color={colors.healthAmber} />
                </View>
                <Text style={styles.recoText}>Consider reducing {cat.category} spending — currently {cat.pct !== null ? `${Math.round(cat.pct)}%` : 'over'} of budget</Text>
              </View>
            ))}
          </View>
        )}

        {/* All categories */}
        {analytics.topCategories.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>All Categories</Text>
            {analytics.topCategories.map(cat => {
              const visual = categoryVisual(cat.category);
              return (
                <PressableScale
                  key={cat.category}
                  style={styles.catRow}
                  onPress={() => router.push(`/category/${encodeURIComponent(cat.category)}` as any)}
                >
                  <View style={[styles.catDotSmall, { backgroundColor: visual.color + '22' }]}>
                    <Feather name={visual.icon} size={13} color={visual.color} />
                  </View>
                  <Text style={styles.catName}>{cat.category}</Text>
                  <Text style={styles.catAmount}>{formatRupees(cat.spent)}</Text>
                </PressableScale>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function CategoryBudgetRow({ trend, isOver }: { trend: CategoryTrend; isOver?: boolean }) {
  const visual = categoryVisual(trend.category);
  return (
    <View style={styles.catBudgetCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.sm }}>
        <View style={[styles.catDot, { backgroundColor: visual.color + '22' }]}>
          <Feather name={visual.icon} size={16} color={visual.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.catName}>{trend.category}</Text>
          {isOver && <Text style={{ ...type.caption, color: colors.expense }}>Over budget</Text>}
        </View>
      </View>
      <BudgetBar allocated={trend.allocated} spent={trend.spent} height={5} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xs }}>
        <Text style={styles.budgetSub}>
          {trend.pct !== null ? `${Math.round(trend.pct)}% used` : 'No budget'}
        </Text>
        <Text style={styles.budgetSub}>
          {trend.remaining >= 0 ? `${formatRupees(trend.remaining)} left` : `over by ${formatRupees(Math.abs(trend.remaining))}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: { padding: layout.screenPaddingH, gap: space.md, paddingBottom: space.lg },
  heroCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: colors.border, gap: space.md, ...shadow.md },
  heroLabel: { ...type.label, color: colors.textSecondary },
  heroPercent: { fontFamily: 'SpaceMono_400Regular', fontSize: 44, letterSpacing: -1 },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  heroSub: { ...type.caption, color: colors.textMuted, marginBottom: 4 },
  badgeRow: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  projectionCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  projectionIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  projectionTitle: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  projectionSub: { ...type.caption, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
  sectionTitle: { ...type.subheading, color: colors.textPrimary, marginTop: space.sm },
  onTrackText: { ...type.body, color: colors.income, marginTop: space.xs },
  trendCard: { backgroundColor: colors.bgCard, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border, marginTop: space.xs },
  trendLabel: { ...type.label, color: colors.textSecondary },
  trendCategory: { ...type.subheading, color: colors.textPrimary },
  trendDelta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  catBudgetCard: { backgroundColor: colors.bgCard, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border, marginTop: space.xs },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  catDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  catDotSmall: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  catName: { ...type.body, color: colors.textPrimary, flex: 1 },
  catAmount: { fontFamily: 'SpaceMono_400Regular', fontSize: 12, color: colors.textPrimary },
  budgetSub: { ...type.caption, color: colors.textMuted },
  recoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: space.sm },
  recoIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.healthAmber + '22', alignItems: 'center', justifyContent: 'center' },
  recoText: { ...type.body, color: colors.textSecondary, flex: 1, lineHeight: 22 },
});
