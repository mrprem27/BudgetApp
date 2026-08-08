import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { colors, type, space, radius, layout, shadow } from '../../tokens';
import { useContentInset } from '../../../hooks/useContentInset';
import { formatRupees } from '../../../lib/money';
import { splitLabel, freqWord } from '../../../lib/groupDetail';
import { nextOccurrenceOnOrAfter } from '../../../lib/recurrence';
import { categoryVisual } from '../../../constants/categories';
import { EmptyState } from '../../ui/EmptyState';
import { SectionHeader } from '../../ui/SectionHeader';
import { Divider } from '../../ui/Divider';
import { RecurringRow } from '../RecurringRow';
import { AppRefreshControl } from '../../ui/AppRefreshControl';
import type { TxnWithSplits } from '../../../db/queries/transactions';
import { alpha } from '../../../theme';

type Props = {
  refreshing: boolean;
  onRefresh: () => void;
  rules: TxnWithSplits[];
  meId: string;
  defaultSplit: string;
  monthlyTotal: number;
  nextLabel: string | null;
  onAdd: () => void;
  onOpenRule: (ruleId: string) => void;
};

/** Group Recurring tab: monthly-total summary + active recurring rules + add CTA. */
export function RecurringTab({ rules, meId, defaultSplit, monthlyTotal, nextLabel, onAdd, onOpenRule, refreshing, onRefresh }: Props) {
  const bottomPad = useContentInset({ fab: true });
  if (rules.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
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
    <ScrollView
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
      <View style={styles.recurSummaryCard}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.xs }}>
          <Text style={styles.recurSummaryTitle}>Group recurring</Text>
          <Text style={styles.recurSummaryAmt}>{formatRupees(monthlyTotal)}/mo</Text>
        </View>
        <Text style={styles.recurSummarySub}>
          {rules.length} active{nextLabel ? ` · next charge ${nextLabel}` : ''} · split {splitLabel(defaultSplit)}
        </Text>
      </View>

      <SectionHeader title={`Active · ${rules.length}`} />
      <View style={[styles.insightCard, { paddingHorizontal: 0 }]}>
        {rules.map((r, i) => (
          <React.Fragment key={r.id}>
            {i > 0 && <Divider indent="text" />}
            <RecurringRow rule={r} meId={meId} showNext onPress={() => onOpenRule(r.id)} />
          </React.Fragment>
        ))}
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
  listContent: { padding: layout.screenPaddingH, gap: space.sm },
  recurSummaryCard: { backgroundColor: colors.settleTint, borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1.5, borderColor: colors.settle },
  recurSummaryTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.textPrimary },
  recurSummaryAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 16, color: colors.settle, letterSpacing: -0.5 },
  recurSummarySub: { fontSize: 12, color: colors.textMuted },
  insightCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, marginBottom: 10, ...shadow.sm },
  addRecurBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.accentMuted, borderWidth: 1.5, borderColor: colors.accent, borderStyle: 'dashed', borderRadius: radius.md, padding: 12, marginBottom: space.md },
  addRecurBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.accent },
  addRecurBtnSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
});
