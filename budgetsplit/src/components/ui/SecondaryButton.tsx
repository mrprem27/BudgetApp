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
  /**
   * Destructive variant — `colors.expense` border, icon and label (AGENTS.md §5).
   * Screens were hand-rolling this (Review's `menuDanger`, the Add sheets' clear
   * rows) because the component only offered the accent colour.
   */
  danger?: boolean;
  /**
   * Shrink to the label instead of filling the row. For a button that sits
   * *beside* content rather than under it — the group header's "Settle up".
   * A prop rather than a call-site width override, so the full-width default
   * stays the thing you get without thinking.
   */
  fit?: boolean;
  style?: ViewStyle;
};

export function SecondaryButton({ label, onPress, disabled, icon, size = 'lg', danger, fit, style }: Props) {
  const heights = { lg: 52, md: 44, sm: 36 };
  const height = heights[size];
  const labelType = size === 'sm' ? type.label : type.button;
  const tint = danger ? colors.expense : colors.accent;

  return (
    <TouchableOpacity
      style={[styles.btn, { height, borderColor: tint }, fit && styles.fit, disabled && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {icon ? <Feather name={icon} size={size === 'sm' ? 14 : 16} color={tint} /> : null}
      <Text style={[labelType, styles.label, { color: tint }]}>{label}</Text>
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
  fit: { width: undefined, alignSelf: 'flex-start', paddingHorizontal: space.md },
  disabled: { opacity: 0.4 },
  label: {
    color: colors.accent,
  },
});
