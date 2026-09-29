import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, layout } from '../../tokens';
import { alpha } from '../../../theme';
import { PressableScale } from '../../ui/PressableScale';
import { formatCompact } from '../../../lib/money';
import { forecastVerdict } from '../../../lib/forecastVerdict';

export type ForecastShift = { cat: string; thisAmt: number; pct: number };

type Props = {
  /** Projected month-end spend (paise). */
  projected: number;
  /** Monthly budget allocated (paise); 0 = no budget set. */
  budget: number;
  /** Biggest category shift vs last month — named only when it explains an overshoot. */
  topShift?: ForecastShift | null;
  /** Mask amounts when the user has hidden balances. */
  obfuscate?: boolean;
  onPressInsights: () => void;
};

/**
 * Home's month-end forecast as ONE line: a verdict, coloured by where the month is heading, that taps
 * through to Insights for the chart and the detail. It was a pace bar, two legends, a "biggest shift"
 * block and a link in one card — six things to read to learn one.
 */
export function ForecastCard({ projected, budget, topShift, obfuscate, onPressInsights }: Props) {
  const v = forecastVerdict({ projected, budget, topShift, mask: obfuscate ? () => '••••' : formatCompact });
  const tone = v.tone === 'over' ? colors.expense : v.tone === 'good' ? colors.income : colors.accent;
  const icon = v.tone === 'over' ? 'alert-circle' : v.tone === 'good' ? 'trending-down' : 'trending-up';
  return (
    <PressableScale style={styles.card} onPress={onPressInsights} accessibilityLabel={`${v.headline}${v.sub ? `. ${v.sub}` : ''}. Open insights`}>
      <View style={[styles.icon, { backgroundColor: alpha(tone, 13) }]}>
        <Feather name={icon} size={18} color={tone} />
      </View>
      <View style={styles.text}>
        <Text style={[styles.headline, { color: v.tone === 'neutral' ? colors.textPrimary : tone }]} numberOfLines={1}>{v.headline}</Text>
        {v.sub && <Text style={styles.sub} numberOfLines={1}>{v.sub}</Text>}
      </View>
      <Feather name="chevron-right" size={18} color={colors.textMuted} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: space.smd, minHeight: layout.rowMinHeight,
    backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: space.md, paddingVertical: space.smd, marginBottom: space.md,
  },
  icon: { width: layout.iconCircle, height: layout.iconCircle, borderRadius: layout.iconCircle / 2, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  headline: { ...type.bodySemi },
  sub: { ...type.caption, color: colors.textMuted, marginTop: 1 },
});
