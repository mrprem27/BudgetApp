import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../tokens';

export type BadgeTone = 'neutral' | 'accent' | 'income' | 'expense' | 'amber' | 'settle';

const TONE_COLORS: Record<BadgeTone, { fg: string; bg: string }> = {
  neutral: { fg: colors.textSecondary, bg: colors.bgMuted },
  accent:  { fg: colors.accent, bg: colors.accentMuted },
  income:  { fg: colors.income, bg: colors.income + '24' },
  expense: { fg: colors.expense, bg: colors.coralMuted },
  amber:   { fg: colors.healthAmber, bg: colors.healthAmber + '28' },
  settle:  { fg: colors.settle, bg: colors.settle + '28' },
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
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    gap: space.xs,
  },
  label: {
    ...type.caption,
    fontFamily: 'Inter_600SemiBold',
  },
});
