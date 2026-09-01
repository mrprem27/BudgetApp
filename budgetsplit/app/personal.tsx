import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SectionList, Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, layout, shadow, alpha } from '../src/theme';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { TabPills } from '../src/components/ui/TabPills';
import { FilterBar } from '../src/components/ui/FilterBar';
import { TransactionRow } from '../src/components/finance/TransactionRow';
import { TxnCell } from '../src/components/finance/TxnCell';
import { SectionHeader } from '../src/components/ui/SectionHeader';
import { BudgetList } from '../src/components/finance/budget/BudgetList';
import { budgetCaption } from '../src/lib/budgetCopy';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ErrorState } from '../src/components/ui/ErrorState';
import { AppRefreshControl } from '../src/components/ui/AppRefreshControl';
import { SheetModal } from '../src/components/ui/SheetModal';
import { FAB } from '../src/components/ui/FAB';
import { SettingsRow, settingsRowDivider } from '../src/components/ui/SettingsRow';
import { useGroupTxnActions } from '../src/hooks/useGroupTxnActions';
import { getMyActivity, type MyActivityItem } from '../src/db/queries/transactions';
import { getAllGroups } from '../src/db/queries/groups';
import { getAllPersons } from '../src/db/queries/persons';
import { getMyExposure } from '../src/db/queries/balances';
import { useScreenData } from '../src/hooks/useScreenData';
import { useContentInset } from '../src/hooks/useContentInset';
import { useStore } from '../src/store';
import { getMyGlobalBudgetSummary } from '../src/lib/budget';
import { groupByDate } from '../src/lib/txnGrouping';
import { formatCompact } from '../src/lib/money';
import { oweView } from '../src/lib/owe';
import { haptic } from '../src/lib/haptics';
import { buildGroupExportCsv } from '../src/lib/groupExport';
import { shareCsv, csvFileSlug } from '../src/lib/shareCsv';

/*
 * Two tabs, not three.
 *
 * A third, "Recurring", listed every rule in every SHARED group — so it was
 * neither personal nor different from `/plan/recurring`, which shows the same
 * query and is one tap from the Plan tab. Two lists of the same rules, in two
 * places, with two different groupings and two different subtotals, is the
 * duplication that made the recurring flow unreadable. There is one inventory now,
 * and every rule in it opens `/recurring/[id]`.
 */
type TabKey = 'activity' | 'budget';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'activity', label: 'Activity' },
  { key: 'budget', label: 'Budget' },
];

export default function PersonalScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const me = useStore((s) => s.me);
  const myId = me?.id ?? '';

  const bottomPad = useContentInset({ fab: true });
  const [tab, setTab] = useState<TabKey>('activity');
  const [filter, setFilter] = useState<string>('personal'); // personal | groups | all | <groupId>
  const [showMenu, setShowMenu] = useState(false);

  const { data, loading, error: loadError, refreshing, onRefresh, reload } = useScreenData(async (db) => {
    if (!me) throw new Error('No current user');
    const [acts, allPersons, grps, exp, bud] = await Promise.all([
      getMyActivity(db, me.id),
      getAllPersons(db),
      getAllGroups(db),
      getMyExposure(db, me.id),
      getMyGlobalBudgetSummary(db, me.id),
    ]);
    return {
      persons: allPersons,
      activity: acts,
      groups: grps,
      budget: bud,
      // Owe / Lent summary — single source of truth (netted per person).
      summary: { owe: exp.owe, lent: exp.owed },
    };
  }, [me?.id]);

  const persons = data?.persons ?? [];
  const activity = data?.activity ?? [];
  const groups = data?.groups ?? [];
  // `getMyGlobalBudgetSummary` is the canonical answer to "how am I doing against
  // my budget" — it carries the overview figures as well as the rows. This screen
  // used `getMyGlobalBudgetStatus`, which returns rows only, which is why it had no
  // overview to render.
  const budget = data?.budget ?? null;
  const summary = data?.summary ?? { owe: 0, lent: 0 };

  // Memoised through to `filterGroups`: the filter bar sits above a SectionList,
  // so without it every keystroke re-filtered the ledger, rebuilt the chip row and
  // re-rendered the whole list. `TransactionsTab` already does it this way.
  const sharedGroups = useMemo(() => groups.filter(g => g.is_personal !== 1), [groups]);
  const personalGroup = useMemo(() => groups.find(g => g.is_personal === 1) ?? null, [groups]);

  // Rows span every group, so the actions read the owning group off each txn.
  const { handleDelete, handleEditTxn } = useGroupTxnActions(null, reload);

  const filtered = useMemo(() => activity.filter(a =>
    filter === 'all' ? true
    : filter === 'personal' ? a.isPersonal
    : filter === 'groups' ? !a.isPersonal
    : a.group_id === filter,
  ), [activity, filter]);
  const sections = useMemo(() => groupByDate(filtered), [filtered]);

  // `FilterBar` memoises its chip elements on these three; passing a literal
  // would defeat that on every render.
  const filterGroups = useMemo(() => [{
    key: 'scope',
    options: [
      { label: 'Personal', value: 'personal' },
      { label: 'Groups', value: 'groups' },
      { label: 'All', value: 'all' },
      ...sharedGroups.map(g => ({ label: g.name, value: g.id })),
    ],
  }], [sharedGroups]);
  const filterSelected = useMemo(() => ({ scope: filter }), [filter]);
  const onSelectFilter = useCallback((_: string, v: string) => setFilter(v), []);

  // Inline arrows here make SectionList re-render every visible row on any state
  // change, filter typing included.
  const renderSectionHeader = useCallback(
    ({ section }: { section: { title: string } }) => <SectionHeader title={section.title} />,
    [],
  );
  const renderItem = useCallback(
    ({ item, index, section }: { item: MyActivityItem; index: number; section: { data: MyActivityItem[] } }) => (
      <TxnCell first={index === 0} last={index === section.data.length - 1}>
        <TransactionRow
          txn={item}
          myId={myId}
          members={persons}
          isPersonal={item.isPersonal}
          groupName={item.isPersonal ? undefined : item.groupName}
          onPress={() => handleEditTxn(item)}
          onDelete={() => handleDelete(item.id)}
        />
      </TxnCell>
    ),
    [myId, persons, handleEditTxn, handleDelete],
  );

  const net = summary.lent - summary.owe;

  function openBudgetEditor() {
    router.push('/budget');
  }

  async function handleExport() {
    const pg = personalGroup;
    setShowMenu(false);
    if (!pg) return;
    try {
      const { csv, rowCount } = await buildGroupExportCsv(db, pg);
      if (rowCount === 0) {
        Alert.alert('Nothing to export', 'You have no personal transactions yet.');
        return;
      }
      const fileName = `budgetsplit_${csvFileSlug(pg.name)}.csv`;
      const { uri, shared } = await shareCsv(csv, fileName, 'Export Personal');
      haptic.success();
      if (!shared) Alert.alert('Saved', `Sharing isn't available here. The CSV was saved to:\n${uri}`);
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Personal"
        onBack={() => router.back()}
        right={
          <TouchableOpacity
            onPress={() => setShowMenu(true)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Personal options"
          >
            <Feather name="more-horizontal" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        }
      />

      {loadError ? (
        <ErrorState onRetry={reload} />
      ) : (
        <>
          {/* Owe / Lent / Net summary */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>You owe</Text>
              <Text style={[styles.summaryAmt, { color: oweView(-summary.owe).color }]}>{formatCompact(summary.owe)}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>You're owed</Text>
              <Text style={[styles.summaryAmt, { color: oweView(summary.lent).color }]}>{formatCompact(summary.lent)}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Net</Text>
              {(() => {
                const ov = oweView(net);
                return (
                  <Text style={[styles.summaryAmt, { color: ov.color }]}>
                    {ov.sign}{formatCompact(Math.abs(net))}
                  </Text>
                );
              })()}
            </View>
          </View>

          {/* Was a byte-identical copy of the group screen's local tab strip, which
              was itself a reimplementation of `TabPills`. One component now. */}
          <View style={styles.tabs}>
            <TabPills
              tabs={TABS}
              active={tab}
              onChange={(k) => { setTab(k as typeof tab); haptic.selection(); }}
            />
          </View>

          {/* ACTIVITY */}
          {tab === 'activity' && (
            <SectionList
              sections={sections}
              keyExtractor={t => t.id}
              contentContainerStyle={[styles.activityContent, { paddingBottom: bottomPad }]}
              refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              ListHeaderComponent={
                activity.length > 0 ? (
                  <View style={{ marginBottom: space.xs }}>
                    <FilterBar
                      selected={filterSelected}
                      onSelect={onSelectFilter}
                      groups={filterGroups}
                    />
                  </View>
                ) : null
              }
              renderSectionHeader={renderSectionHeader}
              stickySectionHeadersEnabled={false}
              renderItem={renderItem}
              ListEmptyComponent={
                loading ? null : (
                  <EmptyState
                    icon="inbox"
                    title="Nothing here yet"
                    body={filter === 'personal' ? 'Your personal expenses & income will show here.' : 'No transactions match this filter.'}
                    tint={colors.textSecondary}
                    // A filter hiding everything and an empty ledger need different
                    // ways out — clearing the filter, or adding the first entry.
                    actionLabel={filter === 'personal' ? 'Add a transaction' : 'Show everything'}
                    onAction={filter === 'personal'
                      ? () => router.push('/add/quick')
                      : () => setFilter('personal')}
                  />
                )
              }
            />
          )}

          {/* BUDGET — global: my total share-spend (personal + groups) vs my limits.
              The same `BudgetList` the group Budget tab renders. It used to be a
              heading, a note, a hand-rolled list and a hand-rolled empty card with a
              naked 22pt icon where §2 requires the 64pt circle — the same idea as the
              group tab at a lower level of finish, missing the overview and the
              filters entirely. */}
          {tab === 'budget' && (
            <BudgetList
              rows={budget?.rows ?? []}
              spent={budget?.spent ?? 0}
              allocated={budget?.allocated ?? 0}
              pct={budget?.pct ?? null}
              pooledAllocated={budget?.pooled ?? 0}
              pooledCount={budget?.pooledCount ?? 0}
              caption={budgetCaption({ scope: 'global', allocated: formatCompact(budget?.allocated ?? 0) })}
              onEdit={openBudgetEditor}
              refreshing={refreshing}
              onRefresh={onRefresh}
              bottomPad={bottomPad}
              empty={
                <EmptyState
                  icon="target"
                  title="No budget yet"
                  body="Set category limits measured against your total spending — personal plus your share of every group."
                  tint={colors.textSecondary}
                  actionLabel="Set a budget"
                  onAction={openBudgetEditor}
                />
              }
            />
          )}

          {/* Single-tap FAB — pre-fills the personal group. */}
          {personalGroup && (
            <FAB onPress={() => router.push(`/add/quick?groupId=${personalGroup.id}&kind=expense`)} aboveTabBar={false} />
          )}
        </>
      )}

      {/* Options menu — mirrors the group screen's overflow. */}
      <SheetModal visible={showMenu} onClose={() => setShowMenu(false)} title="Personal" scroll={false}>
        <View style={styles.menuCard}>
          <SettingsRow
            icon="clock"
            label="Audit log"
            onPress={() => {
              setShowMenu(false);
              if (personalGroup) router.push(`/history?groupId=${personalGroup.id}`);
            }}
          />
          <View style={settingsRowDivider} />
          <SettingsRow icon="download" label="Export as CSV" onPress={handleExport} />
        </View>
        <Text style={styles.personalNote}>
          This is your private personal space — it can't be shared, archived, or have other members.
        </Text>
      </SheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  tabs: { marginHorizontal: layout.screenPaddingH, marginBottom: space.md },
  summaryCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: layout.screenPaddingH, marginBottom: space.md, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: space.md, ...shadow.sm },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border, marginVertical: space.xs },
  summaryLabel: { ...type.caption, color: colors.textMuted },
  summaryAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 16, letterSpacing: -0.3 },


  // No `gap` here: a date section's rows form ONE card, so any gap between them
  // slices it into separate slabs. `SectionHeader` supplies its own spacing.
  activityContent: { paddingHorizontal: layout.screenPaddingH },



  menuCard: { backgroundColor: colors.bgInput, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  personalNote: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.sm, paddingHorizontal: space.md },
});
