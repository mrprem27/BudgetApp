import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, type, space, radius, shadow } from '../../tokens';
import { PressableScale } from '../../ui/PressableScale';
import { formatCompact } from '../../../lib/money';
import { fullDate } from '../../../lib/dateFormat';
import { forecastTile } from '../../../lib/forecastVerdict';
import type { SafeToSpendBreakdown } from '../../../lib/safeToSpend';

type Props = {
  sts: SafeToSpendBreakdown | null;
  /** Projected month-end spend (paise); null until there is enough to project. */
  projected: number | null;
  /** Monthly budget (paise); 0 = none. */
  budget: number;
  obfuscate?: boolean;
  onPressSts: () => void;
  onPressForecast: () => void;
};

/**
 * Home's two headline numbers, side by side above the period pills (`U-21`): what is yours to
 * spend, and where the month is heading. Both are forward-looking and neither depends on the
 * Today / Month / Year pill, which is why they sit above it. They were a strip above the hero and
 * a line near the bottom of the Month tab — the projection was easy to miss.
 */
export function HomeTiles({ sts, projected, budget, obfuscate, onPressSts, onPressForecast }: Props) {
  const mask = obfuscate ? () => '••••' : undefined;
  const over = !!sts && sts.amount < 0;
  const f = projected != null ? forecastTile({ projected, budget, mask }) : null;
  const fTone = f?.tone === 'over' ? colors.expense : f?.tone === 'good' ? colors.income : colors.textPrimary;

  return (
    <View style={styles.row}>
      <Tile
        label="Safe to spend"
        amount={!sts ? '₹0' : obfuscate ? '••••' : formatCompact(sts.amount)}
        tone={!sts ? colors.textMuted : over ? colors.expense : colors.income}
        sub={!sts ? 'Add your money in Money' : over ? 'over-committed' : `until ${fullDate(sts.untilMs)}`}
        onPress={onPressSts}
        a11y="Safe to spend, see how it is worked out"
      />
      <Tile
        label="Month end · projected"
        amount={f ? f.amount : 'Soon'}
        tone={f ? fTone : colors.textMuted}
        sub={f ? f.sub : 'after a few days of spending'}
        onPress={onPressForecast}
        a11y="Projected month-end spend, open Insights"
      />
    </View>
  );
}

function Tile({ label, amount, tone, sub, onPress, a11y }: { label: string; amount: string; tone: string; sub: string; onPress: () => void; a11y: string }) {
  return (
    // The flex lives on a plain wrapper: `PressableScale` puts its `style` on an inner Animated.View,
    // so `flex: 1` there never reached the row and the two tiles took their content's width (`U-30`).
    <View style={styles.cell}>
      <PressableScale style={styles.tile} onPress={onPress} accessibilityLabel={`${a11y}. ${amount}, ${sub}`}>
        <Text style={styles.label} numberOfLines={1}>{label}</Text>
        <Text style={[styles.amount, { color: tone }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{amount}</Text>
        <Text style={styles.sub} numberOfLines={1}>{sub}</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch', gap: space.smd, marginBottom: space.md },
  cell: { flex: 1, minWidth: 0 },
  tile: {
    alignSelf: 'stretch', backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: space.md, gap: space.xs, ...shadow.sm,
  },
  label: { ...type.caption, color: colors.textSecondary },
  amount: { fontFamily: 'SpaceMono_400Regular', fontSize: 22, letterSpacing: -0.5 },
  sub: { ...type.caption, color: colors.textMuted },
});
