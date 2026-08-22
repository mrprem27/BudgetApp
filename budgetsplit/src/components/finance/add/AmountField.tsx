import React from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PressableScale } from '../../ui/PressableScale';
import { colors, type, space, layout } from '../../tokens';
import { formatAmountInput, sanitizeAmountInput, formatRupees } from '../../../lib/money';
import { kindAccent, kindAmountColor } from '../../../lib/kindTheme';
import type { AddKind } from '../../../constants/enums';
import { alpha } from '../../../theme';

/** One 32pt disc plus breathing room, reserved on BOTH sides so the number
 *  stays optically centred rather than shifting when the tool appears. */
const TOOLS_W = layout.iconCircle + space.sm;

type Props = {
  amountText: string;
  onChangeText: (raw: string) => void;
  kind: AddKind;
  autoFocus: boolean;
  /** Transfer placeholder shows the outstanding balance when there is one. */
  transferScopeBal?: number;
  /** Opens the arithmetic sheet. Omitted where adjusting makes no sense. */
  onOpenCalculator?: () => void;
  /**
   * Opens the dictation sheet.
   *
   * **Parked, not deleted.** The mic is off for now: it sat beside the calculator
   * on the amount row, which put two competing shortcuts on the app's one hero
   * number for a capture path most entries never use. The sheet, the deep link and
   * the Siri shortcut all still work — only this entry point is withdrawn, so
   * turning it back on is passing the prop again.
   */
  onOpenVoice?: () => void;
};

/**
 * The big centered amount input. Colour + placeholder follow the kind.
 *
 * The adjust shortcut is an **icon disc on the amount row itself**, pinned to its
 * bottom-right corner. They were a pair of centred captions sandwiching the hero, then
 * a left-aligned pair *below* it: floating under a centred number, they read as a second
 * element rather than as tools belonging to the field. On the row, they are unmistakably
 * about the amount and cost no vertical space. AGENTS §1 allows one hero per screen, and
 * here it is the number.
 *
 * The input keeps symmetric padding for the tools so a long amount can never run under
 * them while staying optically centred.
 */
export function AmountField({
  amountText, onChangeText, kind, autoFocus, transferScopeBal = 0, onOpenCalculator, onOpenVoice,
}: Props) {
  const color = kindAmountColor(kind);
  const cursor = kindAccent(kind);

  /*
   * Shrink a long amount instead of letting it overflow.
   *
   * `adjustsFontSizeToFit` is a `Text` prop — `TextInput` does not have it on
   * either platform — so the size is derived from the string that is actually
   * rendered, grouping separators and all. At the 9-digit cap that string is 16
   * characters ("₹99,99,99,999"), which does not fit any phone width at 36pt.
   *
   * Steps rather than a continuous ratio: a size that moves on every keystroke
   * makes the number visibly wobble while you type.
   */
  const shown = formatAmountInput(amountText);
  const fontSize = shown.length <= 9 ? type.amountXL.fontSize
    : shown.length <= 12 ? type.amountXL.fontSize * 0.78
    : type.amountXL.fontSize * 0.62;

  // The calculator only appears once there is something to adjust — an empty field has
  // nothing to split or tax, and the button would just be a second way to start typing.
  const showCalc = onOpenCalculator != null && amountText.length > 0;
  // The mic is parked — see `onOpenVoice`. Deliberately ignored rather than the
  // prop removed, so callers keep compiling and it is one line to restore.
  const hasTools = showCalc;

  return (
    <View style={styles.amountBlock}>
      <View style={styles.amountRow}>
        <TextInput
          style={[styles.amountInput, { color, fontSize }, hasTools && { paddingHorizontal: TOOLS_W }]}
          value={formatAmountInput(amountText)}
          onChangeText={(t) => onChangeText(sanitizeAmountInput(t))}
          keyboardType="decimal-pad"
          placeholder={kind === 'transfer' && transferScopeBal > 0 ? formatRupees(transferScopeBal) : '₹0'}
          placeholderTextColor={kind === 'income' ? alpha(colors.income, 33) : colors.textMuted}
          accessibilityLabel="Amount"
          autoFocus={autoFocus}
        />
        {showCalc && (
          <View style={styles.tools}>
            <Disc
              icon="divide-circle"
              tint={cursor}
              onPress={onOpenCalculator!}
              label="Adjust amount — split, tip or tax"
            />
          </View>
        )}
      </View>
      <View style={[styles.amountCursor, { backgroundColor: cursor }]} />
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
  // Room above and below: the amount is the hero, and it was sitting tight
  // against the kind switcher above and the category row below, which made all
  // three read as one dense block instead of a headline with its controls.
  amountBlock: {
    paddingTop: space.md,
    paddingBottom: space.lg,
    borderBottomWidth: 1,
    borderColor: alpha(colors.border, 33),
  },
  // `type.amountXL` is the hero-number token (SpaceMono 36). This used to
  // re-declare the size with its own letterSpacing (-1.5 vs the token's -0.5),
  // so the app's biggest number was the one number off-token.
  amountInput: { ...type.amountXL, textAlign: 'center', paddingVertical: space.xs, alignSelf: 'stretch', width: '100%' },
  amountCursor: { width: 48, height: 2, borderRadius: 1, marginTop: space.xs, alignSelf: 'center' },
  amountRow: { flexDirection: 'row', alignItems: 'center' },
  // Absolute so the input keeps the full row and stays optically centred.
  //
  // Pinned to the BOTTOM of the row, not centred on it: level with a 36pt number,
  // the disc read as floating inside the field rather than sitting beside it, and
  // on a short amount it landed almost against the digits. On the baseline it
  // reads as a tool attached to the amount block.
  tools: { position: 'absolute', right: 0, bottom: 0, flexDirection: 'row', gap: space.sm },
  disc: {
    width: layout.iconCircle,
    height: layout.iconCircle,
    borderRadius: layout.iconCircle / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
