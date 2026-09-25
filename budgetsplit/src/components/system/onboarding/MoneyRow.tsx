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
 * available stays the hero (`StepAmountField`) — `SPEC-2026-09-FEEDBACK.md` §2 O5 briefly moved it in
 * here too, behind a fifth chip, and that was cut on review as more friction than the
 * layout it replaced, not less. Bank, wallet, investments and credit are these quiet
 * rows inside one `Card`.
 *
 * The input has no border of its own (AGENTS.md §4: an inline field inside a card row
 * never gets a second box), and it's right-aligned so the digits line up down the card.
 *
 * It is a `ListRow` with a field in its value slot, not a private row shape. What it
 * had been was a hand-written copy of `ListRow`'s geometry that agreed on every
 * number except one: `paddingVertical: space.sm` where `ListRow` uses `space.md`.
 * So these rows sat 12pt shorter than every other row in the app — not wrong on its
 * own, but a second row height nobody chose, which is the drift §4 exists to stop.
 * The discs and dividers were always correct here (`layout.iconCircle`, 16 + 32 + 16
 * = `layout.dividerIndent`); delegating keeps them correct by construction.
 *
 * (An earlier version of this note blamed a 40pt disc and misaligned dividers. That
 * was the hand-rolled **person row** on the people step, a different component,
 * deleted in the same change — and even there the divider cleared the disc and fell
 * short of the label, rather than running underneath it.)
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
