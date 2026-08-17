import React from 'react';
import { format } from 'date-fns';
import { ListRow } from '../ui/ListRow';
import { IconCircle } from '../ui/IconCircle';
import { AmountText } from '../ui/AmountText';
import { categoryVisual } from '../../constants/categories';
import { asFeather } from '../../constants/palette';
import { freqWord } from '../../lib/groupDetail';
import { nextOccurrenceOnOrAfter } from '../../lib/recurrence';
import { myShareOrTotal, txnTotal } from '../../lib/splitMath';
import { colors, layout } from '../tokens';
import type { TxnWithSplits } from '../../db/queries/transactions';

type Props = {
  rule: TxnWithSplits;
  /** Whose share to show. Omit to show the rule's full amount. */
  meId?: string;
  onPress?: () => void;
  /** Adds "· next Mar 5" to the subtitle. */
  showNext?: boolean;
  /** Labels the amount "your share" underneath. */
  showShareLabel?: boolean;
};

/**
 * One recurring rule as a row: category icon, name, cadence, amount.
 *
 * The *derivations* were the real duplication here, not the styling — three
 * places each worked out that the display name is `note || category`, that the
 * amount is the caller's share of `shares` (falling back to the rule total), and
 * how to word the cadence. They disagreed in the process: the group tab showed
 * the full total with "your share" beside it, Personal showed only your share,
 * and the icon disc was 40px/r20 in one and 32px/r16 in the other.
 *
 * Composed over `ListRow` rather than being a fourth row implementation.
 */
export function RecurringRow({ rule, meId, onPress, showNext, showShareLabel }: Props) {
  const visual = categoryVisual(rule.category);
  const name = rule.note?.trim() || rule.category;

  const amount = meId ? myShareOrTotal(rule, meId) : txnTotal(rule);

  const next = showNext ? nextOccurrenceOnOrAfter(rule, Date.now()) : null;
  const paused = rule.recur_state !== 'active' ? `${rule.recur_state} · ` : '';
  const subtitle = `${paused}${freqWord(rule.recur_freq)}${next ? ` · next ${format(next, 'MMM d')}` : ''}`;

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
        <AmountText
          paise={amount}
          size="sm"
          forceColor={colors.textPrimary}
          rounded
        />
      }
      chevron={!!onPress}
      onPress={onPress}
      accessibilityLabel={showShareLabel ? `${name}, your share` : name}
    />
  );
}
