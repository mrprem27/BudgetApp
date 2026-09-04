import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, type, space, radius } from '../../tokens';

type Props = {
  /** 1-based position. */
  step: number;
  total: number;
};

/**
 * The one progress indicator for onboarding.
 *
 * Replaces **two** unrelated systems that were shown on different subsets of steps:
 * a top bar on the feature carousel only, and `SetupDots` (expanding pills) on the
 * five setup steps only. Two vocabularies for "how far along am I" is worse than
 * either, and neither covered the name step at all.
 *
 * It shows the bar **and** the count. A bar alone hides how much is left, which is
 * most of what makes a questionnaire feel long — the reference app shows only a bar
 * and is weaker for it.
 *
 * It carried two more props — `animated` (drive the fill from an existing
 * `Animated.Value`) and `showCount` — for the feature carousel, which was deleted.
 * Neither ever had a second caller. §9's dead-component rule applies to props too:
 * a prop with no caller is an untested branch that documents a feature that is not
 * there.
 */
export function StepProgress({ step, total }: Props) {
  const pct = total > 0 ? Math.max(0, Math.min(1, step / total)) : 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%` }]} />
      </View>
      <Text style={styles.count}>{step} of {total}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.smd },
  track: { flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: colors.bgMuted, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accent },
  count: { ...type.caption, color: colors.textMuted },
});
