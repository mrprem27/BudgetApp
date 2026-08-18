import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SectionList, ScrollView, Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, layout, shadow, alpha } from '../src/theme';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { TabPills } from '../src/components/ui/TabPills';
import { Chip } from '../src/components/ui/Chip';
import { FilterBar } from '../src/components/ui/FilterBar';
import { TransactionRow } from '../src/components/finance/TransactionRow';
import { TxnCell } from '../src/components/finance/TxnCell';
import { SectionHeader } from '../src/components/ui/SectionHeader';
import { Divider } from '../src/components/ui/Divider';
import { RecurringRow } from '../src/components/finance/RecurringRow';
import { BudgetCategoryRow } from '../src/components/finance/BudgetCategoryRow';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ErrorState } from '../src/components/ui/ErrorState';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { AppRefreshControl } from '../src/components/ui/AppRefreshControl';
import { SheetModal } from '../src/components/ui/SheetModal';
import { FAB } from '../src/components/ui/FAB';
import { SettingsRow, settingsRowDivider } from '../src/components/ui/SettingsRow';
import { useGroupTxnActions } from '../src/hooks/useGroupTxnActions';
import { getMyActivity, type TxnWithSplits } from '../src/db/queries/transactions';
import { getRecurringForGroup, getSkipsMap } from '../src/db/queries/recurring';
import { getAllGroups } from '../src/db/queries/groups';
import { getAllPersons } from '../src/db/queries/persons';
import { getMyExposure } from '../src/db/queries/balances';
import { useScreenData } from '../src/hooks/useScreenData';
import { useContentInset } from '../src/hooks/useContentInset';
import { useStore } from '../src/store';
import { getMyGlobalBudgetStatus } from '../src/lib/budget';
import { BudgetBar } from '../src/components/finance/BudgetBar';
import { categoryVisual } from '../src/constants/categories';
import { recurringMonthlyEquivalent } from '../src/lib/recurrence';
import { groupByDate } from '../src/lib/txnGrouping';
import { formatCompact } from '../src/lib/money';
import { oweView } from '../src/lib/owe';
import { myShareOrTotal } from '../src/lib/splitMath';
import { haptic } from '../src/lib/haptics';
import { buildGroupExportCsv } from '../src/lib/groupExport';
import { shareCsv, csvFileSlug } from '../src/lib/shareCsv';

type TabKey = 'activity' | 'budget' | 'recurring';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'activity', label: 'Activity' },
  { key: 'budget', label: 'Budget' },
  { key: 'recurring', label: 'Recurring' },
];

type RecurGroup = { groupId: string; name: string; isPersonal: boolean; rules: TxnWithSplits[] };

export default function PersonalScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const me = useStore((s) => s.me);
  const myId = me?.id ?? '';

  const bottomPad = useContentInset({ fab: true });
  const [tab, setTab] = useState<TabKey>('activity');
  const [filter, setFilter] = useState<string>('personal'); // personal | groups | all | <groupId>
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showMenu, setShowMenu] = useState(false);

  const { data, loading, error: loadError, refreshing, onRefresh, reload } = useScreenData(async (db) => {
    if (!me) throw new Error('No current user');
    const [acts, allPersons, grps, exp, bud] = await Promise.all([
      getMyActivity(db, me.id),
      getAllPersons(db),
      getAllGroups(db),
      getMyExposure(db, me.id),
      getMyGlobalBudgetStatus(db, me.id),
    ]);
    // Recurring rules grouped by their group (personal first).
    const rulesByGroup = await Promise.all(grps.map(g => getRecurringForGroup(db, g.id)));
    const recurGroups: RecurGroup[] = grps
      .map((g, i) => ({ groupId: g.id, name: g.is_personal === 1 ? 'Personal' : g.name, isPersonal: g.is_personal === 1, rules: rulesByGroup[i] }))
      .filter(r => r.rules.length > 0)
      .sort((a, b) => (a.isPersonal ? -1 : b.isPersonal ? 1 : 0));
    const recurSkips = await getSkipsMap(db, recurGroups.flatMap(rg => rg.rules.map(r => r.id)));
    return {
      persons: allPersons,
      activity: acts,
      groups: grps,
      budget: bud,
      recurGroups,
      recurSkips,
      // Owe / Lent summary — single source of truth (netted per person).
      summary: { owe: exp.owe, lent: exp.owed },
    };
  }, [me?.id]);

  const persons = data?.persons ?? [];
  const activity = data?.activity ?? [];
  const groups = data?.groups ?? [];
  const budget = data?.budget ?? [];
  const recurGroups = data?.recurGroups ?? [];
  const recurSkips = data?.recurSkips;
  const summary = data?.summary ?? { owe: 0, lent: 0 };

  const sharedGroups = groups.filter(g => g.is_personal !== 1);
  const personalGroup = groups.find(g => g.is_personal === 1) ?? null;

  // Rows span every group, so the actions read the owning group off each txn.
  const { handleDelete, handleEditTxn } = useGroupTxnActions(null, reload);

  const filtered = activity.filter(a =>
    filter === 'all' ? true
    : filter === 'personal' ? a.isPersonal
    : filter === 'groups' ? !a.isPersonal
    : a.group_id === filter,
  );
  const sections = groupByDate(filtered);

  const net = summary.lent - summary.owe;

  function toggleCollapse(id: string) {
    haptic.selection();
    setCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

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
                      selected={{ scope: filter }}
                      onSelect={(_, v) => setFilter(v)}
                      groups={[{
                        key: 'scope',
                        options: [
                          { label: 'Personal', value: 'personal' },
                          { label: 'Groups', value: 'groups' },
                          { label: 'All', value: 'all' },
                          ...sharedGroups.map(g => ({ label: g.name, value: g.id })),
                        ],
                      }]}
                    />
                  </View>
                ) : null
              }
              renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
              stickySectionHeadersEnabled={false}
              renderItem={({ item, index, section }) => (
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
              )}
              ListEmptyComponent={
                loading ? null : (
                  <EmptyState
                    icon="inbox"
                    title="Nothing here yet"
                    body={filter === 'personal' ? 'Your personal expenses & income will show here.' : 'No transactions match this filter.'}
                    tint={colors.textSecondary}
                  />
                )
              }
            />
          )}

          {/* BUDGET — global: my total share-spend (personal + groups) vs my limits */}
          {tab === 'budget' && (
            <ScrollView contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]} refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
              {budget.length === 0 ? (
                <View style={styles.budgetCard}>
                  <Feather name="target" size={22} color={colors.accent} />
                  <Text style={styles.budgetTitle}>No budget yet</Text>
                  <Text style={styles.budgetBody}>Set category limits measured against your total spending — personal plus your share of group expenses.</Text>
                  <PrimaryButton label="Set a budget" onPress={openBudgetEditor} style={{ marginTop: space.xs }} />
                </View>
              ) : (
                <>
                  <View style={styles.budgetHeadRow}>
                    <Text style={styles.budgetHeading}>Your spending vs budget</Text>
                    <Chip label="Edit" icon="edit-2" onPress={openBudgetEditor} />
                  </View>
                  <Text style={styles.budgetNote}>Counts your share across personal + all groups.</Text>
                  <View style={styles.budgetList}>
                    {budget.map((b, i) => {
                      const vis = categoryVisual(b.category);
                      const tint = b.health === 'red' ? colors.expense : b.health === 'amber' ? colors.healthAmber : colors.income;
                      return (
                        <View key={`${b.category}-${b.cadence}`} style={i < budget.length - 1 ? styles.budgetRowBorder : undefined}>
                          <BudgetCategoryRow
                            category={b.category}
                            cadence={b.cadence}
                            spent={b.spent}
                            allocated={b.allocated}
                            pct={b.pct}
                            health={b.health}
                          />
                        </View>
                      );
                    })}
                  </View>
                </>
              )}
            </ScrollView>
          )}

          {/* RECURRING — collapsible, grouped by group (personal first) */}
          {tab === 'recurring' && (
            <ScrollView contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]} refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
              {recurGroups.length === 0 ? (
                <EmptyState icon="repeat" title="No recurring items" body="Mark an expense as Recurring when you add it and it'll show here, grouped by where it lives." tint={colors.textSecondary} />
              ) : recurGroups.map(rg => {
                const isOpen = !collapsed.has(rg.groupId);
                const monthly = rg.rules.reduce((s, r) => {
                  const mine = myShareOrTotal(r, myId);
                  return s + (r.recur_freq ? recurringMonthlyEquivalent(mine, r.recur_freq, r.recur_interval) : 0);
                }, 0);
                return (
                  <View key={rg.groupId} style={styles.recurGroup}>
                    <TouchableOpacity style={styles.recurHeader} onPress={() => toggleCollapse(rg.groupId)} accessibilityRole="button">
                      <Feather name={isOpen ? 'chevron-down' : 'chevron-right'} size={16} color={colors.textSecondary} />
                      <Text style={styles.recurGroupName}>{rg.name}</Text>
                      <Text style={styles.recurGroupTotal}>{formatCompact(monthly)}/mo</Text>
                    </TouchableOpacity>
                    {isOpen && (
                      <View style={styles.recurCard}>
                        {rg.rules.map((r, i) => {
                          return (
                            <React.Fragment key={r.id}>
                              {i > 0 && <Divider indent="text" />}
                              <RecurringRow
                                rule={r}
                                meId={myId}
                                showNext
                                skipDates={recurSkips?.get(r.id)}
                                onPress={() => router.push(`/group/${rg.groupId}/recurring?focus=${r.id}`)}
                              />
                            </React.Fragment>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
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


  listContent: { paddingHorizontal: layout.screenPaddingH, gap: space.sm },
  // No `gap` here: a date section's rows form ONE card, so any gap between them
  // slices it into separate slabs. `SectionHeader` supplies its own spacing.
  activityContent: { paddingHorizontal: layout.screenPaddingH },

  budgetCard: { alignItems: 'center', gap: space.sm, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.xl, ...shadow.sm },
  budgetTitle: { ...type.subheading, color: colors.textPrimary },
  budgetBody: { ...type.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  budgetHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  budgetHeading: { ...type.subheading, color: colors.textPrimary },
  budgetNote: { ...type.caption, color: colors.textMuted, marginTop: 2, marginBottom: space.xs },
  budgetList: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.sm },
  budgetRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },

  recurGroup: { marginBottom: space.sm },
  recurHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm },
  recurGroupName: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', flex: 1 },
  recurGroupTotal: { ...type.label, color: colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
  recurCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.sm },

  menuCard: { backgroundColor: colors.bgInput, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  personalNote: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.sm, paddingHorizontal: space.md },
});
