import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space } from '../../tokens';
import { formatCompact } from '../../../lib/money';
import type { AffordResult } from '../../../lib/engine/types';

type Props = {
  color: string;
  remaining: number;
  categoryName: string;
  /** Verdict from the same engine as /afford. Omit to show only the budget line. */
  afford?: AffordResult | null;
};

/**
 * The single worst thing about this purchase, from the same engine `/afford`
 * reads (`EN11`). Silent when the verdict is Comfortable or unknown (thin
 * data) — "you're fine" and "we don't know yet" are both noise on a form.
 * Reasons already carry their own plain-English label, ranked by rupee
 * effect — no second copy of the sentence to keep in sync with the screen's.
 */
function affordLine(r: AffordResult): string | null {
  if (r.verdict == null || r.verdict === 'comfortable') return null;
  return r.reasons[0]?.label ?? null;
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
  const warning = afford ? affordLine(afford) : null;

  if (warning) {
    const tint = afford?.verdict === 'not-affordable' ? colors.expense : colors.healthAmber;
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
