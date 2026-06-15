import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { colors } from '../tokens';

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

/** Progress bar whose fill animates to its target width when the value changes. */
export function BudgetBar({ pct, health, height = 6 }: Props) {
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

  return (
    <View style={[styles.track, { height }]}>
      <Animated.View
        style={[styles.fill, { width, backgroundColor: healthColor[health], height }]}
      />
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
});
