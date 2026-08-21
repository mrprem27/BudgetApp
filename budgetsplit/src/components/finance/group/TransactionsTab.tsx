import React, { useMemo, useCallback, useRef } from 'react';
import { View, StyleSheet, SectionList } from 'react-native';
import { colors, space, layout } from '../../tokens';
import { useContentInset } from '../../../hooks/useContentInset';
import { groupByDate } from '../../../lib/txnGrouping';
import { TransactionRow } from '../TransactionRow';
import { TxnCell } from '../TxnCell';
import { FilterBar } from '../../ui/FilterBar';
import { Banner } from '../../ui/Banner';
import { EmptyState } from '../../ui/EmptyState';
import { SectionHeader } from '../../ui/SectionHeader';
import { AppRefreshControl } from '../../ui/AppRefreshControl';
import type { TxnWithSplits } from '../../../db/queries/transactions';
import type { Person } from '../../../db/queries/persons';

type Props = {
  txns: TxnWithSplits[];
  members: Person[];
  meId: string;
  groupName: string;
  onDeleteTxn: (id: string) => void;
  onEditTxn: (txn: TxnWithSplits) => void;
  refreshing: boolean;
  onRefresh: () => void;
  /**
   * Search and kind filter are owned by the screen, not by this tab.
   *
   * All four tabs unmount when you switch away, so a tab-local search box emptied
   * itself every time you glanced at Budget and came back. Now that the tab pills
   * carry counts, that round trip is more inviting, so the state has to outlive it.
   */
  search: string;
  onSearch: (v: string) => void;
  filterKind: string;
  onFilterKind: (v: string) => void;
};

/** Group ledger: collapsible filter bar + date-sectioned transaction list. */
export function TransactionsTab({
  txns, members, meId, groupName, onDeleteTxn, onEditTxn, refreshing, onRefresh,
  search, onSearch, filterKind, onFilterKind,
}: Props) {
  const bottomPad = useContentInset({ fab: true });

  const filteredTxns = useMemo(() => {
    const q = search.trim().toLowerCase();
    return txns.filter(t => {
      if (filterKind !== 'all' && t.kind !== filterKind) return false;
      if (q && !(`${t.category} ${t.note ?? ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [txns, filterKind, search]);

  const sections = useMemo(() => groupByDate<TxnWithSplits>(filteredTxns), [filteredTxns]);
  const filtered = filterKind !== 'all' || search.trim() !== '';

  // Stable renderItem so TransactionRow's React.memo holds; handlers read via refs.
  const delRef = useRef(onDeleteTxn); delRef.current = onDeleteTxn;
  const editRef = useRef(onEditTxn); editRef.current = onEditTxn;
  const renderTxn = useCallback(({ item, index, section }: { item: TxnWithSplits; index: number; section: { data: TxnWithSplits[] } }) => (
    <TxnCell first={index === 0} last={index === section.data.length - 1}>
      <TransactionRow
        txn={item}
        myId={meId}
        onDelete={() => delRef.current(item.id)}
        onPress={() => editRef.current(item)}
        members={members}
        isPersonal={false}
      />
    </TxnCell>
  ), [meId, members]);

  return (
    <SectionList
      sections={sections}
      keyExtractor={t => t.id}
      contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
      initialNumToRender={12}
      maxToRenderPerBatch={10}
      windowSize={11}
      // The default is sticky, and these headers have no background — so a stuck
      // header sat transparently on top of the rows scrolling under it. Search and
      // Review both already disable it; this was the last list that didn't.
      stickySectionHeadersEnabled={false}
      refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        txns.length > 0 ? (
          <View style={{ marginBottom: space.xs }}>
            <FilterBar
              collapsible
              search={search}
              onSearch={onSearch}
              searchPlaceholder="Search note or category"
              selected={{ kind: filterKind }}
              onSelect={(_, v) => onFilterKind(v)}
              groups={[{
                key: 'kind',
                options: [
                  { label: 'All', value: 'all' },
                  { label: 'Expense', value: 'expense' },
                  { label: 'Income', value: 'income' },
                  { label: 'Settlement', value: 'settlement' },
                ],
              }]}
            />
            {/* This tab gets no summary card: the list is a *ledger* of all three
                kinds, and AGENTS §12 forbids one total across them. What's honest to
                say here is how much of the list you're currently looking at — and,
                since the filter bar collapses, that a filter is on at all. */}
            {filtered && (
              <Banner
                icon="filter"
                text="Filtered"
                badge={`${filteredTxns.length} of ${txns.length}`}
                actionLabel="Clear"
                onAction={() => { onSearch(''); onFilterKind('all'); }}
                inset={false}
              />
            )}
          </View>
        ) : null
      }
      renderSectionHeader={({ section }) =>
        section.data.length ? <SectionHeader title={section.title} /> : null
      }
      renderItem={renderTxn}
      ListEmptyComponent={
        txns.length === 0 ? (
          <EmptyState icon="list" title="No expenses yet" body={`Tap + to log your first expense in ${groupName}.`} />
        ) : (
          <EmptyState icon="search" title="No matches" body="Try a different filter or search." tint={colors.textSecondary} />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  // No `gap` here on purpose: `SectionHeader` owns its own vertical margins, and a
  // container gap stacked on top of them was producing 24px above every date
  // header plus a stray 8px between a header and its first row. It also would have
  // split the section card apart, since its rows must sit flush.
  listContent: { padding: layout.screenPaddingH },
});
