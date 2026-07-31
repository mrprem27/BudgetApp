import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, type, space, radius } from '../../tokens';
import { haptic } from '../../../lib/haptics';

export type AddKind = 'income' | 'expense' | 'transfer';

type Props = { kind: AddKind; onSelect: (k: AddKind) => void; showTransfer?: boolean };

const TINT: Record<AddKind, string> = {
  expense: colors.accent,
  transfer: colors.settle,
  income: colors.income,
};

/**
 * Expense / Transfer / Income segmented toggle at the top of Add.
 *
 * Refined: 13pt labels (was 11pt — near-illegible), 40pt tall pill with
 * bigger inner active tab, selection haptic on switch, subtle border on
 * the track for definition on the dark background.
 */
export function KindToggle({ kind, onSelect, showTransfer = true }: Props) {
  const kinds: AddKind[] = showTransfer ? ['expense', 'transfer', 'income'] : ['expense', 'income'];
  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        {kinds.map(k => {
          const active = kind === k;
          const label = k === 'expense' ? 'Expense' : k === 'transfer' ? 'Transfer' : 'Income';
          return (
            <TouchableOpacity
              key={k}
              style={[styles.btn, active && { backgroundColor: TINT[k] }]}
              onPress={() => { if (!active) haptic.selection(); onSelect(k); }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              hitSlop={{ top: 6, bottom: 6 }}
            >
              <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingBottom: space.md },
  track: {
    flexDirection: 'row',
    backgroundColor: colors.bgMuted,
    borderRadius: radius.pill,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btn: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    minWidth: 88,
    alignItems: 'center',
  },
  label: { ...type.label, color: colors.textSecondary, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.2 },
  labelActive: { color: colors.bg },
});
