import React from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { colors, type, space } from '../../tokens';

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  accessibilityLabel: string;
  autoFocus?: boolean;
  maxLength?: number;
};

/**
 * The big rupee figure on an onboarding money step.
 *
 * Underline, not a bordered box. A boxed field reads as *paperwork to fill in*; a large
 * number over a rule reads as *a value being stated*, which is what these steps are
 * actually doing — and it's the single strongest lever on "this doesn't feel like a
 * form". The previous version wrapped it in a 1.5px accent border with 20px radius,
 * which made an optional rough estimate look like a required field.
 *
 * Digits only, and non-numerics are stripped by the caller's handler — these all feed
 * `parseInt`, so a stray separator would silently truncate the amount.
 */
export function StepAmountField({
  value, onChangeText, placeholder = '0', accessibilityLabel, autoFocus, maxLength = 10,
}: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.rupee}>₹</Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          maxLength={maxLength}
          autoFocus={autoFocus}
          accessibilityLabel={accessibilityLabel}
        />
      </View>
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', alignItems: 'center', marginBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: space.xs },
  rupee: { ...type.amountLG, color: colors.textSecondary },
  input: { ...type.amountXL, color: colors.textPrimary, padding: 0, minWidth: 100, textAlign: 'center' },
  rule: { height: 2, alignSelf: 'stretch', marginTop: space.sm, backgroundColor: colors.border, borderRadius: 1 },
});
