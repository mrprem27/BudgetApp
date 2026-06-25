import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, type, space, radius, shadow } from '../../tokens';
import { formatCompact } from '../../../lib/money';

/** Month-end spend forecast card on the Plan tab. Presentational.
 *  Extracted from app/(tabs)/savings.tsx. */
export function ForecastCard({
  forecastMonthEnd,
  forecastBudget,
}: {
  forecastMonthEnd: number;
  forecastBudget: number;
}) {
  return (
    <View style={styles.forecastCard}>
      <View style={{ flex: 1 }}>
        <Text style={styles.forecastLabel}>Month-end forecast</Text>
        <Text style={styles.forecastSub}>At current pace</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.forecastAmt}>{formatCompact(forecastMonthEnd)}</Text>
        {forecastBudget > 0 && (
          <Text style={[styles.forecastDelta, { color: forecastMonthEnd > forecastBudget ? colors.expense : colors.income }]}>
            {forecastMonthEnd > forecastBudget
              ? `${formatCompact(forecastMonthEnd - forecastBudget)} over budget`
              : `${formatCompact(forecastBudget - forecastMonthEnd)} under budget`}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  forecastCard: { backgroundColor: colors.settle + '1A', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.settle + '44', padding: space.md, flexDirection: 'row', alignItems: 'center', ...shadow.sm },
  forecastLabel: { ...type.body, color: colors.settle, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  forecastSub: { ...type.caption, color: colors.textMuted },
  forecastAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 20, color: colors.textPrimary, letterSpacing: -0.5 },
  forecastDelta: { ...type.caption, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
});
