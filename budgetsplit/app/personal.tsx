import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SectionList, ScrollView, Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout, shadow } from '../src/constants/layout';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { FilterBar } from '../src/components/ui/FilterBar';
import { TransactionRow } from '../src/components/finance/TransactionRow';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ErrorState } from '../src/components/ui/ErrorState';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { AppRefreshControl } from '../src/components/ui/AppRefreshControl';
import { getMyActivity, getRecurringForGroup, type TxnWithSplits } from '../src/db/queries/transactions';
import { getAllGroups } from '../src/db/queries/groups';
import { getAllPersons } from '../src/db/queries/persons';
import { getMyExposure } from '../src/db/queries/balances';
import { useScreenData } from '../src/hooks/useScreenData';
import { useStore } from '../src/store';
import { getMyGlobalBudgetStatus } from '../src/lib/budget';
import { BudgetBar } from '../src/components/finance/BudgetBar';
import { categoryVisual } from '../src/constants/categories';
import { recurringMonthlyEquivalent } from '../src/lib/recurrence';
import { groupByDate } from '../src/lib/txnGrouping';
import { formatCompact } from '../src/lib/money';
import { oweView } from '../src/lib/owe';
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
  const router = useRouter();
  const me = useStore((s) => s.me);
  const myId = me?.id ?? '';

  const [tab, setTab] = useState<TabKey>('activity');
  const [filter, setFilter] = useState<string>('personal'); // personal | groups | all | <groupId>
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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
    return {
      persons: allPersons,
      activity: acts,
      groups: grps,
      budget: bud,
      recurGroups,
      // Owe / Lent summary — single source of truth (netted per person).
      summary: { owe: exp.owe, lent: exp.owed },
    };
  }, [me?.id]);

  const persons = data?.persons ?? [];
  const activity = data?.activity ?? [];
  const groups = data?.groups ?? [];
  const budget = data?.budget ?? [];
  const recurGroups = data?.recurGroups ?? [];
  const summary = data?.summary ?? { owe: 0, lent: 0 };

  const sharedGroups = groups.filter(g => g.is_personal !== 1);

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
    const pg = groups.find(g => g.is_personal === 1);
    if (pg) router.push(`/group/${pg.id}/budget` as any);
  }

  async function handleExport() {
    const pg = groups.find(g => g.is_personal === 1);
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
            onPress={handleExport}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Export Personal as CSV"
          >
            <Feather name="download" size={20} color={colors.accent} />
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

          {/* Tab strip */}
          <View style={styles.tabStrip}>
            {TABS.map(t => (
              <TouchableOpacity
                key={t.key}
                style={[styles.tab, tab === t.key && styles.tabActive]}
                onPress={() => { setTab(t.key); haptic.selection(); }}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === t.key }}
              >
                <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ACTIVITY */}
          {tab === 'activity' && (
            <SectionList
              sections={sections}
              keyExtractor={t => t.id}
              contentContainerStyle={styles.listContent}
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
              renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
              renderItem={({ item }) => (
                <TransactionRow
                  txn={item}
                  myId={myId}
                  members={persons}
                  isPersonal={item.isPersonal}
                  groupName={item.isPersonal ? undefined : item.groupName}
                  onPress={() => router.push(`/txn/${item.id}`)}
                />
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
            <ScrollView contentContainerStyle={styles.listContent} refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
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
                    <TouchableOpacity style={styles.editPill} onPress={openBudgetEditor} accessibilityRole="button" accessibilityLabel="Edit budget">
                      <Feather name="edit-2" size={13} color={colors.accent} />
                      <Text style={styles.editPillText}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.budgetNote}>Counts your share across personal + all groups.</Text>
                  <View style={styles.budgetList}>
                    {budget.map((b, i) => {
                      const vis = categoryVisual(b.category);
                      const tint = b.health === 'red' ? colors.expense : b.health === 'amber' ? colors.healthAmber : colors.income;
                      return (
                        <View key={`${b.category}-${b.cadence}`} style={[styles.budgetRow, i < budget.length - 1 && styles.budgetRowBorder]}>
                          <View style={styles.budgetRowTop}>
                            <View style={[styles.budgetIcon, { backgroundColor: vis.color + '22' }]}>
                              <Feather name={vis.icon} size={14} color={vis.color} />
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={styles.budgetCat} numberOfLines={1}>{b.category}</Text>
                              <Text style={styles.budgetCadence}>{b.cadence === 'once' ? 'one-time' : b.cadence}</Text>
                            </View>
                            <Text style={styles.budgetAmt}><Text style={{ color: tint }}>{formatCompact(b.spent)}</Text> / {formatCompact(b.allocated)}</Text>
                          </View>
                          <BudgetBar pct={b.pct} health={b.health} height={6} />
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
            <ScrollView contentContainerStyle={styles.listContent} refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
              {recurGroups.length === 0 ? (
                <EmptyState icon="repeat" title="No recurring items" body="Mark an expense as Recurring when you add it and it'll show here, grouped by where it lives." tint={colors.textSecondary} />
              ) : recurGroups.map(rg => {
                const isOpen = !collapsed.has(rg.groupId);
                const monthly = rg.rules.reduce((s, r) => {
                  const mine = r.shares.find(x => x.personId === myId)?.amount ?? r.shares.reduce((a, x) => a + x.amount, 0);
                  return s + (r.recur_freq ? recurringMonthlyEquivalent(mine, r.recur_freq) : 0);
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
                          const vis = categoryVisual(r.category);
                          const mine = r.shares.find(x => x.personId === myId)?.amount ?? r.shares.reduce((a, x) => a + x.amount, 0);
                          const name = (r.note && r.note.trim()) || r.category;
                          return (
                            <TouchableOpacity
                              key={r.id}
                              style={[styles.recurRow, i < rg.rules.length - 1 && styles.recurRowBorder]}
                              onPress={() => router.push(`/group/${rg.groupId}/recurring?focus=${r.id}`)}
                              accessibilityRole="button"
                            >
                              <View style={[styles.recurIcon, { backgroundColor: vis.color + '22' }]}>
                                <Feather name={vis.icon} size={14} color={vis.color} />
                              </View>
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={styles.recurName} numberOfLines={1}>{name}</Text>
                                <Text style={styles.recurCadence}>{r.recur_state !== 'active' ? `${r.recur_state} · ` : ''}{r.recur_freq}</Text>
                              </View>
                              <Text style={styles.recurAmt}>{formatCompact(mine)}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  summaryCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: layout.screenPaddingH, marginBottom: space.md, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: space.md, ...shadow.sm },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border, marginVertical: space.xs },
  summaryLabel: { ...type.caption, color: colors.textMuted },
  summaryAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 16, letterSpacing: -0.3 },

  tabStrip: { flexDirection: 'row', marginHorizontal: layout.screenPaddingH, marginBottom: space.md, backgroundColor: colors.bgCard, borderRadius: 10, padding: 3, borderWidth: 1, borderColor: colors.border },
  tab: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: colors.accent },
  tabLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textMuted },
  tabLabelActive: { color: colors.bg },

  listContent: { paddingHorizontal: layout.screenPaddingH, paddingBottom: 120, gap: space.sm },
  sectionHeader: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: space.sm, marginBottom: 2 },

  budgetCard: { alignItems: 'center', gap: space.sm, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.xl, ...shadow.sm },
  budgetTitle: { ...type.subheading, color: colors.textPrimary },
  budgetBody: { ...type.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  budgetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: 12, marginTop: space.xs },
  budgetBtnText: { ...type.button, color: colors.bg },
  budgetHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  budgetHeading: { ...type.subheading, color: colors.textPrimary },
  editPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.sm, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.accentMuted },
  editPillText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  budgetNote: { ...type.caption, color: colors.textMuted, marginTop: 2, marginBottom: space.xs },
  budgetList: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.sm },
  budgetRow: { paddingHorizontal: space.md, paddingVertical: space.md, gap: 8 },
  budgetRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  budgetRowTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  budgetIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  budgetCat: { ...type.body, color: colors.textPrimary },
  budgetCadence: { ...type.caption, color: colors.textMuted, marginTop: 1, textTransform: 'capitalize' },
  budgetAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 12, color: colors.textSecondary },

  recurGroup: { marginBottom: space.sm },
  recurHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm },
  recurGroupName: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', flex: 1 },
  recurGroupTotal: { ...type.label, color: colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
  recurCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.sm },
  recurRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm + 2, paddingHorizontal: space.md, minHeight: 52 },
  recurRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  recurIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  recurName: { ...type.body, color: colors.textPrimary },
  recurCadence: { ...type.caption, color: colors.textMuted, marginTop: 1, textTransform: 'capitalize' },
  recurAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 13, color: colors.textSecondary },
});
