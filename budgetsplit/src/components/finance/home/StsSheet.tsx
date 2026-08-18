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
 * The breakdown: each subtraction on its own line, so the figure is never a
 * mystery number. Rows render even at ₹0 — seeing "Goal contributions ₹0" is how
 * a user learns what the number would react to.
 *
 * The everyday-spending row carries its rate and day count in the hint, because
 * it is the one *derived* term here. A number a user cannot check is a number
 * they are right to distrust, and a derived one they cannot check is worse than
 * showing nothing.
 */
export function StsSheet({ visible, onClose, sts }: Props) {
  if (!sts) return null;
  const everydayHint = sts.dailyRate == null
    ? 'Needs a few weeks of history before this can be estimated'
    : `About ${formatRupees(sts.dailyRate)}/day — your usual, ignoring one-off days — over ${sts.daysLeft} days`;
  const rows: Array<{ label: string; hint: string; amount: number; sign: '' | '−' }> = [
    { label: 'Cash available', hint: 'Money you actually hold right now', amount: sts.available, sign: '' },
    { label: 'Bills still due', hint: `Your share of recurring + logged bills over the next ${sts.daysLeft} days`, amount: sts.upcomingBills, sign: '−' },
    { label: 'Card to repay', hint: 'Card spend never left your cash — the bill still will', amount: sts.cardRepayment, sign: '−' },
    { label: 'Goal contributions', hint: 'This month’s goal funding not yet set aside', amount: sts.goalRemaining, sign: '−' },
    { label: 'You owe people', hint: 'Net of settlements — their money, not yours', amount: sts.netIOwe, sign: '−' },
    { label: 'Everyday spending', hint: everydayHint, amount: sts.everydaySpend, sign: '−' },
  ];
  // The largest single claim, for the over-committed note. The sheet has already
  // computed every subtraction, so restating "they add up to more than your cash"
  // tells the user nothing they can act on — naming the biggest one does. Cash
  // available is excluded: it is the thing being spent, not a claim on it.
  const biggest = rows
    .filter(r => r.sign === '−' && r.amount > 0)
    .sort((a, b) => b.amount - a.amount)[0];
  return (
    <SheetModal visible={visible} onClose={onClose} title="Yours to spend">
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
            <Text style={styles.totalLabel}>Yours to spend</Text>
            <Text style={styles.hint}>Over the next {sts.daysLeft} days, on top of everything above</Text>
          </View>
          <Text style={[styles.total, { color: sts.amount < 0 ? colors.healthRed : colors.income }]}>
            {formatRupees(sts.amount)}
          </Text>
        </View>
      </Card>
      {sts.amount < 0 && (
        <Text style={styles.overNote}>
          {biggest
            ? `${biggest.label} is the largest claim on your cash right now, at ${formatRupees(biggest.amount)}. Shift or delay that and the rest fits.`
            : 'Your commitments add up to more than the cash you hold.'}
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
