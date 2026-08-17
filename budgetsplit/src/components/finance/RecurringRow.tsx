import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { ListRow } from '../ui/ListRow';
import { IconCircle } from '../ui/IconCircle';
import { AmountText } from '../ui/AmountText';
import { categoryVisual } from '../../constants/categories';
import { asFeather } from '../../constants/palette';
import { freqLabel, nextUnskippedOccurrence } from '../../lib/recurrence';
import { shortDate } from '../../lib/dateFormat';
import { formatCompact } from '../../lib/money';
import { myShareOrTotal, txnTotal } from '../../lib/splitMath';
import { colors, type, layout } from '../tokens';
import type { TxnWithSplits } from '../../db/queries/transactions';

type Props = {
  rule: TxnWithSplits;
  /** Whose share to show. Omit to show the rule's full amount. */
  meId?: string;
  onPress?: () => void;
  /** Adds "· next 5 Mar" to the subtitle. */
  showNext?: boolean;
  /**
   * Group-surface presentation: the WHOLE bill as the amount, with "your share
   * ₹X" beneath it. Personal surfaces omit this and get just their share —
   * the one basis whose totals sum honestly with budgets and afford.
   */
  showShareLabel?: boolean;
  /**
   * Skipped occurrence dates for this rule (`getSkipsMap().get(rule.id)`).
   * Without it, "next" shows a date the user explicitly skipped.
   */
  skipDates?: Set<number>;
};

/**
 * One recurring rule as a row: category icon, name, cadence, amount.
 *
 * The *derivations* were the real duplication here, not the styling — three
 * places each worked out that the display name is `note || category`, what
 * amount basis to show, and how to word the cadence, and they disagreed in the
 * process (skip-blind next dates, interval-dropping cadence words, my-share vs
 * whole-bill totals). Every derivation now comes from the shared libs:
 * `nextUnskippedOccurrence`, `freqLabel`, `myShareOrTotal`/`txnTotal`.
 *
 * Composed over `ListRow` rather than being a fourth row implementation.
 */
export function RecurringRow({ rule, meId, onPress, showNext, showShareLabel, skipDates }: Props) {
  const visual = categoryVisual(rule.category);
  const name = rule.note?.trim() || rule.category;

  const wholeBill = txnTotal(rule);
  const myShare = meId ? myShareOrTotal(rule, meId) : wholeBill;
  const amount = showShareLabel ? wholeBill : myShare;
  const shareLine = showShareLabel && meId && myShare !== wholeBill
    ? `your share ${formatCompact(myShare)}`
    : null;

  const next = showNext ? nextUnskippedOccurrence(rule, Date.now(), skipDates) : null;
  const paused = rule.recur_state !== 'active' ? `${rule.recur_state} · ` : '';
  const subtitle = `${paused}${freqLabel(rule.recur_freq, rule.recur_interval)}${next ? ` · next ${shortDate(next)}` : ''}`;

  return (
    <ListRow
      leading={
        <IconCircle
          icon={asFeather(visual?.icon, 'repeat')}
          size={layout.iconCircle}
          color={visual?.color ?? colors.accent}
        />
      }
      title={name}
      subtitle={subtitle}
      value={
        <View style={styles.amountCol}>
          <AmountText
            paise={amount}
            size="sm"
            forceColor={colors.textPrimary}
            rounded
          />
          {shareLine && <Text style={styles.shareLine}>{shareLine}</Text>}
        </View>
      }
      chevron={!!onPress}
      onPress={onPress}
      accessibilityLabel={shareLine ? `${name}, ${shareLine}` : name}
    />
  );
}

const styles = StyleSheet.create({
  amountCol: { alignItems: 'flex-end' },
  shareLine: { ...type.caption, color: colors.textSecondary },
});
