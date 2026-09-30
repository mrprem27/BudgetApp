import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, type, space, layout } from '../../tokens';
import { alpha } from '../../../theme';
import { categoryVisual } from '../../../constants/categories';
import { asFeather } from '../../../constants/palette';
import { AmountText } from '../../ui/AmountText';
import { Card } from '../../ui/Card';
import { ListRow } from '../../ui/ListRow';
import { Divider } from '../../ui/Divider';
import { IconCircle } from '../../ui/IconCircle';
import { SectionHeader } from '../../ui/SectionHeader';
import { Chip } from '../../ui/Chip';
import { recurringMonthlyEquivalent, freqLabel } from '../../../lib/recurrence';
import { shortDate } from '../../../lib/dateFormat';
import { formatCompact } from '../../../lib/money';
import type { RecurringSub as Sub } from '../../../lib/recurringData';

/**
 * The recurring inventory: one hero figure (my monthly commitment), then Money out / Money in /
 * Moved, each a card of rows that tap through to the rule. Money's Recurring screen and a group's
 * (and Personal's) Recurring tab both render this, so the two can no longer look different (`U-38`).
 *
 * No actions on the list — a row opens the rule, where Edit, Skip, Pause and Stop live. Four
 * permanent buttons per row once took ~29% of the screen for maintenance nobody was doing.
 */
export function RecurringInventory({ subs, onOpen }: { subs: Sub[]; onOpen: (id: string) => void }) {
  const outSubs = subs.filter(s => s.kind === 'expense');
  const inSubs = subs.filter(s => s.kind === 'income');
  const moveSubs = subs.filter(s => s.kind === 'settlement');
  // Paused rules are listed but never summed: a paused subscription is not money leaving each month.
  const live = (rows: Sub[]) => rows.filter(s => !s.paused);
  const monthly = (rows: Sub[]) => live(rows).reduce((s, x) => s + recurringMonthlyEquivalent(x.amount, x.freq, x.interval), 0);
  const monthlyOut = monthly(outSubs);
  const monthlyIn = monthly(inSubs);
  const monthlyMoved = monthly(moveSubs);
  const activeCount = live(subs).length;
  const pausedCount = subs.length - activeCount;
  const nextUp = subs.find(s => s.nextMs != null);

  return (
    <>
      {/* "a month": each row shows its own per-charge amount, so a yearly ₹12,000 rule reads
          ₹12,000 below while adding ₹1,000 here. */}
      <Card padded style={styles.totalCard}>
        <View style={styles.totalRow}>
          <View style={styles.totalLeft}>
            <Text style={styles.totalLabel}>Spending a month · your share</Text>
            <AmountText paise={monthlyOut} size="xl" forceColor={colors.textPrimary} />
            <Text style={styles.totalSub}>
              ≈ {formatCompact(monthlyOut * 12)} a year
              {monthlyIn > 0 ? ` · +${formatCompact(monthlyIn)}/mo in` : ''}
              {monthlyMoved > 0 ? ` · ${formatCompact(monthlyMoved)}/mo moved` : ''}
            </Text>
          </View>
          <View style={styles.totalRight}>
            <Text style={styles.totalCount}>{activeCount} active{pausedCount > 0 ? ` · ${pausedCount} paused` : ''}</Text>
            {nextUp?.nextMs != null && <Text style={styles.totalNext}>next {shortDate(nextUp.nextMs)}</Text>}
          </View>
        </View>
      </Card>

      {([['Money out', outSubs], ['Money in', inSubs], ['Moved between your own', moveSubs]] as const).map(([title, rows]) => rows.length === 0 ? null : (
        <View key={title}>
          <SectionHeader title={title} right={<Text style={styles.count}>{rows.length}</Text>} />
          <Card clip>
            {rows.map((s, i) => {
              const vis = categoryVisual(s.category);
              return (
                <View key={s.id}>
                  {i > 0 && <Divider indent="text" />}
                  <ListRow
                    leading={
                      <IconCircle
                        icon={asFeather(vis?.icon, s.kind === 'income' ? 'trending-up' : 'refresh-cw')}
                        size={layout.iconCircle}
                        color={vis?.color ?? (s.kind === 'income' ? colors.income : colors.accent)}
                      />
                    }
                    title={s.name}
                    subtitle={`${s.name === s.category ? '' : `${s.category} · `}${freqLabel(s.freq, s.interval)}${
                      s.nextMs != null ? ` · next ${shortDate(s.nextMs)}` : ''}`}
                    value={
                      <View style={styles.rowValue}>
                        {s.paused && <Chip label="Paused" icon="pause" />}
                        <AmountText paise={s.amount} size="sm" forceColor={s.kind === 'income' ? colors.income : colors.textPrimary} rounded />
                      </View>
                    }
                    onPress={() => onOpen(s.id)}
                    accessibilityLabel={`${s.name}, ${freqLabel(s.freq, s.interval)}${s.paused ? ', paused' : ''}`}
                  />
                </View>
              );
            })}
          </Card>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  // Tinted settle, matching how a recurring concern is coloured elsewhere.
  totalCard: { backgroundColor: alpha(colors.settle, 8), borderColor: colors.settle },
  totalRow: { flexDirection: 'row', alignItems: 'flex-start' },
  totalLeft: { flex: 1 },
  totalLabel: { ...type.sectionLabel, color: colors.settle, marginBottom: space.xs },
  totalSub: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  totalRight: { alignItems: 'flex-end' },
  totalCount: { ...type.caption, color: colors.textSecondary },
  totalNext: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  count: { ...type.amountSM, color: colors.textSecondary },
  rowValue: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
