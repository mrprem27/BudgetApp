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
import { BudgetBar } from '../BudgetBar';
import { Card } from '../../ui/Card';
import { Chip } from '../../ui/Chip';
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

  // Grouped once here rather than re-scanning `visible` inside the SECTION_ORDER
  // map below, which was SECTION_ORDER × categories on every render of a list
  // that re-renders on every filter tap.
  //
  // Plain code, not `useMemo`: the empty-state `return` above this is a
  // conditional exit, so a hook here would break the rules of hooks. Moving that
  // return below the hooks is the real fix and is worth doing when this file is
  // next opened for a feature.
  const bySection = new Map<string, CategoryBudgetStatus[]>();
  for (const c of visible) {
    const s = categorySection(c.category);
    const list = bySection.get(s);
    if (list) list.push(c); else bySection.set(s, [c]);
  }

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
      {analytics && (analytics.totalAllocated > 0 || analytics.pooledCount > 0) && (
        <Card padded style={styles.ovCard}>
          {/* Edit sits with the thing it edits. It used to be a lone unlabelled pill in a
              `space-between` row that had lost its heading — so the tab opened with an
              action above the number the action changes. */}
          <View style={styles.ovHead}>
            <Text style={styles.ovLabel}>Your spend</Text>
            <Chip label="Edit" icon="edit-2" onPress={onEditBudget} accessibilityLabel="Edit budget" />
          </View>

          <View style={styles.ovAmountRow}>
            <Text style={[styles.ovSpent, { color: healthColor(budgetHealth(analytics.utilizationPct)) }]}>
              {formatCompact(analytics.totalSpent)}
            </Text>
            <Text style={[styles.ovPct, { color: healthColor(budgetHealth(analytics.utilizationPct)) }]}>
              {utilLabel(analytics.utilizationPct ?? 0)}
            </Text>
          </View>
          {/* "per person", not "my share": the amount is one person's allowance, not
              a pot to divide — ₹10,000 Groceries in a 4-person flat is ₹10,000 each.
              Once you have your own amounts the figure is yours rather than the
              group's, so it stops claiming to be what everyone gets. */}
          <Text style={styles.ovOf}>
            {overrideCount > 0
              ? `of ${formatCompact(analytics.totalAllocated)} for you this month · your own in ${overrideCount} ${overrideCount === 1 ? 'category' : 'categories'}`
              : `of ${formatCompact(analytics.totalAllocated)} per person this month`}
          </Text>
          {/* Yearly and one-time lines are pools, not monthly rates — a ₹24k/yr trip
              budget is spent when the trip happens, so it is excluded from the figures
              above. Naming it here is what keeps the exclusion honest rather than a
              silent omission from a total that looks complete. */}
          {analytics.pooledCount > 0 && (
            <Text style={styles.ovPooled}>
              plus {formatCompact(analytics.pooledAllocated)} in {analytics.pooledCount} yearly/one-time {analytics.pooledCount === 1 ? 'budget' : 'budgets'}
            </Text>
          )}

          <View style={styles.ovBar}>
            <BudgetBar pct={analytics.utilizationPct} health={budgetHealth(analytics.utilizationPct)} height={10} />
          </View>

          <Divider indent="none" />

          <View style={styles.statsRow}>
            <StatFilter
              count={analytics.overBudget.length} label="over" tint={colors.expense}
              active={filter === 'over'} onPress={() => toggle('over')}
            />
            <StatFilter
              count={analytics.nearLimit.length} label="near limit" tint={colors.healthAmber}
              active={filter === 'near'} onPress={() => toggle('near')}
            />
            <StatFilter
              count={analytics.onTrackCount} label="on track" tint={colors.income}
              active={filter === 'ontrack'} onPress={() => toggle('ontrack')}
            />
          </View>
        </Card>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon="filter"
          title="Nothing here"
          body="No categories match this filter. Tap the highlighted count above to clear it."
          tint={colors.textSecondary}
        />
      ) : (
        SECTION_ORDER.map(section => {
          const lines = bySection.get(section) ?? [];
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

/** One tappable count in the overview — the filter control for that health band. */
function StatFilter({ count, label, tint, active, onPress }: {
  count: number; label: string; tint: string; active: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.stat, active && { backgroundColor: alpha(tint, 13), borderColor: tint }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${count} ${label}${active ? ', filtering. Tap to clear' : '. Tap to filter'}`}
    >
      <Text style={[styles.statVal, { color: tint }]}>{count}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  listContent: { padding: layout.screenPaddingH },
  replanBtn: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.sm, alignSelf: 'flex-start', paddingVertical: space.xs, paddingHorizontal: space.sm, borderRadius: radius.pill, backgroundColor: alpha(colors.accent, 13) },
  replanText: { ...type.captionSemi, color: colors.accent },

  ovCard: { marginBottom: space.sm },
  ovHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  ovLabel: { ...type.sectionLabel, color: colors.textMuted },
  ovAmountRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  ovSpent: { ...type.amountXL },
  ovPct: { ...type.amountSM },
  ovPooled: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  ovOf: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  ovBar: { marginTop: space.md, marginBottom: space.md },

  statsRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    minHeight: layout.touchMin,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  statVal: { ...type.amountMD },
  statLabel: { ...type.caption, color: colors.textMuted },
});
