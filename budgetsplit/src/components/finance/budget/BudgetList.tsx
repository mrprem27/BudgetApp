import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, type, space, layout, alpha } from '../../tokens';
import { healthColor } from '../group/helpers';
import { budgetHealth, utilLabel, type CategoryBudgetStatus, type Period } from '../../../lib/budget';
import { formatCompact } from '../../../lib/money';
import { budgetInvestedCaption, PERIOD_WORDS } from '../../../lib/budgetCopy';
import { TabPills } from '../../ui/TabPills';
import { categorySection, sectionIcon, SECTION_ORDER } from '../../../constants/categories';
import { BudgetBar } from '../BudgetBar';
import { BudgetCategoryRow } from '../BudgetCategoryRow';
import { SummaryCard } from '../SummaryCard';
import { SectionCard } from '../../ui/SectionCard';
import { Chip } from '../../ui/Chip';
import { Divider } from '../../ui/Divider';
import { EmptyState } from '../../ui/EmptyState';
import { AppRefreshControl } from '../../ui/AppRefreshControl';
import { haptic } from '../../../lib/haptics';
import { sectionSummary } from '../../../lib/budgetSections';
import { InfoLabel } from '../../ui/InfoLabel';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];
const PERIOD_BY: Record<Period, string> = { daily: 'by the day', monthly: 'by the month', yearly: 'by the year' };

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
  /** The period every figure here is read at (`U-89`). Always on show, above the card. */
  period: Period;
  onPeriod: (p: Period) => void;
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
  caption, period, onPeriod, onEdit, empty, rowExtra, refreshing, onRefresh, bottomPad,
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

  /*
   * Daily / Monthly / Yearly, always there: a budget cannot be judged without saying over what.
   * A line counts in its own period and every longer one (a daily limit fills the month and the
   * year, a monthly one fills the year), never a shorter one (`budgetKind`).
   */
  const periods = (
    <View style={styles.periods}>
      <TabPills tabs={PERIODS} active={period} onChange={k => onPeriod(k as Period)} size="sm" />
    </View>
  );

  // No budget at all: the host's empty state, and nothing to switch between.
  if (rows.length === 0 && pooledCount === 0) return scroll(empty);
  // Budgets exist, but none can be read at this period (monthly limits, seen by the day).
  if (rows.length === 0) {
    return scroll(
      <>
        {periods}
        <EmptyState
          icon="clock"
          title={`Nothing budgeted ${PERIOD_BY[period]}`}
          body={`${pooledCount} ${pooledCount === 1 ? 'budget is' : 'budgets are'} set for a longer period, ${formatCompact(pooledAllocated)} in all. A longer limit is not divided into shorter ones.`}
          tint={colors.textSecondary}
          actionLabel="Edit budget"
          onAction={onEdit}
        />
      </>,
    );
  }

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
      {periods}
      <SummaryCard
        style={styles.overview}
        /* What the figure is measured against, and what it leaves out, sit behind the ⓘ
           (`U-55`, AGENTS §14): three caption lines under the hero made the card read as a
           paragraph. Still one tap away — yearly pools and invested money are exclusions,
           and an exclusion nobody can find is a silent omission. */
        label={
          <InfoLabel
            label="Your spend"
            labelStyle={styles.headLabel}
            accessibilityLabel="About this budget"
            info={
              <View style={styles.info}>
                <Text style={styles.caption}>{caption}</Text>
                {pooledCount > 0 && (
                  <Text style={styles.caption}>
                    Plus {formatCompact(pooledAllocated)} in {pooledCount}{' '}
                    {pooledCount === 1 ? 'budget' : 'budgets'} set for a longer period, not counted {PERIOD_WORDS[period]}.
                  </Text>
                )}
                {invested > 0 && (
                  <Text style={styles.caption}>{budgetInvestedCaption(formatCompact(invested), period)}</Text>
                )}
              </View>
            }
          />
        }
        // Edit sits with the thing it edits.
        action={<Chip label="Edit" icon="edit-2" size="sm" onPress={onEdit} accessibilityLabel="Edit budget" />}
        amount={
          <Text style={[styles.spent, { color: healthColor(health) }]}>
            {formatCompact(spent)}
            <Text style={styles.ofBudget}> / {formatCompact(allocated)}</Text>
          </Text>
        }
        side={<Text style={[styles.pct, { color: healthColor(health) }]}>{utilLabel(pct ?? 0)}</Text>}
        // The three filters, with Expand all at the end of their line.
        foot={
          <View style={styles.filters}>
            <CountChip count={counts.over} label="over" tint={colors.expense} active={filter === 'over'} onPress={() => toggle('over')} />
            <CountChip count={counts.near} label="near limit" tint={colors.healthAmber} active={filter === 'near'} onPress={() => toggle('near')} />
            <CountChip count={counts.ontrack} label="on track" tint={colors.income} active={filter === 'ontrack'} onPress={() => toggle('ontrack')} />
          </View>
        }
        expand={!forcedOpen && shownSections.length > 1 ? { open: allOpen, onPress: () => setAll(!allOpen) } : undefined}
      >
        <View style={styles.bar}>
          <BudgetBar pct={pct} health={health} height={6} />
        </View>
      </SummaryCard>

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
        {/* Each section is a box, like the budget editor's (`SectionCard`). CLOSED, its header
            carries the section's own spent / budget and bar, so a closed box still reads as a
            budget. OPEN, the header is just the name: every line below has its own figure and
            bar, and a total above them said the same thing twice (2026-10-01). */}
        {shownSections.map(section => {
          const lines = bySection.get(section) ?? [];
          const expanded = isOpen(section);
          const sum = sectionSummary(lines);
          const per = sum.cadence === 'yearly' ? ' a year' : sum.cadence === 'daily' ? ' a day' : '';
          const note = [
            sum.overCount > 0 ? `${sum.overCount} over` : null,
            sum.otherCount > 0 ? `+${sum.otherCount} on another cadence` : null,
          ].filter(Boolean).join(' · ');
          return (
            <SectionCard
              key={section}
              title={section}
              icon={sectionIcon(section)}
              subtitle={note || `${lines.length} ${lines.length === 1 ? 'category' : 'categories'}`}
              right={!expanded && sum.allocated > 0 ? (
                <Text style={[styles.boxAmt, { color: healthColor(sum.health) }]} numberOfLines={1}>
                  {formatCompact(sum.spent)}
                  <Text style={styles.boxOf}> / {formatCompact(sum.allocated)}{per}</Text>
                </Text>
              ) : undefined}
              below={!expanded && sum.allocated > 0 ? <BudgetBar pct={sum.pct} health={sum.health} height={4} /> : undefined}
              expanded={expanded}
              onToggle={forcedOpen ? undefined : () => setOpen(o => ({ ...o, [section]: !expanded }))}
            >
              {lines.map(c => (
                <View key={`${c.category}-${c.cadence}`}>
                  <Divider indent="text" />
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
            </SectionCard>
          );
        })}
        </>
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
      size="sm"
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
  periods: { marginBottom: space.md },
  // An overview, and it should look like one: the same wash and border Recurring's card has in
  // its own colour. Plain, it read as one more box in a column of boxes.
  overview: { backgroundColor: alpha(colors.accent, 8), borderColor: colors.accent },
  headLabel: { ...type.sectionLabel, color: colors.accent },
  spent: { ...type.amountLG },
  pct: { ...type.amountSM },
  caption: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  info: { marginTop: space.xs },
  ofBudget: { ...type.amountSM, color: colors.textMuted },
  boxAmt: { ...type.amountSM },
  boxOf: { ...type.caption, color: colors.textMuted },
  bar: { marginTop: space.sm },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
