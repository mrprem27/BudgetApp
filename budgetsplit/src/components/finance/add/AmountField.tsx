import React from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PressableScale } from '../../ui/PressableScale';
import { colors, type, space, layout } from '../../tokens';
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
  /** Opens the dictation sheet. Omitted while editing, where re-dictating would overwrite. */
  onOpenVoice?: () => void;
};

/**
 * The big centered amount input. Colour + placeholder follow the kind.
 *
 * The two shortcuts under it — dictate and adjust — are **icon discs, not text links**.
 * They were a pair of centred captions ("Say it instead" above the field, "Split · tip · tax"
 * below it) that sandwiched the hero and competed with it for the eye; the upper one also
 * pushed the amount down the screen. AGENTS §1 allows one hero per screen, and on this screen
 * the amount is it.
 *
 * Left-aligned on purpose: centring them would put a second axis of symmetry directly under
 * the centred hero, which is what made the old pair read as part of the number rather than as
 * tools beside it.
 */
export function AmountField({
  amountText, onChangeText, kind, autoFocus, transferScopeBal = 0, onOpenCalculator, onOpenVoice,
}: Props) {
  const color = kindAmountColor(kind);
  const cursor = kindAccent(kind);

  // The calculator only appears once there is something to adjust — an empty field has
  // nothing to split or tax, and the button would just be a second way to start typing.
  const showCalc = onOpenCalculator != null && amountText.length > 0;
  const showVoice = onOpenVoice != null;

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

      {(showVoice || showCalc) && (
        <View style={styles.tools}>
          {showVoice && (
            <Disc
              icon="mic"
              tint={cursor}
              onPress={onOpenVoice!}
              // The word moves into the label rather than off the screen — the glyph alone
              // would leave a screen-reader user with "button".
              label="Say the amount and what it was for"
            />
          )}
          {showCalc && (
            <Disc
              icon="divide-circle"
              tint={cursor}
              onPress={onOpenCalculator!}
              label="Adjust amount — split, tip or tax"
            />
          )}
        </View>
      )}
    </View>
  );
}

/** A 32pt disc with a 44pt tap target, per AGENTS §6/§8. */
function Disc({ icon, tint, onPress, label }: {
  icon: keyof typeof Feather.glyphMap; tint: string; onPress: () => void; label: string;
}) {
  return (
    <PressableScale
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={label}
      style={[styles.disc, { backgroundColor: alpha(tint, 20), borderColor: alpha(tint, 33) }]}
    >
      <Feather name={icon} size={15} color={tint} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  amountBlock: { paddingBottom: space.md, borderBottomWidth: 1, borderColor: alpha(colors.border, 33) },
  // `type.amountXL` is the hero-number token (SpaceMono 36). This used to
  // re-declare the size with its own letterSpacing (-1.5 vs the token's -0.5),
  // so the app's biggest number was the one number off-token.
  amountInput: { ...type.amountXL, textAlign: 'center', paddingVertical: space.xs, alignSelf: 'stretch', width: '100%' },
  amountCursor: { width: 48, height: 2, borderRadius: 1, marginTop: space.xs, alignSelf: 'center' },
  tools: { flexDirection: 'row', gap: space.sm, marginTop: space.smd },
  disc: {
    width: layout.iconCircle,
    height: layout.iconCircle,
    borderRadius: layout.iconCircle / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
