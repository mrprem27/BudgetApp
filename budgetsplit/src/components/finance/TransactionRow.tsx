import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { AmountText } from '../ui/AmountText';
import { colors, type, space } from '../tokens';
import { formatRupees } from '../../lib/money';
import { categoryVisual } from '../../constants/categories';
import type { TxnWithSplits } from '../../db/queries/transactions';

type Props = {
  txn: TxnWithSplits;
  myId: string;
  onPress?: () => void;
  onDelete?: () => void;
  showDate?: boolean;
};

export const TransactionRow = React.memo(function TransactionRow({ txn, myId, onPress, onDelete, showDate = false }: Props) {
  const myShare = txn.shares.find(s => s.personId === myId)?.amount ?? 0;
  const displayAmount = txn.kind === 'income'
    ? txn.payments.find(p => p.personId === myId)?.amount ?? 0
    : -myShare;

  const visual = txn.kind === 'income'
    ? { icon: 'trending-up' as const, color: colors.income }
    : txn.kind === 'settlement'
    ? { icon: 'check-circle' as const, color: colors.settle }
    : categoryVisual(txn.category);

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
        <Text style={styles.category} numberOfLines={1}>{txn.category}</Text>
        {txn.note ? <Text style={styles.note} numberOfLines={1}>{txn.note}</Text> : null}
      </View>
      <View style={styles.right}>
        <AmountText
          paise={displayAmount}
          size="sm"
          forceColor={txn.kind === 'settlement' ? colors.settle : undefined}
        />
        {showDate && Number.isFinite(txn.date) && (
          <Text style={styles.date}>{format(new Date(txn.date), 'd MMM')}</Text>
        )}
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
  date: {
    ...type.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
});
