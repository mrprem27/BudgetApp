import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, shadow } from '../../tokens';
import { alpha } from '../../../theme';
import { formatCompact } from '../../../lib/money';
import { formatAgoCompact } from '../../../lib/time';
import { AmountText } from '../../ui/AmountText';
import { Badge } from '../../ui/Badge';
import { PressableScale } from '../../ui/PressableScale';
import { SumLine } from '../../ui/SumLine';
import type { TotalMoney } from '../../../lib/cash';

const WEEK = 7 * 24 * 60 * 60 * 1000;
const MONTH = 30 * 24 * 60 * 60 * 1000;

/** One colour per place money sits, the same in the bar and on each line's dot. */
const TONE = { bank: colors.accent, cash: colors.income, wallet: colors.settle, assets: colors.healthAmber } as const;
const PLACE_LABEL = { bank: 'Bank', cash: 'Cash', wallet: 'Wallet' } as const;

/**
 * Money's hero: **Available money** — spendable cash, and nothing else — then how everything adds
 * up, written as a sum you could check by hand (`U-28`):
 *
 *     Bank + Cash + Wallet = Spendable
 *     + Invested − Card owed = Net worth
 *
 * It was one column of rows at three weights, indented by spaces, with a sentence under each
 * figure and two full-width outlined buttons. Places are listed largest first, and the bar above
 * shows the same shape in the same colours.
 *
 * Credit headroom is in neither total: unused limit is permission to borrow, not money (`V2-12`).
 * `updatedAt` drives the staleness badge — these are figures you typed, with no bank feed behind them.
 */
export function TotalMoneyCard({ money, byBucket, unattributed, updatedAt, onEdit, onPayCardBill, onMoveToInvestments, assets, onManageAssets }: {
  money: TotalMoney;
  /** Per-bucket balances from `getCashPosition`. Absent until it has loaded. */
  byBucket?: Record<'bank' | 'cash' | 'wallet', number>;
  /** Movement on entries with no recorded pay method — shown, never folded in. */
  unattributed?: number;
  updatedAt?: number | null;
  onEdit: () => void;
  onPayCardBill?: () => void;
  onMoveToInvestments?: () => void;
  /** The register behind the Investments figure, itemised. */
  assets?: { id: string; name: string; balance: number }[];
  onManageAssets?: () => void;
}) {
  const negativeCash = money.cashAvailable < 0;
  const age = updatedAt != null ? Date.now() - updatedAt : null;
  const staleness = age === null ? { tone: 'amber' as const, label: 'Never updated' }
    : age > MONTH ? { tone: 'amber' as const, label: `Updated ${formatAgoCompact(updatedAt!)}` }
    : age > WEEK ? { tone: 'neutral' as const, label: `Updated ${formatAgoCompact(updatedAt!)}` }
    : null;

  // Largest first, everywhere: the lines and the bar agree on order.
  const places = byBucket
    ? (Object.keys(PLACE_LABEL) as (keyof typeof PLACE_LABEL)[])
        .map(k => ({ key: k, value: byBucket[k] }))
        .sort((a, b) => b.value - a.value)
    : [{ key: 'cash' as const, value: money.cashAvailable }];
  const slices = [...places.map(p => ({ key: p.key as keyof typeof TONE, v: p.value })), { key: 'assets' as const, v: money.investments }]
    .filter(s => s.v > 0)
    .sort((a, b) => b.v - a.v);

  return (
    <View style={styles.card}>
      <PressableScale onPress={onEdit} accessibilityLabel="Available money, tap to edit">
        <View style={styles.headRow}>
          <Text style={styles.eyebrow}>Available money</Text>
          <View style={styles.headRight}>
            {staleness && <Badge label={staleness.label} tone={staleness.tone} icon="clock" />}
            <Feather name="edit-2" size={14} color={colors.textMuted} />
          </View>
        </View>
        <AmountText paise={money.available} size="xl" compact forceColor={negativeCash ? colors.expense : colors.textPrimary} />
        {negativeCash && <Text style={styles.warn}>Spent past your cash</Text>}
      </PressableScale>

      {slices.length > 0 && (
        <View style={styles.bar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {slices.map(s => <View key={s.key} style={{ flex: s.v, backgroundColor: TONE[s.key] }} />)}
        </View>
      )}

      <View style={styles.sum}>
        {places.map((p, i) => (
          <SumLine key={p.key} op={i === 0 ? '' : '+'} dot={TONE[p.key]} label={PLACE_LABEL[p.key]} value={p.value} />
        ))}
        {!!unattributed && <SumLine op="+" label="Not recorded where" value={unattributed} />}
        <SumLine op="=" label="Spendable" value={money.cashAvailable} total />
        <SumLine op="+" dot={TONE.assets} label="Invested" value={money.investments} onPress={onManageAssets}
          hint={assets?.length ? `${assets.length} ${assets.length === 1 ? 'asset' : 'assets'}` : undefined} />
        {money.creditUsed > 0 && (
          <SumLine op="−" dot={colors.expense} label="Card owed" value={money.creditUsed} color={colors.expense}
            hint={money.creditLimit > 0 ? `${formatCompact(money.creditAvailable)} left to borrow` : undefined} />
        )}
        <SumLine op="=" label="Net worth" value={money.netWorth} total />
      </View>

      {(onMoveToInvestments || (money.creditUsed > 0 && onPayCardBill)) && (
        <View style={styles.actions}>
          {onMoveToInvestments && <Action icon="repeat" label="Move money" onPress={onMoveToInvestments} />}
          {money.creditUsed > 0 && onPayCardBill && <Action icon="credit-card" label="Card bill paid" onPress={onPayCardBill} />}
        </View>
      )}
    </View>
  );
}

function Action({ icon, label, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void }) {
  return (
    // Flex on a plain wrapper — PressableScale styles an inner view, so flex there does nothing.
    <View style={styles.actionCell}>
      <PressableScale style={styles.action} onPress={onPress} accessibilityLabel={label}>
        <Feather name={icon} size={15} color={colors.accent} />
        <Text style={styles.actionText} numberOfLines={1}>{label}</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.md, ...shadow.md },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  eyebrow: { ...type.label, color: colors.textSecondary },
  warn: { ...type.caption, color: colors.expense, marginTop: space.xs },
  bar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 },
  sum: { gap: 6 },
  actions: { flexDirection: 'row', gap: space.sm },
  actionCell: { flex: 1 },
  action: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs,
    minHeight: 44, borderRadius: radius.md, backgroundColor: alpha(colors.accent, 13),
  },
  actionText: { ...type.labelSemi, color: colors.accent },
});
