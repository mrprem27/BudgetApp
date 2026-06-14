import React, { useState, useCallback } from 'react';
import {
  View, Text, SectionList, StyleSheet, TouchableOpacity, Alert,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { format, isSameDay } from 'date-fns';
import { colors } from '../../src/constants/colors';
import { type } from '../../src/constants/typography';
import { space, layout } from '../../src/constants/layout';
import { getGroupById } from '../../src/db/queries/groups';
import { getTransactionsForGroup, softDeleteTxn } from '../../src/db/queries/transactions';
import { getGroupMembers, getMe } from '../../src/db/queries/persons';
import { getGroupNet } from '../../src/db/queries/balances';
import { getBudgetUsage } from '../../src/lib/budget';
import { simplify } from '../../src/lib/settle';
import { formatRupees } from '../../src/lib/money';
import { TransactionRow } from '../../src/components/TransactionRow';
import { BalanceRow } from '../../src/components/BalanceRow';
import { BudgetBar } from '../../src/components/BudgetBar';
import { MemberAvatar } from '../../src/components/MemberAvatar';
import { FAB } from '../../src/components/FAB';
import type { TxnWithSplits } from '../../src/db/queries/transactions';
import type { Person } from '../../src/db/queries/persons';
import type { BudgetGroup } from '../../src/db/queries/groups';
import { insertTxn } from '../../src/db/queries/transactions';

type TabKey = 'transactions' | 'balances' | 'budget' | 'members';

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
  const [activeTab, setActiveTab] = useState<TabKey>('transactions');
  const [group, setGroup] = useState<BudgetGroup | null>(null);
  const [txns, setTxns] = useState<TxnWithSplits[]>([]);
  const [members, setMembers] = useState<Person[]>([]);
  const [me, setMe] = useState<Person | null>(null);
  const [net, setNet] = useState<Record<string, number>>({});
  const [budgetUsage, setBudgetUsage] = useState<any>(null);

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

    const netMap = await getGroupNet(db, id);
    setNet(netMap);

    if (grp) {
      const usage = await getBudgetUsage(db, grp, 'monthly');
      setBudgetUsage(usage);
    }
  }

  async function handleDelete(txnId: string) {
    // Virtual recurring instances have an id of the form "<parentId>_<timestamp>".
    const isRecurInstance = /_\d+$/.test(txnId);
    const targetId = isRecurInstance ? txnId.replace(/_\d+$/, '') : txnId;
    Alert.alert(
      isRecurInstance ? 'Delete recurring transaction?' : 'Delete transaction?',
      isRecurInstance ? 'This removes the recurring transaction and all its occurrences.' : undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            await softDeleteTxn(db, targetId);
            await load();
          },
        },
      ],
    );
  }

  async function handleMarkPaid(from: Person, to: Person, amount: number) {
    if (!me) return;
    await insertTxn(db, {
      groupId: id,
      kind: 'settlement',
      entryMode: 'quick',
      date: Date.now(),
      category: 'Settlement',
      payments: [{ personId: from.id, amount }],
      shares:   [{ personId: to.id, amount }],
    });
    await load();
  }

  const settlements = simplify(net);
  const personMap = new Map(members.map(m => [m.id, m]));

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'transactions', label: 'Txns' },
    { key: 'balances',     label: 'Balances' },
    { key: 'budget',       label: 'Budget' },
    { key: 'members',      label: 'Members' },
  ];

  if (!group) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{group.name}</Text>
        <TouchableOpacity
          onPress={() => router.push(`/group/${id}/members`)}
          accessibilityRole="button"
          accessibilityLabel="Manage members"
        >
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
            <Text style={[styles.segLabel, activeTab === t.key && styles.segLabelActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'transactions' && (
        <SectionList
          sections={groupTxnsByDate(txns)}
          keyExtractor={t => t.id}
          contentContainerStyle={styles.listContent}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <TransactionRow
              txn={item}
              myId={me?.id ?? ''}
              onDelete={() => handleDelete(item.id)}
              onPress={() => {}}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Nothing logged in {group.name}</Text>
            </View>
          }
        />
      )}

      {activeTab === 'balances' && (
        <SectionList
          sections={[{ title: '', data: settlements }]}
          keyExtractor={(s, i) => `${s.from}-${s.to}-${i}`}
          contentContainerStyle={styles.listContent}
          renderItem={({ item: s }) => {
            const fromPerson = personMap.get(s.from);
            const toPerson   = personMap.get(s.to);
            if (!fromPerson || !toPerson) return null;
            return (
              <BalanceRow
                from={fromPerson}
                to={toPerson}
                amount={s.amount}
                onPaid={() => handleMarkPaid(fromPerson, toPerson, s.amount)}
              />
            );
          }}
          renderSectionHeader={() => null}
          ListHeaderComponent={
            settlements.length > 0
              ? <Text style={styles.balanceHint}>{settlements.length} payment{settlements.length > 1 ? 's' : ''} needed</Text>
              : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>All settled up</Text>
            </View>
          }
        />
      )}

      {activeTab === 'budget' && (
        <View style={styles.listContent}>
          {budgetUsage ? (
            <View style={{ gap: space.sm }}>
              {budgetUsage.limit !== null && (
                <>
                  <Text style={styles.budgetLabel}>Monthly budget</Text>
                  <BudgetBar pct={budgetUsage.pct} health={budgetUsage.health} height={8} />
                  <Text style={styles.budgetSub}>
                    {formatRupees(budgetUsage.spent)} of {formatRupees(budgetUsage.limit)}
                  </Text>
                </>
              )}
              <Text style={[styles.budgetLabel, { marginTop: space.md }]}>
                {budgetUsage.limit === null ? 'No budget limit set' : ''}
              </Text>
            </View>
          ) : null}
        </View>
      )}

      {activeTab === 'members' && (
        <View style={styles.listContent}>
          {members.map(m => (
            <View key={m.id} style={styles.memberRow}>
              <MemberAvatar name={m.name} color={m.avatar_color} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>{m.name}{m.is_me ? ' (me)' : ''}</Text>
                <Text style={styles.memberNet}>
                  {net[m.id]
                    ? net[m.id] > 0 ? `Owed ${formatRupees(net[m.id])}` : `Owes ${formatRupees(-net[m.id])}`
                    : 'Settled'}
                </Text>
              </View>
            </View>
          ))}
          <TouchableOpacity
            style={styles.addMemberBtn}
            onPress={() => router.push(`/group/${id}/members`)}
            accessibilityRole="button"
            accessibilityLabel="Manage members"
          >
            <Feather name="user-plus" size={16} color={colors.accent} />
            <Text style={styles.addMemberText}>Manage members</Text>
          </TouchableOpacity>
        </View>
      )}

      <FAB
        actions={[
          { label: 'Expense', icon: 'minus-circle', onPress: () => router.push(`/add/quick?groupId=${id}&kind=expense`) },
          { label: 'Income',  icon: 'plus-circle',  onPress: () => router.push(`/add/quick?groupId=${id}&kind=income`) },
          { label: 'Itemized Bill', icon: 'list', onPress: () => router.push(`/add/itemized?groupId=${id}`) },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: layout.screenPaddingH, paddingTop: space.xl },
  title: { ...type.heading, color: colors.textPrimary, flex: 1 },
  budgetHeaderBar: { paddingHorizontal: layout.screenPaddingH, gap: 4, marginBottom: space.sm },
  budgetHeaderText: { ...type.caption, color: colors.textMuted },
  segmented: { flexDirection: 'row', marginHorizontal: layout.screenPaddingH, backgroundColor: colors.bgMuted, borderRadius: 8, marginBottom: space.md, padding: 3 },
  seg: { flex: 1, paddingVertical: space.xs, alignItems: 'center', borderRadius: 6 },
  segActive: { backgroundColor: colors.bgCard },
  segLabel: { ...type.label, color: colors.textSecondary },
  segLabelActive: { color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  listContent: { padding: layout.screenPaddingH, paddingBottom: 120 },
  sectionHeader: { ...type.caption, color: colors.textMuted, marginTop: space.md, marginBottom: space.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  sep: { height: 1, backgroundColor: colors.border },
  empty: { alignItems: 'center', paddingVertical: space.xxl },
  emptyText: { ...type.body, color: colors.textSecondary },
  balanceHint: { ...type.label, color: colors.textSecondary, marginBottom: space.md },
  budgetLabel: { ...type.subheading, color: colors.textPrimary },
  budgetSub: { ...type.label, color: colors.textSecondary },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  memberName: { ...type.body, color: colors.textPrimary },
  memberNet: { ...type.caption, color: colors.textSecondary },
  addMemberBtn: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.lg, padding: space.md, borderRadius: 8, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  addMemberText: { ...type.body, color: colors.accent },
});
