import React, { useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, SectionList } from 'react-native';
import { colors, type, space, layout } from '../../tokens';
import { groupByDate } from '../../../lib/txnGrouping';
import { TransactionRow } from '../TransactionRow';
import { FilterBar } from '../../ui/FilterBar';
import { EmptyState } from '../../ui/EmptyState';
import { AppRefreshControl } from '../../ui/AppRefreshControl';
import type { TxnWithSplits } from '../../../db/queries/transactions';
import type { Person } from '../../../db/queries/persons';

type Props = {
  txns: TxnWithSplits[];
  members: Person[];
  meId: string;
  isPersonal: boolean;
  groupName: string;
  onDeleteTxn: (id: string) => void;
  onEditTxn: (txn: TxnWithSplits) => void;
  refreshing: boolean;
  onRefresh: () => void;
};

/** Group ledger: collapsible filter bar + date-sectioned transaction list. Owns its
 *  own search/kind filter (tab-local UI state). */
export function TransactionsTab({ txns, members, meId, isPersonal, groupName, onDeleteTxn, onEditTxn, refreshing, onRefresh }: Props) {
  const [filterKind, setFilterKind] = useState('all');
  const [search, setSearch] = useState('');

  const filteredTxns = useMemo(() => {
    const q = search.trim().toLowerCase();
    return txns.filter(t => {
      if (filterKind !== 'all' && t.kind !== filterKind) return false;
      if (q && !(`${t.category} ${t.note ?? ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [txns, filterKind, search]);

  const sections = useMemo(() => groupByDate<TxnWithSplits>(filteredTxns), [filteredTxns]);

  // Stable renderItem so TransactionRow's React.memo holds; handlers read via refs.
  const delRef = useRef(onDeleteTxn); delRef.current = onDeleteTxn;
  const editRef = useRef(onEditTxn); editRef.current = onEditTxn;
  const renderTxn = useCallback(({ item }: { item: TxnWithSplits }) => (
    <TransactionRow
      txn={item}
      myId={meId}
      onDelete={() => delRef.current(item.id)}
      onPress={() => editRef.current(item)}
      members={members}
      isPersonal={isPersonal}
    />
  ), [meId, members, isPersonal]);

  return (
    <SectionList
      sections={sections}
      keyExtractor={t => t.id}
      contentContainerStyle={styles.listContent}
      initialNumToRender={12}
      maxToRenderPerBatch={10}
      windowSize={11}
      refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        txns.length > 0 ? (
          <View style={{ marginBottom: space.xs }}>
            <FilterBar
              collapsible
              search={search}
              onSearch={setSearch}
              searchPlaceholder="Search note or category"
              selected={{ kind: filterKind }}
              onSelect={(_, v) => setFilterKind(v)}
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
          </View>
        ) : null
      }
      renderSectionHeader={({ section }) =>
        section.data.length ? <Text style={styles.sectionHeader}>{section.title}</Text> : null
      }
      renderItem={renderTxn}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
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
  listContent: { padding: layout.screenPaddingH, paddingBottom: 100, gap: space.sm },
  sectionHeader: { ...type.caption, color: colors.textMuted, marginTop: space.md, marginBottom: space.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  sep: { height: 1, backgroundColor: colors.border },
});
