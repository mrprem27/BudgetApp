import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, layout } from '../../tokens';
import { useContentInset } from '../../../hooks/useContentInset';
import { healthColor } from './helpers';
import { budgetHealth, utilLabel } from '../../../lib/budget';
import type { CategoryBudgetStatus } from '../../../lib/budget';
import type { BudgetAnalytics } from '../../../lib/analytics';
import { formatCompact } from '../../../lib/money';
import { categorySection, SECTION_ORDER } from '../../../constants/categories';
import { Card } from '../../ui/Card';
import { Chip } from '../../ui/Chip';
import { OverviewCard } from '../../ui/OverviewCard';
import { Divider } from '../../ui/Divider';
import { EmptyState } from '../../ui/EmptyState';
import { SectionHeader } from '../../ui/SectionHeader';
import { BudgetCategoryRow } from '../BudgetCategoryRow';
import { AppRefreshControl } from '../../ui/AppRefreshControl';
import { planRebalance } from '../../../lib/rebalance';
import { haptic } from '../../../lib/haptics';
import { alpha } from '../../../theme';

/** `'all'` = no filter. The other three mirror `CategoryBudgetStatus.health`. */
type StatusFilter = 'all' | 'over' | 'near' | 'ontrack';

type Props = {
  refreshing: boolean;
  onRefresh: () => void;
  analytics: BudgetAnalytics | null;
  catStatus: CategoryBudgetStatus[];
  onEditBudget: () => void;
  onCreateBudget: () => void;
  /** Open the re-plan sheet for an over-budget category (`V2-07`). */
  onRebalance?: (category: string) => void;
  /** Whether I may edit the line every member inherits — changes what the copy claims. */
  canEditGroupDefault?: boolean;
  /** How many categories I have my own amount for. */
  overrideCount?: number;
};

/**
 * Group Budget tab: one overview card, then the per-category list by section.
 *
 * **The overview's three counts *are* the filter.** They used to be inert numbers sitting
 * directly above a `FilterBar` offering the same four choices — two controls for one job,
 * so seeing "2 over" and then acting on it took a second tap on a different widget. Now
 * the number is the control, and the separate filter row is gone.
 *
 * "Who paid what" used to live here, between the hero and the categories. It moved to the
 * Members tab: it's a settlement concern, and the people and balances are already there.
 */
export function BudgetTab({
  analytics, catStatus, onEditBudget, onCreateBudget, onRebalance, refreshing, onRefresh,
  canEditGroupDefault = false, overrideCount = 0,
}: Props) {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const bottomPad = useContentInset({ fab: true });

  if (catStatus.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* An admin sets what everyone inherits; a member can only set their own,
            and saying so is the difference between an invitation and a dead end. */}
        <EmptyState
          icon="target"
          title="No budget yet"
          body={canEditGroupDefault
            ? "Give a category a limit — one-time, daily, monthly or yearly — and every member starts from it. Each period starts fresh: the limit resets and unused amount doesn't carry over."
            : "Set your own limits for this group — only you see them. An admin sets the group's, and yours replaces it for the categories you fill in."}
          actionLabel={canEditGroupDefault ? 'Set the group\'s budget' : 'Set my budget for this group'}
          onAction={onCreateBudget}
        />
      </ScrollView>
    );
  }

  const matches = (c: CategoryBudgetStatus) =>
    filter === 'all' ? true
    : filter === 'over' ? c.health === 'red'
    : filter === 'near' ? c.health === 'amber'
    : c.health === 'green';
  const visible = catStatus.filter(matches);

  /** Tapping the active count clears the filter, so the row is its own escape hatch. */
  const toggle = (next: StatusFilter) => {
    haptic.selection();
    setFilter(prev => (prev === next ? 'all' : next));
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
      refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {analytics && (analytics.totalAllocated > 0 || analytics.pooledCount > 0) && (() => {
        const health = budgetHealth(analytics.utilizationPct);
        const tint = healthColor(health);
        return (
          <OverviewCard
            eyebrow="Your spend"
            /* Edit sits with the thing it edits. It used to be a lone unlabelled pill in a
               `space-between` row that had lost its heading — so the tab opened with an
               action above the number the action changes. */
            action={<Chip label="Edit" icon="edit-2" onPress={onEditBudget} accessibilityLabel="Edit budget" />}
            amount={analytics.totalSpent}
            amountColor={tint}
            trailing={utilLabel(analytics.utilizationPct ?? 0)}
            trailingColor={tint}
            /* "per person", not "my share": the amount is one person's allowance, not
               a pot to divide — ₹10,000 Groceries in a 4-person flat is ₹10,000 each.
               Once you have your own amounts the figure is yours rather than the
               group's, so it stops claiming to be what everyone gets. */
            supporting={overrideCount > 0
              ? `of ${formatCompact(analytics.totalAllocated)} for you this month · your own in ${overrideCount} ${overrideCount === 1 ? 'category' : 'categories'}`
              : `of ${formatCompact(analytics.totalAllocated)} per person this month`}
            /* Yearly and one-time lines are pools, not monthly rates — a ₹24k/yr trip
               budget is spent when the trip happens, so it is excluded from the figures
               above. Naming it here is what keeps the exclusion honest rather than a
               silent omission from a total that looks complete. */
            supportingSecondary={analytics.pooledCount > 0
              ? `plus ${formatCompact(analytics.pooledAllocated)} in ${analytics.pooledCount} yearly/one-time ${analytics.pooledCount === 1 ? 'budget' : 'budgets'}`
              : undefined}
            bar={{
              progress: (analytics.utilizationPct ?? 0) / 100,
              color: tint,
              accessibilityLabel: `${utilLabel(analytics.utilizationPct ?? 0)} of budget used`,
            }}
            stats={[
              { key: 'over', value: analytics.overBudget.length, label: 'over', tint: colors.expense, onPress: () => toggle('over'), active: filter === 'over' },
              { key: 'near', value: analytics.nearLimit.length, label: 'near limit', tint: colors.healthAmber, onPress: () => toggle('near'), active: filter === 'near' },
              { key: 'ontrack', value: analytics.onTrackCount, label: 'on track', tint: colors.income, onPress: () => toggle('ontrack'), active: filter === 'ontrack' },
            ]}
          />
        );
      })()}

      {visible.length === 0 ? (
        <EmptyState
          icon="filter"
          title="Nothing here"
          body="No categories match this filter. Tap the highlighted count above to clear it."
          tint={colors.textSecondary}
        />
      ) : (
        SECTION_ORDER.map(section => {
          const lines = visible.filter(c => categorySection(c.category) === section);
          if (lines.length === 0) return null;
          return (
            // No `marginBottom` here and no `gap` on the container: SectionHeader owns
            // its own vertical margins, and stacking all three put 32px above every
            // header (AGENTS §12).
            <View key={section}>
              <SectionHeader title={section} />
              <Card clip>
                {lines.map((c, i) => (
                  <View key={c.category}>
                    {i > 0 && <Divider indent="text" />}
                    <BudgetCategoryRow
                      category={c.category}
                      cadence={c.cadence}
                      spent={c.spent}
                      allocated={c.allocated}
                      pct={c.pct}
                      health={c.health}
                    >
                      {/* V2-07: a red bar used to be the whole response to an overrun.
                          Only offered when a re-plan is actually possible. */}
                      {c.remaining < 0 && onRebalance && planRebalance(catStatus, c.category) && (
                        <TouchableOpacity
                          style={styles.replanBtn}
                          onPress={() => onRebalance(c.category)}
                          accessibilityRole="button"
                          accessibilityLabel={`Re-plan ${c.category} for the rest of this month`}
                        >
                          <Feather name="shuffle" size={12} color={colors.accent} />
                          <Text style={styles.replanText}>Re-plan the rest of this month</Text>
                        </TouchableOpacity>
                      )}
                    </BudgetCategoryRow>
                  </View>
                ))}
              </Card>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // No `gap` (AGENTS §12), and the overview card carries no `marginBottom`: the
  // `SectionHeader` under it already owns `marginTop: space.lg`, and the two used
  // to add up to 32px above the first section.
  listContent: { padding: layout.screenPaddingH },
  replanBtn: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.sm, alignSelf: 'flex-start', paddingVertical: space.xs, paddingHorizontal: space.sm, borderRadius: radius.pill, backgroundColor: alpha(colors.accent, 13) },
  replanText: { ...type.captionSemi, color: colors.accent },
});
