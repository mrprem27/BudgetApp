import React, { memo, useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { colors } from '../../tokens';

type Props = {
  /** 0–1. Values outside the range are clamped. */
  progress: number;
  color?: string;
  /** Track colour. Defaults to `colors.bgMuted`. */
  trackColor?: string;
  height?: number;
  duration?: number;
  accessibilityLabel?: string;
};

/**
 * A horizontal progress track that animates to its value.
 *
 * Serves both the onboarding step progress and any budget/goal meter. Note this
 * animates `scaleX`, not `width` — width isn't native-drivable, so a width
 * animation interpolates on the JS thread and stutters exactly when the rest of
 * the screen is also mounting.
 */
export const AnimatedBar = memo(function AnimatedBar({
  progress, color = colors.accent, trackColor = colors.bgMuted,
  height = 4, duration = 320, accessibilityLabel,
}: Props) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const anim = useRef(new Animated.Value(clamped)).current;
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) { anim.setValue(clamped); return; }
    Animated.timing(anim, { toValue: clamped, duration, useNativeDriver: true }).start();
  }, [clamped, anim, duration, reduced]);

  return (
    <View
      style={[styles.track, { height, borderRadius: height / 2, backgroundColor: trackColor }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            height,
            borderRadius: height / 2,
            backgroundColor: color,
            // scaleX from the left edge, so the bar grows rightwards.
            transform: [{ scaleX: anim }],
          },
        ]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  track: { width: '100%', overflow: 'hidden' },
  fill: { width: '100%', transformOrigin: 'left' },
});
