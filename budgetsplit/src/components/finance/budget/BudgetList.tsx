import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, layout } from '../../tokens';
import { healthColor } from '../group/helpers';
import { budgetHealth, utilLabel, type CategoryBudgetStatus } from '../../../lib/budget';
import { formatCompact } from '../../../lib/money';
import { budgetInvestedCaption } from '../../../lib/budgetCopy';
import { categorySection, SECTION_ORDER } from '../../../constants/categories';
import { BudgetBar } from '../BudgetBar';
import { BudgetCategoryRow } from '../BudgetCategoryRow';
import { Card } from '../../ui/Card';
import { Chip } from '../../ui/Chip';
import { Divider } from '../../ui/Divider';
import { EmptyState } from '../../ui/EmptyState';
import { AppRefreshControl } from '../../ui/AppRefreshControl';
import { haptic } from '../../../lib/haptics';
import { sectionSummary } from '../../../lib/budgetSections';
import { InfoLabel } from '../../ui/InfoLabel';
import { PressableScale } from '../../ui/PressableScale';

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
  /** Moved into assets this month — named on the same terms (`DQ-26`). */
  invested?: number;
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
  rows, spent, allocated, pct, pooledAllocated = 0, pooledCount = 0, invested = 0,
  caption, onEdit, empty, rowExtra, refreshing, onRefresh, bottomPad,
}: Props) {
  const [filter, setFilter] = useState<StatusFilter>('all');
  // Sections start collapsed, each header carrying its own spent / budget (`U-55`): the whole
  // budget reads in one screen, and a section opens when you want its lines. A status filter
  // opens every section — "3 over" must never answer with three closed headers.
  const [open, setOpen] = useState<Record<string, boolean>>({});

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
  const shownSections = SECTION_ORDER.filter(sec => (bySection.get(sec)?.length ?? 0) > 0);
  // A lone section stays open: one closed header and nothing else is a screen that hides its budget.
  const forcedOpen = filter !== 'all' || shownSections.length === 1;
  const isOpen = (sec: string) => forcedOpen || !!open[sec];
  const allOpen = shownSections.every(isOpen);
  const setAll = (to: boolean) => setOpen(Object.fromEntries(shownSections.map(sec => [sec, to])));
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
          {/* What the figure is measured against, and what it leaves out, sit behind the ⓘ
              (`U-55`, AGENTS §14): three caption lines under the hero made the card read as a
              paragraph. Still one tap away — yearly pools and invested money are exclusions,
              and an exclusion nobody can find is a silent omission. */}
          <InfoLabel
            label="Your spend"
            labelStyle={styles.headLabel}
            accessibilityLabel="About this budget"
            info={
              <View style={styles.info}>
                <Text style={styles.caption}>{caption}</Text>
                {pooledCount > 0 && (
                  <Text style={styles.caption}>
                    Plus {formatCompact(pooledAllocated)} in {pooledCount} yearly/one-time{' '}
                    {pooledCount === 1 ? 'budget' : 'budgets'}, not counted in this month.
                  </Text>
                )}
                {invested > 0 && (
                  <Text style={styles.caption}>{budgetInvestedCaption(formatCompact(invested))}</Text>
                )}
              </View>
            }
          />
          <Chip label="Edit" icon="edit-2" onPress={onEdit} accessibilityLabel="Edit budget" />
        </View>

        <View style={styles.amountRow}>
          <Text style={[styles.spent, { color: healthColor(health) }]}>
            {formatCompact(spent)}
            <Text style={styles.ofBudget}> / {formatCompact(allocated)}</Text>
          </Text>
          <Text style={[styles.pct, { color: healthColor(health) }]}>{utilLabel(pct ?? 0)}</Text>
        </View>

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
        <>
        {!forcedOpen && shownSections.length > 1 && (
          <View style={styles.toolbar}>
            <TouchableOpacity onPress={() => setAll(!allOpen)} hitSlop={10} accessibilityRole="button">
              <Text style={styles.toolbarText}>{allOpen ? 'Collapse all' : 'Expand all'}</Text>
            </TouchableOpacity>
          </View>
        )}
        {shownSections.map(section => {
          const lines = bySection.get(section) ?? [];
          const expanded = isOpen(section);
          const sum = sectionSummary(lines);
          return (
            // No `gap` on the container: the header row owns its own spacing (AGENTS §12).
            <View key={section} style={styles.section}>
              <SectionToggle
                title={section}
                expanded={expanded}
                summary={expanded ? null : sum}
                count={lines.length}
                onPress={forcedOpen ? undefined : () => setOpen(o => ({ ...o, [section]: !expanded }))}
              />
              {expanded && <Card clip>
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
              </Card>}
            </View>
          );
        })}
        </>
      )}
    </>,
  );
}

/**
 * A budget section's header. Collapsed, it carries the section's own spent / budget and a thin
 * bar in its health colour, so the closed list still reads as a budget; open, the lines below
 * say it and the header is just a name (`U-55`).
 */
function SectionToggle({ title, expanded, summary, count, onPress }: {
  title: string;
  expanded: boolean;
  summary: ReturnType<typeof sectionSummary> | null;
  count: number;
  onPress?: () => void;
}) {
  const tint = summary ? healthColor(summary.health) : colors.textMuted;
  const per = summary?.cadence === 'yearly' ? ' a year' : summary?.cadence === 'daily' ? ' a day' : '';
  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      style={styles.toggle}
      accessibilityLabel={`${title}, ${count} ${count === 1 ? 'category' : 'categories'}${onPress ? `. ${expanded ? 'Collapse' : 'Expand'}` : ''}`}
      accessibilityState={{ expanded }}
    >
      <View style={styles.toggleRow}>
        {onPress && <Feather name={expanded ? 'chevron-down' : 'chevron-right'} size={16} color={colors.textMuted} />}
        <Text style={styles.toggleTitle}>{title}</Text>
        {summary && summary.allocated > 0 ? (
          <Text style={[styles.toggleAmt, { color: tint }]} numberOfLines={1}>
            {formatCompact(summary.spent)}
            <Text style={styles.toggleOf}> / {formatCompact(summary.allocated)}{per}</Text>
          </Text>
        ) : !expanded ? (
          <Text style={styles.toggleOf}>{count}</Text>
        ) : null}
      </View>
      {summary && summary.allocated > 0 && (
        <View style={styles.toggleBar}>
          <BudgetBar pct={summary.pct} health={summary.health} height={4} />
        </View>
      )}
      {summary && (summary.overCount > 0 || summary.otherCount > 0) && (
        <Text style={styles.toggleNote}>
          {summary.overCount > 0 && <Text style={{ color: colors.healthRed }}>{summary.overCount} over</Text>}
          {summary.overCount > 0 && summary.otherCount > 0 ? ' · ' : ''}
          {summary.otherCount > 0 ? `+${summary.otherCount} on another cadence` : ''}
        </Text>
      )}
    </PressableScale>
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
  content: { paddingHorizontal: layout.screenPaddingH, paddingTop: space.xs },
  overview: { marginBottom: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  headLabel: { ...type.sectionLabel, color: colors.textMuted },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  spent: { ...type.amountXL },
  pct: { ...type.amountSM },
  caption: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  info: { marginTop: space.xs },
  ofBudget: { ...type.amountSM, color: colors.textMuted },
  toolbar: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: space.sm },
  toolbarText: { ...type.labelSemi, color: colors.accent },
  section: { marginTop: space.sm },
  toggle: { paddingVertical: space.sm },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: layout.touchMin },
  toggleTitle: { ...type.sectionLabel, color: colors.textMuted, flex: 1 },
  toggleAmt: { ...type.amountSM },
  toggleOf: { ...type.caption, color: colors.textMuted },
  toggleBar: { marginTop: space.xs },
  toggleNote: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  bar: { marginTop: space.md, marginBottom: space.md },
  filters: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
});
