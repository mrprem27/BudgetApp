import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, type, space, layout, alpha } from '../../src/theme';
import { categoryVisual } from '../../src/constants/categories';
import { asFeather } from '../../src/constants/palette';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { AmountText } from '../../src/components/ui/AmountText';
import { AppRefreshControl } from '../../src/components/ui/AppRefreshControl';
import { Card } from '../../src/components/ui/Card';
import { ListRow } from '../../src/components/ui/ListRow';
import { Divider } from '../../src/components/ui/Divider';
import { IconCircle } from '../../src/components/ui/IconCircle';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { SecondaryButton } from '../../src/components/ui/SecondaryButton';
import { useScreenData } from '../../src/hooks/useScreenData';
import { useContentInset } from '../../src/hooks/useContentInset';
import { useRecurringActions } from '../../src/hooks/useRecurringActions';
import { getAllGroups } from '../../src/db/queries/groups';
import { getRecurringForGroup, getSkipsMap } from '../../src/db/queries/recurring';
import { nextUnskippedOccurrence, recurringMonthlyEquivalent, freqLabel } from '../../src/lib/recurrence';
import { shortDate } from '../../src/lib/dateFormat';
import { myShareOrTotal, myIncomeOf, txnTotal } from '../../src/lib/splitMath';
import { getMe } from '../../src/db/queries/persons';
import type { RecurFreq, TxnKind } from '../../src/constants/enums';
import { formatCompact } from '../../src/lib/money';

type Sub = { id: string; groupId: string; name: string; category: string; kind: TxnKind; amount: number; freq: RecurFreq; interval: number | null; nextMs: number | null };

// Normalise a recurring charge to a per-month figure for the running totals.
const toMonthly = recurringMonthlyEquivalent;

/**
 * The recurring **inventory** — one row per rule, with the actions that change it.
 *
 * Not the same list as Plan's "Due this month", which is one row per upcoming *charge*.
 * The two diverge at the edges: a yearly rule due in eleven months, a paused rule, or one
 * whose next occurrences are all skipped, are rules with no upcoming charge — they belong
 * here and nowhere else. Keeping the titles distinct ("Recurring" = the things themselves,
 * "Due this month" = a forward window) is what stops the pair reading as one list shown
 * twice, which is how it was reported.
 */
export default function RecurringScreen() {
  const router = useRouter();
  const bottomPad = useContentInset();

  const { data, loading, error, refreshing, onRefresh, reload } = useScreenData(async (db) => {
    const now = Date.now();
    const grps = await getAllGroups(db);
    const byGroup = await Promise.all(grps.map(g => getRecurringForGroup(db, g.id)));
    // Every kind: recurring income (salary) belongs on this screen too — it was
    // invisible everywhere until it first materialized, which made onboarding's
    // income answer look like it did nothing.
    const rules = byGroup.flat().filter(t => t.recur_freq && (!t.recur_state || t.recur_state === 'active'));
    // Skips have to be loaded, not inferred: "next" must be the next date that actually
    // happens, not the next one the schedule would produce.
    const skips = await getSkipsMap(db, rules.map(r => r.id));
    const meRow = await getMe(db);
    const list: Sub[] = rules.map(t => ({
      id: t.id,
      groupId: t.group_id,
      name: (t.note && t.note.trim()) || t.category,
      category: t.category,
      kind: t.kind,
      // My share — the only basis that sums honestly with budgets and afford.
      // Income is attributed by payments, so it reads the other side.
      amount: meRow
        ? (t.kind === 'income' ? myIncomeOf(t, meRow.id) : myShareOrTotal(t, meRow.id))
        : txnTotal(t),
      freq: t.recur_freq!,
      interval: t.recur_interval,
      nextMs: nextUnskippedOccurrence(t, now, skips.get(t.id)),
    }));
    list.sort((a, b) => (a.nextMs ?? Infinity) - (b.nextMs ?? Infinity));
    return list;
  }, []);

  const subs = data ?? [];
  const { skipNext, pause, end } = useRecurringActions(reload);
  // Never one total across kinds (AGENTS §12): money out and money in are
  // summed and shown separately.
  const outSubs = subs.filter(s => s.kind !== 'income');
  const inSubs = subs.filter(s => s.kind === 'income');
  const monthlyOut = outSubs.reduce((s, x) => s + toMonthly(x.amount, x.freq, x.interval), 0);
  const monthlyIn = inSubs.reduce((s, x) => s + toMonthly(x.amount, x.freq, x.interval), 0);
  const nextUp = subs.find(s => s.nextMs != null);

  if (error) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Recurring" onBack={() => router.back()} />
        <ErrorState onRetry={reload} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Recurring" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad }]}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {!loading && subs.length === 0 ? (
          <EmptyState
            icon="refresh-cw"
            title="No recurring items yet"
            body="Mark an expense as Recurring (monthly Netflix, rent, gym…) when you add it, and it'll show here with its monthly cost and next charge."
            actionLabel="Add a recurring expense"
            onAction={() => router.push('/add/quick?kind=expense')}
          />
        ) : subs.length > 0 ? (
          <>
            {/* The one hero figure on this screen (AGENTS §1): my monthly
                commitment. Income is its own labelled figure, never merged. */}
            <Card padded style={styles.totalCard}>
              <View style={styles.totalRow}>
                <View style={styles.totalLeft}>
                  <Text style={styles.totalLabel}>Money out · your share</Text>
                  <AmountText paise={monthlyOut} size="xl" forceColor={colors.textPrimary} />
                  <Text style={styles.totalSub}>
                    ≈ {formatCompact(monthlyOut * 12)} a year
                    {monthlyIn > 0 ? ` · +${formatCompact(monthlyIn)}/mo in` : ''}
                  </Text>
                </View>
                <View style={styles.totalRight}>
                  <Text style={styles.totalCount}>{subs.length} active</Text>
                  {nextUp?.nextMs != null && (
                    <Text style={styles.totalNext}>next {shortDate(nextUp.nextMs)}</Text>
                  )}
                </View>
              </View>
            </Card>

            {([['Money out', outSubs], ['Money in', inSubs]] as const).map(([title, rows]) => rows.length === 0 ? null : (
              <View key={title}>
                <SectionHeader title={title} right={<Text style={styles.count}>{rows.length}</Text>} />
                <Card clip>
                  {rows.map((s, i) => {
                    const vis = categoryVisual(s.category);
                    return (
                      <View key={s.id}>
                        {i > 0 && <Divider indent="none" />}
                        <ListRow
                          leading={
                            <IconCircle
                              icon={asFeather(vis?.icon, s.kind === 'income' ? 'trending-up' : 'refresh-cw')}
                              size={layout.avatarSize}
                              color={vis?.color ?? (s.kind === 'income' ? colors.income : colors.accent)}
                            />
                          }
                          title={s.name}
                          subtitle={`${s.category} · ${freqLabel(s.freq, s.interval)}${s.nextMs != null ? ` · next ${shortDate(s.nextMs)}` : ''}`}
                          value={<AmountText paise={s.amount} size="sm" forceColor={s.kind === 'income' ? colors.income : colors.textPrimary} rounded />}
                          onPress={() => router.push(`/group/${s.groupId}/recurring?focus=${s.id}`)}
                          accessibilityLabel={`${s.name}, ${freqLabel(s.freq, s.interval)}`}
                        />
                        {/* Real buttons, not caption-sized text links. All three were ~13px
                            tap targets — far under AGENTS §6 — and one of them is destructive. */}
                        <View style={styles.actionRow}>
                          <SecondaryButton label="Skip next" size="sm" onPress={() => skipNext(s.id)} style={styles.actionBtn} />
                          <SecondaryButton label="Pause" size="sm" onPress={() => pause(s.id)} style={styles.actionBtn} />
                          <SecondaryButton label="Stop" size="sm" danger onPress={() => end(s.id)} style={styles.actionBtn} />
                        </View>
                      </View>
                    );
                  })}
                </Card>
              </View>
            ))}

            <Text style={styles.footHint}>Tap a row to manage its schedule.</Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH },
  // Tinted settle, matching how a recurring/settlement concern is coloured elsewhere.
  totalCard: { backgroundColor: alpha(colors.settle, 8), borderColor: colors.settle },
  totalRow: { flexDirection: 'row', alignItems: 'flex-start' },
  totalLeft: { flex: 1 },
  totalLabel: { ...type.sectionLabel, color: colors.settle, marginBottom: space.xs },
  totalSub: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  totalRight: { alignItems: 'flex-end' },
  totalCount: { ...type.caption, color: colors.textSecondary },
  totalNext: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  count: { ...type.amountSM, color: colors.textSecondary },
  actionRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.md },
  // SecondaryButton is width:100% by default; these share the row instead.
  actionBtn: { flex: 1, width: undefined, paddingHorizontal: space.sm },
  footHint: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.md },
});
