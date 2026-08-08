import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { IconCircle } from '../ui/IconCircle';
import { BudgetBar } from './BudgetBar';
import { healthColor } from './group/helpers';
import { categoryVisual } from '../../constants/categories';
import { asFeather } from '../../constants/palette';
import { formatCompact } from '../../lib/money';
import { colors, type, space } from '../tokens';
import type { BudgetHealth } from '../../lib/budget';

type Props = {
  category: string;
  /** `'once'` renders as "one-time". */
  cadence: string;
  spent: number;
  allocated: number;
  /** Null when there's no allocation to measure against — `BudgetBar` handles it. */
  pct: number | null;
  health: BudgetHealth;
  /** Extra content below the bar — e.g. the group tab's re-plan CTA. */
  children?: React.ReactNode;
};

/**
 * One budgeted category: icon, name, cadence, spent-of-allocated, progress bar.
 *
 * The group Budget tab and Personal's Budget tab had this twice, near
 * byte-identically — same 14px icon in a tinted disc, same cadence tag, same
 * `spent / allocated` line with only the spent figure tinted by health, same 6px
 * `BudgetBar`. They differed only in which helper computed the tint (one called
 * `healthColor`, the other inlined the same three-way conditional) and in who
 * owned the horizontal padding.
 */
export function BudgetCategoryRow({ category, cadence, spent, allocated, pct, health, children }: Props) {
  const visual = categoryVisual(category);
  return (
    <View style={styles.row}>
      <View style={styles.top}>
        <IconCircle icon={asFeather(visual?.icon, 'tag')} size={28} color={visual?.color ?? colors.accent} iconSize={14} />
        <View style={styles.mid}>
          <Text style={styles.name} numberOfLines={1}>{category}</Text>
          <Text style={styles.cadence}>{cadence === 'once' ? 'one-time' : cadence}</Text>
        </View>
        <Text style={styles.amount}>
          <Text style={{ color: healthColor(health) }}>{formatCompact(spent)}</Text> / {formatCompact(allocated)}
        </Text>
      </View>
      <BudgetBar pct={pct} health={health} height={6} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: space.md, paddingVertical: space.md, gap: space.sm },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  mid: { flex: 1, minWidth: 0 },
  name: { ...type.body, color: colors.textPrimary },
  cadence: { ...type.caption, color: colors.textMuted, marginTop: 1, textTransform: 'capitalize' },
  // Money is SpaceMono (AGENTS §1). The two copies of this row used a raw 13 and a
  // raw 12; `type.amountSM` is the token for an amount at row scale.
  amount: { ...type.amountSM, color: colors.textSecondary },
});
