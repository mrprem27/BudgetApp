import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { format, addDays, addWeeks, addMonths } from 'date-fns';
import { colors } from '../../../src/constants/colors';
import { type } from '../../../src/constants/typography';
import { space, radius, layout, shadow } from '../../../src/constants/layout';
import { ScreenHeader } from '../../../src/components/ui/ScreenHeader';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import {
  getRecurringForGroup, pauseRecurring, resumeRecurring, endRecurring,
} from '../../../src/db/queries/transactions';
import { categoryVisual } from '../../../src/constants/categories';
import { formatRupees } from '../../../src/lib/money';
import { haptic } from '../../../src/lib/haptics';
import type { TxnWithSplits } from '../../../src/db/queries/transactions';

type Rule = TxnWithSplits;

function freqLabel(freq: string | null, interval: number | null): string {
  const n = interval ?? 1;
  switch (freq) {
    case 'daily':   return n === 1 ? 'Every day' : `Every ${n} days`;
    case 'weekly':  return n === 1 ? 'Every week' : `Every ${n} weeks`;
    case 'monthly': return n === 1 ? 'Every month' : `Every ${n} months`;
    case 'custom':  return `Every ${n} days`;
    default:        return 'Repeats';
  }
}

function nextOccurrence(rule: Rule): Date | null {
  if (rule.recur_state !== 'active') return null;
  const interval = rule.recur_interval ?? 1;
  let cursor = new Date(rule.date);
  if (!isFinite(cursor.getTime())) return null;
  const now = Date.now();
  let guard = 0;
  const adv = (d: Date) => {
    switch (rule.recur_freq) {
      case 'daily': case 'custom': return addDays(d, interval);
      case 'weekly': return addWeeks(d, interval);
      default: return addMonths(d, interval);
    }
  };
  while (cursor.getTime() <= now && guard < 2000) { cursor = adv(cursor); guard++; }
  if (rule.recur_end && cursor.getTime() > rule.recur_end) return null;
  return cursor;
}

export default function RecurringScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loadError, setLoadError] = useState(false);

  useFocusEffect(useCallback(() => { load(); }, [id]));

  if (!id) { router.back(); return null; }

  async function load() {
    try {
      setRules(await getRecurringForGroup(db, id));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }

  function amountOf(r: Rule): number {
    return r.payments.reduce((a, p) => a + p.amount, 0);
  }

  async function onPause(r: Rule) {
    try { await pauseRecurring(db, r.id); haptic.warning(); await load(); }
    catch { haptic.error(); Alert.alert('Something went wrong', 'Please try again.'); }
  }
  async function onResume(r: Rule) {
    try { await resumeRecurring(db, r.id); haptic.success(); await load(); }
    catch { haptic.error(); Alert.alert('Something went wrong', 'Please try again.'); }
  }
  function onEnd(r: Rule) {
    Alert.alert('End this recurring transaction?', 'It stops generating new occurrences. Past ones stay in history.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End', style: 'destructive', onPress: async () => {
        try { await endRecurring(db, r.id); haptic.warning(); await load(); }
        catch { haptic.error(); Alert.alert('Something went wrong', 'Please try again.'); }
      } },
    ]);
  }

  const stateMeta: Record<string, { label: string; color: string }> = {
    active: { label: 'Active', color: colors.income },
    paused: { label: 'Paused', color: colors.healthAmber },
    ended:  { label: 'Ended', color: colors.textMuted },
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Recurring" onBack={() => router.back()} />
      {loadError ? (
        <ErrorState onRetry={() => { setLoadError(false); load(); }} />
      ) : (
      <ScrollView contentContainerStyle={styles.scroll}>
        {rules.length === 0 ? (
          <EmptyState
            icon="repeat"
            title="No recurring transactions"
            body="Rent, salary, subscriptions and bills you set to repeat will appear here to manage."
          />
        ) : (
          rules.map(r => {
            const vis = categoryVisual(r.category);
            const meta = stateMeta[r.recur_state] ?? stateMeta.active;
            const next = nextOccurrence(r);
            return (
              <View key={r.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={[styles.iconDot, { backgroundColor: vis.color + '22' }]}>
                    <Feather name={vis.icon as any} size={18} color={vis.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cat} numberOfLines={1}>{r.category}</Text>
                    <Text style={styles.freq}>{freqLabel(r.recur_freq, r.recur_interval)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.amount}>{formatRupees(amountOf(r))}</Text>
                    <View style={[styles.statePill, { backgroundColor: meta.color + '22' }]}>
                      <Text style={[styles.stateText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Started</Text>
                    <Text style={styles.metaVal}>{format(new Date(r.date), 'dd MMM yyyy')}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>{r.recur_state === 'active' ? 'Next' : r.recur_state === 'paused' ? 'Paused' : 'Ended'}</Text>
                    <Text style={styles.metaVal}>
                      {r.recur_state === 'active'
                        ? (next ? format(next, 'dd MMM yyyy') : '—')
                        : r.recur_end ? format(new Date(r.recur_end), 'dd MMM yyyy') : '—'}
                    </Text>
                  </View>
                </View>

                {r.recur_state !== 'ended' && (
                  <View style={styles.actions}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => router.push(`/add/${r.kind === 'income' ? 'income' : 'quick'}?editId=${r.id}&groupId=${id}`)} accessibilityRole="button">
                      <Feather name="edit-2" size={14} color={colors.accent} />
                      <Text style={[styles.actionText, { color: colors.accent }]}>Edit</Text>
                    </TouchableOpacity>
                    {r.recur_state === 'active' ? (
                      <TouchableOpacity style={styles.actionBtn} onPress={() => onPause(r)} accessibilityRole="button">
                        <Feather name="pause" size={14} color={colors.healthAmber} />
                        <Text style={[styles.actionText, { color: colors.healthAmber }]}>Pause</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={styles.actionBtn} onPress={() => onResume(r)} accessibilityRole="button">
                        <Feather name="play" size={14} color={colors.income} />
                        <Text style={[styles.actionText, { color: colors.income }]}>Resume</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.actionBtn} onPress={() => onEnd(r)} accessibilityRole="button">
                      <Feather name="x-circle" size={14} color={colors.expense} />
                      <Text style={[styles.actionText, { color: colors.expense }]}>End</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.md, paddingBottom: space.lg },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, ...shadow.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  iconDot: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cat: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  freq: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  amount: { fontFamily: 'SpaceMono_400Regular', fontSize: 16, color: colors.textPrimary },
  statePill: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill, marginTop: 4 },
  stateText: { ...type.caption, fontFamily: 'Inter_600SemiBold' },
  metaRow: { flexDirection: 'row', marginTop: space.md, gap: space.lg },
  metaItem: { flex: 1 },
  metaLabel: { ...type.caption, color: colors.textMuted },
  metaVal: { ...type.label, color: colors.textPrimary, marginTop: 2 },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: colors.bgMuted },
  actionText: { ...type.label, fontFamily: 'Inter_600SemiBold' },
});
