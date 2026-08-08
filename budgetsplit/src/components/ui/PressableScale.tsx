import React, { useRef } from 'react';
import {
  Animated, Pressable, ViewStyle, StyleProp, GestureResponderEvent, Insets,
  type AccessibilityState,
} from 'react-native';
import { haptic } from '../../lib/haptics';

type Props = {
  children: React.ReactNode;
  onPress?: (e: GestureResponderEvent) => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  /** Scale the element shrinks to while pressed. */
  activeScale?: number;
  /** Fire a light haptic tick on press-in. */
  haptics?: boolean;
  accessibilityLabel?: string;
  /** Extends the touch target beyond the visual bounds (icon-only / small rows). */
  hitSlop?: number | Insets;
  /** Merged over the computed `disabled` state — pass `{ selected }` on rows that
   *  represent a chosen option, or `{ expanded }` on disclosures. */
  accessibilityState?: AccessibilityState;
};

/**
 * A Pressable that springs down slightly while held — the small tactile detail
 * that makes taps feel responsive across cards, rows and buttons.
 */
export function PressableScale({
  children, onPress, onLongPress, style,
  disabled, activeScale = 0.97, haptics = false, accessibilityLabel, hitSlop,
  accessibilityState,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const interactive = !!(onPress || onLongPress);

  const to = (v: number, bounciness = 0) =>
    Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness }).start();

  return (
    <Pressable
      onPressIn={() => { if (!disabled) { if (haptics) haptic.light(); to(activeScale); } }}
      onPressOut={() => to(1, 8)}
      onPress={disabled ? undefined : onPress}
      onLongPress={disabled ? undefined : onLongPress}
      disabled={disabled}
      hitSlop={hitSlop}
      // Only announce as a button when it actually does something on tap.
      accessibilityRole={interactive ? 'button' : undefined}
      accessibilityState={
        interactive || accessibilityState
          ? { ...(interactive ? { disabled: !!disabled } : null), ...accessibilityState }
          : undefined
      }
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
