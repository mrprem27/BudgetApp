import React from 'react';
import { Text, StyleSheet, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ListRow } from '../../ui/ListRow';
import { colors, type, space } from '../../tokens';

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
 *
 * It is a `ListRow` with a field in its value slot, not a private row shape. It used
 * to redeclare `ListRow`'s geometry by hand and got one number different — a 40pt
 * `IconCircle` where `ListRow` uses 32 — which put the icon 8pt wider than
 * `layout.dividerIndent`, so the dividers between these rows started under the discs
 * instead of clearing them. That is the whole reason §4 says not to hand-roll a row.
 */
export function MoneyRow({ icon, label, value, onChangeText, tint = colors.accent, accessibilityLabel }: Props) {
  return (
    <ListRow
      icon={icon}
      iconColor={tint}
      title={label}
      chevron={false}
      value={
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
      }
    />
  );
}

const styles = StyleSheet.create({
  valueWrap: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  rupee: { ...type.amountSM, color: colors.textMuted },
  // `minWidth` so an empty field still shows a tappable target beside the ₹, and
  // `flexShrink` so a ten-digit figure narrows rather than pushing the label out.
  input: { ...type.amountMD, color: colors.textPrimary, padding: 0, minWidth: 72, flexShrink: 1, textAlign: 'right' },
});
