import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useScreenData } from '../src/hooks/useScreenData';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';
import { getDate, getDaysInMonth, format } from 'date-fns';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout, shadow } from '../src/constants/layout';
import { categoryVisual } from '../src/constants/categories';
import { asFeather } from '../src/constants/palette';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { Badge } from '../src/components/ui/Badge';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ErrorState } from '../src/components/ui/ErrorState';
import { AppRefreshControl } from '../src/components/ui/AppRefreshControl';
import { InsightText } from '../src/components/finance/InsightText';
import { SampleNote } from '../src/components/finance/SampleNote';
import { recBg, recColor } from '../src/components/finance/group/helpers';

import type { Insight } from '../src/lib/savingsInsights';
import { formatCompact, formatCompactMajor, formatAxisShort } from '../src/lib/money';
import { loadInsightsData } from '../src/lib/insightsData';
import { useFeatureFlags } from '../src/components/system/FeatureFlagsProvider';
import { alpha } from '../src/theme';

function insightTint(tone: Insight['tone']): string {
  switch (tone) {
    case 'achieve': return colors.income;
    case 'warn': return colors.healthAmber;
    case 'progress': return colors.income;
    default: return colors.accent; // motivate, compare
  }
}

export default function InsightsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [cutPct, setCutPct] = useState(20);

  const { flags } = useFeatureFlags();

  const { data, loading, error: loadError, refreshing, onRefresh, reload } =
    useScreenData((db) => loadInsightsData(db, { savingsInsights: flags.savingsInsights }), [flags.savingsInsights]);

  const monthSpend = data?.monthSpend ?? 0;
  const txnCount = data?.txnCount ?? 0;
  const budget = data?.budget ?? 0;
  const projected = data?.projected ?? 0;
  const forecastActual = data?.forecastActual ?? [];
  const forecastProjected = data?.forecastProjected ?? [];
  const projectedTotal = data?.projectedTotal ?? 0;
  const shifts = data?.shifts ?? [];
  const whatIf = data?.whatIf ?? null;
  const recommendations = data?.recommendations ?? [];
  const drivers = data?.drivers ?? [];
  const savings = data?.savings ?? [];
  const multiGroup = data?.multiGroup ?? false;

  const today = new Date();
  const dayOfMonth = getDate(today);
  const daysInMonth = getDaysInMonth(today);
  const daysLeft = Math.max(0, daysInMonth - dayOfMonth);
  const overspend = budget > 0 && projected > budget;
  const pctUsed = budget > 0 ? Math.min(100, Math.round((monthSpend / budget) * 100)) : 0;
  const dailyAvg = dayOfMonth > 0 ? Math.round(monthSpend / dayOfMonth) : 0;
  const budgetPerDay = daysInMonth > 0 ? Math.round(budget / daysInMonth) : 0;
  const hasForecast = forecastActual.length >= 2 && forecastProjected.length >= 1;
  const nothingYet = !loading && !overspend && shifts.length === 0 && !whatIf
    && recommendations.length === 0 && drivers.length === 0 && savings.length === 0 && !hasForecast;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Insights"
        onBack={() => router.back()}
        right={<View style={styles.monthPill}><Text style={styles.monthPillText}>{format(today, 'MMMM')}</Text></View>}
      />
      {loadError ? (
        <ErrorState onRetry={reload} />
      ) : (
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + space.lg }]}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.eyebrow}>{format(today, 'MMMM yyyy')} · {dayOfMonth} days in</Text>

        {/* One note for the whole screen — velocity, forecast and what-if share the sample. */}
        {!loading && !nothingYet && (
          <SampleNote
            txnCount={txnCount}
            lowSampleHint="Projections below will sharpen as you log more."
          />
        )}

        {/* HERO — spending velocity (only when projected to overspend) */}
        {overspend && (
          <View style={styles.velocityCard}>
            <View style={styles.velocityHeader}>
              <View style={styles.velocityDot} />
              <Text style={styles.velocityLabel}>Spending velocity</Text>
            </View>
            <Text style={styles.velocityMsg}>
              At this pace you'll overspend by <Text style={{ color: colors.expense }}>{formatCompact(projected - budget)}</Text> by month-end
            </Text>
            <Text style={styles.velocitySub}>
              You're averaging {formatCompact(dailyAvg)}/day · budget allows {formatCompact(budgetPerDay)}/day
            </Text>
            <View style={styles.velocityBarRow}>
              <View style={styles.velocityLegend}>
                <Text style={styles.velocityLegendMuted}>₹0</Text>
                <Text style={[styles.velocityLegendMuted, { color: colors.expense }]}>Projected {formatCompact(projected)}</Text>
                <Text style={styles.velocityLegendMuted}>Budget {formatCompact(budget)}</Text>
              </View>
              <View style={styles.velocityBarTrack}>
                <View style={[styles.velocityBarFill, { width: `${Math.min(100, Math.round((budget / projected) * 100))}%` }]} />
              </View>
              <Text style={styles.velocityLegendMuted}>{pctUsed}% budget used · {daysLeft} days left</Text>
            </View>
            <TouchableOpacity style={styles.velocityCta} onPress={() => router.push('/personal')} accessibilityRole="button">
              <Text style={styles.velocityCtaText}>See what to cut</Text>
              <Feather name="chevron-right" size={12} color={colors.accent} />
            </TouchableOpacity>
          </View>
        )}

        {/* MONTH-END FORECAST — projection graph (moved from Reports) */}
        {hasForecast && (
          <>
            <Text style={styles.secLabel}>MONTH-END FORECAST</Text>
            <View style={styles.chartCard}>
              <View style={styles.forecastHeader}>
                <Text style={styles.forecastSub}>Solid = spent so far · dashed = projected to month-end</Text>
                <Badge label={formatCompactMajor(projectedTotal)} tone="accent" icon="trending-up" />
              </View>
              <LineChart
                data={forecastProjected}
                data2={forecastActual}
                color1={colors.accent}
                color2={colors.expense}
                thickness1={2}
                thickness2={2.5}
                strokeDashArray1={[5, 5]}
                noOfSections={4}
                maxValue={Math.ceil((Math.max(...forecastActual.map(d => d.value), ...forecastProjected.map(d => d.value), 1)) * 1.1)}
                spacing={Math.max(8, 300 / Math.max(forecastProjected.length, 1))}
                initialSpacing={8}
                endSpacing={8}
                xAxisThickness={0}
                yAxisThickness={0}
                yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
                formatYLabel={formatAxisShort}
                xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 9 }}
                hideRules
                isAnimated
                disableScroll
                pointerConfig={{
                  pointerStripUptoDataPoint: true,
                  pointerStripColor: alpha(colors.textMuted, 38),
                  pointerStripWidth: 1,
                  pointerColor: colors.accent,
                  radius: 5,
                  pointerLabelWidth: 76,
                  pointerLabelHeight: 32,
                  activatePointersOnLongPress: false,
                  autoAdjustPointerLabelPosition: true,
                  pointerLabelComponent: (items: Array<{ value: number }>) => {
                    const val = items[0]?.value ?? 0;
                    return (
                      <View style={{ backgroundColor: colors.bgCard, borderRadius: 6, paddingHorizontal: space.sm, paddingVertical: 5, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}>
                        <Text style={{ color: colors.textPrimary, fontFamily: 'SpaceMono_400Regular', fontSize: 11 }}>
                          {formatAxisShort(val)}
                        </Text>
                      </View>
                    );
                  },
                }}
              />
              <View style={styles.forecastLegend}>
                <View style={styles.forecastLegendItem}>
                  <View style={[styles.forecastLegendLine, { backgroundColor: colors.expense }]} />
                  <Text style={styles.forecastLegendText}>Actual</Text>
                </View>
                <View style={styles.forecastLegendItem}>
                  <View style={[styles.forecastLegendLine, { backgroundColor: colors.accent }]} />
                  <Text style={styles.forecastLegendText}>Projected</Text>
                </View>
              </View>
            </View>
          </>
        )}

        {/* RECOMMENDATIONS — aggregated across every group's budget */}
        {recommendations.length > 0 && (
          <>
            <Text style={styles.secLabel}>RECOMMENDATIONS</Text>
            <View style={styles.recList}>
              {recommendations.map(r => (
                <View key={r.key} style={[styles.recPill, { backgroundColor: recBg(r.severity) }]}>
                  <Feather name={asFeather(r.icon, 'info')} size={15} color={recColor(r.severity)} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.recText, { color: recColor(r.severity) }]}>{r.text}</Text>
                    {multiGroup && <Text style={styles.recGroup}>{r.group}</Text>}
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* DRIVING OVERSPEND — biggest over-budget categories across groups */}
        {drivers.length > 0 && (
          <>
            <Text style={styles.secLabel}>DRIVING OVERSPEND</Text>
            <View style={styles.secCard}>
              {drivers.map((d, i) => {
                const vis = categoryVisual(d.category);
                return (
                  <View key={d.key} style={[styles.driverRow, i < drivers.length - 1 && styles.rowBorder]}>
                    <View style={[styles.driverIcon, { backgroundColor: alpha(vis?.color ?? colors.accent, 13) }]}>
                      <Feather name={vis?.icon ?? 'tag'} size={14} color={vis?.color ?? colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.driverName} numberOfLines={1}>{d.category}</Text>
                      {multiGroup && <Text style={styles.driverGroup}>{d.group}</Text>}
                    </View>
                    <Text style={styles.driverOver}>{formatCompact(d.over)} over</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* SHIFTS VS LAST MONTH */}
        {shifts.length > 0 && (
          <>
            <Text style={styles.secLabel}>SHIFTS VS LAST MONTH</Text>
            <View style={styles.secCard}>
              {shifts.map((s, i) => {
                const vis = categoryVisual(s.cat);
                const up = s.pct > 5, down = s.pct < -5;
                return (
                  <View key={s.cat} style={[styles.shiftRow, i < shifts.length - 1 && styles.rowBorder]}>
                    <View style={[styles.shiftEmoji, { backgroundColor: alpha(vis?.color ?? colors.accent, 13) }]}>
                      <Feather name={vis?.icon ?? 'tag'} size={16} color={vis?.color ?? colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.shiftCat}>{s.cat}</Text>
                      <Text style={styles.shiftAmt}>{formatCompact(s.thisAmt)} this month</Text>
                    </View>
                    <View style={[styles.shiftBadge, { backgroundColor: up ? colors.expenseTint : down ? colors.incomeTint : colors.bgCard, borderColor: colors.border, borderWidth: 1 }]}>
                      {up && <Feather name="arrow-up" size={10} color={colors.expense} />}
                      {down && <Feather name="arrow-down" size={10} color={colors.income} />}
                      <Text style={[styles.shiftBadgeText, { color: up ? colors.expense : down ? colors.income : colors.textMuted }]}>
                        {up ? `+${s.pct}%` : down ? `${s.pct}%` : '~same'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* WHAT IF — cut the top category and see the saving */}
        {whatIf && whatIf.monthly > 0 && (
          <>
            <Text style={styles.secLabel}>WHAT IF…</Text>
            <View style={[styles.secCard, { padding: space.md }]}>
              <Text style={styles.whatIfLead}>
                Cut <Text style={{ color: colors.accent, fontFamily: 'Inter_600SemiBold' }}>{whatIf.name}</Text> by
              </Text>
              <View style={styles.whatIfChips}>
                {[10, 20, 30].map(p => (
                  <TouchableOpacity key={p} style={[styles.whatIfChip, cutPct === p && styles.whatIfChipActive]} onPress={() => setCutPct(p)} accessibilityRole="button" accessibilityState={{ selected: cutPct === p }}>
                    <Text style={[styles.whatIfChipText, cutPct === p && { color: colors.bg }]}>{p}%</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.whatIfSave}>
                You'd save <Text style={{ color: colors.income, fontFamily: 'Inter_600SemiBold' }}>{formatCompact(Math.round((whatIf.monthly * cutPct) / 100))}</Text>/mo
              </Text>
              <Text style={styles.whatIfYear}>≈ {formatCompact(Math.round((whatIf.monthly * cutPct) / 100) * 12)} a year</Text>
            </View>
          </>
        )}

        {/* SAVINGS — opportunity-cost / habit nudges (moved from the Plan tab) */}
        {savings.length > 0 && (
          <>
            <Text style={styles.secLabel}>SAVINGS</Text>
            <View style={[styles.secCard, { paddingHorizontal: space.md }]}>
              {savings.map((ins, i) => {
                const tint = insightTint(ins.tone);
                return (
                  <View key={ins.text} style={[styles.savingsRow, i > 0 && styles.rowBorder]}>
                    <View style={[styles.savingsIcon, { backgroundColor: alpha(tint, 13) }]}>
                      <Feather name={asFeather(ins.icon, 'info')} size={14} color={tint} />
                    </View>
                    <InsightText text={ins.text} color={tint} style={styles.savingsText} />
                  </View>
                );
              })}
            </View>
          </>
        )}

        {nothingYet && (
          <EmptyState
            icon="bar-chart-2"
            title="No insights yet"
            body="Log a few expenses and split with a group — patterns, alerts, and balances show up here."
            tint={colors.textSecondary}
          />
        )}
      </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.sm },
  monthPill: { backgroundColor: colors.bgMuted, borderRadius: 100, paddingVertical: 7, paddingHorizontal: 14 },
  monthPillText: { fontSize: 12, color: colors.textSecondary, fontFamily: 'Inter_400Regular' },
  eyebrow: { fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Inter_600SemiBold', marginBottom: space.xs },

  velocityCard: { backgroundColor: colors.expenseTintDeep, borderRadius: 18, padding: 18, borderWidth: 1.5, borderColor: colors.expenseTintStrong },
  velocityHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 10 },
  velocityDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.expense },
  velocityLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: colors.expense, textTransform: 'uppercase', letterSpacing: 0.8 },
  velocityMsg: { fontSize: 17, fontFamily: 'Inter_600SemiBold', color: colors.textPrimary, letterSpacing: -0.3, marginBottom: 6, lineHeight: 23 },
  velocitySub: { fontSize: 12, color: colors.textSecondary, lineHeight: 18, marginBottom: 14 },
  velocityBarRow: { marginBottom: 12, gap: 5 },
  velocityLegend: { flexDirection: 'row', justifyContent: 'space-between' },
  velocityLegendMuted: { fontSize: 10, color: colors.textMuted },
  velocityBarTrack: { height: 6, backgroundColor: colors.bgMuted, borderRadius: 3, overflow: 'hidden' },
  velocityBarFill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  velocityCta: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.bgCard, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.border },
  velocityCtaText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textPrimary },

  secLabel: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Inter_600SemiBold', marginBottom: space.sm, marginTop: space.xs },
  whatIfLead: { ...type.body, color: colors.textSecondary, marginBottom: space.sm },
  whatIfChips: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  whatIfChip: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: colors.bgMuted },
  whatIfChipActive: { backgroundColor: colors.accent },
  whatIfChipText: { ...type.label, color: colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
  whatIfSave: { ...type.body, color: colors.textPrimary },
  whatIfYear: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  secCard: { backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },

  // Month-end forecast graph
  chartCard: { backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm, ...shadow.sm },
  forecastHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  forecastSub: { ...type.caption, color: colors.textMuted, flex: 1 },
  forecastLegend: { flexDirection: 'row', gap: space.lg, marginTop: space.sm },
  forecastLegendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  forecastLegendLine: { width: 16, height: 3, borderRadius: 2 },
  forecastLegendText: { ...type.caption, color: colors.textMuted },

  // Recommendations (aggregated from every group's budget)
  recList: { gap: space.sm, marginBottom: space.xs },
  recPill: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, padding: space.md, borderRadius: radius.md },
  recText: { ...type.label, lineHeight: 18 },
  recGroup: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  // Driving overspend
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: 11 },
  driverIcon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  driverName: { ...type.body, color: colors.textPrimary },
  driverGroup: { ...type.caption, color: colors.textMuted, marginTop: 1 },
  driverOver: { ...type.label, color: colors.expense, fontFamily: 'Inter_600SemiBold' },

  // Savings nudges
  savingsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingVertical: space.md },
  savingsIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  savingsText: { ...type.body, color: colors.textSecondary, flex: 1, lineHeight: 20 },
  shiftRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.md, paddingVertical: 11 },
  shiftEmoji: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  shiftCat: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.textPrimary },
  shiftAmt: { fontSize: 11, color: colors.textMuted },
  shiftBadge: { flexDirection: 'row', alignItems: 'center', gap: space.xs, borderRadius: 6, paddingHorizontal: space.sm, paddingVertical: 3 },
  shiftBadgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

});
