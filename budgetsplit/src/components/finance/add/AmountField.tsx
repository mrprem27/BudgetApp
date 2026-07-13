import React from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { colors, space } from '../../tokens';
import { formatAmountInput, sanitizeAmountInput, formatRupees } from '../../../lib/money';
import type { AddKind } from './KindToggle';

type Props = {
  amountText: string;
  onChangeText: (raw: string) => void;
  kind: AddKind;
  autoFocus: boolean;
  /** Transfer placeholder shows the outstanding balance when there is one. */
  transferScopeBal?: number;
};

/** The big centered amount input. Colour + placeholder follow the kind. */
export function AmountField({ amountText, onChangeText, kind, autoFocus, transferScopeBal = 0 }: Props) {
  const color = kind === 'income' ? colors.income : kind === 'transfer' ? colors.settle : colors.textPrimary;
  const cursor = kind === 'income' ? colors.income : kind === 'transfer' ? colors.settle : colors.accent;
  return (
    <View style={styles.amountBlock}>
      <TextInput
        style={[styles.amountInput, { color }]}
        value={formatAmountInput(amountText)}
        onChangeText={(t) => onChangeText(sanitizeAmountInput(t))}
        keyboardType="decimal-pad"
        placeholder={kind === 'transfer' && transferScopeBal > 0 ? formatRupees(transferScopeBal) : '₹0'}
        placeholderTextColor={kind === 'income' ? colors.income + '55' : colors.textMuted}
        accessibilityLabel="Amount"
        autoFocus={autoFocus}
      />
      <View style={[styles.amountCursor, { backgroundColor: cursor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  amountBlock: { alignItems: 'center', paddingBottom: space.md, borderBottomWidth: 1, borderColor: colors.border + '55' },
  amountInput: { fontFamily: 'SpaceMono_400Regular', fontSize: 36, textAlign: 'center', letterSpacing: -1.5, paddingVertical: space.xs, alignSelf: 'stretch', width: '100%' },
  amountCursor: { width: 48, height: 2, borderRadius: 1, marginTop: space.xs },
});
