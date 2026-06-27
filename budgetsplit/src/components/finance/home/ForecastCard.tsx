import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../../tokens';
import { formatCompact } from '../../../lib/money';
import { categoryVisual } from '../../../constants/categories';

export type ForecastShift = { cat: string; thisAmt: number; pct: number };

type Props = {
  /** Projected month-end spend (paise). */
  projected: number;
  /** Monthly budget allocated (paise); 0 = no budget set. */
  budget: number;
  /** Spend so far this month (paise). */
  spentSoFar: number;
  dayOfMonth: number;
  daysInMonth: number;
  /** Biggest category shift vs last month — teaser. Omit to hide. */
  topShift?: ForecastShift | null;
  /** Mask amounts when the user has hidden balances. */
  obfuscate?: boolean;
  onPressInsights: () => void;
};

/**
 * Dashboard month-end forecast: projected spend vs budget with a pace bar,
 * plus an optional "biggest shift vs last month" teaser linking to Insights.
 */
export function ForecastCard({
  projected, budget, spentSoFar, dayOfMonth, daysInMonth, topShift, obfuscate, onPressInsights,
}: Props) {
  const mask = (paise: number) => (obfuscate ? '••••' : formatCompact(paise));

  const hasBudget = budget > 0;
  const over = hasBudget && projected > budget;
  const delta = projected - budget;
  const daysLeft = Math.max(0, daysInMonth - dayOfMonth);
  const dailyAvg = dayOfMonth > 0 ? Math.round(spentSoFar / dayOfMonth) : 0;
  const budgetPerDay = hasBudget && daysInMonth > 0 ? Math.round(budget / daysInMonth) : 0;

  // Bar scaled to the larger of projected/budget; fill = projected, marker = budget.
  const denom = Math.max(projected, budget, 1);
  const projFrac = Math.min(100, Math.round((projected / denom) * 100));
  const budgetFrac = hasBudget ? Math.min(100, Math.round((budget / denom) * 100)) : 0;
  const barColor = over ? colors.expense : colors.income;

  const statusText = !hasBudget
    ? `${mask(projected)} projected by month-end`
    : over
    ? `Over budget by ${mask(delta)}`
    : `${mask(Math.abs(delta))} to spare`;
  const statusColor = !hasBudget ? colors.textSecondary : over ? colors.expense : colors.income;

  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <Text style={styles.label}>Month-end forecast</Text>
        <Text style={styles.daysLeft}>{daysLeft} {daysLeft === 1 ? 'day' : 'days'} left</Text>
      </View>

      <View style={styles.projRow}>
        <Text style={styles.projAmount}>{mask(projected)}</Text>
        <Text style={[styles.status, { color: statusColor }]} numberOfLines={1}>{statusText}</Text>
      </View>

      {/* Pace bar: projected fill + budget threshold marker */}
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${projFrac}%`, backgroundColor: barColor }]} />
        {hasBudget && budgetFrac > 0 && budgetFrac < 100 && (
          <View style={[styles.marker, { left: `${budgetFrac}%` }]} />
        )}
      </View>
      <View style={styles.legendRow}>
        <Text style={styles.legend}>Spent {mask(spentSoFar)}</Text>
        {hasBudget
          ? <Text style={styles.legend}>{mask(dailyAvg)}/day · budget {mask(budgetPerDay)}/day</Text>
          : <Text style={styles.legend}>{mask(dailyAvg)}/day</Text>}
      </View>

      {/* Biggest shift teaser + link to full Insights */}
      {topShift && (() => {
        const vis = categoryVisual(topShift.cat);
        const up = topShift.pct > 5, down = topShift.pct < -5;
        return (
          <>
            <View style={styles.divider} />
            <Text style={styles.shiftLabel}>BIGGEST SHIFT VS LAST MONTH</Text>
            <View style={styles.shiftRow}>
              <View style={[styles.shiftIcon, { backgroundColor: (vis?.color ?? colors.accent) + '22' }]}>
                <Feather name={vis?.icon ?? 'tag'} size={15} color={vis?.color ?? colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.shiftCat} numberOfLines={1}>{topShift.cat}</Text>
                <Text style={styles.shiftAmt}>{mask(topShift.thisAmt)} this month</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: up ? '#2A1714' : down ? '#081F16' : colors.bgCard }]}>
                {up && <Feather name="arrow-up" size={10} color={colors.expense} />}
                {down && <Feather name="arrow-down" size={10} color={colors.income} />}
                <Text style={[styles.badgeText, { color: up ? colors.expense : down ? colors.income : colors.textMuted }]}>
                  {up ? `+${topShift.pct}%` : down ? `${topShift.pct}%` : '~same'}
                </Text>
              </View>
            </View>
          </>
        );
      })()}

      <TouchableOpacity style={styles.link} onPress={onPressInsights} accessibilityRole="button" accessibilityLabel="See all insights">
        <Text style={styles.linkText}>See all insights</Text>
        <Feather name="chevron-right" size={14} color={colors.accent} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginBottom: space.md,
  },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  label: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Inter_600SemiBold' },
  daysLeft: { ...type.caption, color: colors.textMuted },

  projRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm, marginBottom: space.sm },
  projAmount: { fontFamily: 'SpaceMono_400Regular', fontSize: 24, color: colors.textPrimary, letterSpacing: -0.3 },
  status: { ...type.label, fontFamily: 'Inter_600SemiBold', flexShrink: 1, textAlign: 'right' },

  track: { height: 8, borderRadius: 4, backgroundColor: colors.bgMuted, overflow: 'hidden', position: 'relative' },
  fill: { height: '100%', borderRadius: 4 },
  marker: { position: 'absolute', top: -2, width: 2, height: 12, backgroundColor: colors.textSecondary, borderRadius: 1 },
  legendRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  legend: { ...type.caption, color: colors.textMuted },

  divider: { height: 1, backgroundColor: colors.border, marginVertical: space.md },
  shiftLabel: { ...type.caption, color: colors.textMuted, letterSpacing: 0.6, fontFamily: 'Inter_600SemiBold', marginBottom: space.sm },
  shiftRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  shiftIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  shiftCat: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  shiftAmt: { ...type.caption, color: colors.textMuted, marginTop: 1 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  badgeText: { ...type.caption, fontFamily: 'Inter_600SemiBold' },

  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: space.md, paddingTop: space.sm },
  linkText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
});
