import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, space, layout } from '../../src/theme';
import { setSimplifyDebt, archiveGroupSafe } from '../../src/db/queries/groups';
import { useGroupDetail } from '../../src/hooks/useGroupDetail';
import { useGroupTxnActions } from '../../src/hooks/useGroupTxnActions';
import { canEditGroupBudget } from '../../src/lib/permissions';
import { haptic } from '../../src/lib/haptics';
import { useDataRefresh } from '../../src/components/system/DataRefreshProvider';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { TabPills } from '../../src/components/ui/TabPills';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { FAB } from '../../src/components/ui/FAB';
import { Card } from '../../src/components/ui/Card';
import { Divider } from '../../src/components/ui/Divider';
import { ListRow } from '../../src/components/ui/ListRow';
import { GroupHeader } from '../../src/components/finance/group/GroupHeader';
import { TransactionsTab } from '../../src/components/finance/group/TransactionsTab';
import { BudgetTab } from '../../src/components/finance/group/BudgetTab';
import { RebalanceSheet } from '../../src/components/finance/group/RebalanceSheet';
import { planRebalance, applyRebalance, type RebalancePlan } from '../../src/lib/rebalance';
import { setCategoryBudgets } from '../../src/db/queries/categoryBudgets';
import { MembersTab } from '../../src/components/finance/group/MembersTab';
import { RecurringTab } from '../../src/components/finance/group/RecurringTab';
import { buildGroupExportCsv } from '../../src/lib/groupExport';
import { shareCsv, csvFileSlug } from '../../src/lib/shareCsv';
import type { TxnWithSplits } from '../../src/db/queries/transactions';

type TabKey = 'transactions' | 'budget' | 'members' | 'recurring';

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('transactions');
  // The Expenses tab's filters live here, not in the tab: all four tabs unmount on
  // switch, so a tab-local search box emptied itself on every glance at another tab.
  const [search, setSearch] = useState('');
  const [filterKind, setFilterKind] = useState('all');
  const [simplifyOn, setSimplifyOn] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  // A budget write moves Home's pace and Insights, so it needs the global signal.
  const { refresh } = useDataRefresh();
  // V2-07: the proposed mid-month re-plan, or null when the sheet is closed.
  const [rebalance, setRebalance] = useState<RebalancePlan | null>(null);
  const [applyingRebalance, setApplyingRebalance] = useState(false);

  // Reads and derivations live in the hook; this screen composes (AGENTS "screen
  // thinness"). `simplifyOn` is passed in because it selects between two settlement
  // plans, and stays here because the screen is what writes it back.
  const g = useGroupDetail(id, simplifyOn);
  const {
    group, txns, members, net, meId, catStatus, analytics, recurringRules, recurSkips,
    isPersonal, settlements, personMap, contributions,
    recurringMonthlyTotal, recurringMyShare, recurNextLabel,
    totalSpent, myNet, settleWith, settleSummary,
    loading, error, refreshing, onRefresh, reload,
  } = g;

  const { handleDelete, handleEditTxn } = useGroupTxnActions(id, reload);

  // Seed the simplify toggle from the group's saved preference on each fresh row.
  useEffect(() => { if (group) setSimplifyOn(group.simplify_debt === 1); }, [group]);

  /**
   * `/personal` is the canonical personal screen (AUDIT S-14 / DEBT-03). This route
   * used to render a second, thinner personal variant — two screens for one group,
   * free to drift. Older deep links still land here, so they are forwarded rather
   * than broken. Replace (not push) so Back doesn't bounce between the two.
   */
  useEffect(() => { if (isPersonal) router.replace('/personal'); }, [isPersonal, router]);

  async function handleExport() {
    if (!group) return;
    setShowMenu(false);
    try {
      const { csv, rowCount } = await buildGroupExportCsv(db, group);
      if (rowCount === 0) { Alert.alert('Nothing to export', 'This group has no transactions yet.'); return; }
      const { uri, shared } = await shareCsv(csv, `budgetsplit_${csvFileSlug(group.name)}.csv`, `Export ${group.name}`);
      haptic.success();
      if (!shared) Alert.alert('Saved', `Sharing isn't available here. The CSV was saved to:\n${uri}`);
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    }
  }

  async function handleToggleSimplify(on: boolean) {
    setSimplifyOn(on);
    haptic.selection();
    await setSimplifyDebt(db, id, on);
  }

  const handleSettleWith = useCallback(
    (personId: string) => router.push(`/add/quick?kind=transfer&to=${personId}`),
    [router],
  );

  /**
   * The badges are counts, not alarms — `TabPills` renders them at 0.75 opacity of
   * the label colour, so severity stays on the tab's own summary card. `|| undefined`
   * throughout because a `0` badge is noise, and Budget's over-count is 0 most days.
   *
   * Memoized because the search box below now lives on this screen: without it the
   * pills would get a fresh array on every keystroke.
   */
  const TABS = useMemo(() => [
    { key: 'transactions', label: 'Expenses', badge: txns.length || undefined },
    { key: 'recurring', label: 'Recurring', badge: recurringRules.length || undefined },
    { key: 'budget', label: 'Budget', badge: analytics?.overBudget.length || undefined },
    { key: 'members', label: 'Members', badge: members.length || undefined },
  ], [txns.length, recurringRules.length, analytics?.overBudget.length, members.length]);

  // Recoverable states — never a blank dead-end.
  if (error) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Group" onBack={() => router.back()} />
        <ErrorState onRetry={() => reload()} />
      </View>
    );
  }
  if (!loading && !group) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Group" onBack={() => router.back()} />
        <EmptyState icon="alert-circle" title="Group not found" body="This group may have been deleted or archived." actionLabel="Back to Groups" onAction={() => router.back()} tint={colors.textSecondary} />
      </View>
    );
  }
  if (!group) return null; // first load in flight — resolves quickly
  if (isPersonal) return null; // forwarding to /personal; don't flash this screen

  return (
    <View style={styles.container}>
      {/* `ScreenHeader` rather than a hand-rolled bar: this screen used to pad to
          `insets.top + space.xs` while every screen you navigate to from it uses
          `+ space.sm`, so the header jumped 4px on each push. It also rendered
          `ScreenHeader` in its error/not-found branches and a breadcrumb here, so
          the header changed shape depending on load state.
          The title names where Back goes — `GroupHeader` right below already carries
          the group's name, so repeating it here would just be redundant. */}
      <ScreenHeader
        title="Groups"
        onBack={() => router.back()}
        right={
          <TouchableOpacity onPress={() => setShowMenu(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Group options">
            <Feather name="more-horizontal" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        }
      />

      {/* One card, one hero. `myNet` and `settleWith` are passed already resolved so
          `GroupHeader`'s memo holds — `net` and `simplifiedSettles` are fresh objects
          on every load and every keystroke in the lifted search box. */}
      <GroupHeader
        group={group}
        members={members}
        myNet={myNet}
        settleWith={settleWith}
        onSettle={handleSettleWith}
      />

      {/* `TabPills`, not a local copy of it. This strip was a byte-for-byte
          duplicate of that component's intent at different values (borderRadius 10
          vs radius.pill, 32pt tall vs 36, fontSize 12) — and `personal.tsx` held an
          identical copy of the duplicate. */}
      {/* No haptic on change: AGENTS §7 lists tab switching under "NEVER", and the
          sliding indicator is already the feedback. */}
      <View style={styles.tabs}>
        <TabPills
          tabs={TABS}
          active={activeTab}
          onChange={(k) => setActiveTab(k as TabKey)}
        />
      </View>

      {activeTab === 'transactions' && (
        <TransactionsTab
          txns={txns}
          members={members}
          meId={meId}
          groupName={group.name}
          onDeleteTxn={handleDelete}
          onEditTxn={handleEditTxn}
          refreshing={refreshing}
          onRefresh={onRefresh}
          search={search}
          onSearch={setSearch}
          filterKind={filterKind}
          onFilterKind={setFilterKind}
        />
      )}

      {activeTab === 'budget' && (
        <BudgetTab
          refreshing={refreshing}
          onRefresh={onRefresh}
          analytics={analytics}
          catStatus={catStatus}
          onEditBudget={() => router.push(`/group/${id}/budget`)}
          onCreateBudget={() => router.push(`/group/${id}/budget`)}
          onRebalance={(category) => setRebalance(planRebalance(catStatus, category))}
          canEditGroupDefault={g.ctx ? canEditGroupBudget(g.ctx) : false}
          overrideCount={g.overrideCount}
        />
      )}

      {activeTab === 'members' && (
        <MembersTab
          refreshing={refreshing}
          onRefresh={onRefresh}
          members={members}
          net={net}
          meId={meId}
          totalSpent={totalSpent}
          settlements={settlements}
          personMap={personMap}
          simplifyOn={simplifyOn}
          onToggleSimplify={handleToggleSimplify}
          onInvite={() => router.push(`/group/${id}/members`)}
          onSettlePair={(from, to, amount) => router.push(`/add/quick?kind=transfer&from=${from}&to=${to}&amount=${amount}&groupId=${id}`)}
          onAddExpense={() => router.push(`/add/quick?groupId=${id}&kind=expense`)}
          groupName={group.name}
          contributions={contributions}
          summary={settleSummary}
        />
      )}

      {activeTab === 'recurring' && (
        <RecurringTab
          refreshing={refreshing}
          onRefresh={onRefresh}
          rules={recurringRules}
          skips={recurSkips}
          meId={meId}
          defaultSplit={group.default_split}
          monthlyTotal={recurringMonthlyTotal}
          myShare={recurringMyShare}
          nextLabel={recurNextLabel}
          onAdd={() => router.push(`/add/quick?groupId=${id}&kind=expense`)}
          onOpenRule={(ruleId) => router.push(`/group/${id}/recurring?focus=${ruleId}`)}
        />
      )}

      {/* Single-tap FAB — pre-fills this group. */}
      <FAB onPress={() => router.push(`/add/quick?groupId=${id}&kind=expense`)} aboveTabBar={false} />

      {/* Group options menu */}
      {/* One `Card` of `ListRow`s, archive included — it used to be a hand-rolled
          `bgInput` card plus a separate hand-rolled destructive button below it,
          so the sheet had two chromes for one menu. `ListRow` carries `danger`. */}
      <SheetModal visible={showMenu} onClose={() => setShowMenu(false)} title={group.name} scroll={false}>
        <Card clip>
          <ListRow icon="clock" title="Audit log" onPress={() => { setShowMenu(false); router.push(`/history?groupId=${id}`); }} />
          <Divider indent="text" />
          <ListRow icon="download" title="Export as CSV" onPress={handleExport} />
          <Divider indent="text" />
          <ListRow icon="edit-2" title="Edit group" onPress={() => { setShowMenu(false); router.push(`/group/${id}/edit`); }} />
          <Divider indent="text" />
          <ListRow
            danger
            icon="archive"
            title="Archive group"
            subtitle="Hides it from Groups. Its data is kept."
            onPress={() => {
              setShowMenu(false);
              Alert.alert('Archive group?', `${group.name} will be hidden. Its data is kept.`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Archive', style: 'destructive', onPress: async () => { const ok = await archiveGroupSafe(db, id); if (ok) { haptic.warning(); router.back(); } } },
              ]);
            }}
          />
        </Card>
      </SheetModal>
      <RebalanceSheet
        plan={rebalance}
        applying={applyingRebalance}
        onClose={() => setRebalance(null)}
        onApply={async () => {
          if (!rebalance) return;
          setApplyingRebalance(true);
          try {
            await setCategoryBudgets(db, id, applyRebalance(catStatus, rebalance), { level: 'group', actorId: meId });
            haptic.success();
            setRebalance(null);
            await reload();
            refresh();
          } finally {
            setApplyingRebalance(false);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  tabs: { marginHorizontal: layout.screenPaddingH, marginBottom: space.sm },
});
