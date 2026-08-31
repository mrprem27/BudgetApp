import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useScreenData } from '../../../src/hooks/useScreenData';
import { Feather } from '@expo/vector-icons';
import { fullDate } from '../../../src/lib/dateFormat';
import { colors, type, space, radius, layout, shadow, alpha } from '../../../src/theme';
import { ScreenHeader } from '../../../src/components/ui/ScreenHeader';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { AppRefreshControl } from '../../../src/components/ui/AppRefreshControl';
import { getRecurringForGroup, getSkipsMap } from '../../../src/db/queries/recurring';
import { useRecurringActions } from '../../../src/hooks/useRecurringActions';
import { categoryVisual } from '../../../src/constants/categories';
import { formatRupees } from '../../../src/lib/money';
import { nextOccurrenceOnOrAfter, freqLabel } from '../../../src/lib/recurrence';
import type { TxnWithSplits } from '../../../src/db/queries/transactions';
import { IconCircle } from '../../../src/components/ui/IconCircle';

type Rule = TxnWithSplits;

/**
 * The next occurrence strictly after now, stepping past any the user skipped.
 *
 * The date walk itself is `nextOccurrenceOnOrAfter` (lib/recurrence) — the same
 * one the materializer, reminders and txn detail use. This screen used to carry
 * its own copy of the walker, so a recurrence fix in the library silently missed
 * it. Only the two things the library doesn't model live here: the paused/ended
 * check, and skip-stepping.
 */
function nextOccurrence(rule: Rule, skips?: Set<number>): Date | null {
  if (rule.recur_state !== 'active') return null;
  if (!isFinite(new Date(rule.date).getTime())) return null;

  // +1ms so "on or after" becomes "strictly after" — an occurrence due exactly
  // now has already happened.
  let from = Date.now() + 1;
  for (let guard = 0; guard < 2000; guard++) {
    const next = nextOccurrenceOnOrAfter(rule, from);
    if (next === null) return null;
    if (!skips?.has(next)) return new Date(next);
    from = next + 1;
  }
  return null;
}

export default function RecurringScreen() {
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const [highlightId, setHighlightId] = useState<string | null>(focus ?? null);

  const { data, loading, error: loadError, refreshing, onRefresh, reload } = useScreenData(async (db) => {
    const rs = await getRecurringForGroup(db, id);
    return { rules: rs, skips: await getSkipsMap(db, rs.map(r => r.id)) };
  }, [id]);
  const rules = data?.rules ?? [];
  const skips = data?.skips ?? new Map<string, Set<number>>();
  const { skipNext, undoSkip, pause, resume, edit, end } = useRecurringActions(reload);

  useEffect(() => {
    if (!focus) return;
    setHighlightId(focus);
    const t = setTimeout(() => setHighlightId(null), 2600);
    return () => clearTimeout(t);
  }, [focus]);

  if (!id) { router.back(); return null; }

  function amountOf(r: Rule): number {
    return r.payments.reduce((a, p) => a + p.amount, 0);
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
        <ErrorState onRetry={reload} />
      ) : (
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {rules.length === 0 ? (loading ? null : (
          <EmptyState
            icon="repeat"
            title="No recurring transactions"
            body="Rent, salary, memberships and bills you set to repeat will appear here to manage."
            actionLabel="Add recurring expense"
            onAction={() => router.push(`/add/quick?groupId=${id}&kind=expense`)}
          />
        )) : (
          rules.map(r => {
            const vis = categoryVisual(r.category);
            const meta = stateMeta[r.recur_state] ?? stateMeta.active;
            const seriesSkips = skips.get(r.id);
            const next = nextOccurrence(r, seriesSkips);
            const hasUpcomingSkips = (seriesSkips?.size ?? 0) > 0;
            // When active but no future occurrence exists (all past endDate), only allow Stop or Undo Skip.
            const hasFutureOccurrence = next !== null;

            return (
              <View key={r.id} style={[styles.card, highlightId === r.id && styles.cardHighlight]}>
                <View style={styles.cardTop}>
                  <IconCircle icon={vis.icon} size={40} color={vis.color} iconSize={18} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cat} numberOfLines={1}>{r.category}</Text>
                    <Text style={styles.freq}>{freqLabel(r.recur_freq, r.recur_interval)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.amount}>{formatRupees(amountOf(r))}</Text>
                    <View style={[styles.statePill, { backgroundColor: alpha(meta.color, 13) }]}>
                      <Text style={[styles.stateText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Started</Text>
                    <Text style={styles.metaVal}>{fullDate(new Date(r.date))}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>
                      {r.recur_state === 'active' ? (hasFutureOccurrence ? 'Next' : 'No more occurrences') : r.recur_state === 'paused' ? 'Paused' : 'Ended'}
                    </Text>
                    <Text style={styles.metaVal}>
                      {r.recur_state === 'active'
                        ? (next ? fullDate(next) : r.recur_end ? fullDate(new Date(r.recur_end)) : '—')
                        : r.recur_end ? fullDate(new Date(r.recur_end)) : '—'}
                    </Text>
                  </View>
                </View>

                {hasUpcomingSkips && (
                  <View style={styles.skipBanner}>
                    <Feather name="skip-forward" size={12} color={colors.healthAmber} />
                    <Text style={styles.skipBannerText}>
                      {(seriesSkips?.size ?? 0) === 1 ? '1 upcoming occurrence skipped' : `${seriesSkips?.size} upcoming occurrences skipped`}
                    </Text>
                  </View>
                )}

                {r.recur_state !== 'ended' && (
                  <View style={styles.actions}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => edit(r.id)} accessibilityRole="button">
                      <Feather name="edit-2" size={14} color={colors.accent} />
                      <Text style={[styles.actionText, { color: colors.accent }]}>Edit</Text>
                    </TouchableOpacity>

                    {/* Skip: only available when there's a real future occurrence within the series end date */}
                    {r.recur_state === 'active' && hasFutureOccurrence && (
                      <TouchableOpacity style={styles.actionBtn} onPress={() => skipNext(r.id)} accessibilityRole="button">
                        <Feather name="skip-forward" size={14} color={colors.textSecondary} />
                        <Text style={[styles.actionText, { color: colors.textSecondary }]}>Skip</Text>
                      </TouchableOpacity>
                    )}

                    {/* Undo Skip: only available when there are upcoming skipped occurrences */}
                    {hasUpcomingSkips && (
                      <TouchableOpacity style={styles.actionBtn} onPress={() => undoSkip(r.id)} accessibilityRole="button">
                        <Feather name="rotate-ccw" size={14} color={colors.accent} />
                        <Text style={[styles.actionText, { color: colors.accent }]}>Undo Skip</Text>
                      </TouchableOpacity>
                    )}

                    {r.recur_state === 'active' && hasFutureOccurrence ? (
                      <TouchableOpacity style={styles.actionBtn} onPress={() => pause(r.id)} accessibilityRole="button">
                        <Feather name="pause" size={14} color={colors.healthAmber} />
                        <Text style={[styles.actionText, { color: colors.healthAmber }]}>Pause</Text>
                      </TouchableOpacity>
                    ) : r.recur_state === 'paused' ? (
                      <TouchableOpacity style={styles.actionBtn} onPress={() => resume(r.id)} accessibilityRole="button">
                        <Feather name="play" size={14} color={colors.income} />
                        <Text style={[styles.actionText, { color: colors.income }]}>Resume</Text>
                      </TouchableOpacity>
                    ) : null}

                    <TouchableOpacity style={styles.actionBtn} onPress={() => end(r.id)} accessibilityRole="button">
                      <Feather name="x-circle" size={14} color={colors.expense} />
                      <Text style={[styles.actionText, { color: colors.expense }]}>Stop</Text>
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
  cardHighlight: { borderColor: colors.accent, borderWidth: 1.5, backgroundColor: colors.accentMuted },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  cat: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  freq: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  amount: { fontFamily: 'SpaceMono_400Regular', fontSize: 16, color: colors.textPrimary },
  statePill: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill, marginTop: space.xs },
  stateText: { ...type.caption, fontFamily: 'Inter_600SemiBold' },
  metaRow: { flexDirection: 'row', marginTop: space.md, gap: space.lg },
  metaItem: { flex: 1 },
  metaLabel: { ...type.caption, color: colors.textMuted },
  metaVal: { ...type.label, color: colors.textPrimary, marginTop: 2 },
  skipBanner: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.sm, paddingHorizontal: space.sm, paddingVertical: space.xs, backgroundColor: alpha(colors.healthAmber, 9), borderRadius: radius.sm },
  skipBannerText: { ...type.caption, color: colors.healthAmber },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: colors.bgMuted },
  actionText: { ...type.label, fontFamily: 'Inter_600SemiBold' },
});
