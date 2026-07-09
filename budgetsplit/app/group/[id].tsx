import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, SectionList, StyleSheet, TouchableOpacity, Alert, ScrollView, Switch,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, startOfMonth } from 'date-fns';
import { colors } from '../../src/constants/colors';
import { asFeather } from '../../src/constants/palette';
import { type } from '../../src/constants/typography';
import { space, layout, radius, shadow } from '../../src/constants/layout';
import { getGroupById, setSimplifyDebt, archiveGroupSafe } from '../../src/db/queries/groups';
import { getTransactionsForGroup, softDeleteTxn, restoreTxn, getRecurringForGroup } from '../../src/db/queries/transactions';
import { useUndo } from '../../src/components/system/UndoToast';
import { useRefreshOnDataChange } from '../../src/components/system/DataRefreshProvider';
import { AppRefreshControl, useRefresh } from '../../src/components/ui/AppRefreshControl';
import { getGroupMembers, getMe } from '../../src/db/queries/persons';
import { getGroupNet } from '../../src/db/queries/balances';
import { groupByDate } from '../../src/lib/txnGrouping';
import { getBudgetUsage, getCategoryBudgetStatus, utilLabel, budgetHealth } from '../../src/lib/budget';
import type { CategoryBudgetStatus } from '../../src/lib/budget';
import { getBudgetAnalytics } from '../../src/lib/analytics';
import type { BudgetAnalytics } from '../../src/lib/analytics';
import { simplify, rawDebts } from '../../src/lib/settle';
import { formatCompact, formatRupees } from '../../src/lib/money';
import { oweView } from '../../src/lib/owe';
import { nextOccurrenceOnOrAfter, recurringMonthlyEquivalent } from '../../src/lib/recurrence';
import { categoryVisual, categorySection, SECTION_ORDER } from '../../src/constants/categories';
import { haptic } from '../../src/lib/haptics';
import { TransactionRow } from '../../src/components/finance/TransactionRow';
import { BalanceRow } from '../../src/components/finance/BalanceRow';
import { BudgetBar } from '../../src/components/finance/BudgetBar';
import { MemberAvatar } from '../../src/components/finance/MemberAvatar';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { FilterBar } from '../../src/components/ui/FilterBar';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { FAB } from '../../src/components/ui/FAB';
import { AvatarStack } from '../../src/components/finance/AvatarStack';
import { SettingsRow, settingsRowDivider } from '../../src/components/ui/SettingsRow';
import type { TxnWithSplits } from '../../src/db/queries/transactions';
import type { Person } from '../../src/db/queries/persons';
import type { BudgetGroup } from '../../src/db/queries/groups';

type TabKey = 'transactions' | 'budget' | 'members' | 'recurring';

function healthColor(h: 'green' | 'amber' | 'red' | 'none'): string {
  return h === 'red' ? colors.healthRed : h === 'amber' ? colors.healthAmber : h === 'green' ? colors.healthGreen : colors.textSecondary;
}

// Over 100 %: show as a multiplier (e.g. 2.5×) — more intuitive than 250 %.
function splitLabel(mode: string): string {
  switch (mode) {
    case 'shares': return 'by shares';
    case 'exact': return 'by exact amounts';
    case 'percent': return 'by percentage';
    default: return 'equally';
  }
}
function freqWord(freq: string | null): string {
  switch (freq) {
    case 'daily': return 'daily';
    case 'weekly': return 'weekly';
    case 'yearly': return 'yearly';
    case 'custom': return 'custom';
    default: return 'monthly';
  }
}

function recBg(sev: 'warn' | 'info' | 'good'): string {
  return sev === 'warn' ? '#3A1414' : sev === 'good' ? colors.accentMuted : colors.bgMuted;
}
function recColor(sev: 'warn' | 'info' | 'good'): string {
  return sev === 'warn' ? colors.expense : sev === 'good' ? colors.income : colors.textSecondary;
}

function isRecurInstance(id: string): boolean {
  return /_\d+$/.test(id);
}


const groupTxnsByDate = groupByDate<TxnWithSplits>;

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const { showUndo } = useUndo();
  const { refreshing, onRefresh } = useRefresh(() => load());
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabKey>('transactions');
  const [group, setGroup] = useState<BudgetGroup | null>(null);
  const [txns, setTxns] = useState<TxnWithSplits[]>([]);
  const [members, setMembers] = useState<Person[]>([]);
  const [me, setMe] = useState<Person | null>(null);
  const [net, setNet] = useState<Record<string, number>>({});
  const [budgetUsage, setBudgetUsage] = useState<any>(null);
  const [catStatus, setCatStatus] = useState<CategoryBudgetStatus[]>([]);
  const [analytics, setAnalytics] = useState<BudgetAnalytics | null>(null);
  const [recurringRules, setRecurringRules] = useState<TxnWithSplits[]>([]);
  const [simplifyOn, setSimplifyOn] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [membersExpanded, setMembersExpanded] = useState(false);
  const [filterKind, setFilterKind] = useState('all');
  const [search, setSearch] = useState('');
  const [budgetFilter, setBudgetFilter] = useState('all');

  useFocusEffect(useCallback(() => { load(); }, [id]));
  useRefreshOnDataChange(load);

  async function load() {
    const [grp, txnList, memberList, meRow] = await Promise.all([
      getGroupById(db, id),
      getTransactionsForGroup(db, id),
      getGroupMembers(db, id),
      getMe(db),
    ]);
    setGroup(grp);
    setTxns(txnList);
    setMembers(memberList);
    setMe(meRow);
    if (grp) setSimplifyOn(grp.simplify_debt === 1);

    const netMap = await getGroupNet(db, id);
    setNet(netMap);

    if (grp) {
      // Budgets are individual: count only MY share of each (shared) expense.
      const [usage, cs, an] = await Promise.all([
        getBudgetUsage(db, grp, 'monthly'),
        getCategoryBudgetStatus(db, grp, new Date(), meRow?.id),
        getBudgetAnalytics(db, grp, new Date(), meRow?.id),
      ]);
      setBudgetUsage(usage);
      setCatStatus(cs);
      setAnalytics(an);
      if (grp.is_personal !== 1) {
        const rules = await getRecurringForGroup(db, id);
        setRecurringRules(rules.filter(r => r.recur_state === 'active'));
      }
    }
  }

  const isPersonal = group?.is_personal === 1;

  async function handleToggleSimplify(on: boolean) {
    setSimplifyOn(on);
    haptic.selection();
    await setSimplifyDebt(db, id, on);
  }

  async function deleteTxn(targetId: string, cascade: boolean, message: string) {
    await softDeleteTxn(db, targetId, cascade);
    haptic.warning();
    await load();
    showUndo({
      message,
      onUndo: async () => { try { await restoreTxn(db, targetId, cascade); haptic.success(); await load(); } catch { /* ignore */ } },
    });
  }

  async function handleDelete(txnId: string) {
    const recurring = isRecurInstance(txnId);
    const targetId = recurring ? txnId.replace(/_\d+$/, '') : txnId;
    if (!recurring) {
      Alert.alert('Delete transaction?', undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteTxn(targetId, false, 'Transaction deleted') },
      ]);
      return;
    }
    // Recurring rule: keep the already-logged occurrences unless the user asks otherwise.
    Alert.alert(
      'Delete recurring rule?',
      'Keep the transactions it has already logged, or remove them too?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete rule only', onPress: () => deleteTxn(targetId, false, 'Recurring rule deleted') },
        { text: 'Delete rule + all logged', style: 'destructive', onPress: () => deleteTxn(targetId, true, 'Recurring + occurrences deleted') },
      ],
    );
  }

  function handleEditTxn(txn: TxnWithSplits) {
    if (isRecurInstance(txn.id)) {
      router.push(`/group/${id}/recurring`);
      return;
    }
    // Open the detail view (payer/who-added, splits, full edit history).
    router.push(`/txn/${txn.id}`);
  }

  const settlements = simplifyOn ? simplify(net) : rawDebts(txns);
  const personMap = new Map(members.map(m => [m.id, m]));

  const filteredTxns = useMemo(() => {
    const q = search.trim().toLowerCase();
    return txns.filter(t => {
      if (filterKind !== 'all' && t.kind !== filterKind) return false;
      if (q && !(`${t.category} ${t.note ?? ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [txns, filterKind, search]);

  // "Who paid what" — sum each member's expense payments, vs the equal fair share.
  // net > 0 means the member is ahead (the group owes them); net < 0 means they owe.
  const contributions = useMemo(() => {
    const paid: Record<string, number> = {};
    let total = 0;
    for (const t of txns) {
      if (t.is_deleted || t.kind !== 'expense') continue;
      for (const p of t.payments) {
        paid[p.personId] = (paid[p.personId] ?? 0) + p.amount;
        total += p.amount;
      }
    }
    const fairShare = members.length > 0 ? Math.round(total / members.length) : 0;
    const maxPaid = Math.max(1, ...members.map(m => paid[m.id] ?? 0));
    return {
      total,
      fairShare,
      rows: members
        .map(m => ({ member: m, paid: paid[m.id] ?? 0, net: net[m.id] ?? 0, frac: (paid[m.id] ?? 0) / maxPaid }))
        .sort((a, b) => b.paid - a.paid),
    };
  }, [txns, members, net]);

  // Recurring monthly total for summary pill
  const recurringMonthlyTotal = useMemo(() => {
    return recurringRules.reduce((sum, r) => {
      const rAmt = r.payments.reduce((s, p) => s + p.amount, 0);
      return sum + recurringMonthlyEquivalent(rAmt, r.recur_freq);
    }, 0);
  }, [recurringRules]);

  // Earliest upcoming charge across the active recurring rules (for the summary).
  const recurNextLabel = useMemo(() => {
    const now = Date.now();
    const next = recurringRules
      .map(r => nextOccurrenceOnOrAfter(r, now))
      .filter((d): d is number => d != null)
      .sort((a, b) => a - b)[0];
    return next ? format(next, 'MMM d') : null;
  }, [recurringRules]);

  const TABS: { key: TabKey; label: string }[] = isPersonal
    ? [
        { key: 'transactions', label: 'Expenses' },
        { key: 'budget', label: 'Budget' },
      ]
    : [
        { key: 'transactions', label: 'Expenses' },
        { key: 'recurring', label: 'Recurring' },
        { key: 'budget', label: 'Budget' },
        { key: 'members', label: 'Members' },
      ];

  if (!group) return null;

  return (
    <View style={styles.container}>
      {/* Breadcrumb header */}
      <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
        <TouchableOpacity
          style={styles.breadcrumb}
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back to Groups"
        >
          <Feather name="chevron-left" size={18} color={colors.accent} />
          <Text style={styles.breadcrumbBack}>Groups</Text>
          <Text style={styles.breadcrumbSep}>›</Text>
          <Text style={styles.breadcrumbCurrent} numberOfLines={1}>{group.name}</Text>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => setShowMenu(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Group options">
            <Feather name="more-horizontal" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Group hero */}
      <View style={styles.hero}>
        <View style={[styles.heroIcon, { backgroundColor: group.color + '33' }]}>
          <Feather name={asFeather(group.icon, 'credit-card')} size={22} color={group.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroName} numberOfLines={1}>{group.name}</Text>
          {isPersonal ? (
            <Text style={styles.heroSub} numberOfLines={1}>
              {(() => {
                const monthStart = startOfMonth(new Date()).getTime();
                const monthSpend = txns.reduce((s, t) => (t.kind === 'expense' && t.date >= monthStart ? s + (t.shares.find(x => x.personId === me?.id)?.amount ?? 0) : s), 0);
                return `${formatCompact(monthSpend)} this month`;
              })()}
            </Text>
          ) : (
            <View style={styles.heroMembers}>
              <AvatarStack people={members} size={20} max={4} ringColor={colors.bg} />
              <Text style={styles.heroSub}>{members.length} member{members.length > 1 ? 's' : ''}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Balance card — only for non-personal groups with outstanding balance */}
      {!isPersonal && (() => {
        const myNet = net[me?.id ?? ''] ?? 0;
        if (myNet === 0) return null;
        const mySettles = simplify(net);
        const ov = oweView(myNet);
        const isOwe = ov.direction === 'owe';
        const primarySettle = isOwe
          ? mySettles.find(s => s.from === me?.id)
          : mySettles.find(s => s.to === me?.id);
        const primaryPerson = primarySettle
          ? personMap.get(isOwe ? primarySettle.to : primarySettle.from)
          : null;
        const balColor = ov.color;
        return (
          <View style={[styles.balCard, {
            backgroundColor: isOwe ? '#2A1714' : '#14271F',
            borderColor: isOwe ? '#3A1F1C' : '#1A3527',
          }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.balCardLabel, { color: balColor }]}>
                {isOwe ? 'YOU OWE' : 'OWED TO YOU'}
              </Text>
              <Text style={[styles.balCardAmt, { color: balColor }]}>
                {formatCompact(Math.abs(myNet))}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.balCardBtn}
              onPress={() => {
                // Consistent with the dashboard/friends/groups — open the global Settle flow.
                if (primaryPerson) router.push(`/add/quick?kind=transfer&to=${primaryPerson.id}`);
                else router.push('/add/quick?kind=transfer');
              }}
              accessibilityRole="button"
              accessibilityLabel="Settle up"
            >
              <Text style={styles.balCardBtnText}>Settle up</Text>
            </TouchableOpacity>
          </View>
        );
      })()}

      {/* Pill/boxed segmented tabs — matches design */}
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
        <SectionList
          sections={groupTxnsByDate(filteredTxns)}
          keyExtractor={t => t.id}
          contentContainerStyle={styles.listContent}
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
          renderItem={({ item }) => (
            <TransactionRow
              txn={item}
              myId={me?.id ?? ''}
              onDelete={() => handleDelete(item.id)}
              onPress={() => handleEditTxn(item)}
              members={members}
              isPersonal={isPersonal}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            txns.length === 0 ? (
              <EmptyState
                icon="list"
                title="No expenses yet"
                body={`Tap + to log your first expense in ${group.name}.`}
              />
            ) : (
              <EmptyState icon="search" title="No matches" body="Try a different filter or search." tint={colors.textSecondary} />
            )
          }
        />
      )}

      {/* Balances tab removed — settlement rows now live inside Members tab */}

      {activeTab === 'budget' && (
        <ScrollView contentContainerStyle={styles.listContent}>
          {catStatus.length > 0 ? (
            <>
              <View style={styles.budgetHeadingRow}>
                <Text style={styles.budgetHeading}>Budget</Text>
                <TouchableOpacity style={styles.editPill} onPress={() => router.push(`/group/${id}/budget`)} accessibilityRole="button" accessibilityLabel="Edit budget">
                  <Feather name="edit-2" size={13} color={colors.accent} />
                  <Text style={styles.editPillText}>Edit</Text>
                </TouchableOpacity>
              </View>

              {analytics && analytics.totalAllocated > 0 && (
                <View style={styles.ovCard}>
                  <View style={styles.ovTopRow}>
                    <View>
                      <Text style={styles.ovLabel}>Budget used</Text>
                      <Text style={[styles.ovSpent, { color: healthColor(budgetHealth(analytics.utilizationPct)) }]}>{formatCompact(analytics.totalSpent)}</Text>
                      <Text style={styles.ovOf}>of {formatCompact(analytics.totalAllocated)}</Text>
                    </View>
                    <Text style={[styles.ovPct, { color: healthColor(budgetHealth(analytics.utilizationPct)) }]}>
                      {utilLabel(analytics.utilizationPct ?? 0)}
                    </Text>
                  </View>
                  <View style={{ marginTop: space.md }}>
                    <BudgetBar pct={analytics.utilizationPct} health={budgetHealth(analytics.utilizationPct)} height={10} />
                  </View>
                  <View style={styles.ovStatsRow}>
                    <View style={styles.ovStat}>
                      <Text style={[styles.ovStatVal, { color: colors.expense }]}>{analytics.overBudget.length}</Text>
                      <Text style={styles.ovStatLabel}>over</Text>
                    </View>
                    <View style={styles.ovStatDivider} />
                    <View style={styles.ovStat}>
                      <Text style={[styles.ovStatVal, { color: colors.healthAmber }]}>{analytics.nearLimit.length}</Text>
                      <Text style={styles.ovStatLabel}>near limit</Text>
                    </View>
                    <View style={styles.ovStatDivider} />
                    <View style={styles.ovStat}>
                      <Text style={[styles.ovStatVal, { color: colors.income }]}>{analytics.onTrackCount}</Text>
                      <Text style={styles.ovStatLabel}>on track</Text>
                    </View>
                  </View>
                </View>
              )}

              {analytics && analytics.recommendations.length > 0 && (
                <View style={styles.recList}>
                  {analytics.recommendations.map(r => (
                    <View key={r.id} style={[styles.recPill, { backgroundColor: recBg(r.severity) }]}>
                      <Feather name={r.icon} size={15} color={recColor(r.severity)} />
                      <Text style={[styles.recText, { color: recColor(r.severity) }]}>{r.text}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Driving overspend — over-budget categories worst-first, or all-clear */}
              {analytics && analytics.totalAllocated > 0 && (
                analytics.overBudget.length > 0 ? (
                  <View style={styles.drivingCard}>
                    <Text style={styles.drivingTitle}>Driving overspend</Text>
                    {analytics.overBudget.slice(0, 4).map(t => {
                      const vis = categoryVisual(t.category);
                      const over = t.spent - t.allocated;
                      return (
                        <View key={t.category} style={styles.drivingRow}>
                          <View style={[styles.catIcon, { backgroundColor: vis.color + '22' }]}>
                            <Feather name={vis.icon} size={14} color={vis.color} />
                          </View>
                          <Text style={styles.drivingName} numberOfLines={1}>{t.category}</Text>
                          <Text style={styles.drivingOver}>{formatCompact(over)} over</Text>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.allClearCard}>
                    <Feather name="check-circle" size={16} color={colors.income} />
                    <Text style={styles.allClearText}>Every category within budget</Text>
                  </View>
                )
              )}

              {/* Who paid what — shared groups only */}
              {!isPersonal && contributions.total > 0 && (
                <View style={styles.contribCard}>
                  <Text style={styles.contribTitle}>Who paid what</Text>
                  {contributions.rows.map((r, i) => (
                    <View key={r.member.id} style={[styles.contribRow, i < contributions.rows.length - 1 && styles.contribRowGap]}>
                      <View style={styles.contribHead}>
                        <MemberAvatar name={r.member.name} color={r.member.avatar_color} size={28} imageUri={r.member.image_uri} />
                        <Text style={styles.contribName} numberOfLines={1}>{r.member.name}{r.member.is_me ? ' (me)' : ''}</Text>
                        <Text style={styles.contribPaid}>{formatCompact(r.paid)}</Text>
                        <Text style={[styles.contribDelta, { color: r.net > 0 ? colors.income : r.net < 0 ? colors.expense : colors.textMuted }]}>
                          {r.net > 0 ? `+${formatCompact(r.net)}` : r.net < 0 ? `−${formatCompact(-r.net)}` : '—'}
                        </Text>
                      </View>
                      <View style={styles.contribTrack}>
                        <View style={[styles.contribFill, { width: `${Math.round(r.frac * 100)}%`, backgroundColor: r.member.avatar_color }]} />
                      </View>
                    </View>
                  ))}
                  <Text style={styles.contribFoot}>Fair share is {formatCompact(contributions.fairShare)} each · + ahead, − owes the group</Text>
                </View>
              )}

              <View>
                <FilterBar
                  selected={{ status: budgetFilter }}
                  onSelect={(_, v) => setBudgetFilter(v)}
                  groups={[{ key: 'status', options: [
                    { label: 'All', value: 'all' },
                    { label: 'Over', value: 'over' },
                    { label: 'Near limit', value: 'near' },
                    { label: 'On track', value: 'ontrack' },
                  ] }]}
                />
              </View>

              {(() => {
                const matches = (c: CategoryBudgetStatus) =>
                  budgetFilter === 'all' ? true
                  : budgetFilter === 'over' ? c.health === 'red'
                  : budgetFilter === 'near' ? c.health === 'amber'
                  : c.health === 'green';
                const visible = catStatus.filter(matches);
                if (visible.length === 0) {
                  return <EmptyState icon="filter" title="Nothing here" body="No categories match this filter." tint={colors.textSecondary} />;
                }
                return SECTION_ORDER.map(section => {
                  const lines = visible.filter(c => categorySection(c.category) === section);
                  if (lines.length === 0) return null;
                  return (
                    <View key={section} style={{ marginBottom: space.md }}>
                      <Text style={styles.cadenceLabel}>{section}</Text>
                      <View style={styles.catCard}>
                        {lines.map((c, i) => {
                          const vis = categoryVisual(c.category);
                          return (
                            <View key={c.category} style={[styles.catRow, i < lines.length - 1 && styles.catRowBorder]}>
                              <View style={styles.catTop}>
                                <View style={[styles.catIcon, { backgroundColor: vis.color + '22' }]}>
                                  <Feather name={vis.icon} size={14} color={vis.color} />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.catName} numberOfLines={1}>{c.category}</Text>
                                  <Text style={styles.catCadenceTag}>{c.cadence === 'once' ? 'one-time' : c.cadence}</Text>
                                </View>
                                <Text style={styles.catAmt}><Text style={{ color: healthColor(c.health) }}>{formatCompact(c.spent)}</Text> / {formatCompact(c.allocated)}</Text>
                              </View>
                              <BudgetBar pct={c.pct} health={c.health} height={6} />
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  );
                });
              })()}
            </>
          ) : (
            <EmptyState
              icon="target"
              title="No budget yet"
              body="Give a category a limit — one-time, daily, monthly or yearly — and track it live. Each period starts fresh: the limit resets and unused amount doesn't carry over."
              actionLabel="Create budget"
              onAction={() => router.push(`/group/${id}/budget`)}
            />
          )}
        </ScrollView>
      )}

      {activeTab === 'members' && !isPersonal && (
        <ScrollView contentContainerStyle={styles.listContent}>
          {/* GROUP BALANCES summary */}
          {(() => {
            const totalSpent = txns.filter(t => t.kind === 'expense' && !t.is_deleted).reduce((s, t) => s + (t.shares.reduce((a, x) => a + x.amount, 0)), 0);
            const myNet = net[me?.id ?? ''] ?? 0;
            return (
              <View style={styles.groupBalCard}>
                <View style={styles.groupBalItem}>
                  <Text style={styles.groupBalLabel}>Total spent</Text>
                  <Text style={styles.groupBalAmt}>{formatCompact(totalSpent)}</Text>
                </View>
                <View style={styles.groupBalDivider} />
                <View style={styles.groupBalItem}>
                  <Text style={styles.groupBalLabel}>Your balance</Text>
                  <Text style={[styles.groupBalAmt, { color: myNet > 0 ? colors.income : myNet < 0 ? colors.expense : colors.textMuted }]}>
                    {myNet > 0 ? `+${formatCompact(myNet)}` : myNet < 0 ? `−${formatCompact(-myNet)}` : '—'}
                  </Text>
                </View>
              </View>
            );
          })()}

          {/* Member list — collapsed by default; tap the header to expand */}
          <TouchableOpacity
            style={styles.membersHeader}
            onPress={() => setMembersExpanded(e => !e)}
            accessibilityRole="button"
            accessibilityLabel={`${members.length} members, ${membersExpanded ? 'collapse' : 'expand'}`}
          >
            <AvatarStack people={members} size={24} max={5} ringColor={colors.bg} />
            <Text style={styles.membersHeaderText}>{members.length} member{members.length > 1 ? 's' : ''}</Text>
            <Feather name={membersExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
          </TouchableOpacity>
          {membersExpanded && (
          <View style={styles.card}>
            {members.map((m, mi) => {
              const v = net[m.id] ?? 0;
              const ov = oweView(v); // canonical color + sign
              const isLargest = v > 0 && members.every(o => o.id === m.id || (net[o.id] ?? 0) <= v);
              const sub = isLargest && !m.is_me
                ? 'Largest contributor'
                : m.joined_at ? `Joined ${format(m.joined_at, 'MMM yyyy')}` : '';
              const balLabel = v > 0 ? 'is owed' : v < 0 ? (m.is_me ? 'you owe' : 'owes') : 'settled';
              return (
                <View key={m.id} style={[styles.memberRow, mi < members.length - 1 && styles.rowBorder]}>
                  <MemberAvatar name={m.name} color={m.avatar_color} size={44} imageUri={m.image_uri} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {m.name}{m.is_me ? <Text style={styles.youTag}> (you)</Text> : null}
                    </Text>
                    {!!sub && <Text style={styles.memberSub} numberOfLines={1}>{sub}</Text>}
                  </View>
                  <View style={styles.memberRight}>
                    <Text style={[styles.memberBal, { color: ov.color }]}>
                      {v === 0 ? '₹0' : `${ov.sign}${formatCompact(ov.amount)}`}
                    </Text>
                    <Text style={styles.memberBalLabel}>{balLabel}</Text>
                  </View>
                </View>
              );
            })}
          </View>
          )}

          {/* Invite */}
          <TouchableOpacity style={styles.inviteBtn} onPress={() => router.push(`/group/${id}/members`)} accessibilityRole="button">
            <Feather name="user-plus" size={16} color={colors.accent} />
            <Text style={styles.inviteBtnText}>Invite someone</Text>
          </TouchableOpacity>

          {/* Simplify debts toggle */}
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>Simplify debts</Text>
              <Text style={styles.toggleSub}>{simplifyOn ? 'Fewest possible payments' : 'Show every direct debt'}</Text>
            </View>
            <Switch
              value={simplifyOn}
              onValueChange={handleToggleSimplify}
              trackColor={{ true: colors.accent, false: colors.bgMuted }}
              thumbColor={colors.textPrimary}
              accessibilityLabel="Simplify debts"
            />
          </View>

          {/* Settlement rows — who owes whom */}
          {settlements.length > 0 ? (<>
            <Text style={styles.balSectionLabel}>
              {settlements.length} payment{settlements.length > 1 ? 's' : ''} to settle
            </Text>
            <View style={styles.card}>
              {settlements.map((s, i) => {
                const fromPerson = personMap.get(s.from);
                const toPerson = personMap.get(s.to);
                if (!fromPerson || !toPerson) return null;
                return (
                  <View key={`${s.from}-${s.to}-${i}`} style={[styles.balanceRowWrap, i < settlements.length - 1 && styles.rowBorder]}>
                    <BalanceRow
                      from={fromPerson}
                      to={toPerson}
                      amount={s.amount}
                      onPaid={() => router.push(`/add/quick?kind=transfer&from=${s.from}&to=${s.to}&amount=${s.amount}&groupId=${id}` as any)}
                    />
                  </View>
                );
              })}
            </View>
          </>) : (
            <EmptyState icon="check-circle" title="All settled up" body={`No outstanding balances in ${group.name}.`} tint={colors.income} />
          )}
        </ScrollView>
      )}


      {activeTab === 'recurring' && !isPersonal && (
        <ScrollView contentContainerStyle={styles.listContent}>
          {recurringRules.length === 0 ? (
            <EmptyState
              icon="repeat"
              title="No recurring yet"
              body="Rent, Wi-Fi, subscriptions — anything you set to repeat shows up here with its monthly cost and your share."
              actionLabel="Add recurring expense"
              onAction={() => router.push(`/add/quick?groupId=${id}&kind=expense`)}
            />
          ) : (
            <>
              <View style={styles.recurSummaryCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={styles.recurSummaryTitle}>Group recurring</Text>
                  <Text style={styles.recurSummaryAmt}>{formatRupees(recurringMonthlyTotal)}/mo</Text>
                </View>
                <Text style={styles.recurSummarySub}>
                  {recurringRules.length} active{recurNextLabel ? ` · next charge ${recurNextLabel}` : ''} · split {splitLabel(group.default_split)}
                </Text>
              </View>

              <Text style={styles.insightSectionLabel}>ACTIVE · {recurringRules.length}</Text>
              <View style={[styles.insightCard, { paddingHorizontal: 0 }]}>
                {recurringRules.map((r, i) => {
                  const vis = categoryVisual(r.category);
                  const total = r.shares.reduce((s, x) => s + x.amount, 0) || r.payments.reduce((s, p) => s + p.amount, 0);
                  const myShare = me ? (r.shares.find(s => s.personId === me.id)?.amount ?? 0) : 0;
                  const next = nextOccurrenceOnOrAfter(r, Date.now());
                  const label = (r.note && r.note.trim()) || r.category;
                  return (
                    <TouchableOpacity
                      key={r.id}
                      style={[styles.recurItem, i < recurringRules.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
                      onPress={() => router.push(`/group/${id}/recurring?focus=${r.id}`)}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                    >
                      <View style={[styles.recurItemIcon, { backgroundColor: (vis?.color ?? colors.accent) + '22' }]}>
                        <Feather name={vis?.icon ?? 'repeat'} size={18} color={vis?.color ?? colors.accent} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.recurItemName} numberOfLines={1}>{label}</Text>
                        <Text style={styles.recurItemSub} numberOfLines={1}>
                          {formatRupees(total)} · {freqWord(r.recur_freq)}{next ? ` · next ${format(next, 'MMM d')}` : ''}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.recurItemShare}>{formatRupees(myShare)}</Text>
                        <Text style={styles.recurItemShareLabel}>your share</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity style={styles.addRecurBtn} onPress={() => router.push(`/add/quick?groupId=${id}&kind=expense`)} accessibilityRole="button">
                <Feather name="plus" size={15} color={colors.accent} />
                <View>
                  <Text style={styles.addRecurBtnText}>Add recurring expense</Text>
                  <Text style={styles.addRecurBtnSub}>Bills, subscriptions, any fixed charge</Text>
                </View>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      )}


      {/* Single-tap FAB — pre-fills this group. No tab bar on pushed screen. */}
      <FAB onPress={() => router.push(`/add/quick?groupId=${id}&kind=expense`)} aboveTabBar={false} />

      {/* Group options menu */}
      <SheetModal visible={showMenu} onClose={() => setShowMenu(false)} title={group.name} scroll={false}>
        <View style={styles.menuCard}>
          {/* Recurring & Members live in their own tabs now — kept out of this menu. */}
          <SettingsRow icon="clock" label="Audit log" onPress={() => { setShowMenu(false); router.push(`/history?groupId=${id}`); }} />
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
                {
                  text: 'Archive', style: 'destructive',
                  onPress: async () => { const ok = await archiveGroupSafe(db, id); if (ok) { haptic.warning(); router.back(); } },
                },
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headerAction: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bgCard + 'AA', alignItems: 'center', justifyContent: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: layout.screenPaddingH, paddingBottom: space.md },
  heroIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  heroName: { ...type.title, fontSize: 26, color: colors.textPrimary },
  heroSub: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  heroMembers: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: 4 },
  budgetHeaderBar: { paddingHorizontal: layout.screenPaddingH, gap: 4, marginBottom: space.sm },
  budgetHeaderText: { ...type.caption, color: colors.textMuted },
  tabStrip: { flexDirection: 'row', marginHorizontal: layout.screenPaddingH, marginBottom: space.sm, backgroundColor: colors.bgCard, borderRadius: 10, padding: 3, borderWidth: 1, borderColor: colors.border },
  tab: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: colors.accent },
  tabLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textMuted },
  tabLabelActive: { color: colors.bg },
  listContent: { padding: layout.screenPaddingH, paddingBottom: 100, gap: space.sm },
  sectionHeader: { ...type.caption, color: colors.textMuted, marginTop: space.md, marginBottom: space.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  sep: { height: 1, backgroundColor: colors.border },

  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.sm, marginBottom: space.md },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },

  balSectionLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: space.sm, marginTop: space.xs },
  memberNetRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.md },
  memberNetName: { ...type.body, color: colors.textPrimary, flex: 1, fontFamily: 'Inter_600SemiBold' },
  memberNetAmt: { ...type.label, fontFamily: 'Inter_600SemiBold' },
  balanceRowWrap: { paddingHorizontal: space.md },
  toggleRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, marginBottom: space.md, ...shadow.sm },
  toggleTitle: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  toggleSub: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  ovCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.md, ...shadow.md },
  ovTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  ovLabel: { ...type.label, color: colors.textSecondary },
  ovSpent: { ...type.amountLG, color: colors.textPrimary, marginTop: 2 },
  ovOf: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  ovPct: { ...type.amountLG },
  ovStatsRow: { flexDirection: 'row', alignItems: 'center', marginTop: space.md },
  ovStat: { flex: 1, alignItems: 'center', gap: 2 },
  ovStatDivider: { width: 1, height: 28, backgroundColor: colors.border },
  ovStatVal: { fontFamily: 'SpaceMono_400Regular', fontSize: 14, color: colors.textPrimary },
  ovStatLabel: { ...type.caption, color: colors.textMuted },
  insightPill: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.md, marginTop: space.md },
  insightText: { ...type.label, flex: 1 },
  budgetHeadingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.xs, marginBottom: space.sm },
  budgetHeading: { ...type.subheading, color: colors.textPrimary },
  editLink: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  editPill: { flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: colors.accentMuted, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 },
  editPillText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  cadenceLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: space.xs },
  recList: { gap: space.sm, marginBottom: space.md },
  recPill: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, padding: space.md, borderRadius: radius.md },
  recText: { ...type.label, flex: 1, lineHeight: 18 },

  drivingCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: colors.border, marginBottom: space.md, gap: space.sm, ...shadow.sm },
  drivingTitle: { ...type.subheading, color: colors.textPrimary, marginBottom: 2 },
  drivingRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  drivingName: { ...type.body, color: colors.textPrimary, flex: 1 },
  drivingOver: { ...type.label, color: colors.expense, fontFamily: 'Inter_600SemiBold' },
  allClearCard: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: colors.border, marginBottom: space.md, ...shadow.sm },
  allClearText: { ...type.body, color: colors.income, fontFamily: 'Inter_600SemiBold' },

  contribCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: colors.border, marginBottom: space.md, ...shadow.sm },
  contribTitle: { ...type.subheading, color: colors.textPrimary, marginBottom: space.md },
  contribRow: { gap: space.xs },
  contribRowGap: { marginBottom: space.md },
  contribHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  contribName: { ...type.body, color: colors.textPrimary, flex: 1 },
  contribPaid: { fontFamily: 'SpaceMono_400Regular', fontSize: 13, color: colors.textPrimary },
  contribDelta: { ...type.caption, fontFamily: 'Inter_600SemiBold', minWidth: 52, textAlign: 'right' },
  contribTrack: { height: 6, borderRadius: 3, backgroundColor: colors.bgMuted, overflow: 'hidden' },
  contribFill: { height: 6, borderRadius: 3 },
  contribFoot: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  catCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, ...shadow.sm },
  catRow: { paddingVertical: space.md, gap: space.sm },
  catRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  catTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  catIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  catName: { ...type.body, color: colors.textPrimary },
  catAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 13, color: colors.textSecondary },
  catCadenceTag: { ...type.caption, color: colors.textMuted, marginTop: 1, textTransform: 'capitalize' },
  catUnbudgeted: { ...type.caption, color: colors.textMuted },

  membersHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: space.sm + 2, paddingHorizontal: space.md, marginBottom: space.sm },
  membersHeaderText: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', flex: 1 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.md },
  memberName: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  memberNet: { ...type.caption, marginTop: 2 },
  youTag: { ...type.caption, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  memberSub: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  memberRight: { alignItems: 'flex-end' },
  memberBal: { fontFamily: 'SpaceMono_400Regular', fontSize: 14, letterSpacing: -0.5 },
  memberBalLabel: { ...type.caption, color: colors.textMuted, fontSize: 10, marginTop: 1 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  linkBtnIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  linkBtnText: { ...type.body, color: colors.textPrimary, flex: 1 },

  // Contributions overview card (Members area)
  insightSectionLabel: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Inter_600SemiBold', marginBottom: 8 },
  insightCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, marginBottom: 10, ...shadow.sm },
  // Recurring tab
  recurSummaryCard: { backgroundColor: '#1A1A3A', borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1.5, borderColor: colors.settle },
  recurSummaryTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.textPrimary },
  recurSummaryAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 16, color: colors.settle, letterSpacing: -0.5 },
  recurSummarySub: { fontSize: 12, color: colors.textMuted },
  recurItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.md, paddingVertical: 14 },
  recurItemIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.bgMuted, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  recurItemName: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.textPrimary },
  recurItemSub: { fontSize: 11, color: colors.textMuted },
  recurItemShare: { fontFamily: 'SpaceMono_400Regular', fontSize: 14, color: colors.textPrimary, letterSpacing: -0.5 },
  recurItemShareLabel: { fontSize: 10, color: colors.textMuted, textAlign: 'right' },
  variableBadge: { backgroundColor: '#221A00', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  variableBadgeText: { fontSize: 9, color: '#F5B301', fontFamily: 'Inter_600SemiBold' },
  addRecurBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#0E2C29', borderWidth: 1.5, borderColor: colors.accent, borderStyle: 'dashed', borderRadius: 12, padding: 12, marginBottom: space.md },
  addRecurBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.accent },
  addRecurBtnSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },

  menuCard: { backgroundColor: colors.bgInput, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  archiveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: space.md, marginTop: space.sm },
  archiveText: { ...type.body, color: colors.expense, fontFamily: 'Inter_600SemiBold' },
  personalNote: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.sm, paddingHorizontal: space.md },
  breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  breadcrumbBack: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  breadcrumbSep: { ...type.body, color: colors.border, marginHorizontal: 1 },
  breadcrumbCurrent: { ...type.label, color: colors.textSecondary, flex: 1 },
  balCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: layout.screenPaddingH, borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: space.sm + 2, marginBottom: space.sm, borderWidth: 1 },
  balCardLabel: { ...type.caption, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 },
  balCardAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 22, letterSpacing: -0.5, lineHeight: 26 },
  balCardBtn: { paddingHorizontal: space.md + 2, paddingVertical: space.sm + 2, borderRadius: radius.md, backgroundColor: colors.accentMuted, borderWidth: 1, borderColor: colors.accent },
  balCardBtnText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  groupBalCard: { flexDirection: 'row', backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: space.md, ...shadow.sm },
  groupBalItem: { flex: 1, alignItems: 'center', paddingVertical: space.md, gap: 3 },
  groupBalDivider: { width: 1, backgroundColor: colors.border, marginVertical: space.sm },
  groupBalLabel: { ...type.caption, color: colors.textMuted },
  groupBalAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 18, color: colors.textPrimary },
  largestTag: { ...type.caption, color: colors.textMuted, marginTop: 1, fontSize: 10 },
  inviteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed', borderRadius: radius.lg, paddingVertical: space.md, marginBottom: space.md },
  inviteBtnText: { ...type.body, color: colors.accent },
  settleGroupCta: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.settle + '18', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.settle + '44', padding: space.md, gap: space.md },
  settleGroupTitle: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  settleGroupSub: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  settleGroupBtn: { backgroundColor: colors.settle, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  settleGroupBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#fff' },
});
