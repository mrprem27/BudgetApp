import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { AmountText } from '../ui/AmountText';
import { MemberAvatar } from './MemberAvatar';
import { colors, type, space, radius } from '../tokens';
import type { Person } from '../../db/queries/persons';

type Props = {
  from: Person;
  to: Person;
  amount: number;
  onPaid?: () => void;
};

export function BalanceRow({ from, to, amount, onPaid }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.avatars}>
        <MemberAvatar name={from.name} color={from.avatar_color} size={36} imageUri={from.image_uri} />
        <View style={styles.avatarOverlap}>
          <MemberAvatar name={to.name} color={to.avatar_color} size={28} imageUri={to.image_uri} />
        </View>
      </View>
      <View style={styles.names}>
        <Text style={styles.sentence} numberOfLines={1}>
          <Text style={styles.bold}>{from.name}</Text>
          {' owes '}
          <Text style={styles.bold}>{to.name}</Text>
        </Text>
      </View>
      <View style={styles.right}>
        <AmountText paise={amount} size="md" style={styles.amount} forceColor={colors.accent} />
        {onPaid && (
          <TouchableOpacity
            style={styles.paidBtn}
            onPress={onPaid}
            accessibilityRole="button"
            accessibilityLabel="Record payment"
          >
            <Text style={styles.paidText}>Settle</Text>
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
    gap: space.sm,
  },
  avatars: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 52,
  },
  avatarOverlap: {
    marginLeft: -12,
    borderWidth: 2,
    borderColor: colors.bgCard,
    borderRadius: 16,
  },
  names: {
    flex: 1,
    flexShrink: 1,
  },
  sentence: {
    ...type.body,
    color: colors.textSecondary,
  },
  bold: {
    color: colors.textPrimary,
    fontFamily: 'Inter_600SemiBold',
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
