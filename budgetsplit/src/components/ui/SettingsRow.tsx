import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space } from '../tokens';

type Props = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value?: string;
  /** Tint of the icon circle (defaults to accent). */
  tint?: string;
  onPress?: () => void;
  /** Show a chevron on the right (defaults to true when onPress is set). */
  chevron?: boolean;
  /** Custom right-side element (overrides value/chevron). */
  right?: React.ReactNode;
  danger?: boolean;
};

/**
 * One row inside a settings-style card: icon circle + label + value/chevron.
 * Group several inside a bgCard with hairline dividers (marginLeft 32+16+16).
 */
export function SettingsRow({ icon, label, value, tint = colors.accent, onPress, chevron, right, danger }: Props) {
  const showChevron = chevron ?? !!onPress;
  const Wrapper: any = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      style={styles.row}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
    >
      <View style={[styles.iconDot, { backgroundColor: (danger ? colors.expense : tint) + '22' }]}>
        <Feather name={icon} size={16} color={danger ? colors.expense : tint} />
      </View>
      <Text style={[styles.label, danger && { color: colors.expense }]} numberOfLines={1}>{label}</Text>
      <View style={styles.right}>
        {right ?? (value ? <Text style={styles.value} numberOfLines={1}>{value}</Text> : null)}
        {showChevron && <Feather name="chevron-right" size={16} color={colors.textMuted} />}
      </View>
    </Wrapper>
  );
}

export const settingsRowDivider = {
  height: 1,
  backgroundColor: colors.border,
  marginLeft: 32 + space.md + space.md,
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.md, minHeight: 52 },
  iconDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  label: { ...type.body, color: colors.textPrimary, flex: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1 },
  value: { ...type.body, color: colors.textSecondary, flexShrink: 1 },
});
