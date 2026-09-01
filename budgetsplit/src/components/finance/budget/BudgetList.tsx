import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, type, space, layout } from '../../tokens';
import { healthColor } from '../group/helpers';
import { budgetHealth, utilLabel, type CategoryBudgetStatus } from '../../../lib/budget';
import { formatCompact } from '../../../lib/money';
import { categorySection, SECTION_ORDER } from '../../../constants/categories';
import { BudgetBar } from '../BudgetBar';
import { BudgetCategoryRow } from '../BudgetCategoryRow';
import { Card } from '../../ui/Card';
import { Chip } from '../../ui/Chip';
import { Divider } from '../../ui/Divider';
import { EmptyState } from '../../ui/EmptyState';
import { SectionHeader } from '../../ui/SectionHeader';
import { AppRefreshControl } from '../../ui/AppRefreshControl';
import { haptic } from '../../../lib/haptics';

/** `'all'` = no filter. The other three mirror `CategoryBudgetStatus.health`. */
type StatusFilter = 'all' | 'over' | 'near' | 'ontrack';

type Props = {
  /** The lines to show, already resolved for this viewer. */
  rows: CategoryBudgetStatus[];
  /** Spend so far, over the same window as `allocated`. */
  spent: number;
  allocated: number;
  pct: number | null;
  /** Yearly/one-time lines — named, never folded into the figures above. */
  pooledAllocated?: number;
  pooledCount?: number;
  /** The one line that genuinely differs between the two callers. */
  caption: string;
  onEdit: () => void;
  /** Shown instead of everything when `rows` is empty — the copy is role-dependent. */
  empty: React.ReactNode;
  /** Extra content under one row — the group tab's re-plan chip. */
  rowExtra?: (row: CategoryBudgetStatus) => React.ReactNode;
  refreshing: boolean;
  onRefresh: () => void;
  bottomPad: number;
};

/**
 * A budget, as a list. **One** component for the group's Budget tab and
 * Personal's.
 *
 * ## Why it is shared
 *
 * The two read views already shared `BudgetCategoryRow` — and then wrapped it in
 * completely different screens. The group had an overview card, a progress bar and
 * three filters; Personal had a bare heading, a note, a hand-rolled list and a
 * hand-rolled empty state with a naked 22pt icon where §2 requires the 64pt circle.
 * The same idea, at two levels of finish, so the more useful half was unreachable
 * from the screen most people open. The difference between them is the data, not
 * the layout.
 *
 * ## The counts ARE the filter
 *
 * They used to be inert numbers above a separate `FilterBar` offering the same four
 * choices — two controls for one job. They are now `ui/Chip`, which is what §9 says
 * a pill is. As hand-rolled `StatFilter`s they carried `borderColor: 'transparent'`,
 * so three *filters* read as three read-only stats and nobody found them.
 *
 * A count of zero renders as a plain chip with no `onPress`: "0 over" is a fact
 * worth stating, but a control that can only ever produce an empty list is not.
 *
 * ## Where the counts come from
 *
 * From `rows`, the array this list renders — never from a parallel aggregate. The
 * group tab took them from `BudgetAnalytics.overBudget.length` while filtering on
 * `health === 'red'` from a different query, which folds `Others` differently: two
 * computations, one label, free to disagree about a number you can count on screen.
 */
export function BudgetList({
  rows, spent, allocated, pct, pooledAllocated = 0, pooledCount = 0,
  caption, onEdit, empty, rowExtra, refreshing, onRefresh, bottomPad,
}: Props) {
  const [filter, setFilter] = useState<StatusFilter>('all');

  const counts = useMemo(() => ({
    over: rows.filter(r => r.health === 'red').length,
    near: rows.filter(r => r.health === 'amber').length,
    ontrack: rows.filter(r => r.health === 'green').length,
  }), [rows]);

  const visible = useMemo(() => rows.filter(r =>
    filter === 'all' ? true
    : filter === 'over' ? r.health === 'red'
    : filter === 'near' ? r.health === 'amber'
    : r.health === 'green',
  ), [rows, filter]);

  const bySection = useMemo(() => {
    const m = new Map<string, CategoryBudgetStatus[]>();
    for (const r of visible) {
      const s = categorySection(r.category);
      const list = m.get(s);
      if (list) list.push(r); else m.set(s, [r]);
    }
    return m;
  }, [visible]);

  const scroll = (
    children: React.ReactNode,
  ) => (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {children}
    </ScrollView>
  );

  if (rows.length === 0) return scroll(empty);

  const health = budgetHealth(pct);
  /** Tapping the active count clears the filter, so the row is its own way out. */
  const toggle = (next: StatusFilter) => {
    haptic.selection();
    setFilter(prev => (prev === next ? 'all' : next));
  };

  return scroll(
    <>
      <Card padded style={styles.overview}>
        {/* Edit sits with the thing it edits. It was once a lone unlabelled pill in
            a `space-between` row that had lost its heading, so the tab opened with
            an action above the number the action changes. */}
        <View style={styles.head}>
          <Text style={styles.headLabel}>Your spend</Text>
          <Chip label="Edit" icon="edit-2" onPress={onEdit} accessibilityLabel="Edit budget" />
        </View>

        <View style={styles.amountRow}>
          <Text style={[styles.spent, { color: healthColor(health) }]}>{formatCompact(spent)}</Text>
          <Text style={[styles.pct, { color: healthColor(health) }]}>{utilLabel(pct ?? 0)}</Text>
        </View>

        <Text style={styles.caption}>{caption}</Text>

        {/* Yearly and one-time lines are pools, not monthly rates — a ₹24k/yr trip
            budget is spent when the trip happens, so it is excluded from the figures
            above. Naming it here is what keeps that an exclusion rather than a
            silent omission from a total that looks complete. */}
        {pooledCount > 0 && (
          <Text style={styles.caption}>
            plus {formatCompact(pooledAllocated)} in {pooledCount} yearly/one-time{' '}
            {pooledCount === 1 ? 'budget' : 'budgets'}
          </Text>
        )}

        <View style={styles.bar}>
          <BudgetBar pct={pct} health={health} height={10} />
        </View>

        <Divider indent="none" />

        <View style={styles.filters}>
          <CountChip count={counts.over} label="over" tint={colors.expense} active={filter === 'over'} onPress={() => toggle('over')} />
          <CountChip count={counts.near} label="near limit" tint={colors.healthAmber} active={filter === 'near'} onPress={() => toggle('near')} />
          <CountChip count={counts.ontrack} label="on track" tint={colors.income} active={filter === 'ontrack'} onPress={() => toggle('ontrack')} />
        </View>
      </Card>

      {visible.length === 0 ? (
        <EmptyState
          icon="filter"
          title="Nothing here"
          body="No categories match this filter."
          tint={colors.textSecondary}
          // Was "Tap the highlighted count above to clear it" — instructions for a
          // control that may be off-screen, which is what §2's CTA rule replaces.
          actionLabel="Show all categories"
          onAction={() => setFilter('all')}
        />
      ) : (
        SECTION_ORDER.map(section => {
          const lines = bySection.get(section) ?? [];
          if (lines.length === 0) return null;
          return (
            // No `marginBottom` here and no `gap` on the container: SectionHeader
            // owns its own vertical margins, and stacking all three put 32px above
            // every header (AGENTS §12).
            <View key={section}>
              <SectionHeader title={section} />
              <Card clip>
                {lines.map((c, i) => (
                  <View key={`${c.category}-${c.cadence}`}>
                    {i > 0 && <Divider indent="text" />}
                    <BudgetCategoryRow
                      category={c.category}
                      cadence={c.cadence}
                      spent={c.spent}
                      allocated={c.allocated}
                      pct={c.pct}
                      health={c.health}
                    >
                      {rowExtra?.(c)}
                    </BudgetCategoryRow>
                  </View>
                ))}
              </Card>
            </View>
          );
        })
      )}
    </>,
  );
}

/**
 * One count in the overview: a filter when it has rows to show, a plain statement
 * of fact when it does not.
 */
function CountChip({ count, label, tint, active, onPress }: {
  count: number; label: string; tint: string; active: boolean; onPress: () => void;
}) {
  return (
    <Chip
      grow
      label={`${count} ${label}`}
      accent={tint}
      selected={active}
      onPress={count > 0 ? onPress : undefined}
      accessibilityLabel={`${count} ${label}${active ? ', filtering. Tap to clear' : count > 0 ? '. Tap to filter' : ''}`}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: layout.screenPaddingH },
  overview: { marginBottom: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  headLabel: { ...type.sectionLabel, color: colors.textMuted },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  spent: { ...type.amountXL },
  pct: { ...type.amountSM },
  caption: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  bar: { marginTop: space.md, marginBottom: space.md },
  filters: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
});
