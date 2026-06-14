import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AmountText } from './AmountText';
import { colors, type, space } from './tokens';
import { formatRupees } from '../lib/money';
import type { TxnWithSplits } from '../db/queries/transactions';

const CATEGORY_ICONS: Record<string, string> = {
  Food: 'coffee', Groceries: 'shopping-cart', Rent: 'home',
  Utilities: 'zap', Travel: 'map', Fuel: 'droplet',
  Medical: 'heart', Shopping: 'tag', Subscriptions: 'repeat',
  Settlement: 'check-circle', Income: 'trending-up', Other: 'more-horizontal',
};

type Props = {
  txn: TxnWithSplits;
  myId: string;
  onPress?: () => void;
  onDelete?: () => void;
};

export function TransactionRow({ txn, myId, onPress, onDelete }: Props) {
  const icon = CATEGORY_ICONS[txn.category] ?? 'circle';
  const myShare = txn.shares.find(s => s.personId === myId)?.amount ?? 0;
  const displayAmount = txn.kind === 'income'
    ? txn.payments.find(p => p.personId === myId)?.amount ?? 0
    : -myShare;

  const kindColor = txn.kind === 'income'
    ? colors.income
    : txn.kind === 'settlement'
    ? colors.settle
    : colors.expense;

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      onLongPress={onDelete}
      accessibilityRole="button"
      accessibilityLabel={`${txn.category}: ${formatRupees(Math.abs(displayAmount))}`}
    >
      <View style={[styles.iconCircle, { backgroundColor: kindColor + '22' }]}>
        <Feather name={icon as any} size={18} color={kindColor} />
      </View>
      <View style={styles.middle}>
        <Text style={styles.category}>{txn.category}</Text>
        {txn.note ? <Text style={styles.note} numberOfLines={1}>{txn.note}</Text> : null}
      </View>
      <AmountText
        paise={displayAmount}
        size="sm"
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
