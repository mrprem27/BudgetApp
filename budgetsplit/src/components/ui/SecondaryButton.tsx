import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, radius, space } from '../tokens';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: keyof typeof Feather.glyphMap;
  size?: 'lg' | 'md' | 'sm';
  style?: ViewStyle;
};

export function SecondaryButton({ label, onPress, disabled, icon, size = 'lg', style }: Props) {
  const heights = { lg: 52, md: 44, sm: 36 };
  const height = heights[size];
  const fontSize = size === 'sm' ? type.label : type.button;

  return (
    <TouchableOpacity
      style={[styles.btn, { height }, disabled && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {icon ? <Feather name={icon} size={size === 'sm' ? 14 : 16} color={colors.accent} /> : null}
      <Text style={[styles.label, fontSize]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space.sm,
    width: '100%',
  },
  disabled: { opacity: 0.4 },
  label: {
    ...type.button,
    color: colors.accent,
  },
});
