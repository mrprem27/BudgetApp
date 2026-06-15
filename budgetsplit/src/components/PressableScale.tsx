import React, { useRef } from 'react';
import { Animated, Pressable, ViewStyle, StyleProp, GestureResponderEvent } from 'react-native';
import { haptic } from '../lib/haptics';

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
};

/**
 * A Pressable that springs down slightly while held — the small tactile detail
 * that makes taps feel responsive across cards, rows and buttons.
 */
export function PressableScale({
  children, onPress, onLongPress, style,
  disabled, activeScale = 0.97, haptics = false, accessibilityLabel,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const to = (v: number, bounciness = 0) =>
    Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness }).start();

  return (
    <Pressable
      onPressIn={() => { if (!disabled) { if (haptics) haptic.light(); to(activeScale); } }}
      onPressOut={() => to(1, 8)}
      onPress={disabled ? undefined : onPress}
      onLongPress={disabled ? undefined : onLongPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
