import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, type, space, radius } from '../../tokens';
import { SheetModal } from '../../ui/SheetModal';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { formatCompact } from '../../../lib/money';
import type { RebalancePlan } from '../../../lib/rebalance';
import { alpha } from '../../../theme';

/**
 * "Re-plan the rest of this month" (`V2-07`).
 *
 * Shows exactly which limits move and by how much before anything is written. The
 * month's total is unchanged by construction — this trades headroom between
 * categories, so it can never quietly raise what you've allowed yourself.
 */
export function RebalanceSheet({
  plan,
  onClose,
  onApply,
  applying,
}: {
  plan: RebalancePlan | null;
  onClose: () => void;
  onApply: () => void;
  applying?: boolean;
}) {
  if (!plan) return null;
  return (
    <SheetModal visible={!!plan} onClose={onClose} title={`Re-plan ${plan.category}`}>
      <Text style={styles.intro}>
        {plan.partial
          // Said plainly: a partial cover still leaves the month over, and pretending
          // otherwise would be the same dishonesty the red bar was at least avoiding.
          ? `${plan.category} is ${formatCompact(plan.overspend)} over. Only ${formatCompact(plan.covered)} can be moved from other categories — the rest stays over.`
          : `${plan.category} is ${formatCompact(plan.overspend)} over. Cover it by trimming categories that still have room. Your total budget doesn’t change.`}
      </Text>

      <Text style={styles.label}>WHAT MOVES</Text>
      <View style={styles.card}>
        {plan.donors.map((d, i) => (
          <View key={d.category} style={[styles.row, i > 0 && styles.rowDivided]}>
            <Text style={styles.rowLabel} numberOfLines={1}>{d.category}</Text>
            <Text style={styles.rowFrom}>{formatCompact(d.allocated)}</Text>
            <Text style={styles.rowArrow}>→</Text>
            <Text style={styles.rowTo}>{formatCompact(d.newAllocated)}</Text>
          </View>
        ))}
        <View style={[styles.row, styles.rowDivided]}>
          <Text style={[styles.rowLabel, styles.gainLabel]} numberOfLines={1}>{plan.category}</Text>
          <Text style={styles.rowFrom}>+{formatCompact(plan.covered)}</Text>
        </View>
      </View>

      <PrimaryButton label={applying ? 'Applying…' : 'Apply re-plan'} onPress={onApply} disabled={applying} />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  intro: { ...type.body, color: colors.textSecondary, lineHeight: 20, marginBottom: space.md },
  label: { ...type.label, color: colors.textSecondary, marginBottom: space.sm },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, marginBottom: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.smd, minHeight: 48 },
  rowDivided: { borderTopWidth: 1, borderTopColor: colors.border },
  rowLabel: { ...type.body, color: colors.textPrimary, flex: 1 },
  gainLabel: { color: colors.income, fontFamily: 'Inter_600SemiBold' },
  rowFrom: { fontFamily: 'SpaceMono_400Regular', fontSize: 13, color: colors.textMuted },
  rowArrow: { ...type.caption, color: colors.textMuted },
  rowTo: { fontFamily: 'SpaceMono_400Regular', fontSize: 13, color: colors.textPrimary, backgroundColor: alpha(colors.accent, 13), paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
});
