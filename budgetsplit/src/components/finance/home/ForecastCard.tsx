import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../../tokens';
import { formatCompact } from '../../../lib/money';
import { categoryVisual } from '../../../constants/categories';
import { alpha } from '../../../theme';

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
  /** Consecutive logging streak. Omit or `<3` to hide the streak block. */
  streakDays?: number;
  /** ISO date strings the user has logged this month, for the dot row. */
  streakLoggedDays?: Set<string>;
  /** Mask amounts when the user has hidden balances. */
  obfuscate?: boolean;
  onPressInsights: () => void;
};

/**
 * "This month" tile — a single consolidated dashboard card that unifies
 * three signals that were previously three separate cards, reducing the
 * dashboard's vertical footprint:
 *   1. Month-end forecast + pace bar (was ForecastCard)
 *   2. Biggest category shift vs last month (was inside ForecastCard, but
 *      now uses SectionLabel-style eyebrows for consistency).
 *   3. Optional tracking-streak row (was the separate StreakCard).
 *
 * Each block is independent — hidden when there's nothing meaningful to
 * say — so the card gracefully collapses to just the essentials on quiet
 * months.
 */
export function ForecastCard({
  projected, budget, spentSoFar, dayOfMonth, daysInMonth, topShift,
  streakDays, streakLoggedDays, obfuscate, onPressInsights,
}: Props) {
  const mask = (paise: number) => (obfuscate ? '••••' : formatCompact(paise));

  const hasBudget = budget > 0;
  const over = hasBudget && projected > budget;
  const delta = projected - budget;
  const daysLeft = Math.max(0, daysInMonth - dayOfMonth);
  const dailyAvg = dayOfMonth > 0 ? Math.round(spentSoFar / dayOfMonth) : 0;
  const budgetPerDay = hasBudget && daysInMonth > 0 ? Math.round(budget / daysInMonth) : 0;

  const denom = Math.max(projected, budget, 1);
  const projFrac = Math.min(100, Math.round((projected / denom) * 100));
  const budgetFrac = hasBudget ? Math.min(100, Math.round((budget / denom) * 100)) : 0;
  const barColor = over ? colors.expense : colors.income;

  const statusText = !hasBudget
    ? 'projected by month-end'
    : over
    ? `over budget by ${mask(delta)}`
    : `${mask(Math.abs(delta))} to spare`;
  const statusColor = !hasBudget ? colors.textSecondary : over ? colors.expense : colors.income;

  const showStreak = streakDays != null && streakDays >= 3 && streakLoggedDays;

  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <Text style={styles.label}>This month</Text>
        <View style={styles.daysPill}>
          <Feather name="clock" size={11} color={colors.textSecondary} />
          <Text style={styles.daysLeft}>{daysLeft} {daysLeft === 1 ? 'day' : 'days'} left</Text>
        </View>
      </View>

      <View style={styles.projRow}>
        <Text style={styles.projAmount}>{mask(projected)}</Text>
        <Text style={[styles.status, { color: statusColor }]} numberOfLines={1}>{statusText}</Text>
      </View>

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

      {topShift && (() => {
        const vis = categoryVisual(topShift.cat);
        const up = topShift.pct > 5, down = topShift.pct < -5;
        return (
          <>
            <View style={styles.divider} />
            <Text style={styles.eyebrow}>Biggest shift vs last month</Text>
            <View style={styles.shiftRow}>
              <View style={[styles.shiftIcon, { backgroundColor: alpha(vis?.color ?? colors.accent, 13) }]}>
                <Feather name={vis?.icon ?? 'tag'} size={15} color={vis?.color ?? colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.shiftCat} numberOfLines={1}>{topShift.cat}</Text>
                <Text style={styles.shiftAmt}>{mask(topShift.thisAmt)} this month</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: up ? colors.expenseTint : down ? colors.incomeTint : colors.bgCard }]}>
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

      {showStreak && (() => {
        const now = new Date();
        const yr = now.getFullYear();
        const mo = now.getMonth();
        return (
          <>
            <View style={styles.divider} />
            <Text style={styles.eyebrow}>Tracking streak</Text>
            <View style={styles.streakRow}>
              <View style={styles.streakBadge}>
                <Text style={styles.streakFire}>🔥</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.streakHeadline}>{streakDays}-day streak</Text>
                <Text style={styles.streakSub}>Every day this month, so far.</Text>
              </View>
            </View>
            <View style={styles.streakDots}>
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayDate = new Date(yr, mo, i + 1);
                const key = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
                const future = dayDate > now;
                const logged = streakLoggedDays!.has(key);
                return (
                  <View
                    key={i}
                    style={[
                      styles.streakDot,
                      future ? styles.streakDotFuture : logged ? styles.streakDotLogged : styles.streakDotMissed,
                    ]}
                  />
                );
              })}
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
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginBottom: space.md,
  },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  label: { ...type.subheading, color: colors.textPrimary },
  daysPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.bgMuted, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  daysLeft: { ...type.caption, color: colors.textSecondary, fontFamily: 'Inter_600SemiBold' },

  projRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm, marginBottom: space.sm },
  projAmount: { ...type.amountLG, color: colors.textPrimary },
  status: { ...type.label, fontFamily: 'Inter_600SemiBold', flexShrink: 1, textAlign: 'right' },

  track: { height: 8, borderRadius: 4, backgroundColor: colors.bgMuted, overflow: 'hidden', position: 'relative' },
  fill: { height: '100%', borderRadius: 4 },
  marker: { position: 'absolute', top: -2, width: 2, height: 12, backgroundColor: colors.textSecondary, borderRadius: 1 },
  legendRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  legend: { ...type.caption, color: colors.textMuted },

  divider: { height: 1, backgroundColor: colors.divider, marginVertical: space.md },
  eyebrow: { ...type.overline, color: colors.textMuted, marginBottom: space.sm },

  shiftRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  shiftIcon: { width: 32, height: 32, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  shiftCat: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  shiftAmt: { ...type.caption, color: colors.textMuted, marginTop: 1 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  badgeText: { ...type.caption, fontFamily: 'Inter_600SemiBold' },

  streakRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  streakBadge: { width: 32, height: 32, borderRadius: radius.md, backgroundColor: colors.expenseTint, borderWidth: 1, borderColor: colors.expenseTintStrong, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  streakFire: { fontSize: 16, lineHeight: 20 },
  streakHeadline: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  streakSub: { ...type.caption, color: colors.textMuted, marginTop: 1 },
  streakDots: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  streakDot: { width: 8, height: 8, borderRadius: 2 },
  streakDotLogged: { backgroundColor: colors.streakFlame },
  streakDotMissed: { backgroundColor: colors.streakFlame, opacity: 0.2 },
  streakDotFuture: { backgroundColor: colors.bgMuted },

  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, marginTop: space.md, paddingTop: space.sm },
  linkText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
});
