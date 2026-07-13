import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { colors, type, space, radius, shadow } from '../../tokens';
import { asFeather } from '../../../constants/palette';
import { formatCompact } from '../../../lib/money';
import { goalProgress, monthlyContribution, neededPerMonth, monthsUntil } from '../../../lib/savings';
import { PressableScale } from '../../ui/PressableScale';
import { BudgetBar } from '../BudgetBar';
import type { SavingsGoal } from '../../../db/queries/savings';

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
  const monthsLeft = hasDate ? monthsUntil(g.target_date!) : 0;

  return (
    <PressableScale
      style={[styles.goalCard, completed ? styles.goalCardDone : isActive && styles.goalCardActive]}
      onPress={onPress}
      accessibilityLabel={completed ? `${g.name}, completed` : g.name}
    >
      <View style={styles.goalRow}>
        <View style={[styles.goalIcon, { backgroundColor: (completed ? colors.income : g.color ?? colors.accent) + '22' }]}>
          <Feather name={completed ? 'check' : asFeather(g.icon, 'target')} size={20} color={completed ? colors.income : g.color ?? colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.goalNameRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.goalName, completed && styles.goalNameDone]} numberOfLines={1}>{g.name}</Text>
              <Text style={[styles.goalSub, completed && { color: colors.income }]} numberOfLines={1}>
                {completed
                  ? `Reached · ${formatCompact(p.saved)} saved`
                  : hasDate ? `${format(g.target_date!, 'MMM yyyy')} · ${monthsLeft <= 0 ? 'due now' : `${monthsLeft} ${monthsLeft === 1 ? 'month' : 'months'}`}` : 'No deadline'}
              </Text>
            </View>
            <Text style={styles.goalAmt}>{formatCompact(p.saved)} / {formatCompact(p.target)}</Text>
          </View>
          <View style={styles.goalBarWrap}>
            <BudgetBar pct={completed ? 100 : p.pct} health={completed ? 'green' : p.over > 0 ? 'amber' : hasDate && needed > monthly ? 'amber' : 'green'} height={4} />
          </View>
          {!completed && (
            <View style={styles.goalMetaRow}>
              {p.over > 0 ? (
                <Text style={[styles.goalMeta, { color: colors.healthAmber }]} numberOfLines={1}>{p.rawPct}% · +{formatCompact(p.over)} over</Text>
              ) : (
                <Text style={styles.goalMeta} numberOfLines={1}>{p.pct}% · {formatCompact(p.remaining)} to go</Text>
              )}
              {hasDate ? (
                <Text style={[styles.goalMetaRight, { color: needed > monthly ? colors.healthAmber : colors.income }]} numberOfLines={1}>{formatCompact(needed)}/mo needed</Text>
              ) : monthly > 0 ? (
                <Text style={[styles.goalMetaRight, { color: colors.accent }]} numberOfLines={1}>+{formatCompact(monthly)}/mo</Text>
              ) : null}
            </View>
          )}
        </View>
        {completed ? (
          <View style={styles.doneBadge}><Text style={styles.doneBadgeText}>Done</Text></View>
        ) : (
          <View style={styles.trailing}>
            {onAdd && (
              <TouchableOpacity style={styles.addBtn} onPress={onAdd} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Add money to ${g.name}`}>
                <Feather name="plus" size={16} color={colors.accent} />
              </TouchableOpacity>
            )}
            <Feather name="menu" size={16} color={colors.textMuted} style={styles.dragHandle} />
          </View>
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  goalCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, ...shadow.sm },
  goalCardActive: { borderColor: colors.accent },
  goalCardDone: { borderColor: colors.income + '55', backgroundColor: colors.income + '0D' },
  goalNameDone: { color: colors.textSecondary },
  doneBadge: { backgroundColor: colors.income + '22', borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 3, marginLeft: space.xs },
  doneBadgeText: { ...type.caption, color: colors.income, fontFamily: 'Inter_600SemiBold' },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  goalIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  goalNameRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm, marginBottom: 6 },
  goalName: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  goalSub: { ...type.caption, color: colors.textMuted, fontSize: 10, marginTop: 1 },
  goalAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 12, color: colors.textSecondary, letterSpacing: -0.3 },
  goalBarWrap: { marginBottom: 5 },
  goalMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  goalMeta: { ...type.caption, color: colors.textMuted, flexShrink: 1 },
  goalMetaRight: { ...type.caption, fontFamily: 'Inter_600SemiBold' },
  dragHandle: { marginLeft: space.xs },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  addBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
});
