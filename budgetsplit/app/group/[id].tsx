import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../src/constants/colors';
import { type } from '../../src/constants/typography';
import { space, layout, radius } from '../../src/constants/layout';
import { getGroupById, setSimplifyDebt, archiveGroupSafe } from '../../src/db/queries/groups';
import { getTransactionsForGroup, getRecurringForGroup } from '../../src/db/queries/transactions';
import { useScreenData } from '../../src/hooks/useScreenData';
import { useGroupTxnActions } from '../../src/hooks/useGroupTxnActions';
import { getGroupMembers, getMe } from '../../src/db/queries/persons';
import { getGroupNet } from '../../src/db/queries/balances';
import { getBudgetUsage, getCategoryBudgetStatus } from '../../src/lib/budget';
import type { CategoryBudgetStatus } from '../../src/lib/budget';
import { getBudgetAnalytics } from '../../src/lib/analytics';
import type { BudgetAnalytics } from '../../src/lib/analytics';
import { simplify, rawDebts } from '../../src/lib/settle';
import {
  computeContributions, computePersonalMonthSpend, computeRecurringMonthlyTotal, computeRecurNextLabel,
} from '../../src/lib/groupDetail';
import { haptic } from '../../src/lib/haptics';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { FAB } from '../../src/components/ui/FAB';
import { SettingsRow, settingsRowDivider } from '../../src/components/ui/SettingsRow';
import { GroupHero } from '../../src/components/finance/group/GroupHero';
import { GroupBalanceCard } from '../../src/components/finance/group/GroupBalanceCard';
import { TransactionsTab } from '../../src/components/finance/group/TransactionsTab';
import { BudgetTab } from '../../src/components/finance/group/BudgetTab';
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

    let budgetUsage: any = null;
    let catStatus: CategoryBudgetStatus[] = [];
    let analytics: BudgetAnalytics | null = null;
    let recurringRules: TxnWithSplits[] = [];
    if (grp) {
      const [usage, cs, an] = await Promise.all([
        getBudgetUsage(db, grp, 'monthly'),
        getCategoryBudgetStatus(db, grp, new Date(), meRow?.id),
        getBudgetAnalytics(db, grp, new Date(), meRow?.id),
      ]);
      budgetUsage = usage;
      catStatus = cs;
      analytics = an;
      if (grp.is_personal !== 1) {
        const rules = await getRecurringForGroup(db, id);
        recurringRules = rules.filter(r => r.recur_state === 'active');
      }
    }
    return { group: grp, txns: txnList, members: memberList, me: meRow, net: netMap, budgetUsage, catStatus, analytics, recurringRules };
  }, [id]);

  const group = data?.group ?? null;
  const txns = data?.txns ?? [];
  const members = data?.members ?? [];
  const me = data?.me ?? null;
  const net = data?.net ?? {};
  const catStatus = data?.catStatus ?? [];
  const analytics = data?.analytics ?? null;
  const recurringRules = data?.recurringRules ?? [];
  const meId = me?.id ?? '';
  const isPersonal = group?.is_personal === 1;

  const { handleDelete, handleEditTxn } = useGroupTxnActions(id, reload);

  // Seed the simplify toggle from the group's saved preference on each fresh row.
  useEffect(() => { if (data?.group) setSimplifyOn(data.group.simplify_debt === 1); }, [data?.group]);

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

  // simplify(net) feeds both the balance card and the settlements list — memoize once.
  const simplifiedSettles = useMemo(() => simplify(net), [net]);
  const settlements = useMemo(() => (simplifyOn ? simplifiedSettles : rawDebts(txns)), [simplifyOn, simplifiedSettles, txns]);
  const personMap = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
  const contributions = useMemo(() => computeContributions(txns, members, net), [txns, members, net]);
  const personalMonthSpend = useMemo(() => (isPersonal ? computePersonalMonthSpend(txns, meId) : 0), [txns, meId, isPersonal]);
  const recurringMonthlyTotal = useMemo(() => computeRecurringMonthlyTotal(recurringRules), [recurringRules]);
  const recurNextLabel = useMemo(() => computeRecurNextLabel(recurringRules), [recurringRules]);
  const totalSpent = useMemo(
    () => txns.filter(t => t.kind === 'expense' && !t.is_deleted).reduce((s, t) => s + t.shares.reduce((a, x) => a + x.amount, 0), 0),
    [txns],
  );

  const TABS: { key: TabKey; label: string }[] = isPersonal
    ? [{ key: 'transactions', label: 'Expenses' }, { key: 'budget', label: 'Budget' }]
    : [
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

  return (
    <View style={styles.container}>
      {/* Breadcrumb header */}
      <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
        <TouchableOpacity style={styles.breadcrumb} onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back to Groups">
          <Feather name="chevron-left" size={18} color={colors.accent} />
          <Text style={styles.breadcrumbBack}>Groups</Text>
          <Text style={styles.breadcrumbSep}>›</Text>
          <Text style={styles.breadcrumbCurrent} numberOfLines={1}>{group.name}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowMenu(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Group options">
          <Feather name="more-horizontal" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <GroupHero group={group} isPersonal={isPersonal} members={members} personalMonthSpend={personalMonthSpend} />

      {!isPersonal && (
        <GroupBalanceCard
          net={net}
          meId={meId}
          simplifiedSettles={simplifiedSettles}
          personMap={personMap}
          onSettle={(personId) => router.push(`/add/quick?kind=transfer&to=${personId}`)}
        />
      )}

      {/* Segmented tabs */}
      <View style={styles.tabStrip}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, activeTab === t.key && styles.tabActive]}
            onPress={() => { setActiveTab(t.key); haptic.selection(); }}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === t.key }}
          >
            <Text style={[styles.tabLabel, activeTab === t.key && styles.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'transactions' && (
        <TransactionsTab
          txns={txns}
          members={members}
          meId={meId}
          isPersonal={isPersonal}
          groupName={group.name}
          onDeleteTxn={handleDelete}
          onEditTxn={handleEditTxn}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      )}

      {activeTab === 'budget' && (
        <BudgetTab
          analytics={analytics}
          catStatus={catStatus}
          contributions={contributions}
          isPersonal={isPersonal}
          onEditBudget={() => router.push(`/group/${id}/budget`)}
          onCreateBudget={() => router.push(`/group/${id}/budget`)}
        />
      )}

      {activeTab === 'members' && !isPersonal && (
        <MembersTab
          members={members}
          net={net}
          meId={meId}
          totalSpent={totalSpent}
          settlements={settlements}
          personMap={personMap}
          simplifyOn={simplifyOn}
          onToggleSimplify={handleToggleSimplify}
          onInvite={() => router.push(`/group/${id}/members`)}
          onSettlePair={(from, to, amount) => router.push(`/add/quick?kind=transfer&from=${from}&to=${to}&amount=${amount}&groupId=${id}` as any)}
          groupName={group.name}
        />
      )}

      {activeTab === 'recurring' && !isPersonal && (
        <RecurringTab
          rules={recurringRules}
          meId={meId}
          defaultSplit={group.default_split}
          monthlyTotal={recurringMonthlyTotal}
          nextLabel={recurNextLabel}
          onAdd={() => router.push(`/add/quick?groupId=${id}&kind=expense`)}
          onOpenRule={(ruleId) => router.push(`/group/${id}/recurring?focus=${ruleId}`)}
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
          {!isPersonal && <View style={settingsRowDivider} />}
          {!isPersonal && (
            <SettingsRow icon="edit-2" label="Edit group" onPress={() => { setShowMenu(false); router.push(`/group/${id}/edit`); }} />
          )}
        </View>
        {!isPersonal && (
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
        )}
        {isPersonal && (
          <Text style={styles.personalNote}>This is your private personal space — it can't be shared, archived, or have other members.</Text>
        )}
      </SheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: layout.screenPaddingH, paddingBottom: space.sm },
  breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flex: 1 },
  breadcrumbBack: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  breadcrumbSep: { ...type.body, color: colors.border, marginHorizontal: 1 },
  breadcrumbCurrent: { ...type.label, color: colors.textSecondary, flex: 1 },
  tabStrip: { flexDirection: 'row', marginHorizontal: layout.screenPaddingH, marginBottom: space.sm, backgroundColor: colors.bgCard, borderRadius: 10, padding: 3, borderWidth: 1, borderColor: colors.border },
  tab: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: radius.sm },
  tabActive: { backgroundColor: colors.accent },
  tabLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textMuted },
  tabLabelActive: { color: colors.bg },
  menuCard: { backgroundColor: colors.bgInput, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  archiveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: space.md, marginTop: space.sm },
  archiveText: { ...type.body, color: colors.expense, fontFamily: 'Inter_600SemiBold' },
  personalNote: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.sm, paddingHorizontal: space.md },
});
