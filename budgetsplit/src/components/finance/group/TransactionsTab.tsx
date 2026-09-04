import React, { useMemo, useState, useCallback, useRef } from 'react';
import { View, StyleSheet, SectionList } from 'react-native';
import { colors, space, layout } from '../../tokens';
import { useContentInset } from '../../../hooks/useContentInset';
import { groupByDate } from '../../../lib/txnGrouping';
import { TransactionRow } from '../TransactionRow';
import { TxnCell } from '../TxnCell';
import { FilterBar } from '../../ui/FilterBar';
import { applyFilters, KIND_ANY, type KindFilter, type RangePreset } from '../../../lib/txnFilter';
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
  /** Add an expense in THIS group — the empty state's CTA (§2). */
  onAddTxn: () => void;
  refreshing: boolean;
  onRefresh: () => void;
};

/** Group ledger: collapsible filter bar + date-sectioned transaction list. Owns its
 *  own search/kind filter (tab-local UI state). */
export function TransactionsTab({ txns, members, meId, groupName, onDeleteTxn, onEditTxn, onAddTxn, refreshing, onRefresh }: Props) {
  const bottomPad = useContentInset({ fab: true });
  const [kind, setKind] = useState<KindFilter>(KIND_ANY);
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<RangePreset>('any');
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);

  /*
   * `OV-34`: this searched `category + note` only, while Search searched tags and
   * both spellings of the amount, and Personal searched nothing at all. One
   * predicate now, in `lib/txnFilter.ts`.
   *
   * The person filter matters most here — this is the shared ledger, so "everything
   * involving Aarav" is the question the screen exists to answer and could not.
   */
  const filteredTxns = useMemo(
    () => applyFilters(txns, { query: search, kind, from, to, personId }),
    [txns, search, kind, from, to, personId],
  );

  const sections = useMemo(() => groupByDate<TxnWithSplits>(filteredTxns), [filteredTxns]);

  // Stable identity for the person sheet — `FilterBar` memoises on it.
  const people = useMemo(() => members.map(m => ({ id: m.id, name: m.name })), [members]);

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
            {/* Kind is a named prop now, not a hand-rolled chip group — it is a
                property of a transaction, so it must behave the same on all three
                ledgers. `groups` is left for what is genuinely screen-specific,
                and this screen has none. */}
            <FilterBar
              collapsible
              search={search}
              onSearch={setSearch}
              searchPlaceholder="Search this group…"
              selected={{}}
              onSelect={() => {}}
              kind={kind}
              onKind={setKind}
              range={range}
              customFrom={from}
              customTo={to}
              onRange={(r, f2, t2) => { setRange(r); setFrom(f2); setTo(t2); }}
              people={people}
              personId={personId}
              onPerson={setPersonId}
            />
          </View>
        ) : null
      }
      renderSectionHeader={({ section }) =>
        section.data.length ? <SectionHeader title={section.title} /> : null
      }
      renderItem={renderTxn}
      ListEmptyComponent={
        txns.length === 0 ? (
          <EmptyState
            icon="list"
            title="No expenses yet"
            body={`Log your first expense in ${groupName} and it will appear here.`}
            actionLabel="Add an expense"
            onAction={onAddTxn}
          />
        ) : (
          // The filter is this tab's own state, so the way out is right here.
          <EmptyState
            icon="search"
            title="No matches"
            body="Nothing in this group matches the current filter."
            tint={colors.textSecondary}
            actionLabel="Clear filters"
            // Clears every filter, not the two that used to exist. A "clear
            // filters" that left a date range or a person set would be the same
            // dead end it exists to escape.
            onAction={() => {
              setKind(KIND_ANY); setSearch('');
              setRange('any'); setFrom(null); setTo(null); setPersonId(null);
            }}
          />
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
