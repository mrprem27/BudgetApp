import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useScreenData } from '../../../src/hooks/useScreenData';
import { Feather } from '@expo/vector-icons';
import { fullDate } from '../../../src/lib/dateFormat';
import { colors, type, space, radius, layout, alpha } from '../../../src/theme';
import { ScreenHeader } from '../../../src/components/ui/ScreenHeader';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { AppRefreshControl } from '../../../src/components/ui/AppRefreshControl';
import { Card } from '../../../src/components/ui/Card';
import { Divider } from '../../../src/components/ui/Divider';
import { SheetModal } from '../../../src/components/ui/SheetModal';
import { getRecurringForGroup, getSkipsMap } from '../../../src/db/queries/recurring';
import { useRecurringActions } from '../../../src/hooks/useRecurringActions';
import { RecurringRow } from '../../../src/components/finance/RecurringRow';
import { nextOccurrenceOnOrAfter } from '../../../src/lib/recurrence';
import type { TxnWithSplits } from '../../../src/db/queries/transactions';

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

/**
 * Manage one group's recurring rules.
 *
 * The rows are `RecurringRow` — the same component the group's Recurring tab uses.
 * This screen used to hand-roll a second, entirely different card for the same
 * object (its own icon dot, its own state pill, its own meta grid), so the two
 * surfaces described one rule two ways. Now the tab and this screen agree, and the
 * per-rule *actions* — which are what this screen is actually for — move into a
 * sheet opened by the row, instead of five buttons under every card.
 */
export default function RecurringScreen() {
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>();
  const router = useRouter();
  const [highlightId, setHighlightId] = useState<string | null>(focus ?? null);
  const [openRuleId, setOpenRuleId] = useState<string | null>(null);

  const { data, loading, error: loadError, refreshing, onRefresh, reload } = useScreenData(async (db) => {
    const rs = await getRecurringForGroup(db, id);
    return { rules: rs, skips: await getSkipsMap(db, rs.map(r => r.id)) };
  }, [id]);
  const rules = data?.rules ?? [];
  const skips = data?.skips ?? new Map<string, Set<number>>();
  const { skipNext, undoSkip, pause, resume, end } = useRecurringActions(reload);

  useEffect(() => {
    if (!focus) return;
    setHighlightId(focus);
    const t = setTimeout(() => setHighlightId(null), 2600);
    return () => clearTimeout(t);
  }, [focus]);

  if (!id) { router.back(); return null; }

  const openRule = rules.find(r => r.id === openRuleId) ?? null;
  const openSkips = openRule ? skips.get(openRule.id) : undefined;
  const openNext = openRule ? nextOccurrence(openRule, openSkips) : null;
  const openHasSkips = (openSkips?.size ?? 0) > 0;

  const stateMeta: Record<string, { label: string; color: string }> = {
    active: { label: 'Active', color: colors.income },
    paused: { label: 'Paused', color: colors.healthAmber },
    ended: { label: 'Ended', color: colors.textMuted },
  };
  const meta = openRule ? (stateMeta[openRule.recur_state] ?? stateMeta.active) : null;

  /** Runs an action and closes the sheet — every one of them changes what it says. */
  const act = (fn: (ruleId: string) => void) => {
    if (!openRule) return;
    fn(openRule.id);
    setOpenRuleId(null);
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
            <Card clip>
              {rules.map((r, i) => (
                <React.Fragment key={r.id}>
                  {i > 0 && <Divider indent="text" />}
                  {/* The deep-link highlight tints the row rather than re-bordering a
                      card, so it can't change the row's height as it fades. */}
                  <View style={highlightId === r.id ? styles.highlight : undefined}>
                    <RecurringRow
                      rule={r}
                      showNext
                      skipDates={skips.get(r.id)}
                      onPress={() => setOpenRuleId(r.id)}
                    />
                  </View>
                </React.Fragment>
              ))}
            </Card>
          )}
        </ScrollView>
      )}

      {/* Actions for one rule. Everything the old per-card action row offered, plus
          the Started/Next dates it showed inline — a rule you are about to pause is
          exactly when those dates matter. */}
      <SheetModal
        visible={!!openRule}
        onClose={() => setOpenRuleId(null)}
        title={openRule ? (openRule.note?.trim() || openRule.category) : ''}
        scroll={false}
      >
        {openRule && meta && (
          <>
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Started</Text>
                <Text style={styles.metaVal}>{fullDate(new Date(openRule.date))}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>
                  {openRule.recur_state === 'active'
                    ? (openNext ? 'Next' : 'No more occurrences')
                    : openRule.recur_state === 'paused' ? 'Paused' : 'Ended'}
                </Text>
                <Text style={styles.metaVal}>
                  {openRule.recur_state === 'active'
                    ? (openNext ? fullDate(openNext) : openRule.recur_end ? fullDate(new Date(openRule.recur_end)) : '—')
                    : openRule.recur_end ? fullDate(new Date(openRule.recur_end)) : '—'}
                </Text>
              </View>
              <View style={[styles.statePill, { backgroundColor: alpha(meta.color, 13) }]}>
                <Text style={[styles.stateText, { color: meta.color }]}>{meta.label}</Text>
              </View>
            </View>

            {openHasSkips && (
              <View style={styles.skipBanner}>
                <Feather name="skip-forward" size={12} color={colors.healthAmber} />
                <Text style={styles.skipBannerText}>
                  {(openSkips?.size ?? 0) === 1 ? '1 upcoming occurrence skipped' : `${openSkips?.size} upcoming occurrences skipped`}
                </Text>
              </View>
            )}

            {openRule.recur_state !== 'ended' && (
              <View style={styles.actions}>
                {/* Skip: only when there's a real future occurrence inside the series end date. */}
                {openRule.recur_state === 'active' && openNext !== null && (
                  <ActionBtn icon="skip-forward" label="Skip" tint={colors.textSecondary} onPress={() => act(skipNext)} />
                )}
                {openHasSkips && (
                  <ActionBtn icon="rotate-ccw" label="Undo Skip" tint={colors.accent} onPress={() => act(undoSkip)} />
                )}
                {openRule.recur_state === 'active' && openNext !== null ? (
                  <ActionBtn icon="pause" label="Pause" tint={colors.healthAmber} onPress={() => act(pause)} />
                ) : openRule.recur_state === 'paused' ? (
                  <ActionBtn icon="play" label="Resume" tint={colors.income} onPress={() => act(resume)} />
                ) : null}
                <ActionBtn icon="x-circle" label="Stop" tint={colors.expense} onPress={() => act(end)} />
              </View>
            )}
          </>
        )}
      </SheetModal>
    </View>
  );
}

function ActionBtn({ icon, label, tint, onPress }: {
  icon: keyof typeof Feather.glyphMap; label: string; tint: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Feather name={icon} size={14} color={tint} />
      <Text style={[styles.actionText, { color: tint }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  // No `gap`: the rows are card-grouped now, and a container gap would slice the
  // card into separate slabs (AGENTS §12).
  scroll: { padding: layout.screenPaddingH, paddingBottom: space.lg },
  highlight: { backgroundColor: colors.accentMuted },

  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, marginBottom: space.md },
  metaItem: { flex: 1 },
  metaLabel: { ...type.caption, color: colors.textMuted },
  metaVal: { ...type.label, color: colors.textPrimary, marginTop: 2 },
  statePill: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill },
  stateText: { ...type.caption, fontFamily: 'Inter_600SemiBold' },

  skipBanner: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.md, paddingHorizontal: space.sm, paddingVertical: space.xs, backgroundColor: alpha(colors.healthAmber, 9), borderRadius: radius.sm },
  skipBannerText: { ...type.caption, color: colors.healthAmber },

  actions: { flexDirection: 'row', gap: space.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, minHeight: layout.touchMin, borderRadius: radius.md, backgroundColor: colors.bgMuted },
  actionText: { ...type.label, fontFamily: 'Inter_600SemiBold' },
});
