import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { colors, type, space } from '../tokens';
import { formatRupees } from '../../lib/money';

type Health = 'green' | 'amber' | 'red' | 'none';

const healthColor: Record<Health, string> = {
  green: colors.healthGreen,
  amber: colors.healthAmber,
  red:   colors.healthRed,
  none:  colors.bgMuted,
};

type Props = {
  pct: number | null;
  health: Health;
  height?: number;
  /** Show "spent / limit" label above the bar. */
  spent?: number;
  limit?: number;
};

export function BudgetBar({ pct, health, height = 6, spent, limit }: Props) {
  const target = Math.min(100, Math.max(0, pct ?? 0));
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: target,
      duration: 650,
      useNativeDriver: false,
    }).start();
  }, [target, anim]);

  const width = anim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  const showLabel = spent != null && limit != null;

  return (
    <View>
      {showLabel && (
        <View style={styles.labelRow}>
          <Text style={styles.labelText}>
            {formatRupees(spent!)} <Text style={styles.labelMuted}>/ {formatRupees(limit!)}</Text>
          </Text>
          <Text style={[styles.pctText, { color: healthColor[health] }]}>
            {Math.round(pct ?? 0)}%
          </Text>
        </View>
      )}
      <View style={[styles.track, { height }]}>
        <Animated.View
          style={[styles.fill, { width, backgroundColor: healthColor[health], height }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    backgroundColor: colors.bgMuted,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: { borderRadius: 999 },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.xs,
  },
  labelText: {
    ...type.caption,
    color: colors.textSecondary,
  },
  labelMuted: {
    color: colors.textMuted,
  },
  pctText: {
    ...type.caption,
    fontFamily: 'Inter_600SemiBold',
  },
});
