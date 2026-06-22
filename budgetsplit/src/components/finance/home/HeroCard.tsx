import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, shadow } from '../../tokens';
import { AmountText } from '../../ui/AmountText';
import { formatCompact } from '../../../lib/money';

type Props = {
  /** My spend (paise) for the active period. */
  spent: number;
  /** UPPERCASE label e.g. "SPENT THIS MONTH". */
  periodLabel: string;
  /** Rolled-up budget for the period; 0 when none is set. */
  budgetAllocated: number;
  budgetSpent: number;
  /** Prior-period spend + its label, for the delta row when no budget exists. */
  prevSpending: number;
  prevLabel: string;
};

/**
 * The single hero of Home — answers "am I on pace this month?". One XL number.
 * Pace bar + "X% · ₹Y left" appear only when a budget is set (deviation D7);
 * otherwise a period-over-period delta row.
 */
export function HeroCard({ spent, periodLabel, budgetAllocated, budgetSpent, prevSpending, prevLabel }: Props) {
  const hasBudget = budgetAllocated > 0;
  const util = hasBudget ? Math.round((budgetSpent / budgetAllocated) * 100) : 0;
  const left = budgetAllocated - budgetSpent;
  const paceColor = util >= 100 ? colors.expense : util >= 80 ? colors.healthAmber : colors.income;
  const barPct = Math.min(100, Math.max(0, util));

  const delta = spent - prevSpending;
  const deltaPct = prevSpending > 0 ? Math.round((delta / prevSpending) * 100) : null;
  const up = delta > 0;
  const deltaColor = delta === 0 ? colors.textMuted : up ? colors.expense : colors.income;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{periodLabel}</Text>
      <AmountText paise={spent} size="xl" forceColor={colors.textPrimary} compact zeroDash />

      {hasBudget ? (
        <>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${barPct}%`, backgroundColor: paceColor }]} />
          </View>
          <View style={styles.paceRow}>
            <View style={styles.paceLeft}>
              <View style={[styles.dot, { backgroundColor: paceColor }]} />
              <Text style={[styles.paceText, { color: paceColor }]}>
                {util >= 100 ? 'Over budget' : 'On pace'} · {util}%
              </Text>
            </View>
            <Text style={styles.paceSub}>
              {left >= 0 ? `${formatCompact(left)} left` : `${formatCompact(-left)} over`}
            </Text>
          </View>
        </>
      ) : (spent > 0 || prevSpending > 0) ? (
        <View style={styles.deltaRow}>
          <Feather name={delta === 0 ? 'minus' : up ? 'arrow-up-right' : 'arrow-down-right'} size={13} color={deltaColor} />
          <Text style={[styles.deltaText, { color: deltaColor }]}>
            {deltaPct === null ? formatCompact(Math.abs(delta)) : `${Math.abs(deltaPct)}%`} vs {prevLabel}
          </Text>
        </View>
      ) : (
        <Text style={styles.empty}>Nothing logged yet this period</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.lg, marginBottom: space.md, borderWidth: 1, borderColor: colors.border, ...shadow.md },
  label: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: space.sm, fontFamily: 'Inter_600SemiBold' },
  track: { height: 4, backgroundColor: colors.bgElevated, borderRadius: 2, marginTop: space.md, marginBottom: space.sm },
  fill: { height: 4, borderRadius: 2 },
  paceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  paceLeft: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  paceText: { ...type.label, fontFamily: 'Inter_600SemiBold' },
  paceSub: { ...type.label, color: colors.textMuted },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: space.sm },
  deltaText: { ...type.label },
  empty: { ...type.caption, color: colors.textMuted, marginTop: space.sm },
});
