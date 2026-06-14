import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from './tokens';

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
};

export function BudgetBar({ pct, health, height = 4 }: Props) {
  const fill = Math.min(100, Math.max(0, pct ?? 0));
  return (
    <View style={[styles.track, { height }]}>
      <View
        style={[
          styles.fill,
          { width: `${fill}%`, backgroundColor: healthColor[health], height },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    backgroundColor: colors.bgMuted,
    overflow: 'hidden',
  },
  fill: {},
});
