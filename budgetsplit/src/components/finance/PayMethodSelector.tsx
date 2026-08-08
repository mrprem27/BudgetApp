import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { colors, type, space, radius } from '../tokens';
import { haptic } from '../../lib/haptics';
import { PAY_METHOD, PAY_METHOD_LABEL, PAY_METHOD_EMOJI, type PayMethod } from '../../constants/enums';
import { alpha } from '../../theme';

type Props = {
  /** `''` selects nothing — an imported Review row may carry no pay-method cue. */
  value: PayMethod | '';
  onChange: (m: PayMethod) => void;
  /** Accent colour for the selected tile (defaults to the app accent). */
  accent?: string;
  /**
   * Restrict which methods are offered. Income uses this to ask "where did it
   * land?" — money arrives in cash, a bank account or a wallet; it doesn't arrive
   * "by autopay". Defaults to the whole `PAY_METHOD` set.
   */
  options?: readonly PayMethod[];
};

/**
 * The one pay-method picker used everywhere a payment method is chosen (Add
 * expense/income/transfer). Horizontal scroll of emoji tiles driven entirely by
 * the `PAY_METHOD` enum, so the set + labels + glyphs live in exactly one place.
 */
export function PayMethodSelector({ value, onChange, accent = colors.accent, options = PAY_METHOD }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {options.map(m => {
        const on = value === m;
        return (
          <TouchableOpacity
            key={m}
            style={[styles.tile, on && { borderColor: accent, backgroundColor: alpha(accent, 13) }]}
            onPress={() => { haptic.selection(); onChange(m); }}
            accessibilityRole="button"
            accessibilityLabel={PAY_METHOD_LABEL[m]}
            accessibilityState={{ selected: on }}
          >
            <Text style={styles.emoji}>{PAY_METHOD_EMOJI[m]}</Text>
            <Text style={[styles.label, on && { color: accent, fontFamily: 'Inter_600SemiBold' }]}>{PAY_METHOD_LABEL[m]}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.sm, paddingVertical: 2 },
  tile: { alignItems: 'center', gap: space.xs, paddingVertical: space.sm, paddingHorizontal: space.md, minWidth: 68, borderRadius: radius.md, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  emoji: { fontSize: 20 },
  label: { ...type.label, color: colors.textSecondary },
});
