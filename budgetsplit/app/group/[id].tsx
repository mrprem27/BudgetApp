import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, SectionList, StyleSheet, TouchableOpacity, Alert, ScrollView, Switch,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, isSameDay } from 'date-fns';
import { colors } from '../../src/constants/colors';
import { type } from '../../src/constants/typography';
import { space, layout, radius, shadow } from '../../src/constants/layout';
import { getGroupById, setSimplifyDebt, archiveGroupSafe } from '../../src/db/queries/groups';
import { getTransactionsForGroup, softDeleteTxn, insertTxn } from '../../src/db/queries/transactions';
import { getGroupMembers, getMe } from '../../src/db/queries/persons';
import { getGroupNet } from '../../src/db/queries/balances';
import { getBudgetUsage, getCategoryBudgetStatus } from '../../src/lib/budget';
import type { CategoryBudgetStatus } from '../../src/lib/budget';
import { simplify, rawDebts } from '../../src/lib/settle';
import { formatRupees } from '../../src/lib/money';
import { haptic } from '../../src/lib/haptics';
import { TransactionRow } from '../../src/components/TransactionRow';
import { BalanceRow } from '../../src/components/BalanceRow';
import { BudgetBar } from '../../src/components/BudgetBar';
import { MemberAvatar } from '../../src/components/MemberAvatar';
import { FAB } from '../../src/components/FAB';
import { EmptyState } from '../../src/components/EmptyState';
import { FilterBar } from '../../src/components/FilterBar';
import { SheetModal } from '../../src/components/SheetModal';
import { SettingsRow, settingsRowDivider } from '../../src/components/SettingsRow';
import type { TxnWithSplits } from '../../src/db/queries/transactions';
import type { Person } from '../../src/db/queries/persons';
import type { BudgetGroup } from '../../src/db/queries/groups';

type TabKey = 'transactions' | 'balances' | 'budget' | 'members';

function healthColor(h: 'green' | 'amber' | 'red' | 'none'): string {
  return h === 'red' ? colors.healthRed : h === 'amber' ? colors.healthAmber : h === 'green' ? colors.healthGreen : colors.textSecondary;
}

function isRecurInstance(id: string): boolean {
  return /_\d+$/.test(id);
}

const CADENCE_SECTIONS = [
  { key: 'daily', label: 'Daily · spent today' },
  { key: 'monthly', label: 'Monthly · this month' },
  { key: 'yearly', label: 'Yearly · this year' },
  { key: 'once', label: 'One-time · all-time' },
] as const;

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
  const [simplifyOn, setSimplifyOn] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [filterKind, setFilterKind] = useState('all');
  const [search, setSearch] = useState('');

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
      const [usage, cs] = await Promise.all([
        getBudgetUsage(db, grp, 'monthly'),
        getCategoryBudgetStatus(db, grp),
      ]);
      setBudgetUsage(usage);
      setCatStatus(cs);
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
    if (txn.kind === 'settlement') return; // settlements aren't directly editable
    router.push(`/add/quick?editId=${txn.id}&groupId=${id}`);
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
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{group.name}</Text>
        <TouchableOpacity onPress={() => setShowMenu(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Group options">
          <Feather name="more-horizontal" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {budgetUsage && budgetUsage.pct !== null && (
        <View style={styles.budgetHeaderBar}>
          <BudgetBar pct={budgetUsage.pct} health={budgetUsage.health} height={4} />
          <Text style={styles.budgetHeaderText}>
            {formatRupees(budgetUsage.spent)} / {formatRupees(budgetUsage.limit ?? 0)} ({budgetUsage.pct}%)
          </Text>
        </View>
      )}

      <View style={styles.segmented}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.seg, activeTab === t.key && styles.segActive]}
            onPress={() => setActiveTab(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === t.key }}
          >
            <Text style={[styles.segLabel, activeTab === t.key && styles.segLabelActive]}>{t.label}</Text>
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
                    {v > 0 ? `is owed ${formatRupees(v)}` : v < 0 ? `owes ${formatRupees(-v)}` : 'settled up'}
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
                    <BalanceRow from={fromPerson} to={toPerson} amount={s.amount} onPaid={() => handleMarkPaid(fromPerson, toPerson, s.amount)} />
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
                <TouchableOpacity onPress={() => router.push(`/group/${id}/budget`)} accessibilityRole="button">
                  <Text style={styles.editLink}>Edit</Text>
                </TouchableOpacity>
              </View>

              {CADENCE_SECTIONS.map(sec => {
                const lines = catStatus.filter(c => c.cadence === sec.key);
                if (lines.length === 0) return null;
                return (
                  <View key={sec.key} style={{ marginBottom: space.md }}>
                    <Text style={styles.cadenceLabel}>{sec.label}</Text>
                    <View style={styles.catCard}>
                      {lines.map((c, i) => (
                        <View key={c.category} style={[styles.catRow, i < lines.length - 1 && styles.catRowBorder]}>
                          <View style={styles.catTop}>
                            <Text style={styles.catName} numberOfLines={1}>{c.category}</Text>
                            <Text style={styles.catAmt}>{formatRupees(c.spent)} / {formatRupees(c.allocated)}</Text>
                          </View>
                          <BudgetBar pct={c.pct} health={c.health} height={6} />
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </>
          ) : (
            <EmptyState
              icon="target"
              title="No budget yet"
              body="Give a category a limit — one-time, daily, monthly or yearly — and track it live. It rolls forward automatically each period."
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
                    {net[m.id] ? net[m.id] > 0 ? `Owed ${formatRupees(net[m.id])}` : `Owes ${formatRupees(-net[m.id])}` : 'Settled up'}
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
        actions={[
          { label: 'Expense', icon: 'minus-circle', onPress: () => router.push(`/add/quick?groupId=${id}&kind=expense`) },
          { label: 'Income', icon: 'plus-circle', onPress: () => router.push(`/add/quick?groupId=${id}&kind=income`) },
          { label: 'Itemized Bill', icon: 'list', onPress: () => router.push(`/add/itemized?groupId=${id}`) },
        ]}
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
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: layout.screenPaddingH },
  title: { ...type.heading, color: colors.textPrimary, flex: 1 },
  budgetHeaderBar: { paddingHorizontal: layout.screenPaddingH, gap: 4, marginBottom: space.sm },
  budgetHeaderText: { ...type.caption, color: colors.textMuted },
  segmented: { flexDirection: 'row', marginHorizontal: layout.screenPaddingH, backgroundColor: colors.bgMuted, borderRadius: 8, marginBottom: space.md, padding: 3 },
  seg: { flex: 1, paddingVertical: space.xs, alignItems: 'center', borderRadius: 6 },
  segActive: { backgroundColor: colors.bgCard, ...shadow.sm },
  segLabel: { ...type.label, color: colors.textSecondary },
  segLabelActive: { color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
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
  cadenceLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: space.xs },
  catCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, ...shadow.sm },
  catRow: { paddingVertical: space.md, gap: space.sm },
  catRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  catTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  catName: { ...type.body, color: colors.textPrimary, flex: 1 },
  catAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 13, color: colors.textSecondary },
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
