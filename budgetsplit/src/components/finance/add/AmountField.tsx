import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
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
  /** Opens the arithmetic sheet. Omitted where adjusting makes no sense. */
  onOpenCalculator?: () => void;
};

/** The big centered amount input. Colour + placeholder follow the kind. */
export function AmountField({ amountText, onChangeText, kind, autoFocus, transferScopeBal = 0, onOpenCalculator }: Props) {
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
      {/* Only offered once there's something to adjust — an empty field has nothing to
          split or tax, and the button would just be a second way to start typing. */}
      {onOpenCalculator && amountText.length > 0 && (
        <TouchableOpacity
          onPress={onOpenCalculator}
          hitSlop={10}
          style={styles.calcBtn}
          accessibilityRole="button"
          accessibilityLabel="Adjust amount — split, tip or tax"
        >
          <Feather name="divide-circle" size={14} color={cursor} />
          <Text style={[styles.calcText, { color: cursor }]}>Split · tip · tax</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  calcBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: space.xs, marginTop: space.sm, paddingVertical: space.xs },
  calcText: { ...type.captionSemi },
  amountBlock: { alignItems: 'center', paddingBottom: space.md, borderBottomWidth: 1, borderColor: alpha(colors.border, 33) },
  // `type.amountXL` is the hero-number token (SpaceMono 36). This used to
  // re-declare the size with its own letterSpacing (-1.5 vs the token's -0.5),
  // so the app's biggest number was the one number off-token.
  amountInput: { ...type.amountXL, textAlign: 'center', paddingVertical: space.xs, alignSelf: 'stretch', width: '100%' },
  amountCursor: { width: 48, height: 2, borderRadius: 1, marginTop: space.xs },
});
