import React, { useRef } from 'react';
import { Animated, Pressable, Text, StyleSheet, ViewStyle, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, type, radius, gradients, shadow } from './tokens';
import { haptic } from '../lib/haptics';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
};

export function PrimaryButton({ label, onPress, disabled, loading, style }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const inactive = disabled || loading;

  const to = (v: number, bounciness = 0) =>
    Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness }).start();

  return (
    <Pressable
      onPressIn={() => { if (!inactive) { haptic.light(); to(0.97); } }}
      onPressOut={() => to(1, 8)}
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive }}
      style={style}
    >
      <Animated.View style={[styles.shadow, inactive && styles.disabled, { transform: [{ scale }] }]}>
        <LinearGradient
          colors={gradients.accent}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.btn}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.label}>{label}</Text>}
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
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    ...type.button,
    color: '#fff',
  },
});
