import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AmountText } from './AmountText';
import { MemberAvatar } from './MemberAvatar';
import { colors, type, space, radius } from './tokens';
import type { Person } from '../db/queries/persons';

type Props = {
  from: Person;
  to: Person;
  amount: number;
  onPaid?: () => void;
};

export function BalanceRow({ from, to, amount, onPaid }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.persons}>
        <MemberAvatar name={from.name} color={from.avatar_color} size={36} />
        <Feather name="arrow-right" size={14} color={colors.textMuted} style={styles.arrow} />
        <MemberAvatar name={to.name} color={to.avatar_color} size={36} />
        <View style={styles.names}>
          <Text style={styles.fromName} numberOfLines={1}>{from.name}</Text>
          <Text style={styles.toName} numberOfLines={1}>pays {to.name}</Text>
        </View>
      </View>
      <View style={styles.right}>
        <AmountText paise={amount} size="md" style={styles.amount} forceColor={colors.accent} />
        {onPaid && (
          <TouchableOpacity
            style={styles.paidBtn}
            onPress={onPaid}
            accessibilityRole="button"
            accessibilityLabel="Mark as paid"
          >
            <Text style={styles.paidText}>Paid</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
    minHeight: 56,
  },
  persons: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  arrow: {
    marginHorizontal: space.xs,
  },
  names: {
    marginLeft: space.sm,
    flex: 1,
    flexShrink: 1,
  },
  fromName: {
    ...type.body,
    color: colors.textPrimary,
  },
  toName: {
    ...type.label,
    color: colors.textSecondary,
  },
  right: {
    alignItems: 'flex-end',
    gap: space.xs,
    marginLeft: space.sm,
  },
  amount: {
    minWidth: 70,
    textAlign: 'right',
  },
  paidBtn: {
    backgroundColor: colors.accentMuted,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
  },
  paidText: {
    ...type.label,
    color: colors.accent,
    fontFamily: 'Inter_600SemiBold',
  },
});
