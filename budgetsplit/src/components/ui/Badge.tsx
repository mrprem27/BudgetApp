import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, type, space, radius } from '../tokens';

type Props = {
  label: string;
  variant?: 'subtle' | 'solid';
  color?: string;
  style?: ViewStyle;
};

/**
 * Small pill badge for counts, status indicators (e.g. "3 over", "New").
 * Subtle = tinted background; Solid = full color background.
 */
export function Badge({ label, variant = 'subtle', color = colors.accent, style }: Props) {
  const bg = variant === 'solid' ? color : color + '22';
  const textColor = variant === 'solid' ? '#fff' : color;

  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      <Text style={[styles.label, { color: textColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    height: 22,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  label: {
    ...type.caption,
    fontFamily: 'Inter_600SemiBold',
  },
});
