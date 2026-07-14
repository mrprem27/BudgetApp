import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { colors, type, space, radius, layout, shadow } from '../../tokens';
import { formatRupees } from '../../../lib/money';
import { splitLabel, freqWord } from '../../../lib/groupDetail';
import { nextOccurrenceOnOrAfter } from '../../../lib/recurrence';
import { categoryVisual } from '../../../constants/categories';
import { EmptyState } from '../../ui/EmptyState';
import type { TxnWithSplits } from '../../../db/queries/transactions';

type Props = {
  rules: TxnWithSplits[];
  meId: string;
  defaultSplit: string;
  monthlyTotal: number;
  nextLabel: string | null;
  onAdd: () => void;
  onOpenRule: (ruleId: string) => void;
};

/** Group Recurring tab: monthly-total summary + active recurring rules + add CTA. */
export function RecurringTab({ rules, meId, defaultSplit, monthlyTotal, nextLabel, onAdd, onOpenRule }: Props) {
  if (rules.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.listContent}>
        <EmptyState
          icon="repeat"
          title="No recurring yet"
          body="Rent, Wi-Fi, memberships — anything you set to repeat shows up here with its monthly cost and your share."
          actionLabel="Add recurring expense"
          onAction={onAdd}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.listContent}>
      <View style={styles.recurSummaryCard}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.xs }}>
          <Text style={styles.recurSummaryTitle}>Group recurring</Text>
          <Text style={styles.recurSummaryAmt}>{formatRupees(monthlyTotal)}/mo</Text>
        </View>
        <Text style={styles.recurSummarySub}>
          {rules.length} active{nextLabel ? ` · next charge ${nextLabel}` : ''} · split {splitLabel(defaultSplit)}
        </Text>
      </View>

      <Text style={styles.insightSectionLabel}>ACTIVE · {rules.length}</Text>
      <View style={[styles.insightCard, { paddingHorizontal: 0 }]}>
        {rules.map((r, i) => {
          const vis = categoryVisual(r.category);
          const total = r.shares.reduce((s, x) => s + x.amount, 0) || r.payments.reduce((s, p) => s + p.amount, 0);
          const myShare = r.shares.find(s => s.personId === meId)?.amount ?? 0;
          const next = nextOccurrenceOnOrAfter(r, Date.now());
          const label = (r.note && r.note.trim()) || r.category;
          return (
            <TouchableOpacity
              key={r.id}
              style={[styles.recurItem, i < rules.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
              onPress={() => onOpenRule(r.id)}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <View style={[styles.recurItemIcon, { backgroundColor: (vis?.color ?? colors.accent) + '22' }]}>
                <Feather name={vis?.icon ?? 'repeat'} size={18} color={vis?.color ?? colors.accent} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.recurItemName} numberOfLines={1}>{label}</Text>
                <Text style={styles.recurItemSub} numberOfLines={1}>
                  {formatRupees(total)} · {freqWord(r.recur_freq)}{next ? ` · next ${format(next, 'MMM d')}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.recurItemShare}>{formatRupees(myShare)}</Text>
                <Text style={styles.recurItemShareLabel}>your share</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity style={styles.addRecurBtn} onPress={onAdd} accessibilityRole="button">
        <Feather name="plus" size={15} color={colors.accent} />
        <View>
          <Text style={styles.addRecurBtnText}>Add recurring expense</Text>
          <Text style={styles.addRecurBtnSub}>Bills, memberships, any fixed charge</Text>
        </View>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  listContent: { padding: layout.screenPaddingH, paddingBottom: 100, gap: space.sm },
  recurSummaryCard: { backgroundColor: colors.settleTint, borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1.5, borderColor: colors.settle },
  recurSummaryTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.textPrimary },
  recurSummaryAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 16, color: colors.settle, letterSpacing: -0.5 },
  recurSummarySub: { fontSize: 12, color: colors.textMuted },
  insightSectionLabel: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Inter_600SemiBold', marginBottom: space.sm },
  insightCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, marginBottom: 10, ...shadow.sm },
  recurItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.md, paddingVertical: 14 },
  recurItemIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.bgMuted, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  recurItemName: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.textPrimary },
  recurItemSub: { fontSize: 11, color: colors.textMuted },
  recurItemShare: { fontFamily: 'SpaceMono_400Regular', fontSize: 14, color: colors.textPrimary, letterSpacing: -0.5 },
  recurItemShareLabel: { fontSize: 10, color: colors.textMuted, textAlign: 'right' },
  addRecurBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.accentMuted, borderWidth: 1.5, borderColor: colors.accent, borderStyle: 'dashed', borderRadius: radius.md, padding: 12, marginBottom: space.md },
  addRecurBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.accent },
  addRecurBtnSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
});
