import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, type, space, radius, layout } from '../../src/theme';
import { getGroupById, setSimplifyDebt, archiveGroupSafe, getGroupContext } from '../../src/db/queries/groups';
import { getTransactionsForGroup } from '../../src/db/queries/transactions';
import { getRecurringForGroup, getSkipsMap } from '../../src/db/queries/recurring';
import { useScreenData } from '../../src/hooks/useScreenData';
import { useGroupTxnActions } from '../../src/hooks/useGroupTxnActions';
import { getGroupMembers, getMe } from '../../src/db/queries/persons';
import { getGroupNet } from '../../src/db/queries/balances';
import { getCategoryBudgetStatus } from '../../src/lib/budget';
import type { CategoryBudgetStatus } from '../../src/lib/budget';
import { getBudgetAnalytics } from '../../src/lib/analytics';
import { canEditGroupBudget } from '../../src/lib/permissions';
import type { BudgetAnalytics } from '../../src/lib/analytics';
import { simplify, rawDebts } from '../../src/lib/settle';
import {
  computeContributions, computeRecurringMonthlyTotal, computeRecurNextLabel,
} from '../../src/lib/groupDetail';
import { haptic } from '../../src/lib/haptics';
import { useDataRefresh } from '../../src/components/system/DataRefreshProvider';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { TabPills } from '../../src/components/ui/TabPills';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { FAB } from '../../src/components/ui/FAB';
import { SettingsRow, settingsRowDivider } from '../../src/components/ui/SettingsRow';
import { GroupHero } from '../../src/components/finance/group/GroupHero';
import { GroupBalanceCard } from '../../src/components/finance/group/GroupBalanceCard';
import { TransactionsTab } from '../../src/components/finance/group/TransactionsTab';
import { BudgetTab } from '../../src/components/finance/group/BudgetTab';
import { RebalanceSheet } from '../../src/components/finance/group/RebalanceSheet';
import { planRebalance, applyRebalance, type RebalancePlan } from '../../src/lib/rebalance';
import { setCategoryBudgets, getCategoryBudgetRows } from '../../src/db/queries/categoryBudgets';
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
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabKey>('transactions');
  const [simplifyOn, setSimplifyOn] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  // A budget write moves Home's pace and Insights, so it needs the global signal.
  const { refresh } = useDataRefresh();
  // V2-07: the proposed mid-month re-plan, or null when the sheet is closed.
  const [rebalance, setRebalance] = useState<RebalancePlan | null>(null);
  const [applyingRebalance, setApplyingRebalance] = useState(false);

  // Pure read: group + its txns/members/balances/budget/recurring. Refetches on
  // focus and on cross-screen writes; retry = reload().
  const { data, loading, error, refreshing, onRefresh, reload } = useScreenData(async (db) => {
    const [grp, txnList, memberList, meRow] = await Promise.all([
      getGroupById(db, id),
      getTransactionsForGroup(db, id),
      getGroupMembers(db, id),
      getMe(db),
    ]);
    const netMap = await getGroupNet(db, id);

    let ctx: Awaited<ReturnType<typeof getGroupContext>> | null = null;
    let overrideCount = 0;
    let catStatus: CategoryBudgetStatus[] = [];
    let analytics: BudgetAnalytics | null = null;
    let recurringRules: TxnWithSplits[] = [];
    let recurSkips = new Map<string, Set<number>>();
    if (grp) {
      const meId = meRow?.id ?? '';
      const [cs, an, gctx, budgetRows] = await Promise.all([
        getCategoryBudgetStatus(db, grp, { meId }),
        getBudgetAnalytics(db, grp, { meId }),
        getGroupContext(db, id, meId),
        getCategoryBudgetRows(db, id),
      ]);
      ctx = gctx;
      overrideCount = budgetRows.filter(r => r.person_id === meId && r.amount > 0).length;
      catStatus = cs;
      analytics = an;
      const rules = await getRecurringForGroup(db, id);
      /*
       * Paused rules stay listed, same as the global screen.
       *
       * Filtering them out here meant pausing a rule from the rule's own screen
       * — reached FROM this tab — made it vanish from the tab you came back to,
       * with Resume reachable only by remembering the deep link. That is the
       * defect `app/plan/recurring.tsx` documents as fixed, still live one level
       * down.
       */
      recurringRules = rules.filter(r => r.recur_state !== 'ended');
      recurSkips = await getSkipsMap(db, recurringRules.map(r => r.id));
    }
    return { group: grp, txns: txnList, members: memberList, me: meRow, net: netMap, catStatus, analytics, recurringRules, recurSkips, ctx, overrideCount };
  }, [id]);

  const group = data?.group ?? null;
  const txns = data?.txns ?? [];
  const members = data?.members ?? [];
  const me = data?.me ?? null;
  const net = data?.net ?? {};
  const catStatus = data?.catStatus ?? [];
  const analytics = data?.analytics ?? null;
  const recurringRules = data?.recurringRules ?? [];
  const recurSkips = data?.recurSkips;
  const meId = me?.id ?? '';
  const isPersonal = group?.is_personal === 1;

  const { handleDelete, handleEditTxn } = useGroupTxnActions(id, reload);

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
  const recurringMonthlyTotal = useMemo(() => computeRecurringMonthlyTotal(recurringRules), [recurringRules]);
  const recurNextLabel = useMemo(() => computeRecurNextLabel(recurringRules, recurSkips), [recurringRules, recurSkips]);
  const totalSpent = useMemo(
    () => settled.filter(t => t.kind === 'expense' && !t.is_deleted).reduce((s, t) => s + t.shares.reduce((a, x) => a + x.amount, 0), 0),
    [settled],
  );

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'transactions', label: 'Expenses' },
    { key: 'recurring', label: 'Recurring' },
    { key: 'budget', label: 'Budget' },
    { key: 'members', label: 'Members' },
  ];

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
          The title names where Back goes — `GroupHero` right below already carries
          the group's name at 26px, so repeating it here would just be redundant. */}
      <ScreenHeader
        title="Groups"
        onBack={() => router.back()}
        right={
          <TouchableOpacity onPress={() => setShowMenu(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Group options">
            <Feather name="more-horizontal" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        }
      />

      <GroupHero group={group} members={members} />

      <GroupBalanceCard
        net={net}
        meId={meId}
        simplifiedSettles={simplifiedSettles}
        personMap={personMap}
        onSettle={(personId) => router.push(`/add/quick?kind=transfer&to=${personId}`)}
      />

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
          refreshing={refreshing}
          onRefresh={onRefresh}
          analytics={analytics}
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
          meId={meId}
          totalSpent={totalSpent}
          settlements={settlements}
          personMap={personMap}
          simplifyOn={simplifyOn}
          onToggleSimplify={handleToggleSimplify}
          onInvite={() => router.push(`/group/${id}/members`)}
          onSettlePair={(from, to, amount) => router.push(`/add/quick?kind=transfer&from=${from}&to=${to}&amount=${amount}&groupId=${id}`)}
          groupName={group.name}
          contributions={contributions}
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
          nextLabel={recurNextLabel}
          onAdd={() => router.push(`/add/quick?groupId=${id}&kind=expense`)}
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
            Alert.alert('Archive group?', `${group.name} will be hidden. Its data is kept.`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Archive', style: 'destructive', onPress: async () => { const ok = await archiveGroupSafe(db, id); if (ok) { haptic.warning(); router.back(); } } },
            ]);
          }}
          accessibilityRole="button"
        >
          <Feather name="archive" size={16} color={colors.expense} />
          <Text style={styles.archiveText}>Archive group</Text>
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
  tabs: { marginHorizontal: layout.screenPaddingH, marginBottom: space.sm },
  menuCard: { backgroundColor: colors.bgInput, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  archiveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: space.md, marginTop: space.sm },
  archiveText: { ...type.body, color: colors.expense, fontFamily: 'Inter_600SemiBold' },
});
