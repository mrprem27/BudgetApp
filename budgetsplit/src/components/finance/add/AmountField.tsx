import React from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { colors, type, space } from '../../tokens';
import { formatAmountInput, sanitizeAmountInput, formatRupees } from '../../../lib/money';
import { kindAccent, kindAmountColor } from '../../../lib/kindTheme';
import type { AddKind } from '../../../constants/enums';
import { alpha } from '../../../theme';

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
  const color = kindAmountColor(kind);
  const cursor = kindAccent(kind);
  return (
    <View style={styles.amountBlock}>
      <TextInput
        style={[styles.amountInput, { color }]}
        value={formatAmountInput(amountText)}
        onChangeText={(t) => onChangeText(sanitizeAmountInput(t))}
        keyboardType="decimal-pad"
        placeholder={kind === 'transfer' && transferScopeBal > 0 ? formatRupees(transferScopeBal) : '₹0'}
        placeholderTextColor={kind === 'income' ? alpha(colors.income, 33) : colors.textMuted}
        accessibilityLabel="Amount"
        autoFocus={autoFocus}
      />
      <View style={[styles.amountCursor, { backgroundColor: cursor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  amountBlock: { alignItems: 'center', paddingBottom: space.md, borderBottomWidth: 1, borderColor: alpha(colors.border, 33) },
  // `type.amountXL` is the hero-number token (SpaceMono 36). This used to
  // re-declare the size with its own letterSpacing (-1.5 vs the token's -0.5),
  // so the app's biggest number was the one number off-token.
  amountInput: { ...type.amountXL, textAlign: 'center', paddingVertical: space.xs, alignSelf: 'stretch', width: '100%' },
  amountCursor: { width: 48, height: 2, borderRadius: 1, marginTop: space.xs },
});
