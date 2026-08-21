import React from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, layout } from '../../tokens';
import { IconCircle } from '../../ui/IconCircle';
import { categoryVisual } from '../../../constants/categories';
import { formatCompact, parseToPaise } from '../../../lib/money';
import type { BudgetCadence } from '../../../db/queries/categoryBudgets';
import type { InheritedLine } from '../../../lib/budgetEditor';

export const CADENCE_LABEL: Record<BudgetCadence, string> = {
  daily: 'Daily', monthly: 'Monthly', yearly: 'Yearly',
};

/**
 * One category's budget row.
 *
 * When editing your own budget in a group, a row you haven't typed into shows the
 * group's amount as a placeholder with a "Group default" caption — so a blank field
 * reads as "still following the group" rather than as "no budget". Tapping the
 * caption takes the line as yours, which is also how its cadence becomes editable.
 */
export function BudgetAmountRow({
  category, value, cadence, inherited, autoFocus, onChange, onPressCadence, onPromote,
}: {
  category: string;
  value: string;
  cadence: BudgetCadence;
  /** The group default this row would follow if left blank. */
  inherited?: InheritedLine;
  autoFocus?: boolean;
  onChange: (v: string) => void;
  onPressCadence: () => void;
  onPromote: () => void;
}) {
  const vis = categoryVisual(category);
  const hasAmt = parseToPaise(value) > 0;

  return (
    <View style={styles.row}>
      <IconCircle icon={vis.icon} size={layout.iconCircle} color={vis.color} />
      <View style={styles.mid}>
        <Text style={styles.name} numberOfLines={1}>{category}</Text>
        {hasAmt ? (
          <TouchableOpacity
            style={styles.cadence}
            onPress={onPressCadence}
            accessibilityRole="button"
            accessibilityLabel={`Cadence: ${CADENCE_LABEL[cadence]}`}
          >
            <Feather name="repeat" size={11} color={colors.textSecondary} />
            <Text style={styles.cadenceText}>{CADENCE_LABEL[cadence]}</Text>
            <Feather name="chevron-down" size={12} color={colors.textMuted} />
          </TouchableOpacity>
        ) : inherited ? (
          <TouchableOpacity
            onPress={onPromote}
            accessibilityRole="button"
            accessibilityLabel={`Following the group default for ${category}. Tap to make it yours.`}
          >
            <Text style={styles.inherited}>
              Group default · {CADENCE_LABEL[inherited.cadence]}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {/* No border of its own: AGENTS §4 — an inline field inside a card row is
          right-aligned, never a second box. */}
      <View style={styles.amountWrap}>
        <Text style={[styles.rupee, hasAmt && { color: colors.textSecondary }]}>₹</Text>
        <TextInput
          style={[styles.input, hasAmt && styles.inputSet]}
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          placeholder={inherited ? formatCompact(inherited.amount).replace('₹', '') : '0'}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={`${category} budget`}
          autoFocus={autoFocus}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.smd,
    paddingHorizontal: space.md, minHeight: layout.rowMinHeight,
  },
  mid: { flex: 1, gap: 2 },
  name: { ...type.body, color: colors.textPrimary },
  cadence: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  cadenceText: { ...type.caption, color: colors.textSecondary },
  inherited: { ...type.caption, color: colors.textMuted },
  amountWrap: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  rupee: { ...type.body, color: colors.textMuted },
  input: { ...type.body, color: colors.textPrimary, minWidth: 72, textAlign: 'right', paddingVertical: space.sm },
  inputSet: { ...type.amountMD, color: colors.textPrimary },
});
