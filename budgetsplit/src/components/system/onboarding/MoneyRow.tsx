import React from 'react';
import { Text, StyleSheet, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { IconCircle } from '../../ui/IconCircle';
import { colors, type, space, layout } from '../../tokens';

type Props = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  tint?: string;
  accessibilityLabel: string;
};

/**
 * One secondary money figure on the onboarding Money step: `[icon] label ⟶ ₹input`.
 *
 * The Money step used to ask four numbers as four 40px hero fields stacked down the
 * screen — five equally-loud numbers on one page, which `V2_PRODUCT_REVIEW.md`
 * §150-153 named as the sharpest instance of the whole flow feeling like a form. Cash
 * on hand stays the hero (`StepAmountField`); investments, credit limit and credit used
 * become these quiet rows inside one `Card`.
 *
 * The input has no border of its own (AGENTS.md §4: an inline field inside a card row
 * never gets a second box), and it's right-aligned so the digits line up down the card.
 */
export function MoneyRow({ icon, label, value, onChangeText, tint = colors.accent, accessibilityLabel }: Props) {
  return (
    <View style={styles.row}>
      <IconCircle icon={icon} size={layout.iconCircle} color={tint} />
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueWrap}>
        <Text style={styles.rupee}>₹</Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          maxLength={10}
          accessibilityLabel={accessibilityLabel}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: layout.rowMinHeight,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  label: { ...type.body, color: colors.textPrimary, flex: 1 },
  valueWrap: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  rupee: { ...type.amountSM, color: colors.textMuted },
  input: { ...type.amountMD, color: colors.textPrimary, padding: 0, minWidth: 72, textAlign: 'right' },
});
