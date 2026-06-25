import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { colors } from '../../src/constants/colors';
import { type } from '../../src/constants/typography';
import { space, radius, layout, shadow } from '../../src/constants/layout';
import { categoryVisual } from '../../src/constants/categories';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { AmountText } from '../../src/components/ui/AmountText';
import { AppRefreshControl, useRefresh } from '../../src/components/ui/AppRefreshControl';
import { getAllGroups } from '../../src/db/queries/groups';
import { getRecurringForGroup } from '../../src/db/queries/transactions';
import { nextOccurrenceOnOrAfter } from '../../src/lib/recurrence';
import { formatCompact } from '../../src/lib/money';

type Sub = { id: string; groupId: string; name: string; category: string; amount: number; freq: string; nextMs: number | null };

// Normalise a recurring charge to a per-month figure for the running total.
function toMonthly(amount: number, freq: string): number {
  switch (freq) {
    case 'daily': return amount * 30;
    case 'weekly': return Math.round((amount * 52) / 12);
    case 'monthly': return amount;
    case 'yearly': return Math.round(amount / 12);
    default: return amount;
  }
}
function cadenceLabel(freq: string): string {
  return freq === 'daily' ? 'daily' : freq === 'weekly' ? 'weekly' : freq === 'yearly' ? 'yearly' : freq === 'custom' ? 'custom' : 'monthly';
}

export default function SubscriptionsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const now = Date.now();
    const grps = await getAllGroups(db);
    const byGroup = await Promise.all(grps.map(g => getRecurringForGroup(db, g.id)));
    const rules = byGroup.flat().filter(t => t.kind === 'expense' && t.recur_freq && (!t.recur_state || t.recur_state === 'active'));
    const list: Sub[] = rules.map(t => ({
      id: t.id,
      groupId: t.group_id,
      name: (t.note && t.note.trim()) || t.category,
      category: t.category,
      amount: t.shares.reduce((s, sh) => s + sh.amount, 0),
      freq: t.recur_freq as string,
      nextMs: nextOccurrenceOnOrAfter(t, now),
    }));
    list.sort((a, b) => (a.nextMs ?? Infinity) - (b.nextMs ?? Infinity));
    setSubs(list);
    setLoaded(true);
  }

  useFocusEffect(useCallback(() => { load(); }, []));
  const { refreshing, onRefresh } = useRefresh(() => load());

  const monthlyTotal = subs.reduce((s, x) => s + toMonthly(x.amount, x.freq), 0);
  const nextUp = subs.find(s => s.nextMs != null);

  return (
    <View style={styles.container}>
      <ScreenHeader title="Subscriptions" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + space.xl }]}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.intro}>Your repeating bills & subscriptions — from your recurring expenses.</Text>

        {loaded && subs.length === 0 ? (
          <EmptyState
            icon="refresh-cw"
            title="No subscriptions yet"
            body="Mark an expense as Recurring (monthly Netflix, rent, gym…) when you add it, and it'll show here with its monthly cost and next charge."
            actionLabel="Add a recurring expense"
            onAction={() => router.push('/add/quick?kind=expense' as any)}
          />
        ) : subs.length > 0 ? (
          <>
            {/* Monthly total */}
            <View style={styles.summaryCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.summaryLabel}>MONTHLY TOTAL</Text>
                <AmountText paise={monthlyTotal} size="xl" forceColor={colors.textPrimary} />
              </View>
              <View style={styles.summaryRight}>
                <Text style={styles.summaryCount}>{subs.length} active</Text>
                {nextUp?.nextMs != null && <Text style={styles.summaryNext}>next {format(nextUp.nextMs, 'MMM d')}</Text>}
              </View>
            </View>

            <Text style={styles.sectionLabel}>ACTIVE · {subs.length}</Text>
            <View style={styles.listCard}>
              {subs.map((s, i) => {
                const vis = categoryVisual(s.category);
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.row, i < subs.length - 1 && styles.rowBorder]}
                    onPress={() => router.push(`/group/${s.groupId}/recurring` as any)}
                    accessibilityRole="button"
                    accessibilityLabel={`${s.name}, ${cadenceLabel(s.freq)}`}
                  >
                    <View style={[styles.icon, { backgroundColor: (vis?.color ?? colors.accent) + '22' }]}>
                      <Feather name={vis?.icon ?? 'refresh-cw'} size={18} color={vis?.color ?? colors.accent} />
                    </View>
                    <View style={styles.info}>
                      <Text style={styles.name} numberOfLines={1}>{s.name}</Text>
                      <Text style={styles.detail}>{s.category} · {cadenceLabel(s.freq)}</Text>
                    </View>
                    <View style={styles.right}>
                      <AmountText paise={s.amount} size="sm" forceColor={colors.textPrimary} />
                      {s.nextMs != null && <Text style={styles.nextDate}>next {format(s.nextMs, 'MMM d')}</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.footHint}>≈ {formatCompact(monthlyTotal * 12)} a year · tap a row to manage its schedule.</Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.sm },
  intro: { ...type.label, color: colors.textMuted, marginBottom: space.xs, lineHeight: 19 },
  summaryCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A3A', borderRadius: 16, padding: space.md, borderWidth: 1.5, borderColor: colors.settle },
  summaryLabel: { fontSize: 11, color: colors.settle, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Inter_600SemiBold', marginBottom: 4 },
  summaryRight: { alignItems: 'flex-end' },
  summaryCount: { ...type.caption, color: colors.textSecondary },
  summaryNext: { ...type.caption, color: colors.textMuted, marginTop: 4 },
  sectionLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Inter_600SemiBold', marginTop: space.sm, marginBottom: space.xs },
  listCard: { backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  icon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  info: { flex: 1, minWidth: 0 },
  name: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  detail: { ...type.caption, color: colors.textMuted },
  right: { alignItems: 'flex-end' },
  nextDate: { ...type.caption, color: colors.textMuted, fontSize: 10, marginTop: 2 },
  footHint: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.sm, lineHeight: 16 },
});
