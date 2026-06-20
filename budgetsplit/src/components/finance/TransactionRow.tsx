import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { AmountText } from '../ui/AmountText';
import { colors, type, space } from '../tokens';
import { formatRupees, formatCompact } from '../../lib/money';
import { categoryVisual } from '../../constants/categories';
import type { TxnWithSplits } from '../../db/queries/transactions';
import type { Person } from '../../db/queries/persons';

type Props = {
  txn: TxnWithSplits;
  myId: string;
  onPress?: () => void;
  onDelete?: () => void;
  showDate?: boolean;
  members?: Person[];
  isPersonal?: boolean;
};

export const TransactionRow = React.memo(function TransactionRow({ txn, myId, onPress, onDelete, showDate = false, members, isPersonal }: Props) {
  const myShare = txn.shares.find(s => s.personId === myId)?.amount ?? 0;
  const nameOf = (pid?: string) => members?.find(m => m.id === pid)?.name ?? 'Someone';

  // Title + signed amount. Settlements read directionally (who paid whom); the
  // payer has no share, so the old `-myShare` showed ₹0 for them.
  let title = txn.category;
  let displayAmount: number;
  if (txn.kind === 'income') {
    displayAmount = txn.payments.find(p => p.personId === myId)?.amount ?? 0;
  } else if (txn.kind === 'settlement') {
    const fromId = txn.payments[0]?.personId;
    const toId = txn.shares[0]?.personId;
    const amount = txn.payments[0]?.amount ?? 0;
    const iPaid = fromId === myId;
    const iGot = toId === myId;
    displayAmount = iPaid ? -amount : amount; // out when I paid, in when I received
    if (members && !isPersonal) {
      title = iPaid ? `You paid ${nameOf(toId)}`
        : iGot ? `${nameOf(fromId)} paid you`
        : `${nameOf(fromId)} paid ${nameOf(toId)}`;
    }
  } else {
    displayAmount = -myShare;
  }

  const visual = txn.kind === 'income'
    ? { icon: 'trending-up' as const, color: colors.income }
    : txn.kind === 'settlement'
    ? { icon: 'check-circle' as const, color: colors.settle }
    : categoryVisual(txn.category);

  // Attribution line — "you lent / you borrowed" on shared-group expenses.
  let attribution: { text: string; color: string } | null = null;
  if (members && !isPersonal && txn.kind === 'expense') {
    const myPaid = txn.payments.find(p => p.personId === myId)?.amount ?? 0;
    const lent = myPaid - myShare;
    if (lent > 0) {
      attribution = { text: `you lent ${formatCompact(lent)}`, color: colors.income };
    } else if (lent < 0) {
      attribution = { text: `you borrowed ${formatCompact(-lent)}`, color: colors.expense };
    }
  }

  const hasAttachment = !!txn.attachment_uri;

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      onLongPress={onDelete}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={`${txn.category}: ${formatRupees(Math.abs(displayAmount))}`}
    >
      <View style={[styles.iconCircle, { backgroundColor: visual.color + '22' }]}>
        <Feather name={visual.icon} size={18} color={visual.color} />
      </View>
      <View style={styles.middle}>
        <Text style={styles.category} numberOfLines={1}>{title}</Text>
        {txn.note ? <Text style={styles.note} numberOfLines={1}>{txn.note}</Text> : null}
        {attribution && <Text style={[styles.attribution, { color: attribution.color }]} numberOfLines={1}>{attribution.text}</Text>}
      </View>
      <View style={styles.right}>
        {/* Sign-colored: + received (green) / − paid out (red). The purple icon
            already marks it as a settlement, so the amount can show direction. */}
        <AmountText paise={displayAmount} size="sm" />
        <View style={styles.rightMeta}>
          {hasAttachment && <Feather name="paperclip" size={12} color={colors.textMuted} />}
          {showDate && Number.isFinite(txn.date) && (
            <Text style={styles.date}>{format(new Date(txn.date), 'd MMM')}</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
    minHeight: 64,
    gap: space.sm,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: {
    flex: 1,
  },
  right: {
    alignItems: 'flex-end',
  },
  category: {
    ...type.body,
    color: colors.textPrimary,
  },
  note: {
    ...type.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  attribution: {
    ...type.caption,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 2,
  },
  date: {
    ...type.caption,
    color: colors.textMuted,
  },
  rightMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
});
