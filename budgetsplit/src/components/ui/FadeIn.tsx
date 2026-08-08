import React, { useEffect, useRef } from 'react';
import { Animated, ViewStyle, StyleProp } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

type Props = {
  children: React.ReactNode;
  /** Stagger delay in ms (e.g. index * 60) for list-style cascades. */
  delay?: number;
  /** Vertical offset to rise from. */
  offset?: number;
  style?: StyleProp<ViewStyle>;
};

/** Fades + rises its children in on mount — used for content entrance cascades. */
export function FadeIn({ children, delay = 0, offset = 12, style }: Props) {
  const reduced = useReducedMotion();
  // Start fully visible when motion is reduced, so content never depends on an
  // animation that won't run.
  const anim = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) { anim.setValue(1); return; }
    Animated.timing(anim, {
      toValue: 1,
      duration: 380,
      delay,
      useNativeDriver: true,
    }).start();
  }, [anim, delay, reduced]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
