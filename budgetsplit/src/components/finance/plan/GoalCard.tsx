import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { monthShort } from '../../../lib/dateFormat';
import { colors, type, space, radius, shadow } from '../../tokens';
import { asFeather } from '../../../constants/palette';
import { formatCompact } from '../../../lib/money';
import { goalProgress, monthlyContribution, neededPerMonth } from '../../../lib/savings';
import { PressableScale } from '../../ui/PressableScale';
import { BudgetBar } from '../BudgetBar';
import type { SavingsGoal } from '../../../db/queries/savings';
import { alpha } from '../../../theme';

/**
 * One savings goal row on the Plan tab. Presentational — derives its own
 * progress/contribution figures from (goal, saved); the parent owns the goal
 * list, drag state and navigation. Extracted from app/(tabs)/savings.tsx.
 */
export function GoalCard({
  goal: g,
  saved,
  isActive,
  onPress,
  /** Reached its target — renders the distinct completed style (no drag, green accents). */
  completed = false,
  /** Quick-fund this goal directly from cash. When set (and not completed), shows a + button. */
  onAdd,
}: {
  goal: SavingsGoal;
  saved: number;
  isActive: boolean;
  onPress: () => void;
  completed?: boolean;
  onAdd?: () => void;
}) {
  const p = goalProgress(saved, g.target);
  const hasDate = g.target_date != null;
  const monthly = monthlyContribution(g.allocation, g.frequency);
  const needed = hasDate ? neededPerMonth(p.remaining, g.target_date!) : 0;
  /** Funding this goal on schedule needs more per month than it is set to put in. */
  const behind = !completed && hasDate && needed > monthly;

  /*
   * One figure and one context line.
   *
   * The card used to state the same progress five ways — `₹12K / ₹50K`, the bar,
   * `24%`, `₹38K to go`, and `₹9.5K/mo needed` on their own rows. The bar already
   * carries proportion, so the ratio and the percent were the bar written out in
   * words; what is left is the number you act on, plus the schedule that decides
   * whether you are on track.
   */
  const headline = completed
    ? `${formatCompact(p.saved)} saved`
    : p.over > 0
      ? `+${formatCompact(p.over)} over`
      : `${formatCompact(p.remaining)} to go`;

  const subLine = completed
    ? 'Reached'
    : hasDate
      ? `${monthShort(g.target_date!)} · ${formatCompact(needed)}/mo needed`
      : monthly > 0
        ? `+${formatCompact(monthly)}/mo`
        : 'No deadline';

  return (
    <PressableScale
      style={[styles.goalCard, completed ? styles.goalCardDone : isActive && styles.goalCardActive]}
      onPress={onPress}
      accessibilityLabel={completed ? `${g.name}, completed` : g.name}
    >
      <View style={styles.goalRow}>
        <View style={[styles.goalIcon, { backgroundColor: alpha(completed ? colors.income : g.color ?? colors.accent, 13) }]}>
          <Feather name={completed ? 'check' : asFeather(g.icon, 'target')} size={20} color={completed ? colors.income : g.color ?? colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.goalNameRow}>
            <Text style={[styles.goalName, completed && styles.goalNameDone]} numberOfLines={1}>{g.name}</Text>
            <Text style={[styles.goalAmt, behind && { color: colors.healthAmber }]} numberOfLines={1}>{headline}</Text>
          </View>
          <Text style={[styles.goalSub, completed && { color: colors.income }, behind && { color: colors.healthAmber }]} numberOfLines={1}>
            {subLine}
          </Text>
          <View style={styles.goalBarWrap}>
            <BudgetBar pct={completed ? 100 : p.pct} health={completed ? 'green' : p.over > 0 || behind ? 'amber' : 'green'} height={4} />
          </View>
        </View>
        {completed ? (
          <View style={styles.doneBadge}><Text style={styles.doneBadgeText}>Done</Text></View>
        ) : onAdd ? (
          <TouchableOpacity style={styles.addBtn} onPress={onAdd} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Add money to ${g.name}`}>
            <Feather name="plus" size={16} color={colors.accent} />
          </TouchableOpacity>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  goalCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, ...shadow.sm },
  goalCardActive: { borderColor: colors.accent },
  goalCardDone: { borderColor: alpha(colors.income, 33), backgroundColor: alpha(colors.income, 5) },
  goalNameDone: { color: colors.textSecondary },
  doneBadge: { backgroundColor: alpha(colors.income, 13), borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 3, marginLeft: space.xs },
  doneBadgeText: { ...type.caption, color: colors.income, fontFamily: 'Inter_600SemiBold' },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  goalIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  goalNameRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm },
  goalName: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', flex: 1, minWidth: 0 },
  goalSub: { ...type.caption, color: colors.textMuted, fontSize: 10, marginTop: 2 },
  goalAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 12, color: colors.textSecondary, letterSpacing: -0.3, flexShrink: 0 },
  goalBarWrap: { marginTop: space.sm },
  addBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
});
