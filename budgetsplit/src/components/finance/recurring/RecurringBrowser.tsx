import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, type, space } from '../../tokens';
import { Input } from '../../ui/Input';
import { Chip } from '../../ui/Chip';
import { RecurringInventory } from './RecurringInventory';
import { StoppedRecurring } from './StoppedRecurring';
import { findRecurring, type RecurringSort, type RecurringSub } from '../../../lib/recurringData';

const SORTS: { key: RecurringSort; label: string }[] = [
  { key: 'next', label: 'Next due' },
  { key: 'newest', label: 'Newest' },
  { key: 'amount', label: 'Amount' },
];

/** Search and sort appear once a list is long enough to need them. */
const TOOLS_FROM = 4;

/**
 * Money's Recurring page: every rule, with the tools. Search above the card, sorting as small
 * chips on the card's last line (where Budget keeps its filters), stopped rules in a closed box
 * at the end. A Recurring tab is the plain list instead (`RecurringTab`): active and paused
 * rules and a link here. The host owns the scroll view and the empty state.
 */
export function RecurringBrowser({ active, stopped, onOpen, empty }: {
  active: RecurringSub[];
  stopped: RecurringSub[];
  onOpen: (id: string) => void;
  /** Shown when there are no live rules at all. */
  empty: React.ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<RecurringSort>('next');
  const shown = useMemo(() => findRecurring(active, query, sort), [active, query, sort]);
  const tools = active.length >= TOOLS_FROM;
  return (
    <>
      {active.length === 0 ? empty : (
        <>
          {tools && (
            <Input round value={query} onChangeText={setQuery} placeholder="Search by name or category" icon="search"
              autoCapitalize="none" autoCorrect={false} accessibilityLabel="Search recurring" style={styles.search} />
          )}
          {shown.length > 0 ? (
            <RecurringInventory
              subs={shown}
              onOpen={onOpen}
              tools={tools ? (
                <View style={styles.sorts}>
                  {SORTS.map(s => (
                    <Chip key={s.key} size="sm" label={s.label} selected={sort === s.key} onPress={() => setSort(s.key)}
                      accessibilityLabel={`Sort by ${s.label}`} />
                  ))}
                </View>
              ) : undefined}
            />
          ) : <Text style={styles.noMatch}>Nothing matches “{query.trim()}”.</Text>}
        </>
      )}
      <StoppedRecurring stopped={stopped} onOpen={onOpen} />
    </>
  );
}

const styles = StyleSheet.create({
  search: { marginBottom: space.md },
  sorts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  noMatch: { ...type.body, color: colors.textMuted, textAlign: 'center', paddingVertical: space.lg },
});
