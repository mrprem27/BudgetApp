import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../tokens';
import { alpha } from '../../theme';

export type BadgeTone = 'neutral' | 'accent' | 'income' | 'expense' | 'amber' | 'settle';

const TONE_COLORS: Record<BadgeTone, { fg: string; bg: string }> = {
  neutral: { fg: colors.textSecondary, bg: colors.bgMuted },
  accent:  { fg: colors.accent, bg: colors.accentMuted },
  income:  { fg: colors.income, bg: alpha(colors.income, 14) },
  expense: { fg: colors.expense, bg: colors.coralMuted },
  amber:   { fg: colors.healthAmber, bg: alpha(colors.healthAmber, 16) },
  settle:  { fg: colors.settle, bg: alpha(colors.settle, 16) },
};

type Props = {
  label: string;
  tone?: BadgeTone;
  icon?: keyof typeof Feather.glyphMap;
  style?: ViewStyle;
};

export function Badge({ label, tone = 'neutral', icon, style }: Props) {
  const { fg, bg } = TONE_COLORS[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      {icon && <Feather name={icon} size={12} color={fg} />}
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.xs,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    gap: space.xs,
  },
  label: {
    ...type.caption,
    fontFamily: 'Inter_600SemiBold',
  },
});
