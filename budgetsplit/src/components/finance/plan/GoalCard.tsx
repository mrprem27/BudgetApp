import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
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
}: {
  goal: SavingsGoal;
  saved: number;
  isActive: boolean;
  onPress: () => void;
}) {
  const p = goalProgress(saved, g.target);
  const hasDate = g.target_date != null;
  const monthly = monthlyContribution(g.allocation, g.frequency);
  const needed = hasDate ? neededPerMonth(p.remaining, g.target_date!) : 0;
  const monthsLeft = hasDate ? monthsUntil(g.target_date!) : 0;

  return (
    <PressableScale style={[styles.goalCard, isActive && styles.goalCardActive]} onPress={onPress} accessibilityLabel={g.name}>
      <View style={styles.goalRow}>
        <View style={[styles.goalIcon, { backgroundColor: (g.color ?? colors.accent) + '22' }]}>
          <Feather name={asFeather(g.icon, 'target')} size={20} color={g.color ?? colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.goalNameRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.goalName} numberOfLines={1}>{g.name}</Text>
              <Text style={styles.goalSub} numberOfLines={1}>
                {hasDate ? `${format(g.target_date!, 'MMM yyyy')} · ${monthsLeft <= 0 ? 'due now' : `${monthsLeft} ${monthsLeft === 1 ? 'month' : 'months'}`}` : 'No deadline'}
              </Text>
            </View>
            <Text style={styles.goalAmt}>{formatCompact(p.saved)} / {formatCompact(p.target)}</Text>
          </View>
          <View style={styles.goalBarWrap}>
            <BudgetBar pct={p.pct} health={p.over > 0 ? 'amber' : hasDate && needed > monthly ? 'amber' : 'green'} height={4} />
          </View>
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
        </View>
        <Feather name="menu" size={16} color={colors.textMuted} style={styles.dragHandle} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  goalCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, ...shadow.sm },
  goalCardActive: { borderColor: colors.accent },
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
  dragHandle: { marginLeft: 4 },
});
