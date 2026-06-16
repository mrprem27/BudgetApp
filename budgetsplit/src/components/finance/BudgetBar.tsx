import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import { colors, type, space } from '../tokens';
import { formatRupees } from '../../lib/money';

type Health = 'green' | 'amber' | 'red' | 'none';

const healthColor: Record<Health, string> = {
  green: colors.healthGreen,
  amber: colors.healthAmber,
  red:   colors.healthRed,
  none:  colors.bgMuted,
};

function computeHealth(pct: number): Health {
  if (pct > 100) return 'red';
  if (pct >= 80) return 'amber';
  if (pct > 0) return 'green';
  return 'none';
}

type ExplicitProps = {
  pct: number | null;
  health: Health;
  height?: number;
  spent?: number;
  limit?: number;
};

type AutoProps = {
  allocated: number;
  spent: number;
  height?: number;
};

type Props = ExplicitProps | AutoProps;

function isAutoProps(p: Props): p is AutoProps {
  return 'allocated' in p && !('health' in p);
}

export function BudgetBar(props: Props) {
  let pct: number | null;
  let health: Health;
  let height: number;
  let spent: number | undefined;
  let limit: number | undefined;

  if (isAutoProps(props)) {
    const p = props.allocated > 0 ? Math.round((props.spent / props.allocated) * 100) : 0;
    pct = p;
    health = computeHealth(p);
    height = props.height ?? 6;
  } else {
    pct = props.pct;
    health = props.health;
    height = props.height ?? 6;
    spent = props.spent;
    limit = props.limit;
  }

  const target = Math.min(100, Math.max(0, pct ?? 0));
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: target,
      duration: 650,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
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
