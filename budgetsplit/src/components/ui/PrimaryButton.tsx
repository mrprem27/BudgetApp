import React, { useRef } from 'react';
import { Animated, Pressable, Text, StyleSheet, ViewStyle, ActivityIndicator, View } from 'react-native';
import { colors, type, radius } from '../tokens';
import { alpha } from '../../theme';
import { haptic } from '../../lib/haptics';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
};

/**
 * The one primary CTA in the app. Design decisions:
 *  - Solid accent fill (was a gradient). Gradients on primary buttons read as
 *    "webby" — Linear/Stripe/Notion all use flat solid CTAs. The teal is
 *    saturated enough to carry on its own.
 *  - A single 1px inner highlight along the top edge (Apple-style tactile
 *    finish) — gives the button "presence" without shouting.
 *  - No drop-shadow: on this dark background a shadow becomes a fuzzy halo
 *    that muddies the edge. The inner highlight replaces it.
 *  - Slightly deeper press-scale (0.96, was 0.97) — reads as more responsive.
 *  - Height stays 52 (comfortable thumb target, HIG-compliant).
 */
export function PrimaryButton({ label, onPress, disabled, loading, style }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const inactive = disabled || loading;

  const to = (v: number, bounciness = 0) =>
    Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness }).start();

  return (
    <Pressable
      onPressIn={() => { if (!inactive) { haptic.light(); to(0.96); } }}
      onPressOut={() => to(1, 8)}
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive }}
      style={style}
    >
      <Animated.View style={[styles.btn, inactive && styles.disabled, { transform: [{ scale }] }]}>
        {/* Inner top-edge highlight — subtle Apple tactile finish */}
        <View pointerEvents="none" style={styles.innerHighlight} />
        {loading
          ? <ActivityIndicator color={colors.onAccent} />
          : <Text style={styles.label}>{label}</Text>}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    overflow: 'hidden',
  },
  innerHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: alpha('#FFFFFF', 20),
  },
  disabled: { opacity: 0.4 },
  label: {
    ...type.button,
    color: colors.onAccent,
  },
});
