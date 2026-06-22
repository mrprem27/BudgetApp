import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout } from '../src/constants/layout';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { Input } from '../src/components/ui/Input';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ErrorState } from '../src/components/ui/ErrorState';
import { TransactionRow } from '../src/components/finance/TransactionRow';
import { getTransactionsInRange } from '../src/db/queries/transactions';
import { getMe } from '../src/db/queries/persons';
import { formatRupees } from '../src/lib/money';
import type { TxnWithSplits } from '../src/db/queries/transactions';

type KindFilter = 'all' | 'expense' | 'income' | 'settlement';
const KINDS: { key: KindFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'expense', label: 'Expenses' },
  { key: 'income', label: 'Income' },
  { key: 'settlement', label: 'Settlements' },
];

const THREE_YEARS_MS = 3 * 365 * 24 * 60 * 60 * 1000;

export default function SearchScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [all, setAll] = useState<TxnWithSplits[]>([]);
  const [myId, setMyId] = useState('');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const now = Date.now();
        const [txns, me] = await Promise.all([
          getTransactionsInRange(db, null, now - THREE_YEARS_MS, now),
          getMe(db),
        ]);
        setAll(txns);
        setMyId(me?.id ?? '');
        setLoadError(false);
      } catch { setLoadError(true); }
    })();
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(t => {
      if (kind !== 'all' && t.kind !== kind) return false;
      if (!q) return true;
      const total = t.payments.reduce((s, p) => s + p.amount, 0);
      const hay = `${t.category} ${t.note ?? ''} ${formatRupees(total)} ${Math.round(total / 100)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [all, query, kind]);

  return (
    <View style={styles.container}>
      <ScreenHeader title="Search" onBack={() => router.back()} />
      {loadError ? (
        <ErrorState onRetry={() => { setLoadError(false); }} />
      ) : (
        <>
          <View style={styles.searchWrap}>
            <Input value={query} onChangeText={setQuery} placeholder="Search category, note or amount…" icon="search" autoFocus />
          </View>
          <View style={styles.chips}>
            {KINDS.map(k => (
              <TouchableOpacity
                key={k.key}
                style={[styles.chip, kind === k.key && styles.chipActive]}
                onPress={() => setKind(k.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: kind === k.key }}
              >
                <Text style={[styles.chipText, kind === k.key && styles.chipTextActive]}>{k.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {results.length === 0 ? (
            <EmptyState
              icon="search"
              title={query.trim() ? 'No matches' : 'Search your transactions'}
              body={query.trim() ? 'Try a different word or amount.' : 'Find any past expense, income or settlement by category, note or amount.'}
              tint={colors.textSecondary}
            />
          ) : (
            <FlatList
              data={results}
              keyExtractor={(t) => t.id}
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TransactionRow
                  txn={item}
                  myId={myId}
                  showDate
                  onPress={() => router.push(`/txn/${item.id}`)}
                />
              )}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  searchWrap: { paddingHorizontal: layout.screenPaddingH, paddingBottom: space.sm },
  chips: { flexDirection: 'row', gap: space.sm, paddingHorizontal: layout.screenPaddingH, paddingBottom: space.sm, flexWrap: 'wrap' },
  chip: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: colors.bgMuted },
  chipActive: { backgroundColor: colors.accent },
  chipText: { ...type.label, color: colors.textSecondary },
  chipTextActive: { color: colors.bg },
  list: { paddingHorizontal: layout.screenPaddingH, paddingBottom: space.lg },
});
