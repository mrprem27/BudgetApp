import { useState } from 'react';
import { kindColor } from '../../../lib/kindTheme';
import { View, Text, StyleSheet } from 'react-native';
import { colors, type, space, layout } from '../../tokens';
import { categoryVisual } from '../../../constants/categories';
import { asFeather } from '../../../constants/palette';
import { AmountText } from '../../ui/AmountText';
import { Card } from '../../ui/Card';
import { ListRow } from '../../ui/ListRow';
import { Divider } from '../../ui/Divider';
import { IconCircle } from '../../ui/IconCircle';
import { SectionCard } from '../../ui/SectionCard';
import { ExpandAll } from '../budget/BudgetList';
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
  // Boxes start open (a rule list is short, unlike a budget's forty lines); Collapse all is in the card.
  const [closed, setClosed] = useState<Set<string>>(new Set());
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
  const sections = ([['Money out', outSubs], ['Money in', inSubs], ['Moved between your own', moveSubs]] as const)
    .filter(([, rows]) => rows.length > 0);

  return (
    <>
      {/* "a month": each row shows its own per-charge amount, so a yearly ₹12,000 rule reads
          ₹12,000 below while adding ₹1,000 here. */}
      {/* One figure, then labelled facts in columns (`U-62`). It was one dotted line —
          "1 active · next 3 Oct · ≈ ₹3.3L a year · +₹85/mo in" — every fact a different kind
          of thing, run together. */}
      {/* The same card as Budget's (label, one large figure, facts, Expand all), so the two tabs
          open on boxes of one size. */}
      <Card padded style={styles.totalCard}>
        <Text style={styles.totalLabel}>Spending a month · your share</Text>
        <AmountText paise={monthlyOut} size="lg" forceColor={colors.textPrimary} />
        <View style={styles.stats}>
          <Stat label="A year" value={formatCompact(monthlyOut * 12)} />
          <View style={styles.statDivider} />
          <Stat label="Active" value={pausedCount > 0 ? `${activeCount} · ${pausedCount} paused` : String(activeCount)} />
          <View style={styles.statDivider} />
          <Stat label="Next" value={nextUp?.nextMs != null ? shortDate(nextUp.nextMs) : 'None'} />
        </View>
        {(monthlyIn > 0 || monthlyMoved > 0) && (
          <Text style={styles.totalSub}>
            {monthlyIn > 0 ? `Income ${formatCompact(monthlyIn)} a month` : ''}
            {monthlyIn > 0 && monthlyMoved > 0 ? '  ·  ' : ''}
            {monthlyMoved > 0 ? `Moved ${formatCompact(monthlyMoved)} a month` : ''}
          </Text>
        )}
        {sections.length > 1 && (
          <ExpandAll
            open={closed.size === 0}
            onPress={() => setClosed(closed.size === 0 ? new Set(sections.map(([t]) => t)) : new Set())}
          />
        )}
      </Card>

      {sections.map(([title, rows]) => (
        <SectionCard
          key={title}
          title={title}
          right={<Text style={styles.count}>{rows.length}</Text>}
          expanded={!closed.has(title)}
          onToggle={() => setClosed(c => { const n = new Set(c); if (n.has(title)) n.delete(title); else n.add(title); return n; })}
        >
          {rows.map(s => {
            const vis = categoryVisual(s.category);
            return (
              <View key={s.id}>
                <Divider indent="text" />
                <ListRow
                  leading={
                    <IconCircle
                      icon={asFeather(vis?.icon, s.kind === 'income' ? 'trending-up' : 'refresh-cw')}
                      size={layout.iconCircle}
                      color={vis?.color ?? kindColor(s.kind)}
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
        </SectionCard>
      ))}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', alignItems: 'center', marginTop: space.md },
  stat: { flex: 1, alignItems: 'flex-start', gap: 2 },
  statDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border, marginHorizontal: space.sm },
  statLabel: { ...type.caption, color: colors.textMuted },
  statValue: { ...type.labelSemi, color: colors.textPrimary },
  totalCard: { marginBottom: space.md },
  totalLabel: { ...type.sectionLabel, color: colors.textMuted, marginBottom: space.xs },
  totalSub: { ...type.caption, color: colors.textMuted, marginTop: space.smd },
  count: { ...type.amountSM, color: colors.textSecondary },
  rowValue: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
