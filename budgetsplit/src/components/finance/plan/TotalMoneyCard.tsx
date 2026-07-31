import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, shadow } from '../../tokens';
import { formatCompact } from '../../../lib/money';
import { formatAgoCompact } from '../../../lib/time';
import { AmountText } from '../../ui/AmountText';
import { Badge } from '../../ui/Badge';
import { PressableScale } from '../../ui/PressableScale';
import type { TotalMoney } from '../../../lib/cash';

const WEEK = 7 * 24 * 60 * 60 * 1000;
const MONTH = 30 * 24 * 60 * 60 * 1000;

/**
 * The Plan screen hero: one "Total Money" figure (your money + available credit)
 * with a grouped breakdown. Tap to edit cash / investments / credit. Credit is
 * shown for spending-power context but is never spent from automatically.
 *
 * `updatedAt` is the last `setMoneyProfile` write — these are manually-entered
 * figures with no bank feed, so a staleness badge is the difference between an
 * honest snapshot and a confident-looking number nobody's touched in months.
 */
export function TotalMoneyCard({ money, updatedAt, onEdit }: { money: TotalMoney; updatedAt?: number | null; onEdit: () => void }) {
  const negativeCash = money.cashAvailable < 0;
  const age = updatedAt != null ? Date.now() - updatedAt : null;
  // <7d: no badge (don't clutter a freshly-edited card). 7-30d: neutral. >30d
  // or never set: amber — old enough that Insights shouldn't lean on it as fresh.
  const staleness = age === null ? { tone: 'amber' as const, label: 'Never updated' }
    : age > MONTH ? { tone: 'amber' as const, label: `Updated ${formatAgoCompact(updatedAt!)}` }
    : age > WEEK ? { tone: 'neutral' as const, label: `Updated ${formatAgoCompact(updatedAt!)}` }
    : null;
  return (
    <PressableScale style={styles.card} onPress={onEdit} accessibilityLabel="Total money, tap to edit">
      <View style={styles.headRow}>
        <Text style={styles.label}>TOTAL MONEY</Text>
        <View style={styles.headRowRight}>
          {staleness && <Badge label={staleness.label} tone={staleness.tone} icon="clock" />}
          <Feather name="edit-2" size={14} color={colors.textMuted} />
        </View>
      </View>
      <AmountText paise={money.total} size="xl" compact forceColor={colors.textPrimary} />

      <View style={styles.divider} />

      {/* Your money */}
      <Row label="Your money" value={formatCompact(money.yourMoney)} strong />
      <SubRow label="Cash available" value={formatCompact(money.cashAvailable)} valueColor={negativeCash ? colors.expense : colors.textSecondary} />
      <SubRow label="Investments" value={formatCompact(money.investments)} />

      {/* Credit */}
      <Row label="Credit available" value={formatCompact(money.creditAvailable)} strong />
      <SubRow label={`Limit ${formatCompact(money.creditLimit)} · used ${formatCompact(money.creditUsed)}`} value="" />
    </PressableScale>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, strong && styles.rowLabelStrong]}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowValueStrong]}>{value}</Text>
    </View>
  );
}

function SubRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.subRow}>
      <Text style={styles.subLabel}>{label}</Text>
      {value ? <Text style={[styles.subValue, valueColor ? { color: valueColor } : null]}>{value}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, ...shadow.md },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs },
  headRowRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  label: { ...type.label, color: colors.textSecondary },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: space.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
  rowLabel: { ...type.body, color: colors.textSecondary },
  rowLabelStrong: { color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  rowValue: { fontFamily: 'SpaceMono_400Regular', fontSize: 13, color: colors.textSecondary },
  rowValueStrong: { color: colors.textPrimary, fontSize: 14 },
  subRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3, paddingLeft: space.md },
  subLabel: { ...type.caption, color: colors.textMuted },
  subValue: { fontFamily: 'SpaceMono_400Regular', fontSize: 12, color: colors.textSecondary },
});
