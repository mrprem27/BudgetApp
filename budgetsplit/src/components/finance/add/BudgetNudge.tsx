import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space } from '../../tokens';
import { formatCompact } from '../../../lib/money';
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

/**
 * One quiet line of context under the category — what's left in this budget, or the
 * one thing worth knowing before you commit.
 *
 * Deliberately **not** a card. This used to stack up to two bordered strips with
 * status dots, which made ordinary information ("₹400 left in Food") look like two
 * error states on a form you hadn't finished filling in. It also showed both at
 * once, so the warning it actually wanted you to read competed with a number you
 * could already infer. Now: the warning when there is one, otherwise the remainder.
 */
export function BudgetNudge({ color, remaining, categoryName, afford }: Props) {
  const warning = afford ? affordLine(afford, categoryName) : null;

  if (warning) {
    const tint = afford?.verdict === AffordVerdict.No ? colors.expense : colors.healthAmber;
    return (
      <View style={styles.row}>
        <Feather name="alert-triangle" size={13} color={tint} />
        <Text style={[styles.text, { color: tint }]}>{warning}</Text>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Text style={[styles.text, { color }]}>
        {remaining >= 0
          ? `${formatCompact(remaining)} left in ${categoryName} this month`
          : `${formatCompact(-remaining)} over budget in ${categoryName}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Negative top margin pulls it up under the category pills it annotates, so it
  // reads as a caption on them rather than as its own block in the form's rhythm.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginTop: -space.sm,
    paddingHorizontal: space.xs,
  },
  text: { ...type.label, flex: 1 },
});
