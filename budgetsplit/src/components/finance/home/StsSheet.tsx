import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, type, space } from '../../tokens';
import { SheetModal } from '../../ui/SheetModal';
import { Card } from '../../ui/Card';
import { Divider } from '../../ui/Divider';
import { formatRupees } from '../../../lib/money';
import type { SafeToSpend } from '../../../lib/safeToSpend';

type Props = {
  visible: boolean;
  onClose: () => void;
  sts: SafeToSpend | null;
};

/**
 * The Safe-to-Spend breakdown: each subtraction on its own line, so the
 * headline is never a mystery number. Rows render even at ₹0 — seeing
 * "Goals set aside ₹0" is how a user learns what the number would react to.
 */
export function StsSheet({ visible, onClose, sts }: Props) {
  if (!sts) return null;
  const rows: Array<{ label: string; hint: string; amount: number; sign: '' | '−' }> = [
    { label: 'Cash available', hint: 'Money you actually hold right now', amount: sts.available, sign: '' },
    { label: 'Bills still due', hint: 'Your share of recurring + logged bills before month-end', amount: sts.upcomingBills, sign: '−' },
    { label: 'Goal contributions', hint: 'This month’s goal funding not yet set aside', amount: sts.goalRemaining, sign: '−' },
    { label: 'You owe people', hint: 'Net of settlements — their money, not yours', amount: sts.netIOwe, sign: '−' },
  ];
  return (
    <SheetModal visible={visible} onClose={onClose} title="Safe to spend">
      <Card padded>
        {rows.map((r, i) => (
          <React.Fragment key={r.label}>
            {i > 0 && <Divider indent="none" />}
            <View style={styles.row}>
              <View style={styles.left}>
                <Text style={styles.label}>{r.label}</Text>
                <Text style={styles.hint}>{r.hint}</Text>
              </View>
              <Text style={[styles.amount, r.sign === '−' && r.amount > 0 && { color: colors.expense }]}>
                {r.sign === '−' && r.amount > 0 ? '−' : ''}{formatRupees(r.amount)}
              </Text>
            </View>
          </React.Fragment>
        ))}
        <Divider indent="none" />
        <View style={styles.row}>
          <View style={styles.left}>
            <Text style={styles.totalLabel}>Safe to spend</Text>
            <Text style={styles.hint}>Until month-end, without touching any of the above</Text>
          </View>
          <Text style={[styles.total, { color: sts.amount < 0 ? colors.healthRed : colors.income }]}>
            {formatRupees(sts.amount)}
          </Text>
        </View>
      </Card>
      {sts.amount < 0 && (
        <Text style={styles.overNote}>
          You&apos;re over-committed this month — bills, goals and owed money add up to more than your cash.
        </Text>
      )}
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.smd, gap: space.md },
  left: { flex: 1 },
  label: { ...type.body, color: colors.textPrimary },
  hint: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  amount: { ...type.bodySemi, fontFamily: 'SpaceMono_400Regular', color: colors.textPrimary },
  totalLabel: { ...type.bodySemi, color: colors.textPrimary },
  total: { ...type.subheading, fontFamily: 'SpaceMono_400Regular' },
  overNote: { ...type.caption, color: colors.healthRed, marginTop: space.sm, marginHorizontal: space.xs },
});
