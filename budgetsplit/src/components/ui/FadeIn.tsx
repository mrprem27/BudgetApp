import React, { useEffect, useRef } from 'react';
import { Animated, ViewStyle, StyleProp } from 'react-native';

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
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 380,
      delay,
      useNativeDriver: true,
    }).start();
  }, [anim, delay]);

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
