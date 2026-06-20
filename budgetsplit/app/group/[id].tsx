import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, SectionList, StyleSheet, TouchableOpacity, Alert, ScrollView, Switch,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, isSameDay, startOfMonth } from 'date-fns';
import { colors } from '../../src/constants/colors';
import { asFeather } from '../../src/constants/palette';
import { type } from '../../src/constants/typography';
import { space, layout, radius, shadow } from '../../src/constants/layout';
import { getGroupById, setSimplifyDebt, archiveGroupSafe } from '../../src/db/queries/groups';
import { getTransactionsForGroup, softDeleteTxn, insertTxn } from '../../src/db/queries/transactions';
import { getGroupMembers, getMe } from '../../src/db/queries/persons';
import { getGroupNet } from '../../src/db/queries/balances';
import { getBudgetUsage, getCategoryBudgetStatus } from '../../src/lib/budget';
import type { CategoryBudgetStatus } from '../../src/lib/budget';
import { getBudgetAnalytics } from '../../src/lib/analytics';
import type { BudgetAnalytics } from '../../src/lib/analytics';
import { simplify, rawDebts } from '../../src/lib/settle';
import { formatCompact } from '../../src/lib/money';
import { categoryVisual, categorySection, SECTION_ORDER } from '../../src/constants/categories';
import { haptic } from '../../src/lib/haptics';
import { TransactionRow } from '../../src/components/finance/TransactionRow';
import { BalanceRow } from '../../src/components/finance/BalanceRow';
import { BudgetBar } from '../../src/components/finance/BudgetBar';
import { MemberAvatar } from '../../src/components/finance/MemberAvatar';
import { FAB } from '../../src/components/ui/FAB';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { FilterBar } from '../../src/components/ui/FilterBar';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { SettleSheet } from '../../src/components/finance/SettleSheet';
import { SettingsRow, settingsRowDivider } from '../../src/components/ui/SettingsRow';
import type { TxnWithSplits } from '../../src/db/queries/transactions';
import type { Person } from '../../src/db/queries/persons';
import type { BudgetGroup } from '../../src/db/queries/groups';

type TabKey = 'transactions' | 'balances' | 'budget' | 'members';

function healthColor(h: 'green' | 'amber' | 'red' | 'none'): string {
  return h === 'red' ? colors.healthRed : h === 'amber' ? colors.healthAmber : h === 'green' ? colors.healthGreen : colors.textSecondary;
}

function utilHealth(pct: number | null): 'green' | 'amber' | 'red' | 'none' {
  if (pct === null) return 'none';
  return pct >= 100 ? 'red' : pct >= 80 ? 'amber' : 'green';
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


function groupTxnsByDate(txns: TxnWithSplits[]): Array<{ title: string; data: TxnWithSplits[] }> {
  const map = new Map<string, TxnWithSplits[]>();
  for (const txn of txns) {
    const date = new Date(txn.date);
    const key = isSameDay(date, new Date()) ? 'Today' : format(date, 'dd MMM yyyy');
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(txn);
  }
  return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
}

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
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
  const [simplifyOn, setSimplifyOn] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [settleTarget, setSettleTarget] = useState<{ from: Person; to: Person; amount: number } | null>(null);
  const [filterKind, setFilterKind] = useState('all');
  const [search, setSearch] = useState('');
  const [budgetFilter, setBudgetFilter] = useState('all');

  useFocusEffect(useCallback(() => { load(); }, [id]));

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
      const [usage, cs, an] = await Promise.all([
        getBudgetUsage(db, grp, 'monthly'),
        getCategoryBudgetStatus(db, grp),
        getBudgetAnalytics(db, grp),
      ]);
      setBudgetUsage(usage);
      setCatStatus(cs);
      setAnalytics(an);
    }
  }

  const isPersonal = group?.is_personal === 1;

  async function handleToggleSimplify(on: boolean) {
    setSimplifyOn(on);
    haptic.selection();
    await setSimplifyDebt(db, id, on);
  }

  async function handleDelete(txnId: string) {
    const recurring = isRecurInstance(txnId);
    const targetId = recurring ? txnId.replace(/_\d+$/, '') : txnId;
    Alert.alert(
      recurring ? 'Delete recurring transaction?' : 'Delete transaction?',
      recurring ? 'This removes the recurring transaction and all its occurrences.' : undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => { await softDeleteTxn(db, targetId); haptic.warning(); await load(); },
        },
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

  async function handleMarkPaid(from: Person, to: Person, amount: number) {
    if (!me) return;
    await insertTxn(db, {
      groupId: id, kind: 'settlement', entryMode: 'quick', date: Date.now(), category: 'Settlement',
      payments: [{ personId: from.id, amount }],
      shares:   [{ personId: to.id, amount }],
    });
    haptic.success();
    await load();
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

  const TABS: { key: TabKey; label: string }[] = isPersonal
    ? [
        { key: 'transactions', label: 'Expenses' },
        { key: 'budget', label: 'Budget' },
      ]
    : [
        { key: 'transactions', label: 'Expenses' },
        { key: 'balances', label: 'Balances' },
        { key: 'budget', label: 'Budget' },
        { key: 'members', label: 'Members' },
      ];

  if (!group) return null;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[group.color + '22', colors.bg]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.gradientHeader}
      >
        <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
            <Feather name="arrow-left" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          {!isPersonal && (
            <TouchableOpacity onPress={() => router.push(`/group/${id}/members`)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Manage members" style={styles.headerAction}>
              <Feather name="users" size={21} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setShowMenu(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Group options">
            <Feather name="more-horizontal" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Group hero — themed by the group's colour */}
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: group.color + '33' }]}>
            <Feather name={asFeather(group.icon, 'credit-card')} size={22} color={group.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroName} numberOfLines={1}>{group.name}</Text>
            <Text style={styles.heroSub} numberOfLines={1}>
              {(() => {
                const monthStart = startOfMonth(new Date()).getTime();
                const monthSpend = txns.reduce((s, t) => (t.kind === 'expense' && t.date >= monthStart ? s + (t.shares.find(x => x.personId === me?.id)?.amount ?? 0) : s), 0);
                const myNet = net[me?.id ?? ''] ?? 0;
                const parts: string[] = [`${formatCompact(monthSpend)} this month`];
                if (!isPersonal) {
                  parts.push(`${members.length} member${members.length > 1 ? 's' : ''}`);
                  if (myNet > 0) parts.push(`you're owed ${formatCompact(myNet)}`);
                  else if (myNet < 0) parts.push(`you owe ${formatCompact(-myNet)}`);
                }
                return parts.join(' · ');
            })()}
          </Text>
        </View>
      </View>
      </LinearGradient>

      {budgetUsage && budgetUsage.pct !== null && (
        <View style={styles.budgetHeaderBar}>
          <BudgetBar pct={budgetUsage.pct} health={budgetUsage.health} height={4} />
          <Text style={styles.budgetHeaderText}>
            <Text style={{ color: healthColor(budgetUsage.health) }}>{formatCompact(budgetUsage.spent)}</Text> / {formatCompact(budgetUsage.limit ?? 0)} ({budgetUsage.pct}%)
          </Text>
        </View>
      )}

      {/* Modern underline tab strip (replaces the boxed segmented control) */}
      <View style={styles.tabStrip}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={styles.tab}
            onPress={() => setActiveTab(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === t.key }}
          >
            <Text style={[styles.tabLabel, activeTab === t.key && styles.tabLabelActive]}>{t.label}</Text>
            <View style={[styles.tabUnderline, activeTab === t.key && { backgroundColor: group.color }]} />
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'transactions' && (
        <SectionList
          sections={groupTxnsByDate(filteredTxns)}
          keyExtractor={t => t.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            txns.length > 0 ? (
              <View style={{ marginBottom: space.sm }}>
                <FilterBar
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

      {activeTab === 'balances' && (
        <ScrollView contentContainerStyle={styles.listContent}>
          {/* Per-member net totals */}
          <Text style={styles.balSectionLabel}>Everyone's balance</Text>
          <View style={styles.card}>
            {members.map((m, i) => {
              const v = net[m.id] ?? 0;
              return (
                <View key={m.id} style={[styles.memberNetRow, i < members.length - 1 && styles.rowBorder]}>
                  <MemberAvatar name={m.name} color={m.avatar_color} size={36} />
                  <Text style={styles.memberNetName} numberOfLines={1}>{m.name}{m.is_me ? ' (me)' : ''}</Text>
                  <Text style={[styles.memberNetAmt, { color: v > 0 ? colors.income : v < 0 ? colors.expense : colors.textMuted }]}>
                    {v > 0 ? `is owed ${formatCompact(v)}` : v < 0 ? `owes ${formatCompact(-v)}` : 'settled up'}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Simplify toggle */}
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

          {/* Settlements */}
          <Text style={styles.balSectionLabel}>
            {settlements.length > 0 ? `${settlements.length} payment${settlements.length > 1 ? 's' : ''} to settle` : 'Settlements'}
          </Text>
          {settlements.length > 0 ? (
            <View style={styles.card}>
              {settlements.map((s, i) => {
                const fromPerson = personMap.get(s.from);
                const toPerson = personMap.get(s.to);
                if (!fromPerson || !toPerson) return null;
                return (
                  <View key={`${s.from}-${s.to}-${i}`} style={[styles.balanceRowWrap, i < settlements.length - 1 && styles.rowBorder]}>
                    <BalanceRow from={fromPerson} to={toPerson} amount={s.amount} onPaid={() => setSettleTarget({ from: fromPerson, to: toPerson, amount: s.amount })} />
                  </View>
                );
              })}
            </View>
          ) : (
            <EmptyState icon="check-circle" title="All settled up" body={`No outstanding balances in ${group.name}.`} tint={colors.income} />
          )}
        </ScrollView>
      )}

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
                      <Text style={[styles.ovSpent, { color: healthColor(utilHealth(analytics.utilizationPct)) }]}>{formatCompact(analytics.totalSpent)}</Text>
                      <Text style={styles.ovOf}>of {formatCompact(analytics.totalAllocated)}</Text>
                    </View>
                    <Text style={[styles.ovPct, { color: healthColor(utilHealth(analytics.utilizationPct)) }]}>
                      {analytics.utilizationPct ?? 0}%
                    </Text>
                  </View>
                  <View style={{ marginTop: space.md }}>
                    <BudgetBar pct={analytics.utilizationPct} health={utilHealth(analytics.utilizationPct)} height={10} />
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
                        <MemberAvatar name={r.member.name} color={r.member.avatar_color} size={28} />
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

              <View style={{ marginBottom: space.sm }}>
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
          <View style={styles.card}>
            {members.map((m, mi) => (
              <View key={m.id} style={[styles.memberRow, mi < members.length - 1 && styles.rowBorder]}>
                <MemberAvatar name={m.name} color={m.avatar_color} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{m.name}{m.is_me ? ' (me)' : ''}</Text>
                  <Text style={[styles.memberNet, { color: net[m.id] > 0 ? colors.income : net[m.id] < 0 ? colors.expense : colors.textMuted }]}>
                    {net[m.id] ? net[m.id] > 0 ? `Owed ${formatCompact(net[m.id])}` : `Owes ${formatCompact(-net[m.id])}` : 'Settled up'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
          <TouchableOpacity style={styles.linkBtn} onPress={() => router.push(`/group/${id}/members`)} accessibilityRole="button">
            <View style={styles.linkBtnIcon}><Feather name="user-plus" size={16} color={colors.accent} /></View>
            <Text style={styles.linkBtnText}>Manage members</Text>
            <Feather name="chevron-right" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </ScrollView>
      )}

      <FAB
        aboveTabBar={false}
        actions={[
          { label: 'Expense', icon: 'minus-circle', tint: colors.expense, description: 'Record spending', onPress: () => router.push(`/add/quick?groupId=${id}&kind=expense`) },
          // Income is real money you received → personal ledger only. Shared groups
          // move money via Transfer (settling "I owe you"), not income.
          ...(isPersonal
            ? [{ label: 'Income', icon: 'plus-circle' as const, tint: colors.income, description: 'Money you received', onPress: () => router.push(`/add/income?groupId=${id}`) }]
            : [{ label: 'Transfer', icon: 'repeat' as const, tint: colors.settle, description: 'Settle who owes whom', onPress: () => router.push(`/add/transfer?groupId=${id}`) }]),
          { label: 'Itemized Bill', icon: 'list', tint: colors.accent, description: 'Split a bill line by line', onPress: () => router.push(`/add/itemized?groupId=${id}`) },
        ]}
      />

      <SettleSheet
        visible={!!settleTarget}
        from={settleTarget?.from ?? null}
        to={settleTarget?.to ?? null}
        outstanding={settleTarget?.amount ?? 0}
        onClose={() => setSettleTarget(null)}
        onConfirm={(amt) => { if (settleTarget) handleMarkPaid(settleTarget.from, settleTarget.to, amt); setSettleTarget(null); }}
      />

      {/* Group options menu */}
      <SheetModal visible={showMenu} onClose={() => setShowMenu(false)} title={group.name} scroll={false}>
        <View style={styles.menuCard}>
          <SettingsRow icon="repeat" label="Recurring transactions" onPress={() => { setShowMenu(false); router.push(`/group/${id}/recurring`); }} />
          <View style={settingsRowDivider} />
          <SettingsRow icon="clock" label="History" onPress={() => { setShowMenu(false); router.push(`/history?groupId=${id}`); }} />
          {!isPersonal && <View style={settingsRowDivider} />}
          {!isPersonal && (
            <SettingsRow icon="edit-2" label="Edit group" onPress={() => { setShowMenu(false); router.push(`/group/${id}/edit`); }} />
          )}
          {!isPersonal && <View style={settingsRowDivider} />}
          {!isPersonal && (
            <SettingsRow icon="users" label="Manage members" onPress={() => { setShowMenu(false); router.push(`/group/${id}/members`); }} />
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
  gradientHeader: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: layout.screenPaddingH, paddingBottom: space.xs },
  headerAction: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bgCard + 'AA', alignItems: 'center', justifyContent: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: layout.screenPaddingH, paddingBottom: space.md },
  heroIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  heroName: { ...type.title, fontSize: 26, color: colors.textPrimary },
  heroSub: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  budgetHeaderBar: { paddingHorizontal: layout.screenPaddingH, gap: 4, marginBottom: space.sm },
  budgetHeaderText: { ...type.caption, color: colors.textMuted },
  tabStrip: { flexDirection: 'row', paddingHorizontal: layout.screenPaddingH, gap: space.lg, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: space.md },
  tab: { paddingBottom: space.sm, alignItems: 'center' },
  tabLabel: { ...type.subheading, fontSize: 15, color: colors.textMuted },
  tabLabelActive: { color: colors.textPrimary },
  tabUnderline: { height: 2, alignSelf: 'stretch', borderRadius: 2, backgroundColor: 'transparent', marginTop: space.sm },
  listContent: { padding: layout.screenPaddingH, paddingBottom: 120 },
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

  ovCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, ...shadow.md },
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
  budgetHeadingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.lg, marginBottom: space.sm },
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

  memberRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.md },
  memberName: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  memberNet: { ...type.caption, marginTop: 2 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  linkBtnIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  linkBtnText: { ...type.body, color: colors.textPrimary, flex: 1 },

  menuCard: { backgroundColor: colors.bgInput, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  archiveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: space.md, marginTop: space.sm },
  archiveText: { ...type.body, color: colors.expense, fontFamily: 'Inter_600SemiBold' },
  personalNote: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.sm, paddingHorizontal: space.md },
});
