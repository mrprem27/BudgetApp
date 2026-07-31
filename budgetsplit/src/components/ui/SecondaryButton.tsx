import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, radius, space } from '../tokens';
import { alpha } from '../../theme';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: keyof typeof Feather.glyphMap;
  size?: 'lg' | 'md' | 'sm';
  style?: ViewStyle;
};

/**
 * Secondary CTA. Refined from a solid-border pill to a subtle-filled surface
 * with a 1px accent border — reads as a proper "second choice" next to the
 * solid primary, rather than a competing outline.
 */
export function SecondaryButton({ label, onPress, disabled, icon, size = 'lg', style }: Props) {
  const heights = { lg: 52, md: 44, sm: 36 };
  const height = heights[size];
  const labelStyle = size === 'sm' ? type.label : type.button;

  return (
    <TouchableOpacity
      style={[styles.btn, { height }, disabled && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {icon ? <Feather name={icon} size={size === 'sm' ? 14 : 16} color={colors.accent} /> : null}
      <Text style={[labelStyle, styles.label]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: alpha(colors.accent, 8),
    borderWidth: 1,
    borderColor: alpha(colors.accent, 25),
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space.sm,
    width: '100%',
  },
  disabled: { opacity: 0.4 },
  label: { color: colors.accent },
});
