import React from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { colors, type, space } from '../../tokens';
import { formatAmountInput, sanitizeAmountInput, formatRupees } from '../../../lib/money';
import type { AddKind } from './KindToggle';
import { alpha } from '../../../theme';

type Props = {
  amountText: string;
  onChangeText: (raw: string) => void;
  kind: AddKind;
  autoFocus: boolean;
  /** Transfer placeholder shows the outstanding balance when there is one. */
  transferScopeBal?: number;
};

/**
 * The big centered amount input. Colour follows the kind.
 *
 * Refined: uses `type.amountXXL` (48pt tabular) — was hand-set 36pt.
 * The animated underline stays the same but a hair thicker for presence.
 * Placeholder is dimmer so the field doesn't feel filled before you type.
 */
export function AmountField({ amountText, onChangeText, kind, autoFocus, transferScopeBal = 0 }: Props) {
  const color = kind === 'income' ? colors.income : kind === 'transfer' ? colors.settle : colors.textPrimary;
  const cursor = kind === 'income' ? colors.income : kind === 'transfer' ? colors.settle : colors.accent;
  return (
    <View style={styles.block}>
      <TextInput
        style={[styles.input, { color }]}
        value={formatAmountInput(amountText)}
        onChangeText={(t) => onChangeText(sanitizeAmountInput(t))}
        keyboardType="decimal-pad"
        placeholder={kind === 'transfer' && transferScopeBal > 0 ? formatRupees(transferScopeBal) : '₹0'}
        placeholderTextColor={alpha(colors.textMuted, 33)}
        accessibilityLabel="Amount"
        autoFocus={autoFocus}
      />
      <View style={[styles.cursor, { backgroundColor: cursor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { alignItems: 'center', paddingBottom: space.md, paddingTop: space.sm, borderBottomWidth: 1, borderColor: alpha(colors.border, 33) },
  input: { ...type.amountXXL, textAlign: 'center', paddingVertical: space.xs, alignSelf: 'stretch', width: '100%' },
  cursor: { width: 56, height: 3, borderRadius: 2, marginTop: space.sm },
});
