import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PressableScale } from '../../ui/PressableScale';
import { useRouter } from 'expo-router';
import { colors, type, space } from '../../tokens';
import { SheetModal } from '../../ui/SheetModal';
import { Card } from '../../ui/Card';
import { Divider } from '../../ui/Divider';
import { formatRupees } from '../../../lib/money';
import type { SafeToSpendBreakdown } from '../../../lib/safeToSpend';
import { shortDate } from '../../../lib/dateFormat';

type Props = {
  visible: boolean;
  onClose: () => void;
  sts: SafeToSpendBreakdown | null;
};

/**
 * The breakdown: each subtraction on its own line, so the figure is never a
 * mystery number. Rows render even at ₹0 — seeing "Goal contributions ₹0" is how
 * a user learns what the number would react to.
 *
 * `B-103` (`DQ-103`, "feels vague"): every row with a real claim on it opens the
 * rows behind it — no new screen, each routes to the existing place that already
 * shows them. A ₹0 row has nothing to check, so it stays flat (no chevron, no
 * tap) rather than opening an empty list.
 *
 * The everyday-spending row carries its rate and day count in the hint, because
 * it is the one *derived* term here. A number a user cannot check is a number
 * they are right to distrust, and a derived one they cannot check is worse than
 * showing nothing.
 */
export function StsSheet({ visible, onClose, sts }: Props) {
  const router = useRouter();
  if (!sts) return null;
  const until = shortDate(sts.untilMs);
  const everydayHint = sts.dailyRate == null
    ? 'Needs a few weeks of history before this can be estimated'
    : `About ${formatRupees(sts.dailyRate)}/day — your usual, ignoring one-off days — until ${until}`;

  const go = (path: Parameters<typeof router.push>[0]) => {
    onClose();
    router.push(path);
  };

  const rows: Array<{ label: string; hint: string; amount: number; sign: '' | '+' | '−'; onPress?: () => void }> = [
    { label: 'Cash available', hint: 'Money you actually hold right now', amount: sts.available, sign: '' },
    ...(sts.income > 0
      ? [{ label: 'Salary before then', hint: `Your pay, landing on or before ${until}`, amount: sts.income, sign: '+' as const, onPress: () => go('/plan/recurring') }]
      : []),
    { label: 'Bills still due', hint: `Your share of recurring + logged bills until ${until}`, amount: sts.upcomingBills, sign: '−' as const, onPress: () => go('/upcoming') },
    { label: 'Card to repay', hint: 'Card spend never left your cash — the bill still will', amount: sts.cardRepayment, sign: '−' as const, onPress: () => go('/savings') },
    { label: 'Goal contributions', hint: 'This month’s goal funding not yet set aside', amount: sts.goalRemaining, sign: '−' as const, onPress: () => go('/savings') },
    { label: 'You owe people', hint: 'Net of settlements — their money, not yours', amount: sts.netIOwe, sign: '−' as const, onPress: () => go('/friends') },
    { label: 'Everyday spending', hint: everydayHint, amount: sts.everydaySpend, sign: '−' as const },
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
        {rows.map((r, i) => {
          const tappable = r.amount > 0 && !!r.onPress;
          const content = (
            <View style={styles.row}>
              <View style={styles.left}>
                <Text style={styles.label}>{r.label}</Text>
                <Text style={styles.hint}>{r.hint}</Text>
              </View>
              <Text style={[
                styles.amount,
                r.sign === '−' && r.amount > 0 && { color: colors.expense },
                r.sign === '+' && r.amount > 0 && { color: colors.income },
              ]}>
                {r.amount > 0 ? r.sign : ''}{formatRupees(r.amount)}
              </Text>
              {tappable && <Feather name="chevron-right" size={16} color={colors.textMuted} style={styles.chevron} />}
            </View>
          );
          return (
            <React.Fragment key={r.label}>
              {i > 0 && <Divider indent="none" />}
              {tappable ? (
                <PressableScale onPress={r.onPress} accessibilityLabel={`${r.label}, ${formatRupees(r.amount)}`}>
                  {content}
                </PressableScale>
              ) : content}
            </React.Fragment>
          );
        })}
        <Divider indent="none" />
        <View style={styles.row}>
          <View style={styles.left}>
            <Text style={styles.totalLabel}>Yours to spend</Text>
            <Text style={styles.hint}>Until {until}, on top of everything above</Text>
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
  chevron: { marginLeft: -space.xs },
  totalLabel: { ...type.bodySemi, color: colors.textPrimary },
  total: { ...type.subheading, fontFamily: 'SpaceMono_400Regular' },
  overNote: { ...type.caption, color: colors.healthRed, marginTop: space.sm, marginHorizontal: space.xs },
});
