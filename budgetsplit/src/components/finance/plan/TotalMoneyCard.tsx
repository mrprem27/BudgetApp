import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
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
 * The Plan screen hero: **Available Money** — spendable cash, and nothing else.
 *
 * It used to be one "Total Money" figure adding cash + investments + *unused credit*
 * (`V2-12`). That made a ₹2L card limit read as ₹2L of money, in an app whose job is
 * telling you when to stop; and it moved with a number the user typed once and never
 * revisited. Net worth still matters, so it stays — one line down, clearly separate.
 *
 * Credit headroom appears in neither figure. Unused limit is not an asset and not a
 * debt; it is permission to borrow, and labelling it "available" alongside money was
 * the whole problem.
 *
 * `updatedAt` is the last `setMoneyProfile` write — these are manually-entered
 * figures with no bank feed, so a staleness badge is the difference between an
 * honest snapshot and a confident-looking number nobody's touched in months.
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
  // <7d: no badge (don't clutter a freshly-edited card). 7-30d: neutral. >30d
  // or never set: amber — old enough that Insights shouldn't lean on it as fresh.
  const staleness = age === null ? { tone: 'amber' as const, label: 'Never updated' }
    : age > MONTH ? { tone: 'amber' as const, label: `Updated ${formatAgoCompact(updatedAt!)}` }
    : age > WEEK ? { tone: 'neutral' as const, label: `Updated ${formatAgoCompact(updatedAt!)}` }
    : null;
  return (
    <PressableScale style={styles.card} onPress={onEdit} accessibilityLabel="Available money, tap to edit">
      <View style={styles.headRow}>
        <Text style={styles.label}>AVAILABLE MONEY</Text>
        <View style={styles.headRowRight}>
          {staleness && <Badge label={staleness.label} tone={staleness.tone} icon="clock" />}
          <Feather name="edit-2" size={14} color={colors.textMuted} />
        </View>
      </View>
      <AmountText paise={money.available} size="xl" compact forceColor={negativeCash ? colors.expense : colors.textPrimary} />
      <Text style={styles.heroHint}>
        {negativeCash ? 'You’ve spent past your cash. Investments and credit are shown below.' : 'Cash you can spend right now.'}
      </Text>

      <View style={styles.divider} />

      {/* Net worth — what you own minus what you owe. */}
      <Row label="Net worth" value={formatCompact(money.netWorth)} strong />
      <SubRow label="Cash" value={formatCompact(money.cashAvailable)} valueColor={negativeCash ? colors.expense : colors.textSecondary} />
      {/*
        Where that cash sits, when we know. Nested under Cash rather than replacing
        it: the hero stays one number (§1), and these are a breakdown of the row
        above, not four competing figures.

        `unattributed` is shown, not hidden. It is movement on entries whose pay
        method was never recorded — real money we decline to assign rather than
        guessing and quietly draining a bucket. Hiding it would make the three
        buckets look like they should add up to Cash when they do not.
      */}
      {byBucket && (
        <>
          <SubRow label="  in bank" value={formatCompact(byBucket.bank)} />
          <SubRow label="  in cash" value={formatCompact(byBucket.cash)} />
          <SubRow label="  in wallet" value={formatCompact(byBucket.wallet)} />
          {!!unattributed && (
            <SubRow label="  not recorded where" value={formatCompact(unattributed)} />
          )}
        </>
      )}
      {/*
        * ONE line, and it is the way in — not an itemised list.
        *
        * This briefly rendered a SubRow per asset. Unbounded (six assets, six new
        * rows), duplicating the screen that exists to show exactly that, inside a
        * card already carrying Cash + three buckets + unattributed + Investments +
        * Credit used + Headroom + the limit line. A summary card that lists its own
        * detail has stopped being a summary.
        *
        * The count is the affordance instead: "3 assets ›" says there is more and
        * where it is, in one line, and taps through.
        */}
      <SubRow
        label="Investments & assets"
        value={formatCompact(money.investments)}
        hint={assets?.length ? `${assets.length} ${assets.length === 1 ? 'asset' : 'assets'}` : undefined}
        onPress={onManageAssets}
      />
      {money.creditUsed > 0 && <SubRow label="Credit used" value={`−${formatCompact(money.creditUsed)}`} valueColor={colors.expense} />}

      {/* Headroom, deliberately outside both figures. */}
      <Row label="Credit headroom" value={formatCompact(money.creditAvailable)} strong />
      <SubRow label={`Limit ${formatCompact(money.creditLimit)} · used ${formatCompact(money.creditUsed)} · borrowing, not money`} value="" />

      {/* Investments have a real way UP now — not just re-typing the figure.
          Buying an SIP was logged as an expense, which dropped net worth by the
          amount when it should have stayed flat. */}
      {onMoveToInvestments && (
        <PressableScale style={styles.payBillBtn} onPress={onMoveToInvestments} accessibilityLabel="Move money to investments">
          <Feather name="trending-up" size={14} color={colors.accent} />
          <Text style={styles.payBillText}>Bought an investment? Move it across</Text>
        </PressableScale>
      )}

      {/* Card debt has a real way down now — not just re-typing the balance. */}
      {money.creditUsed > 0 && onPayCardBill && (
        <PressableScale style={styles.payBillBtn} onPress={onPayCardBill} accessibilityLabel="Pay card bill">
          <Feather name="corner-up-left" size={14} color={colors.accent} />
          <Text style={styles.payBillText}>Paid your card bill? Log it</Text>
        </PressableScale>
      )}
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

/**
 * `onPress` turns a sub-row into the way into its own screen — a chevron and a
 * trailing hint, no extra button. The card was growing a stacked full-width CTA
 * per destination; three of them was ~150pt of identical accent outlines under a
 * summary, all shouting equally.
 */
function SubRow({ label, value, valueColor, hint, onPress }: {
  label: string; value: string; valueColor?: string; hint?: string; onPress?: () => void;
}) {
  // Label left, everything else right — the row is `space-between`, so the
  // trailing items have to be one group or they spread across the whole width.
  const body = (
    <>
      <Text style={styles.subLabel}>{label}</Text>
      <View style={styles.subRight}>
        {hint ? <Text style={styles.subHint}>{hint}</Text> : null}
        {value ? <Text style={[styles.subValue, valueColor ? { color: valueColor } : null]}>{value}</Text> : null}
        {onPress ? <Feather name="chevron-right" size={13} color={colors.textMuted} /> : null}
      </View>
    </>
  );
  if (!onPress) return <View style={styles.subRow}>{body}</View>;
  return (
    <TouchableOpacity
      style={styles.subRow}
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6 }}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}. ${hint ?? ''}`}
    >
      {body}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, ...shadow.md },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs },
  headRowRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  label: { ...type.label, color: colors.textSecondary },
  heroHint: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: space.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
  rowLabel: { ...type.body, color: colors.textSecondary },
  rowLabelStrong: { color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  rowValue: { fontFamily: 'SpaceMono_400Regular', fontSize: 13, color: colors.textSecondary },
  rowValueStrong: { color: colors.textPrimary, fontSize: 14 },
  subRight: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  subHint: { ...type.caption, color: colors.textMuted },
  subRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3, paddingLeft: space.md },
  subLabel: { ...type.caption, color: colors.textMuted },
  subValue: { fontFamily: 'SpaceMono_400Regular', fontSize: 12, color: colors.textSecondary },
  payBillBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, marginTop: space.md, paddingVertical: space.smd, borderRadius: radius.md, borderWidth: 1, borderColor: colors.accent, minHeight: 44 },
  payBillText: { ...type.labelSemi, color: colors.accent },
});
