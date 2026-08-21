import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, type ViewStyle, type StyleProp } from 'react-native';
import { colors, type, space, radius, layout } from '../tokens';
import { alpha } from '../../theme';
import { Card } from './Card';
import { Divider } from './Divider';
import { AmountText } from './AmountText';
import { AnimatedBar } from './anim/AnimatedBar';

export type OverviewStat = {
  key: string;
  /** The figure, already formatted: "2", "₹4.2k", "5 Mar". This card never formats money. */
  value: string | number;
  label: string;
  /** Tint for the figure. Defaults to `colors.textPrimary`. */
  tint?: string;
  /** Present ⇒ this stat is a control. Absent ⇒ it's a read-only tile. */
  onPress?: () => void;
  /** Selected state for a filter stat. Only meaningful alongside `onPress`. */
  active?: boolean;
  accessibilityLabel?: string;
};

type Props = {
  /** Uppercase eyebrow — the card's subject. */
  eyebrow: string;
  /** Money hero, in paise. */
  amount?: number;
  /** Non-money hero (a date, a count). Use instead of `amount`, not alongside it. */
  amountText?: string;
  amountColor?: string;
  /** `'lg'` (24pt) when something else already owns the screen's hero; `'xl'` (36pt) when nothing competes. */
  size?: 'lg' | 'xl';
  /** Sits on the figure's baseline, right-aligned: "82%", "/mo". */
  trailing?: string;
  trailingColor?: string;
  supporting?: string;
  /** A second, quieter line. There is deliberately no third — that's how you get an explainer wall. */
  supportingSecondary?: string;
  bar?: { progress: number; color: string; accessibilityLabel?: string };
  /** The divided foot row. Two or three; four don't fit the card's width. */
  stats?: OverviewStat[];
  /** Header-right slot — a `Chip`, a count. */
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * The summary card that opens a screen or a tab: eyebrow → figure → supporting
 * copy → optional meter → optional divided stat row.
 *
 * Every group tab and the budget editor had their own version of this shape, and
 * only one of them (the Budget tab's) was built out of the design system —
 * `MembersTab` hand-rolled five card recipes and `RecurringTab` was written almost
 * entirely in raw numbers. This is that shape, once, with the spacing fixed
 * internally so no caller can drift it.
 *
 * It lives in `ui/` rather than `finance/` because it has no domain knowledge: it
 * takes strings, paise and callbacks. That's also what lets `finance/budget` use it
 * — `ui` may never import from `finance`. Hence `anim/AnimatedBar` rather than
 * `finance/BudgetBar`, which additionally keeps the meter on the native driver
 * (AGENTS §11); `BudgetBar` animates `width` on the JS thread.
 *
 * **A stat may be a control.** `onPress`/`active` live on the individual stat, not
 * on the card, because the Budget tab's three counts *are* its filter — the number
 * you read is the thing you tap. That was true before this component existed and
 * had to survive it.
 */
export function OverviewCard({
  eyebrow, amount, amountText, amountColor, size = 'lg',
  trailing, trailingColor, supporting, supportingSecondary,
  bar, stats, action, style,
}: Props) {
  return (
    <Card padded style={style}>
      <View style={styles.head}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        {action}
      </View>

      <View style={styles.figureRow}>
        {amountText !== undefined ? (
          <Text style={[styles.amountText, size === 'xl' && styles.amountTextXl, !!amountColor && { color: amountColor }]} numberOfLines={1}>
            {amountText}
          </Text>
        ) : (
          <AmountText paise={amount ?? 0} size={size} compact forceColor={amountColor ?? colors.textPrimary} />
        )}
        {!!trailing && (
          <Text style={[styles.trailing, !!trailingColor && { color: trailingColor }]}>{trailing}</Text>
        )}
      </View>

      {!!supporting && <Text style={styles.supporting}>{supporting}</Text>}
      {!!supportingSecondary && <Text style={styles.supporting}>{supportingSecondary}</Text>}

      {!!bar && (
        <View style={styles.bar}>
          <AnimatedBar
            progress={bar.progress}
            color={bar.color}
            height={8}
            accessibilityLabel={bar.accessibilityLabel}
          />
        </View>
      )}

      {/* Conditional on purpose: a card with no stat row must never draw a rule
          under its copy. The budget editor's section cards had the mirror-image
          bug — an unconditional divider directly under every header. */}
      {!!stats?.length && (
        <>
          <Divider indent="none" />
          <View style={styles.statsRow}>
            {stats.map(({ key, ...s }) => <Stat key={key} {...s} />)}
          </View>
        </>
      )}
    </Card>
  );
}

/** One foot-row tile. Interactive when the caller gave it an `onPress`. */
function Stat({ value, label, tint = colors.textPrimary, onPress, active, accessibilityLabel }: Omit<OverviewStat, 'key'>) {
  const body = (
    <>
      <Text style={[styles.statVal, { color: tint }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </>
  );
  if (!onPress) {
    return <View style={styles.stat} accessibilityLabel={accessibilityLabel ?? `${value} ${label}`}>{body}</View>;
  }
  return (
    <TouchableOpacity
      style={[styles.stat, active && { backgroundColor: alpha(tint, 13), borderColor: tint }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel ?? `${value} ${label}${active ? ', filtering. Tap to clear' : '. Tap to filter'}`}
    >
      {body}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  eyebrow: { ...type.sectionLabel, color: colors.textMuted },

  figureRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm },
  amountText: { ...type.amountLG, color: colors.textPrimary },
  amountTextXl: { ...type.amountXL },
  trailing: { ...type.amountSM, color: colors.textSecondary },

  supporting: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  bar: { marginTop: space.md, marginBottom: space.md },

  statsRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    minHeight: layout.touchMin,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  statVal: { ...type.amountMD },
  statLabel: { ...type.caption, color: colors.textMuted, textAlign: 'center' },
});
