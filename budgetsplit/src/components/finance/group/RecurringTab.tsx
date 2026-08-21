import React from 'react';
import { StyleSheet, ScrollView } from 'react-native';
import { colors, layout } from '../../tokens';
import { useContentInset } from '../../../hooks/useContentInset';
import { formatCompact } from '../../../lib/money';
import { splitLabel } from '../../../lib/groupDetail';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/EmptyState';
import { SectionHeader } from '../../ui/SectionHeader';
import { Divider } from '../../ui/Divider';
import { ListRow } from '../../ui/ListRow';
import { OverviewCard } from '../../ui/OverviewCard';
import { RecurringRow } from '../RecurringRow';
import { AppRefreshControl } from '../../ui/AppRefreshControl';
import type { TxnWithSplits } from '../../../db/queries/transactions';

type Props = {
  refreshing: boolean;
  onRefresh: () => void;
  rules: TxnWithSplits[];
  /** Skipped occurrence dates per rule — keeps "next charge" honest. */
  skips?: Map<string, Set<number>>;
  meId: string;
  defaultSplit: string;
  /** Monthly-equivalent of the whole bill across active rules. */
  monthlyTotal: number;
  /** Monthly-equivalent of my share of it. */
  myShare: number;
  nextLabel: string | null;
  onAdd: () => void;
  onOpenRule: (ruleId: string) => void;
};

/** Group Recurring tab: monthly-total summary + active recurring rules + add row. */
export function RecurringTab({
  rules, skips, meId, defaultSplit, monthlyTotal, myShare, nextLabel,
  onAdd, onOpenRule, refreshing, onRefresh,
}: Props) {
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
      {/* The headline is the group's bill, because that's what a group surface owes
          you — but "your share" now sits beside it. It used to be missing entirely,
          so the summary talked about the whole rent while every row underneath
          talked about your third of it, with nothing connecting the two. */}
      <OverviewCard
        eyebrow="Per month"
        amount={monthlyTotal}
        trailing="/mo"
        supporting={`Split ${splitLabel(defaultSplit)}`}
        stats={[
          { key: 'active', value: rules.length, label: 'active' },
          { key: 'next', value: nextLabel ?? '—', label: 'next charge' },
          { key: 'mine', value: formatCompact(myShare), label: 'your share', tint: colors.accent },
        ]}
      />

      <SectionHeader title={`Active · ${rules.length}`} />
      <Card clip>
        {rules.map((r, i) => (
          <React.Fragment key={r.id}>
            {i > 0 && <Divider indent="text" />}
            <RecurringRow rule={r} meId={meId} showNext showShareLabel skipDates={skips?.get(r.id)} onPress={() => onOpenRule(r.id)} />
          </React.Fragment>
        ))}
        {/* Last row of the same card rather than a dashed box below it. The dashed
            CTA was a hand-rolled seventh pill recipe (AGENTS §9); §4's `ListRow` is
            the primitive for icon + label + subtitle + chevron. */}
        <Divider indent="text" />
        <ListRow
          icon="plus"
          title="Add recurring expense"
          subtitle="Bills, memberships, any fixed charge"
          onPress={onAdd}
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // No `gap` (AGENTS §12) — it used to stack with each card's own `marginBottom`,
  // producing three different gutters (18 / 22 / 32px) on one 97-line screen.
  listContent: { padding: layout.screenPaddingH },
});
