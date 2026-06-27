import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SectionList, ScrollView } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout, shadow } from '../src/constants/layout';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { FilterBar } from '../src/components/ui/FilterBar';
import { TransactionRow } from '../src/components/finance/TransactionRow';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ErrorState } from '../src/components/ui/ErrorState';
import { AppRefreshControl, useRefresh } from '../src/components/ui/AppRefreshControl';
import { getMyActivity, getRecurringForGroup, type MyActivityItem, type TxnWithSplits } from '../src/db/queries/transactions';
import { getAllGroups, type BudgetGroup } from '../src/db/queries/groups';
import { getAllPersons, getMe } from '../src/db/queries/persons';
import { getFriendBalances } from '../src/db/queries/balances';
import { categoryVisual } from '../src/constants/categories';
import { recurringMonthlyEquivalent } from '../src/lib/recurrence';
import { groupByDate } from '../src/lib/txnGrouping';
import { formatCompact } from '../src/lib/money';
import { haptic } from '../src/lib/haptics';
import type { Person } from '../src/db/queries/persons';

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
  const { refreshing, onRefresh } = useRefresh(() => load());

  const [tab, setTab] = useState<TabKey>('activity');
  const [me, setMe] = useState<Person | null>(null);
  const [persons, setPersons] = useState<Person[]>([]);
  const [activity, setActivity] = useState<MyActivityItem[]>([]);
  const [groups, setGroups] = useState<BudgetGroup[]>([]);
  const [recurGroups, setRecurGroups] = useState<RecurGroup[]>([]);
  const [summary, setSummary] = useState({ owe: 0, lent: 0 });
  const [filter, setFilter] = useState<string>('personal'); // personal | groups | all | <groupId>
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    try {
      const meRow = await getMe(db);
      if (!meRow) { setLoadError(true); return; }
      const [acts, allPersons, grps, fb] = await Promise.all([
        getMyActivity(db, meRow.id),
        getAllPersons(db),
        getAllGroups(db),
        getFriendBalances(db, meRow.id),
      ]);
      setMe(meRow);
      setPersons(allPersons);
      setActivity(acts);
      setGroups(grps);

      // Owe / Lent summary from pairwise friend balances.
      let owe = 0, lent = 0;
      for (const f of fb) { if (f.net > 0) lent += f.net; else owe += -f.net; }
      setSummary({ owe, lent });

      // Recurring rules grouped by their group (personal first).
      const rulesByGroup = await Promise.all(grps.map(g => getRecurringForGroup(db, g.id)));
      const recur: RecurGroup[] = grps
        .map((g, i) => ({ groupId: g.id, name: g.is_personal === 1 ? 'Personal' : g.name, isPersonal: g.is_personal === 1, rules: rulesByGroup[i] }))
        .filter(r => r.rules.length > 0)
        .sort((a, b) => (a.isPersonal ? -1 : b.isPersonal ? 1 : 0));
      setRecurGroups(recur);

      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  const myId = me?.id ?? '';
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

  return (
    <View style={styles.container}>
      <ScreenHeader title="Personal" onBack={() => router.back()} />

      {loadError ? (
        <ErrorState onRetry={() => { setLoadError(false); setLoading(true); load(); }} />
      ) : (
        <>
          {/* Owe / Lent / Net summary */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>You owe</Text>
              <Text style={[styles.summaryAmt, { color: summary.owe > 0 ? colors.expense : colors.textMuted }]}>{formatCompact(summary.owe)}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>You're owed</Text>
              <Text style={[styles.summaryAmt, { color: summary.lent > 0 ? colors.income : colors.textMuted }]}>{formatCompact(summary.lent)}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Net</Text>
              <Text style={[styles.summaryAmt, { color: net > 0 ? colors.income : net < 0 ? colors.expense : colors.textMuted }]}>
                {net > 0 ? '+' : net < 0 ? '−' : ''}{formatCompact(Math.abs(net))}
              </Text>
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

          {/* BUDGET — Phase 3 makes this a global budget; for now route to the personal budget. */}
          {tab === 'budget' && (
            <ScrollView contentContainerStyle={styles.listContent}>
              <View style={styles.budgetCard}>
                <Feather name="target" size={22} color={colors.accent} />
                <Text style={styles.budgetTitle}>Your budget</Text>
                <Text style={styles.budgetBody}>Set category limits for your spending. A unified budget across personal + your share of group spend is coming next.</Text>
                <TouchableOpacity
                  style={styles.budgetBtn}
                  onPress={() => { const pg = groups.find(g => g.is_personal === 1); if (pg) router.push(`/group/${pg.id}/budget`); }}
                  accessibilityRole="button"
                >
                  <Text style={styles.budgetBtnText}>Edit budget</Text>
                  <Feather name="chevron-right" size={16} color={colors.bg} />
                </TouchableOpacity>
              </View>
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
