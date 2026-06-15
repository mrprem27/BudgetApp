import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, ViewStyle, StyleProp, DimensionValue } from 'react-native';
import { colors, radius } from './tokens';

type Props = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/** A single shimmering placeholder block used to build loading skeletons. */
export function Skeleton({ width = '100%', height = 16, radius: r = 8, style }: Props) {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: r, backgroundColor: colors.bgMuted, opacity: pulse },
        style,
      ]}
    />
  );
}

/** A card-shaped skeleton, matching the app's standard surface. */
export function SkeletonCard({ height = 100, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  return <Skeleton width="100%" height={height} radius={radius.lg} style={style} />;
}

const styles = StyleSheet.create({});
