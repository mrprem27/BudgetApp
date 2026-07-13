import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, space } from '../../tokens';

export type AddKind = 'income' | 'expense' | 'transfer';

type Props = { kind: AddKind; onSelect: (k: AddKind) => void };

/** Expense / Transfer / Income segmented toggle at the top of Add. Presentational —
 *  the side effects of switching kind (reloading the category catalog, picking the
 *  right group) live in the form hook via `onSelect`. */
export function KindToggle({ kind, onSelect }: Props) {
  return (
    <View style={styles.kindToggleRow}>
      <View style={styles.kindRow}>
        <TouchableOpacity
          style={[styles.kindBtn, kind === 'expense' && styles.kindBtnExpenseActive]}
          onPress={() => onSelect('expense')}
          accessibilityRole="button"
          accessibilityState={{ selected: kind === 'expense' }}
        >
          <Text style={[styles.kindLabel, kind === 'expense' && styles.kindLabelActive]}>Expense</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.kindBtn, kind === 'transfer' && styles.kindBtnTransferActive]}
          onPress={() => onSelect('transfer')}
          accessibilityRole="button"
          accessibilityState={{ selected: kind === 'transfer' }}
        >
          <Text style={[styles.kindLabel, kind === 'transfer' && styles.kindLabelTransferActive]}>Transfer</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.kindBtn, kind === 'income' && styles.kindBtnIncomeActive]}
          onPress={() => onSelect('income')}
          accessibilityRole="button"
          accessibilityState={{ selected: kind === 'income' }}
        >
          <Text style={[styles.kindLabel, kind === 'income' && styles.kindLabelIncomeActive]}>Income</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  kindToggleRow: { alignItems: 'center', paddingTop: space.xs, paddingBottom: space.sm },
  kindRow: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 100, padding: 3, borderWidth: 1, borderColor: colors.border },
  kindBtn: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 100 },
  kindBtnExpenseActive: { backgroundColor: colors.accent },
  kindBtnIncomeActive: { backgroundColor: colors.income },
  kindBtnTransferActive: { backgroundColor: colors.settle },
  kindLabel: { fontSize: 11, color: colors.textMuted, fontFamily: 'Inter_600SemiBold' },
  kindLabelActive: { color: colors.bg, fontFamily: 'Inter_600SemiBold' },
  kindLabelIncomeActive: { color: colors.bg, fontFamily: 'Inter_600SemiBold' },
  kindLabelTransferActive: { color: colors.bg, fontFamily: 'Inter_600SemiBold' },
});
