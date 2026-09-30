import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, type, space } from '../../tokens';
import { Card } from '../../ui/Card';
import { ListRow } from '../../ui/ListRow';
import { Input } from '../../ui/Input';
import { TabPills } from '../../ui/TabPills';
import { EmptyState } from '../../ui/EmptyState';
import { RecurringInventory } from './RecurringInventory';
import { StoppedEntry, StoppedList } from './StoppedRecurring';
import { findRecurring, type RecurringSort, type RecurringSub } from '../../../lib/recurringData';

const SORTS: { key: RecurringSort; label: string }[] = [
  { key: 'next', label: 'Next due' },
  { key: 'newest', label: 'Newest' },
  { key: 'amount', label: 'Amount' },
];

/** Search and sort appear once a list is long enough to need them. */
const TOOLS_FROM = 4;

/**
 * A rule list, searchable and sortable, with stopped rules in a view of their own (2026-09-30).
 * Money's Recurring screen and every group's (and Personal's) Recurring tab render this, so the
 * three can never behave differently. The host owns the scroll view and the empty state.
 */
export function RecurringBrowser({ active, stopped, onOpen, empty }: {
  active: RecurringSub[];
  stopped: RecurringSub[];
  onOpen: (id: string) => void;
  /** Shown when there are no live rules at all. */
  empty: React.ReactNode;
}) {
  const [viewWanted, setView] = useState<'active' | 'stopped'>('active');
  // Back to the live list once the last stopped rule is started again.
  const view = viewWanted === 'stopped' && stopped.length > 0 ? 'stopped' : 'active';
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<RecurringSort>('next');
  const list = view === 'stopped' ? stopped : active;
  const shown = useMemo(() => findRecurring(list, query, sort), [list, query, sort]);
  const tools = list.length >= TOOLS_FROM;

  const toolbar = tools ? (
    <View style={styles.tools}>
      <Input value={query} onChangeText={setQuery} placeholder="Search by name or category" icon="search"
        autoCapitalize="none" autoCorrect={false} accessibilityLabel="Search recurring" />
      <TabPills tabs={SORTS} active={sort} onChange={k => setSort(k as RecurringSort)} />
    </View>
  ) : null;
  const noMatch = <Text style={styles.noMatch}>Nothing matches “{query.trim()}”.</Text>;

  if (view === 'stopped') {
    return (
      <>
        <Card clip style={styles.back}>
          <ListRow icon="arrow-left" title="Active rules" subtitle={`${stopped.length} stopped`} chevron={false}
            onPress={() => { setView('active'); setQuery(''); }} accessibilityLabel="Back to active rules" />
        </Card>
        {toolbar}
        {shown.length > 0 ? <StoppedList stopped={shown} onOpen={onOpen} /> : noMatch}
      </>
    );
  }

  return (
    <>
      {active.length === 0 ? empty : (
        <>
          {toolbar}
          {shown.length > 0 ? <RecurringInventory subs={shown} onOpen={onOpen} /> : noMatch}
        </>
      )}
      <StoppedEntry count={stopped.length} onPress={() => { setView('stopped'); setQuery(''); }} />
    </>
  );
}

/** For hosts that want the stock empty state. */
export function NoRecurring({ onAdd }: { onAdd: () => void }) {
  return (
    <EmptyState
      icon="repeat"
      title="No recurring yet"
      body="Rent, Wi-Fi, memberships, anything you set to repeat shows up here with its monthly cost and your share."
      actionLabel="Add recurring expense"
      onAction={onAdd}
    />
  );
}

const styles = StyleSheet.create({
  tools: { gap: space.sm, marginBottom: space.md },
  back: { marginBottom: space.md },
  noMatch: { ...type.body, color: colors.textMuted, textAlign: 'center', paddingVertical: space.lg },
});
