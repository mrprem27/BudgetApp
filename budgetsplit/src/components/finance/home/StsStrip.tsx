import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PressableScale } from '../../ui/PressableScale';
import { colors, type, space, radius } from '../../tokens';
import { formatCompact, formatRupees } from '../../../lib/money';
import type { SafeToSpend } from '../../../lib/safeToSpend';

type Props = {
  sts: SafeToSpend | null;
  onPress: () => void;
  /** Privacy mode — amounts become ₹ ••••, and the affordance goes with them. */
  obfuscate?: boolean;
};

/**
 * What's genuinely yours to spend, sat above the spend hero as one quiet line.
 *
 * **Why it isn't the hero.** It used to be. The problem wasn't the number, it was
 * that `HeroCard` carried three time bases at once: this figure is horizon-scoped
 * and ignores the Today/Month/Year pills, while the spend figure, the delta and
 * the pace bar all answer to them — and the pills sit *below* the card. Worse,
 * the bar measures `spent / budget`, so the card's most prominent visual was
 * explaining a number that wasn't the headline. Lifting this out puts every
 * element inside the card back on one quantity and one time base.
 *
 * **Why a strip and not a second card.** Same reasoning as `add/ContextPill`:
 * this is *context above the hero*, not a competing hero, so it is quiet by
 * design and satisfies the one-hero rule (AGENTS.md §1) precisely by not being
 * dominant. A full card here would re-create the problem in a new shape.
 *
 * It carries the per-day figure because the amount alone is a stock, and a stock
 * on payday reads as permission. `₹1,050/day` is the same fact as a flow.
 */
export function StsStrip({ sts, onPress, obfuscate = false }: Props) {
  if (!sts) return null;
  const over = sts.amount < 0;
  const tint = over ? colors.healthRed : colors.income;

  return (
    <PressableScale
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
      accessibilityLabel="Yours to spend, view breakdown"
    >
      <View style={styles.strip}>
        <View style={[styles.dot, { backgroundColor: tint }]} />
        {obfuscate ? (
          <Text style={styles.amount}>₹ ••••</Text>
        ) : (
          <>
            <Text style={[styles.amount, { color: tint }]} numberOfLines={1}>
              {formatCompact(sts.amount)}
            </Text>
            <Text style={styles.label} numberOfLines={1}>
              {over ? 'over-committed' : 'yours to spend'}
            </Text>
            {/* The rate shows in BOTH states. It used to render only when
                positive, which handed the actionable framing to the user who
                needed it least: someone in good shape got "₹1,050/day" and
                someone over-committed got a bare negative figure and no way to
                think about it. Still gated on real history — an invented rate is
                exactly the kind of number that costs trust when it's wrong. */}
            {sts.dailyRate != null && (
              <Text style={styles.detail} numberOfLines={1}>
                · {formatRupees(sts.dailyRate)}/day usual
              </Text>
            )}
          </>
        )}
        <View style={styles.spacer} />
        {!obfuscate && <Feather name="chevron-right" size={15} color={colors.textMuted} />}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.smd,
    paddingVertical: space.sm,
    marginBottom: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  amount: { ...type.labelSemi, fontFamily: 'SpaceMono_400Regular', color: colors.textPrimary },
  label: { ...type.label, color: colors.textSecondary, flexShrink: 1 },
  detail: { ...type.caption, color: colors.textMuted, flexShrink: 1 },
  spacer: { flex: 1, minWidth: space.xs },
});
