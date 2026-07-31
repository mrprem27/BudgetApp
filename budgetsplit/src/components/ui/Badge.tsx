import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../tokens';
import { alpha } from '../../theme';

export type BadgeTone = 'neutral' | 'accent' | 'income' | 'expense' | 'amber' | 'settle';

/** Tone → { foreground, background } pair. Backgrounds sit at 14% (was 14 or
 *  a re-invented `muted` in-hex) — soft enough on dark to read as tinted air,
 *  not a coloured chip. */
const TONE_COLORS: Record<BadgeTone, { fg: string; bg: string }> = {
  neutral: { fg: colors.textSecondary, bg: colors.bgMuted },
  accent:  { fg: colors.accent,        bg: alpha(colors.accent,       14) },
  income:  { fg: colors.income,        bg: alpha(colors.income,       14) },
  expense: { fg: colors.expense,       bg: alpha(colors.expense,      14) },
  amber:   { fg: colors.healthAmber,   bg: alpha(colors.healthAmber,  14) },
  settle:  { fg: colors.settle,        bg: alpha(colors.settle,       14) },
};

type Props = {
  label: string;
  tone?: BadgeTone;
  icon?: keyof typeof Feather.glyphMap;
  style?: ViewStyle;
};

/**
 * Small tag/pill for status. Refinements: unified background opacity across
 * tones (was per-tone re-invented), consistent gap, capsule shape.
 */
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
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    gap: space.xs,
  },
  label: {
    ...type.caption,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.2,
  },
});
