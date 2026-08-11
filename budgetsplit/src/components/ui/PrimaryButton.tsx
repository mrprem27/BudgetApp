import React, { useRef } from 'react';
import { Animated, Pressable, Text, StyleSheet, ViewStyle, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, type, radius, gradients, shadow, space } from '../tokens';
import { haptic } from '../../lib/haptics';

type Props = {
  label: string;
  onPress: () => void;
  /** Optional secondary gesture. Nothing essential may live here — it is undiscoverable. */
  onLongPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  /**
   * Overrides the default teal `gradients.accent`. Use when the button's colour
   * carries meaning — the Add screen tints its save button by transaction kind, so
   * the CTA agrees with the rest of the form.
   */
  gradient?: readonly [string, string, ...string[]];
};

export function PrimaryButton({ label, onPress, onLongPress, disabled, loading, style, gradient }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const inactive = disabled || loading;

  const to = (v: number, bounciness = 0) =>
    Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness }).start();

  return (
    <Pressable
      onPressIn={() => { if (!inactive) { haptic.light(); to(0.97); } }}
      onPressOut={() => to(1, 8)}
      onPress={inactive ? undefined : onPress}
      onLongPress={inactive ? undefined : onLongPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive }}
      style={style}
    >
      <Animated.View style={[styles.shadow, inactive && styles.disabled, { transform: [{ scale }] }]}>
        <LinearGradient
          colors={gradient ?? gradients.accent}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.btn}
        >
          {loading
            ? <ActivityIndicator color={colors.onAccent} />
            : <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">{label}</Text>}
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shadow: {
    borderRadius: radius.md,
    ...shadow.sm,
  },
  btn: {
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    // The height is fixed, so a two-line label does not grow the button — it
    // overflows it. Review's footer builds labels like "Save 12 said out loud",
    // which wrapped and broke the 52pt block. Padding + `numberOfLines={1}` above
    // means a long label truncates inside the button instead.
    paddingHorizontal: space.md,
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    ...type.button,
    color: colors.onAccent,
    textAlign: 'center',
  },
});
