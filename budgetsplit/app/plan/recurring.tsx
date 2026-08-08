import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { colors } from '../../src/constants/colors';
import { type } from '../../src/constants/typography';
import { space, radius, layout, shadow } from '../../src/constants/layout';
import { categoryVisual } from '../../src/constants/categories';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { AmountText } from '../../src/components/ui/AmountText';
import { AppRefreshControl } from '../../src/components/ui/AppRefreshControl';
import { useScreenData } from '../../src/hooks/useScreenData';
import { useRecurringActions } from '../../src/hooks/useRecurringActions';
import { getAllGroups } from '../../src/db/queries/groups';
import { getRecurringForGroup, getSkipsMap } from '../../src/db/queries/recurring';
import { nextUnskippedOccurrence, recurringMonthlyEquivalent } from '../../src/lib/recurrence';
import { formatCompact } from '../../src/lib/money';
import { alpha } from '../../src/theme';

type Sub = { id: string; groupId: string; name: string; category: string; amount: number; freq: string; nextMs: number | null };

// Normalise a recurring charge to a per-month figure for the running total.
const toMonthly = recurringMonthlyEquivalent;
function cadenceLabel(freq: string): string {
  return freq === 'daily' ? 'daily' : freq === 'weekly' ? 'weekly' : freq === 'yearly' ? 'yearly' : freq === 'custom' ? 'custom' : 'monthly';
}

export default function RecurringScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data, loading, error, refreshing, onRefresh, reload } = useScreenData(async (db) => {
    const now = Date.now();
    const grps = await getAllGroups(db);
    const byGroup = await Promise.all(grps.map(g => getRecurringForGroup(db, g.id)));
    const rules = byGroup.flat().filter(t => t.kind === 'expense' && t.recur_freq && (!t.recur_state || t.recur_state === 'active'));
    // Skips have to be loaded, not inferred: "next" must be the next date that
    // actually happens, not the next one the schedule would produce.
    const skips = await getSkipsMap(db, rules.map(r => r.id));
    const list: Sub[] = rules.map(t => ({
      id: t.id,
      groupId: t.group_id,
      name: (t.note && t.note.trim()) || t.category,
      category: t.category,
      amount: t.shares.reduce((s, sh) => s + sh.amount, 0),
      freq: t.recur_freq as string,
      nextMs: nextUnskippedOccurrence(t, now, skips.get(t.id)),
    }));
    list.sort((a, b) => (a.nextMs ?? Infinity) - (b.nextMs ?? Infinity));
    return list;
  }, []);

  const subs = data ?? [];
  const { skipNext, pause, end } = useRecurringActions(reload);
  const loaded = !loading;
  const monthlyTotal = subs.reduce((s, x) => s + toMonthly(x.amount, x.freq), 0);
  const nextUp = subs.find(s => s.nextMs != null);

  return (
    <View style={styles.container}>
      <ScreenHeader title="Recurring" onBack={() => router.back()} />
      {error ? (
        <ErrorState onRetry={reload} />
      ) : (
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + space.xl }]}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.intro}>Your repeating bills & charges — from your recurring expenses.</Text>

        {loaded && subs.length === 0 ? (
          <EmptyState
            icon="refresh-cw"
            title="No recurring items yet"
            body="Mark an expense as Recurring (monthly Netflix, rent, gym…) when you add it, and it'll show here with its monthly cost and next charge."
            actionLabel="Add a recurring expense"
            onAction={() => router.push('/add/quick?kind=expense')}
          />
        ) : (
          <>
            {subs.length > 0 && (<>
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
                  <View key={s.id} style={i < subs.length - 1 ? styles.rowBorder : undefined}>
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => router.push(`/group/${s.groupId}/recurring?focus=${s.id}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`${s.name}, ${cadenceLabel(s.freq)}`}
                  >
                    <View style={[styles.icon, { backgroundColor: alpha(vis?.color ?? colors.accent, 13) }]}>
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
                  <View style={styles.actionRow}>
                    <TouchableOpacity onPress={() => skipNext(s.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Skip next ${s.name}`}>
                      <Text style={styles.action}>Skip next</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => pause(s.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Pause ${s.name}`}>
                      <Text style={styles.action}>Pause</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => end(s.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Stop ${s.name}`}>
                      <Text style={[styles.action, styles.actionDanger]}>Stop</Text>
                    </TouchableOpacity>
                  </View>
                  </View>
                );
              })}
            </View>

            <Text style={styles.footHint}>≈ {formatCompact(monthlyTotal * 12)} a year · tap a row to manage its schedule.</Text>
            </>)}
          </>
        )}
      </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.sm },
  intro: { ...type.label, color: colors.textMuted, marginBottom: space.xs, lineHeight: 19 },
  summaryCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.settleTint, borderRadius: 16, padding: space.md, borderWidth: 1.5, borderColor: colors.settle },
  summaryLabel: { fontSize: 11, color: colors.settle, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Inter_600SemiBold', marginBottom: space.xs },
  summaryRight: { alignItems: 'flex-end' },
  summaryCount: { ...type.caption, color: colors.textSecondary },
  summaryNext: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
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
  actionRow: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.md, paddingBottom: space.sm },
  action: { ...type.caption, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  actionDanger: { color: colors.expense },
  footHint: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.sm, lineHeight: 16 },
});
