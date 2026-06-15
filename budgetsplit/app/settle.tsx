import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout, shadow } from '../src/constants/layout';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { EmptyState } from '../src/components/EmptyState';
import { BalanceRow } from '../src/components/BalanceRow';
import { getGlobalNet } from '../src/db/queries/balances';
import { getAllPersons, getMe } from '../src/db/queries/persons';
import { getCommonGroupId } from '../src/db/queries/groups';
import { insertTxn } from '../src/db/queries/transactions';
import { simplify } from '../src/lib/settle';
import { haptic } from '../src/lib/haptics';
import type { Person } from '../src/db/queries/persons';

export default function GlobalSettleScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [net, setNet] = useState<Record<string, number>>({});
  const [persons, setPersons] = useState<Person[]>([]);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    const [n, all] = await Promise.all([getGlobalNet(db), getAllPersons(db)]);
    setNet(n);
    setPersons(all);
  }

  const personMap = new Map(persons.map(p => [p.id, p]));
  const settlements = simplify(net);

  async function markPaid(from: Person, to: Person, amount: number) {
    const gid = await getCommonGroupId(db, from.id, to.id);
    if (!gid) {
      Alert.alert('Cannot settle here', `${from.name} and ${to.name} don't share a group. Settle inside the group where the expense was logged.`);
      return;
    }
    await insertTxn(db, {
      groupId: gid, kind: 'settlement', entryMode: 'quick', date: Date.now(), category: 'Settlement',
      payments: [{ personId: from.id, amount }],
      shares:   [{ personId: to.id, amount }],
    });
    haptic.success();
    await load();
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Settle Up" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {settlements.length > 0 ? (
          <>
            <Text style={styles.hint}>
              {settlements.length} payment{settlements.length > 1 ? 's' : ''} settle everyone across all groups.
            </Text>
            <View style={styles.card}>
              {settlements.map((s, i) => {
                const from = personMap.get(s.from);
                const to = personMap.get(s.to);
                if (!from || !to) return null;
                return (
                  <View key={`${s.from}-${s.to}-${i}`} style={[styles.rowWrap, i < settlements.length - 1 && styles.rowBorder]}>
                    <BalanceRow from={from} to={to} amount={s.amount} onPaid={() => markPaid(from, to, s.amount)} />
                  </View>
                );
              })}
            </View>
          </>
        ) : (
          <EmptyState icon="check-circle" title="All settled up" body="You don't owe anyone and no one owes you." tint={colors.income} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, paddingBottom: 60 },
  hint: { ...type.body, color: colors.textSecondary, marginBottom: space.md },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.sm },
  rowWrap: { paddingHorizontal: space.md },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
});
