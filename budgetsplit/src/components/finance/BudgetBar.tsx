import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, type, space } from '../tokens';
import { AnimatedBar } from '../ui/anim/AnimatedBar';
import { formatCompact } from '../../lib/money';

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
  const showLabel = spent != null && limit != null;

  return (
    <View>
      {showLabel && (
        <View style={styles.labelRow}>
          <Text style={[styles.labelText, { color: healthColor[health] }]}>
            {formatCompact(spent!)} <Text style={styles.labelMuted}>/ {formatCompact(limit!)}</Text>
          </Text>
          <Text style={[styles.pctText, { color: healthColor[health] }]}>
            {Math.round(pct ?? 0)}%
          </Text>
        </View>
      )}
      {/*
        * The fill comes off the shelf (`AnimatedBar`), which is what §11 says to
        * do and what this component was ignoring while hand-rolling all three of
        * its properties worse.
        *
        * It animated `width` as a percentage string with `useNativeDriver: false`
        * — banned by name in §11, because width is not native-drivable, so every
        * frame interpolated on the JS thread. This bar renders inside the groups
        * FlatList's `renderItem`, so each row scrolling into view started its own
        * 650ms JS-thread animation, on the thread that is simultaneously mounting
        * the rest of the row. `AnimatedBar` animates `scaleX` on the native
        * driver instead, honours Reduce Motion, and carries the `progressbar`
        * accessibility role this had none of.
        */}
      <AnimatedBar
        progress={target / 100}
        color={healthColor[health]}
        height={height}
        duration={650}
        accessibilityLabel={showLabel ? `${Math.round(pct ?? 0)}% of budget used` : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
