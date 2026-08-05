import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, space } from '../../tokens';
import { formatCompact } from '../../../lib/money';
import { alpha } from '../../../theme';
import { AffordVerdict, AffordReason, type AffordResult } from '../../../lib/afford';

type Props = {
  color: string;
  remaining: number;
  categoryName: string;
  /** Verdict from the same engine as /afford. Omit to show only the budget line. */
  afford?: AffordResult | null;
};

/**
 * The single worst thing about this purchase, from the /afford engine. Silent when
 * the verdict is comfortable — "you're fine" is noise on a form.
 */
function affordLine(r: AffordResult, categoryName: string): string | null {
  if (r.verdict === AffordVerdict.Comfortable) return null;
  switch (r.reasons.find(x => x !== AffordReason.Healthy)) {
    case AffordReason.CashShort:
      return `You'd be short ${formatCompact(-r.remaining)} once this month's bills are covered`;
    case AffordReason.OverCategoryBudget:
      return `Puts ${categoryName} over its budget`;
    case AffordReason.MonthAlreadyOver:
      return 'This month is already tracking over budget';
    case AffordReason.AboveCategoryNorm:
      return `More than you usually spend on ${categoryName}`;
    case AffordReason.DelaysGoal:
      return `Sets ${r.goalImpact?.name} back`;
    case AffordReason.LargeIncomeShare:
      return "A big slice of a month's income in one go";
    case AffordReason.UnusualForCategory:
      return `Bigger than usual for ${categoryName}`;
    case AffordReason.ThinBuffer:
      return 'Leaves little cushion';
    default:
      return null;
  }
}

/** Inline "₹X left / over budget" nudge under the category (expense only). */
export function BudgetNudge({ color, remaining, categoryName, afford }: Props) {
  const line = afford ? affordLine(afford, categoryName) : null;
  const lineColor = afford?.verdict === AffordVerdict.No ? colors.expense : colors.healthAmber;
  return (
    <View style={styles.wrap}>
      <View style={styles.nudge}>
        <View style={[styles.nudgeDot, { backgroundColor: color }]} />
        <Text style={[styles.nudgeText, { color }]}>
          {remaining >= 0
            ? `${formatCompact(remaining)} left in ${categoryName} this month`
            : `${formatCompact(-remaining)} over budget in ${categoryName}`}
        </Text>
      </View>
      {line && (
        <View style={[styles.nudge, { borderColor: alpha(lineColor, 33) }]}>
          <View style={[styles.nudgeDot, { backgroundColor: lineColor }]} />
          <Text style={[styles.nudgeText, { color: lineColor }]}>{line}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  nudge: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bg, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border },
  nudgeDot: { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  nudgeText: { fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },
});
