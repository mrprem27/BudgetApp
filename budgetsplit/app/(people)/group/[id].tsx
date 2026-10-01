import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, layout } from '../../../src/theme';
import { loadGroupHub, setSimplifyDebt, archiveGroup, setCategoryBudgets, trustPeople } from '../../../src/lib/groupsData';
import { useScreenData } from '../../../src/hooks/useScreenData';
import { useGroupTxnActions } from '../../../src/hooks/useGroupTxnActions';
import { asTrustState } from '../../../src/constants/enums';
import { confirmAsync } from '../../../src/lib/confirm';
import { trustMeans } from '../../../src/lib/trustCopy';
import { canEditGroupBudget } from '../../../src/lib/permissions';
import { simplify, rawDebts } from '../../../src/lib/settle';
import {
  computeContributions,
} from '../../../src/lib/groupDetail';
import { haptic } from '../../../src/lib/haptics';
import { useDataRefresh } from '../../../src/components/system/DataRefreshProvider';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { TabPills } from '../../../src/components/ui/TabPills';
import { ScreenHeader } from '../../../src/components/ui/ScreenHeader';
import { HeaderIconButton } from '../../../src/components/ui/HeaderIconButton';
import { SheetModal } from '../../../src/components/ui/SheetModal';
import { FAB } from '../../../src/components/ui/FAB';
import { SettingsRow, settingsRowDivider } from '../../../src/components/ui/SettingsRow';
import { formatCompact } from '../../../src/lib/money';
import { LedgerTotalsRow } from '../../../src/components/finance/LedgerTotalsRow';
import { useTxnFilters } from '../../../src/hooks/useTxnFilters';
import { applyFilters } from '../../../src/lib/txnFilter';
import { groupSpend } from '../../../src/lib/activityTotals';
import { GroupHeaderCard } from '../../../src/components/finance/group/GroupHeaderCard';
import { TransactionsTab } from '../../../src/components/finance/group/TransactionsTab';
import { BudgetTab } from '../../../src/components/finance/group/BudgetTab';
import { RebalanceSheet } from '../../../src/components/finance/group/RebalanceSheet';
import { planRebalance, applyRebalance, type RebalancePlan } from '../../../src/lib/rebalance';
import { MembersTab } from '../../../src/components/finance/group/MembersTab';
import { RecurringTab } from '../../../src/components/finance/group/RecurringTab';
import { buildGroupExportCsv } from '../../../src/lib/groupExport';
import { useFeatureFlags } from '../../../src/components/system/FeatureFlagsProvider';
import { shareCsv, csvFileSlug } from '../../../src/lib/shareCsv';
import { ARCHIVE_GROUP } from '../../../src/lib/groupCopy';
import { backOr } from '../../../src/lib/nav';

type TabKey = 'transactions' | 'budget' | 'members' | 'recurring';

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('transactions');
  const [simplifyOn, setSimplifyOn] = useState(true);
  const [trusting, setTrusting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  // A budget write moves Home's pace and Insights, so it needs the global signal.
  const { refresh } = useDataRefresh();
  // V2-07: the proposed mid-month re-plan, or null when the sheet is closed.
  const [rebalance, setRebalance] = useState<RebalancePlan | null>(null);
  const [applyingRebalance, setApplyingRebalance] = useState(false);

  // Pure read: group + its txns/members/balances/budget/recurring. Refetches on
  // focus and on cross-screen writes; retry = reload().
  const { data, loading, error, refreshing, onRefresh, reload } = useScreenData((db) => loadGroupHub(db, id), [id]);

  const group = data?.group ?? null;
  const txns = data?.txns ?? [];
  const filter = useTxnFilters();
  const members = data?.members ?? [];
  const me = data?.me ?? null;
  const net = data?.net ?? {};
  const catStatus = data?.catStatus ?? [];
  const recurringRules = data?.recurringRules ?? [];
  const recurSkips = data?.recurSkips;
  const meId = me?.id ?? '';
  const isPersonal = group?.is_personal === 1;

  const { handleDelete, handleEditTxn } = useGroupTxnActions(reload);
  // The Recurring switch hides this tab too, not only Money's Recurring row.
  const { flags } = useFeatureFlags();
  useEffect(() => { if (!flags.recurring && activeTab === 'recurring') setActiveTab('transactions'); }, [flags.recurring, activeTab]);

  // Seed the simplify toggle from the group's saved preference on each fresh row.
  useEffect(() => { if (data?.group) setSimplifyOn(data.group.simplify_debt === 1); }, [data?.group]);

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
    // Optimistic, then reverted on refusal or failure. The switch used to flip and
    // stay flipped whatever happened, so a refused or failed write left the screen
    // claiming a setting the database did not have until the next load.
    setSimplifyOn(on);
    haptic.selection();
    try {
      await setSimplifyDebt(db, id, on, meId);
    } catch (e) {
      setSimplifyOn(!on);
      haptic.error();
      Alert.alert(
        "Couldn't change this",
        e instanceof Error ? e.message : 'Please try again.',
      );
    }
  }

  // simplify(net) feeds both the balance card and the settlements list — memoize once.
  const simplifiedSettles = useMemo(() => simplify(net), [net]);
  /*
   * `txns` is the group LEDGER and deliberately includes entries still waiting on
   * my approval — the group agrees on what happened even before I accept my part.
   * But every figure derived here must exclude them, because `net` beside them
   * comes from `getGroupNet`, which does. Mixing the two would put two different
   * populations on one card, and `computeContributions` below takes BOTH in the
   * same call.
   */
  const settled = useMemo(() => txns.filter(t => !t.pendingApproval), [txns]);
  const settlements = useMemo(() => (simplifyOn ? simplifiedSettles : rawDebts(settled)), [simplifyOn, simplifiedSettles, settled]);
  const personMap = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
  const contributions = useMemo(() => computeContributions(settled, members, net), [settled, members, net]);

  /*
   * Who this button would actually change: people in this group who have an
   * account and are not already trusted. Excludes me, and excludes anyone with
   * no `remote_uid` — their setting is inert either way, so counting them would
   * make the button offer to do something it cannot.
   */
  const trustable = useMemo(
    () => members.filter(m => m.is_me !== 1 && m.remote_uid != null && asTrustState(m.trust_state) !== 'trusted'),
    [members],
  );

  /**
   * Trust everyone here, in one tap — by writing each PERSON.
   *
   * Nothing is stored on the group, so somebody added next month still starts on
   * "asks me". A group-level flag would have been one column and would have
   * silently extended trust to whoever is invited next, which is exactly what
   * `IV-10` forbids and why trust has never been group-shaped.
   */
  async function handleTrustAll() {
    if (trusting || trustable.length === 0) return;
    const names = trustable.map(m => m.name).join(', ');
    const ok = await confirmAsync(
      `Trust everyone in ${group?.name ?? 'this group'}?`,
      `${trustMeans(names)} This applies to them everywhere, not only here, trust is about a person, `
      + 'not a group, so anyone added later still waits for you.',
      'Trust them',
    );
    if (!ok) return;
    setTrusting(true);
    try {
      await trustPeople(db, trustable);
      haptic.success();
    } catch {
      haptic.error();
      Alert.alert('Couldn’t save that', 'Some people may not have been trusted. Please try again.');
    } finally {
      await reload();
      refresh();
      setTrusting(false);
    }
  }
  // The row under the header adds up what the list shows, by the rule Personal's follows
  // (`useTxnFilters.totalsRows`, `U-63`): my share and everyone's, through the filters but not the
  // search text, this month while no date is chosen. It stayed on this month whatever was filtered.
  const filteredTxns = useMemo(() => applyFilters(txns, filter.filters), [txns, filter.filters]);
  const monthSpend = useMemo(() => groupSpend(filter.totalsRows(txns), meId), [filter.totalsRows, txns, meId]);

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'transactions', label: 'Expenses' },
    ...(flags.recurring ? [{ key: 'recurring' as const, label: 'Recurring' }] : []),
    { key: 'budget', label: 'Budget' },
    { key: 'members', label: 'Members' },
  ];

  // Recoverable states — never a blank dead-end.
  if (error) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Group" onBack={() => backOr(router, '/(tabs)')} />
        <ErrorState onRetry={() => reload()} />
      </View>
    );
  }
  if (!loading && !group) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Group" onBack={() => backOr(router, '/(tabs)')} />
        <EmptyState icon="alert-circle" title="Group not found" body="This group may have been deleted or archived." actionLabel="Back to Groups" onAction={() => backOr(router, '/(tabs)')} tint={colors.textSecondary} fill />
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
          The title names where Back goes — `GroupHeaderCard` right below already carries
          the group's name, so repeating it here would just be redundant. */}
      <ScreenHeader
        title="Groups"
        onBack={() => backOr(router, '/(tabs)')}
        right={
          <HeaderIconButton icon="more-horizontal" label="Group options" onPress={() => setShowMenu(true)} />
        }
      />

      <GroupHeaderCard
        group={group}
        members={members}
        myNet={net[meId] ?? 0}
        settleWith={(() => {
          const owe = (net[meId] ?? 0) < 0;
          const leg = owe ? simplifiedSettles.find(s => s.from === meId) : simplifiedSettles.find(s => s.to === meId);
          return leg ? personMap.get(owe ? leg.to : leg.from) ?? null : null;
        })()}
        onSettle={(personId) => router.push(`/add/quick?kind=transfer&to=${personId}`)}
      />

      {/* The same row Personal has under its card (`U-88`): this month in this group, and
          Reports opened on this group. "Group total" stands where Personal has Income, because
          income is never booked to a shared group and would read zero in every one. */}
      <View style={styles.totals}>
        <LedgerTotalsRow
          onReports={() => router.push(filter.reportsHref(id) as never)}
          label={filter.label}
          stats={[
            { label: 'Your share', value: formatCompact(monthSpend.mine), tint: colors.expense },
            { label: 'Group total', value: formatCompact(monthSpend.everyone), tint: colors.textPrimary },
          ]}
        />
      </View>

      {/* `TabPills`, not a local copy of it. This strip was a byte-for-byte
          duplicate of that component's intent at different values (borderRadius 10
          vs radius.pill, 32pt tall vs 36, fontSize 12) — and `personal.tsx` held an
          identical copy of the duplicate. */}
      <View style={styles.tabs}>
        <TabPills
          tabs={TABS}
          active={activeTab}
          onChange={(k) => { setActiveTab(k as TabKey); haptic.selection(); }}
        />
      </View>

      {activeTab === 'transactions' && (
        <TransactionsTab
          txns={txns}
          filteredTxns={filteredTxns}
          filter={filter}
          members={members}
          meId={meId}
          groupName={group.name}
          onDeleteTxn={handleDelete}
          onEditTxn={handleEditTxn}
          onAddTxn={() => router.push(`/add/quick?groupId=${id}&kind=expense`)}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      )}

      {activeTab === 'budget' && (
        <BudgetTab
          groupId={id}
          catStatus={catStatus}
          onOpenBudget={() => router.push(`/group/${id}/budget`)}
          groupName={group.name}
          onRebalance={(category) => setRebalance(planRebalance(catStatus, category))}
          canEditGroupDefault={data?.ctx ? canEditGroupBudget(data.ctx) : false}
          overrideCount={data?.overrideCount ?? 0}
        />
      )}

      {activeTab === 'members' && (
        <MembersTab
          refreshing={refreshing}
          onRefresh={onRefresh}
          members={members}
          net={net}
          settlements={settlements}
          personMap={personMap}
          simplifyOn={simplifyOn}
          onToggleSimplify={handleToggleSimplify}
          onInvite={() => router.push(`/group/${id}/members`)}
          onSettlePair={(from, to, amount) => router.push(`/add/quick?kind=transfer&from=${from}&to=${to}&amount=${amount}&groupId=${id}`)}
          groupName={group.name}
          contributions={contributions}
          trustAllCount={trustable.length}
          onTrustAll={trustable.length > 0 ? handleTrustAll : undefined}
        />
      )}

      {activeTab === 'recurring' && (
        <RecurringTab
          refreshing={refreshing}
          onRefresh={onRefresh}
          rules={recurringRules}
          skips={recurSkips}
          meId={meId}
          spentThisYear={data?.recurringSpent ?? 0}
          onAdd={() => router.push(`/add/quick?groupId=${id}&kind=expense&repeat=1`)}
          onOpenRule={(ruleId) => router.push(`/recurring/${ruleId}`)}
        />
      )}

      {/* Single-tap FAB — pre-fills this group. */}
      <FAB onPress={() => router.push(`/add/quick?groupId=${id}&kind=expense`)} aboveTabBar={false} />

      {/* Group options menu */}
      <SheetModal visible={showMenu} onClose={() => setShowMenu(false)} title={group.name} scroll={false}>
        <View style={styles.menuCard}>
          <SettingsRow icon="clock" label="Audit log" onPress={() => { setShowMenu(false); router.push(`/history?groupId=${id}`); }} />
          <View style={settingsRowDivider} />
          <SettingsRow icon="download" label="Export as CSV" onPress={handleExport} />
          <View style={settingsRowDivider} />
          <SettingsRow icon="edit-2" label="Edit group" onPress={() => { setShowMenu(false); router.push(`/group/${id}/edit`); }} />
        </View>
        <TouchableOpacity
          style={styles.archiveBtn}
          onPress={() => {
            setShowMenu(false);
            Alert.alert(ARCHIVE_GROUP.title(group.name), ARCHIVE_GROUP.body, [
              { text: 'Cancel', style: 'cancel' },
              { text: ARCHIVE_GROUP.confirm, onPress: async () => {
                try {
                  // Same exit as the edit screen's Archive: the list, not the stack below it.
                  if (await archiveGroup(db, id)) { haptic.warning(); refresh(); router.dismissTo('/groups'); }
                } catch {
                  haptic.error();
                  Alert.alert('Couldn’t archive', 'Please try again.');
                }
              } },
            ]);
          }}
          accessibilityRole="button"
        >
          <Feather name="archive" size={16} color={colors.textSecondary} />
          <Text style={styles.archiveText}>{ARCHIVE_GROUP.action}</Text>
        </TouchableOpacity>
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
          } catch (e) {
            // `setCategoryBudgets` refuses a non-admin. With no catch that arrived
            // as an unhandled rejection: the sheet stayed open, the spinner
            // cleared, nothing was written and nothing was said.
            haptic.error();
            Alert.alert(
              "Couldn't re-plan",
              e instanceof Error ? e.message : 'Please try again.',
            );
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
  totals: { marginHorizontal: layout.screenPaddingH, marginBottom: space.md },
  tabs: { marginHorizontal: layout.screenPaddingH, marginBottom: space.sm },
  menuCard: { backgroundColor: colors.bgInput, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  archiveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: space.md, marginTop: space.sm },
  archiveText: { ...type.body, color: colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
});
