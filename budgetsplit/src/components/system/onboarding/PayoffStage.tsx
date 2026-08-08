import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { IconCircle } from '../../ui/IconCircle';
import { AnimatedNumber } from '../../ui/anim/AnimatedNumber';
import { colors, type, space } from '../../tokens';
import { formatRupees } from '../../../lib/money';
import type { Payoff, PayoffTone } from '../../../lib/onboardingPayoff';

/** The copy and the arithmetic live in `lib/onboardingPayoff`; only the colour
 *  mapping is presentational, so it lives here. */
const TONE: Record<PayoffTone, string> = {
  good: colors.income,
  warn: colors.healthAmber,
  neutral: colors.accent,
};

/**
 * The reflection beat between the money questions and the rest of setup.
 *
 * The flow used to ask for a name, income, pay-day, four money figures and a budget
 * cap, then return **nothing** until the app finally opened. This is the one screen
 * that pays those answers back — and it costs the user no input at all.
 *
 * The figure counts up rather than being printed, because landing on a number is what
 * makes it read as an answer instead of a label (AGENTS.md §1: one hero figure).
 */
export function PayoffStage({ payoff }: { payoff: Payoff }) {
  const tint = TONE[payoff.tone];

  return (
    <View style={styles.wrap}>
      <IconCircle icon={payoff.icon} size={72} color={tint} iconSize={32} />
      <AnimatedNumber
        value={payoff.amountPaise}
        format={formatRupees}
        style={[styles.amount, { color: tint }]}
        accessibilityLabel={`${formatRupees(payoff.amountPaise)} ${payoff.headline}`}
      />
      <Text style={styles.headline}>{payoff.headline}</Text>
      <Text style={styles.body}>{payoff.body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.md },
  amount: { ...type.amountXL, marginTop: space.md },
  headline: { ...type.subheading, color: colors.textPrimary, textAlign: 'center' },
  body: { ...type.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 23, paddingHorizontal: space.sm },
});
