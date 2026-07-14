import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, space } from '../../tokens';
import { formatCompact } from '../../../lib/money';

type Props = { color: string; remaining: number; categoryName: string };

/** Inline "₹X left / over budget" nudge under the category (expense only). */
export function BudgetNudge({ color, remaining, categoryName }: Props) {
  return (
    <View style={styles.nudge}>
      <View style={[styles.nudgeDot, { backgroundColor: color }]} />
      <Text style={[styles.nudgeText, { color }]}>
        {remaining >= 0
          ? `${formatCompact(remaining)} left in ${categoryName} this month`
          : `${formatCompact(-remaining)} over budget in ${categoryName}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  nudge: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bg, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border },
  nudgeDot: { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  nudgeText: { fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },
});
