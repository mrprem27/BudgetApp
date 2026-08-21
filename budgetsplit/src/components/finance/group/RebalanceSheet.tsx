import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, type, space, radius, layout } from '../../tokens';
import { SheetModal } from '../../ui/SheetModal';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { Card } from '../../ui/Card';
import { Divider } from '../../ui/Divider';
import { SectionHeader } from '../../ui/SectionHeader';
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

      <SectionHeader title="What moves" first />
      <Card clip style={styles.card}>
        {plan.donors.map((d, i) => (
          <React.Fragment key={d.category}>
            {i > 0 && <Divider indent="none" />}
            <View style={styles.row}>
              <Text style={styles.rowLabel} numberOfLines={1}>{d.category}</Text>
              <Text style={styles.rowFrom}>{formatCompact(d.allocated)}</Text>
              <Text style={styles.rowArrow}>→</Text>
              <Text style={styles.rowTo}>{formatCompact(d.newAllocated)}</Text>
            </View>
          </React.Fragment>
        ))}
        <Divider indent="none" />
        <View style={styles.row}>
          <Text style={[styles.rowLabel, styles.gainLabel]} numberOfLines={1}>{plan.category}</Text>
          <Text style={styles.rowFrom}>+{formatCompact(plan.covered)}</Text>
        </View>
      </Card>

      <PrimaryButton label={applying ? 'Applying…' : 'Apply re-plan'} onPress={onApply} disabled={applying} />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  intro: { ...type.body, color: colors.textSecondary, marginBottom: space.md },
  card: { marginBottom: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.smd, minHeight: layout.rowMinHeight },
  rowLabel: { ...type.body, color: colors.textPrimary, flex: 1 },
  gainLabel: { color: colors.income, fontFamily: 'Inter_600SemiBold' },
  rowFrom: { ...type.amountSM, color: colors.textMuted },
  rowArrow: { ...type.caption, color: colors.textMuted },
  rowTo: { ...type.amountSM, color: colors.textPrimary, backgroundColor: alpha(colors.accent, 13), paddingHorizontal: space.xs, paddingVertical: 2, borderRadius: radius.sm },
});
