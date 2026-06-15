import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AmountText } from './AmountText';
import { colors, type, space } from './tokens';
import { formatRupees } from '../lib/money';
import { categoryVisual } from '../constants/categories';
import type { TxnWithSplits } from '../db/queries/transactions';

type Props = {
  txn: TxnWithSplits;
  myId: string;
  onPress?: () => void;
  onDelete?: () => void;
};

export function TransactionRow({ txn, myId, onPress, onDelete }: Props) {
  const myShare = txn.shares.find(s => s.personId === myId)?.amount ?? 0;
  const displayAmount = txn.kind === 'income'
    ? txn.payments.find(p => p.personId === myId)?.amount ?? 0
    : -myShare;

  // Income & settlements get fixed treatment; expenses use the category's own
  // icon + colour from the catalog (falls back to a tag for custom categories).
  const visual = txn.kind === 'income'
    ? { icon: 'trending-up', color: colors.income }
    : txn.kind === 'settlement'
    ? { icon: 'check-circle', color: colors.settle }
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
        <Feather name={visual.icon as any} size={18} color={visual.color} />
      </View>
      <View style={styles.middle}>
        <Text style={styles.category} numberOfLines={1}>{txn.category}</Text>
        {txn.note ? <Text style={styles.note} numberOfLines={1}>{txn.note}</Text> : null}
      </View>
      <AmountText
        paise={displayAmount}
        size="sm"
        style={styles.amount}
        forceColor={txn.kind === 'settlement' ? colors.settle : undefined}
      />
    </TouchableOpacity>
  );
}

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
  amount: {
    marginLeft: space.xs,
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
});
